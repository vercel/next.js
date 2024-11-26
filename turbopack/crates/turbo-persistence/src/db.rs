use std::{
    any::{Any, TypeId},
    collections::HashSet,
    fs::{self, File, OpenOptions, ReadDir},
    io::Write,
    mem::{transmute, MaybeUninit},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc,
    },
};

use anyhow::{bail, Context, Result};
use byteorder::{ReadBytesExt, WriteBytesExt, BE};
use lzzzz::lz4::decompress;
use parking_lot::{Mutex, RwLock};
use rayon::iter::{IntoParallelIterator, ParallelIterator};

use crate::{
    arc_slice::ArcSlice,
    constants::{
        AQMF_AVG_SIZE, AQMF_CACHE_SIZE, DATA_THRESHOLD_PER_COMPACTED_FILE, INDEX_BLOCK_AVG_SIZE,
        INDEX_BLOCK_CACHE_SIZE, KEY_BLOCK_AVG_SIZE, KEY_BLOCK_CACHE_SIZE,
        MAX_ENTRIES_PER_COMPACTED_FILE, VALUE_BLOCK_AVG_SIZE, VALUE_BLOCK_CACHE_SIZE,
    },
    key::{hash_key, StoreKey},
    lookup_entry::LookupEntry,
    merge_iter::MergeIter,
    static_sorted_file::{AqmfCache, BlockCache, LookupResult, StaticSortedFile},
    static_sorted_file_builder::StaticSortedFileBuilder,
    write_batch::WriteBatch,
    QueryKey,
};

#[cfg(feature = "stats")]
#[derive(Debug)]
pub struct CacheStatistics {
    pub hit_rate: f32,
    pub fill: f32,
    pub items: usize,
    pub size: u64,
    pub hits: u64,
    pub misses: u64,
}

#[cfg(feature = "stats")]
impl CacheStatistics {
    fn new<Key, Val, We, B, L>(cache: &quick_cache::sync::Cache<Key, Val, We, B, L>) -> Self
    where
        Key: Eq + std::hash::Hash,
        Val: Clone,
        We: quick_cache::Weighter<Key, Val> + Clone,
        B: std::hash::BuildHasher + Clone,
        L: quick_cache::Lifecycle<Key, Val> + Clone,
    {
        let size = cache.weight();
        let hits = cache.hits();
        let misses = cache.misses();
        Self {
            hit_rate: hits as f32 / (hits + misses) as f32,
            fill: size as f32 / cache.capacity() as f32,
            items: cache.len(),
            size,
            hits,
            misses,
        }
    }
}

#[cfg(feature = "stats")]
#[derive(Debug)]
pub struct Statistics {
    pub sst_files: usize,
    pub index_block_cache: CacheStatistics,
    pub key_block_cache: CacheStatistics,
    pub value_block_cache: CacheStatistics,
    pub aqmf_cache: CacheStatistics,
    pub hits: u64,
    pub misses: u64,
    pub miss_range: u64,
    pub miss_aqmf: u64,
    pub miss_key: u64,
}

#[cfg(feature = "stats")]
#[derive(Default)]
struct TrackedStats {
    hits_deleted: std::sync::atomic::AtomicU64,
    hits_small: std::sync::atomic::AtomicU64,
    hits_blob: std::sync::atomic::AtomicU64,
    miss_range: std::sync::atomic::AtomicU64,
    miss_aqmf: std::sync::atomic::AtomicU64,
    miss_key: std::sync::atomic::AtomicU64,
    miss_global: std::sync::atomic::AtomicU64,
}

pub struct TurboPersistence {
    path: PathBuf,
    inner: RwLock<Inner>,
    idle_write_batch: Mutex<Option<(TypeId, Box<dyn Any + Send + Sync>)>>,
    active_write_operation: AtomicBool,
    aqmf_cache: AqmfCache,
    index_block_cache: BlockCache,
    key_block_cache: BlockCache,
    value_block_cache: BlockCache,
    #[cfg(feature = "stats")]
    stats: TrackedStats,
}

struct Inner {
    static_sorted_files: Vec<StaticSortedFile>,
    current_sequence_number: u32,
}

impl TurboPersistence {
    pub fn open(path: PathBuf) -> Result<Self> {
        let mut db = Self {
            path,
            inner: RwLock::new(Inner {
                static_sorted_files: Vec::new(),
                current_sequence_number: 0,
            }),
            idle_write_batch: Mutex::new(None),
            active_write_operation: AtomicBool::new(false),
            aqmf_cache: AqmfCache::with(
                AQMF_CACHE_SIZE as usize / AQMF_AVG_SIZE,
                AQMF_CACHE_SIZE,
                Default::default(),
                Default::default(),
                Default::default(),
            ),
            index_block_cache: BlockCache::with(
                INDEX_BLOCK_CACHE_SIZE as usize / INDEX_BLOCK_AVG_SIZE,
                INDEX_BLOCK_CACHE_SIZE,
                Default::default(),
                Default::default(),
                Default::default(),
            ),
            key_block_cache: BlockCache::with(
                KEY_BLOCK_CACHE_SIZE as usize / KEY_BLOCK_AVG_SIZE,
                KEY_BLOCK_CACHE_SIZE,
                Default::default(),
                Default::default(),
                Default::default(),
            ),
            value_block_cache: BlockCache::with(
                VALUE_BLOCK_CACHE_SIZE as usize / VALUE_BLOCK_AVG_SIZE,
                VALUE_BLOCK_CACHE_SIZE,
                Default::default(),
                Default::default(),
                Default::default(),
            ),
            #[cfg(feature = "stats")]
            stats: TrackedStats::default(),
        };
        db.open_directory()?;
        Ok(db)
    }

    fn open_directory(&mut self) -> Result<()> {
        match fs::read_dir(&self.path) {
            Ok(entries) => {
                if !self
                    .load_directory(entries)
                    .context("Loading persistence directory failed")?
                {
                    self.init_directory()
                        .context("Initializing persistence directory failed")?;
                }
                Ok(())
            }
            Err(e) => {
                if e.kind() == std::io::ErrorKind::NotFound {
                    self.create_and_init_directory()
                        .context("Creating and initializing persistence directory failed")?;
                    Ok(())
                } else {
                    Err(e).context("Failed to open database")
                }
            }
        }
    }

    fn create_and_init_directory(&mut self) -> Result<()> {
        fs::create_dir_all(&self.path)?;
        self.init_directory()
    }

    fn init_directory(&mut self) -> Result<()> {
        let mut current = File::create(self.path.join("CURRENT"))?;
        current.write_u32::<BE>(0)?;
        current.flush()?;
        Ok(())
    }

    fn load_directory(&mut self, entries: ReadDir) -> Result<bool> {
        let mut sst_files = Vec::new();
        let mut current_file = match File::open(&self.path.join("CURRENT")) {
            Ok(file) => file,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::NotFound {
                    return Ok(false);
                } else {
                    return Err(e).context("Failed to open CURRENT file");
                }
            }
        };
        let current = current_file.read_u32::<BE>()?;
        drop(current_file);

        let mut deleted_files = HashSet::new();
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let seq: u32 = path
                    .file_stem()
                    .context("File has no file stem")?
                    .to_str()
                    .context("File stem is not valid utf-8")?
                    .parse()?;
                if deleted_files.contains(&seq) {
                    continue;
                }
                if seq > current {
                    fs::remove_file(&path)?;
                } else {
                    match ext {
                        "sst" => {
                            sst_files.push(seq);
                        }
                        "del" => {
                            let mut content = &*fs::read(&path)?;
                            let mut no_existing_files = true;
                            while !content.is_empty() {
                                let seq = content.read_u32::<BE>()?;
                                deleted_files.insert(seq);
                                let sst_file = self.path.join(&format!("{:08}.sst", seq));
                                let blob_file = self.path.join(&format!("{:08}.blob", seq));
                                for path in [sst_file, blob_file] {
                                    if fs::exists(&path)? {
                                        let _ = fs::remove_file(path)?;
                                        no_existing_files = false;
                                    }
                                }
                            }
                            if no_existing_files {
                                fs::remove_file(&path)?;
                            }
                        }
                        "blob" => {
                            // ignore blobs, they are read when needed
                        }
                        _ => {
                            bail!("Unexpected file in persistence directory: {:?}", path);
                        }
                    }
                }
            } else {
                match path.file_stem().and_then(|s| s.to_str()) {
                    Some("CURRENT") => {
                        // Already read
                    }
                    _ => {
                        bail!("Unexpected file in persistence directory: {:?}", path);
                    }
                }
            }
        }

        sst_files.retain(|seq| !deleted_files.contains(seq));
        sst_files.sort();
        let sst_files = sst_files
            .into_iter()
            .map(|seq| self.open_sst(seq))
            .collect::<Result<Vec<StaticSortedFile>>>()?;
        #[cfg(feature = "stats")]
        {
            for sst in sst_files.iter() {
                let crate::static_sorted_file::StaticSortedFileRange {
                    family,
                    min_hash,
                    max_hash,
                } = sst.range()?;
                println!(
                    "SST {}  {} {:016x} - {:016x}",
                    sst.sequence_number(),
                    family,
                    min_hash,
                    max_hash
                );
            }
        }
        let inner = self.inner.get_mut();
        inner.static_sorted_files = sst_files;
        inner.current_sequence_number = current;
        Ok(true)
    }

    fn open_sst(&self, seq: u32) -> Result<StaticSortedFile> {
        let path = self.path.join(format!("{:08}.sst", seq));
        StaticSortedFile::open(seq, path)
            .with_context(|| format!("Unable to open sst file {:08}.sst", seq))
    }

    fn read_blob(&self, seq: u32) -> Result<ArcSlice<u8>> {
        let path = self.path.join(format!("{:08}.blob", seq));
        let compressed =
            fs::read(path).with_context(|| format!("Unable to read blob file {:08}.blob", seq))?;
        let mut compressed = &compressed[..];
        let uncompressed_length = compressed.read_u32::<BE>()? as usize;

        let buffer = Arc::new_zeroed_slice(uncompressed_length);
        // Safety: MaybeUninit<u8> can be safely transmuted to u8.
        let mut buffer = unsafe { transmute::<Arc<[MaybeUninit<u8>]>, Arc<[u8]>>(buffer) };
        // Safety: We know that the buffer is not shared yet.
        let decompressed = unsafe { Arc::get_mut_unchecked(&mut buffer) };
        decompress(compressed, decompressed)?;
        Ok(ArcSlice::from(buffer))
    }

    pub fn is_empty(&self) -> bool {
        self.inner.read().static_sorted_files.is_empty()
    }

    pub fn write_batch<K: StoreKey + Send + Sync + 'static, const FAMILIES: usize>(
        &self,
    ) -> Result<WriteBatch<K, FAMILIES>> {
        if self
            .active_write_operation
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            bail!(
                "Another write batch or compaction is already active (Only a single write \
                 operations is allowed at a time)"
            );
        }
        let current = self.inner.read().current_sequence_number;
        if let Some((ty, any)) = self.idle_write_batch.lock().take() {
            if ty == TypeId::of::<WriteBatch<K, FAMILIES>>() {
                let mut write_batch = *any.downcast::<WriteBatch<K, FAMILIES>>().unwrap();
                write_batch.reset(current);
                return Ok(write_batch);
            }
        }
        Ok(WriteBatch::new(self.path.clone(), current))
    }

    pub fn commit_write_batch<K: StoreKey + Send + Sync + 'static, const FAMILIES: usize>(
        &self,
        mut write_batch: WriteBatch<K, FAMILIES>,
    ) -> Result<()> {
        let (seq, new_sst_files) = write_batch.finish()?;
        self.commit(new_sst_files, vec![], seq)?;
        self.active_write_operation.store(false, Ordering::Release);
        self.idle_write_batch.lock().replace((
            TypeId::of::<WriteBatch<K, FAMILIES>>(),
            Box::new(write_batch),
        ));
        Ok(())
    }

    fn commit(
        &self,
        new_sst_files: Vec<(u32, File)>,
        indicies_to_delete: Vec<usize>,
        mut seq: u32,
    ) -> Result<(), anyhow::Error> {
        let mut new_sst_files = new_sst_files
            .into_iter()
            .map(|(seq, file)| {
                file.sync_all()?;
                Ok(self.open_sst(seq)?)
            })
            .collect::<Result<Vec<_>>>()?;

        if !indicies_to_delete.is_empty() {
            seq += 1;
        }

        let removed_ssts;

        {
            let mut inner = self.inner.write();
            inner.current_sequence_number = seq;
            removed_ssts = remove_indicies(&mut inner.static_sorted_files, &indicies_to_delete);
            inner.static_sorted_files.append(&mut new_sst_files);
        }

        let removed_ssts = removed_ssts
            .into_iter()
            .map(|sst| sst.sequence_number())
            .collect::<Vec<_>>();

        if !indicies_to_delete.is_empty() {
            // Write *.del file, marking the selected files as to delete
            let mut buf = Vec::with_capacity(removed_ssts.len() * 4);
            for seq in removed_ssts.iter() {
                buf.write_u32::<BE>(*seq)?;
            }
            let mut file = File::create(self.path.join(format!("{:08}.del", seq)))?;
            file.write_all(&buf)?;
            file.sync_all()?;
        }

        let mut current_file = OpenOptions::new()
            .write(true)
            .truncate(false)
            .read(false)
            .open(self.path.join("CURRENT"))?;
        current_file.write_u32::<BE>(seq)?;
        current_file.sync_all()?;

        for seq in removed_ssts {
            fs::remove_file(self.path.join(&format!("{seq:08}.sst")))?;
        }

        Ok(())
    }

    pub fn full_compact(&self) -> Result<()> {
        self.compact(1.0, usize::MAX)?;
        Ok(())
    }

    pub fn compact(&self, sharding_factor: f32, max_chain: usize) -> Result<()> {
        if self
            .active_write_operation
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            bail!(
                "Another write batch or compaction is already active (Only a single write \
                 operations is allowed at a time)"
            );
        }

        let mut sequence_number;
        let mut new_sst_files = Vec::new();
        let mut indicies_to_delete = Vec::new();

        {
            let inner = self.inner.read();
            let mut uncompacted_files = inner
                .static_sorted_files
                .iter()
                .map(|sst| Some(sst))
                .collect::<Vec<_>>();
            sequence_number = AtomicU32::new(inner.current_sequence_number);
            self.compact_internal(
                &mut uncompacted_files,
                &sequence_number,
                &mut new_sst_files,
                &mut indicies_to_delete,
                sharding_factor,
                max_chain,
            )?;
        }

        self.commit(
            new_sst_files,
            indicies_to_delete,
            *sequence_number.get_mut(),
        )?;

        self.active_write_operation.store(false, Ordering::Release);

        Ok(())
    }

    fn compact_internal<'l>(
        &self,
        static_sorted_files: &mut Vec<Option<&'l StaticSortedFile>>,
        sequence_number: &AtomicU32,
        new_sst_files: &mut Vec<(u32, File)>,
        indicies_to_delete: &mut Vec<usize>,
        sharding_factor: f32,
        max_chain: usize,
    ) -> Result<bool> {
        let mut compaction_jobs = Vec::new();

        loop {
            // Find all ranges
            let ranges = static_sorted_files
                .iter()
                .flat_map(|slot| {
                    if let Some(sst) = slot {
                        sst.range().ok()
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();

            // Find the biggest spread
            let Some(mut selected_range) =
                ranges.iter().max_by_key(|range| range.spread()).copied()
            else {
                // No SST files to compact
                break;
            };

            // Extend range to include overlapping ranges
            'outer: loop {
                for range in ranges.iter() {
                    if selected_range.is_overlapping(&range)
                        && (selected_range.min_hash > range.min_hash
                            || selected_range.max_hash < range.max_hash)
                    {
                        selected_range.min_hash = selected_range.min_hash.min(range.min_hash);
                        selected_range.max_hash = selected_range.max_hash.max(range.max_hash);
                        continue 'outer;
                    }
                }
                break;
            }

            // Find all SST files that overlap with the selected range
            let mut selected_files = static_sorted_files
                .iter_mut()
                .enumerate()
                .flat_map(|(i, slot)| {
                    if let Some(sst) = &slot {
                        if let Some(range) = sst.range().ok() {
                            // Ranges have overlap
                            if selected_range.is_overlapping(&range) {
                                return slot.take().map(|sst| (i, sst, false));
                            }
                        }
                    }
                    None
                })
                .collect::<Vec<_>>();

            if selected_files.len() > 1 {
                // Target spread is
                let target_spread =
                    (((selected_range.spread() / selected_files.len().min(max_chain) as u64) as f32
                        / sharding_factor)
                        .min(u64::MAX as f32) as u64)
                        .saturating_add(1);

                // Check if we need to compact
                let ssts_with_target_spread = selected_files
                    .iter_mut()
                    .map(|(_, sst, in_target_range)| {
                        *in_target_range = sst
                            .range()
                            .ok()
                            .map_or(false, |range| range.spread() <= target_spread);
                        *in_target_range
                    })
                    .filter(|in_target_range| *in_target_range)
                    .count();
                let target_number = (selected_files.len() as f32 * sharding_factor) as usize;
                if ssts_with_target_spread < target_number {
                    compaction_jobs.push(selected_files);
                }
            }
        }

        let key_block_cache = &self.key_block_cache;
        let value_block_cache = &self.value_block_cache;
        let path = &self.path;
        let result = compaction_jobs
            .into_par_iter()
            .map(|selected_files| {
                let in_range_at_start = selected_files
                    .iter()
                    .take_while(|(_, _, in_target_range)| *in_target_range)
                    .count();
                let mut in_range_at_end = selected_files
                    .iter()
                    .rev()
                    .take_while(|(_, _, in_target_range)| *in_target_range)
                    .count();
                if selected_files.len() - in_range_at_start - in_range_at_end > max_chain {
                    in_range_at_end = selected_files.len() - max_chain - in_range_at_start;
                }

                let mut new_sst_files = Vec::new();

                // Split the selected files into the start, middle and end files

                // The selected_files_start can be kept on disk as they are
                let (_selected_files_start, selected_files) =
                    selected_files.split_at(in_range_at_start);

                // Later we will remove the mid and end files as they are updated
                let indicies_to_delete = selected_files
                    .iter()
                    .map(|(i, _, _)| *i)
                    .collect::<Vec<_>>();

                let (selected_files_mid, selected_files_end) =
                    selected_files.split_at(selected_files.len() - in_range_at_end);

                fn create_sst_file(
                    family: u32,
                    entries: &[LookupEntry],
                    total_key_size: usize,
                    total_value_size: usize,
                    path: &Path,
                    seq: u32,
                ) -> Result<(u32, File)> {
                    let builder = StaticSortedFileBuilder::new(
                        family,
                        &entries,
                        total_key_size,
                        total_value_size,
                    )?;
                    Ok((seq, builder.write(&path.join(format!("{:08}.sst", seq)))?))
                }

                let family = selected_files_mid[0].1.family()?;

                // Iterate all middle files
                let iters = selected_files_mid
                    .iter()
                    .map(|(_, sst, _)| sst.iter(&key_block_cache, &value_block_cache))
                    .collect::<Result<Vec<_>>>()?;

                let iter = MergeIter::new(iters.into_iter())?;

                let mut total_key_size = 0;
                let mut total_value_size = 0;
                let mut current: Option<LookupEntry> = None;
                let mut entries = Vec::new();
                for entry in iter {
                    let entry = entry?;

                    // Remove duplicates
                    if let Some(current) = current.take() {
                        if current.key != entry.key {
                            let key_size = current.key.len();
                            let value_size = current.value.len();
                            total_key_size += key_size;
                            total_value_size += value_size;

                            if total_key_size + total_value_size > DATA_THRESHOLD_PER_COMPACTED_FILE
                                || entries.len() >= MAX_ENTRIES_PER_COMPACTED_FILE
                            {
                                let seq = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

                                new_sst_files.push(create_sst_file(
                                    family,
                                    &entries,
                                    total_key_size - key_size,
                                    total_value_size - value_size,
                                    &path,
                                    seq,
                                )?);

                                entries.clear();
                                total_key_size = key_size;
                                total_value_size = value_size;
                            }

                            entries.push(current);
                        } else {
                            // Override value
                        }
                    }
                    current = Some(entry);
                }
                if let Some(entry) = current {
                    total_key_size += entry.key.len();
                    total_value_size += entry.value.len();
                    entries.push(entry);
                }
                if !entries.is_empty() {
                    let seq = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

                    new_sst_files.push(create_sst_file(
                        family,
                        &entries,
                        total_key_size,
                        total_value_size,
                        &path,
                        seq,
                    )?);
                }

                // Move files at the end of the range
                for (_, sst, _) in selected_files_end.iter() {
                    let seq = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
                    let src_path = self.path.join(&format!("{:08}.sst", sst.sequence_number()));
                    let dst_path = self.path.join(&format!("{:08}.sst", seq));
                    if fs::hard_link(&src_path, &dst_path).is_err() {
                        fs::copy(src_path, &dst_path)?;
                    }
                    new_sst_files.push((seq, File::open(dst_path)?));
                }

                anyhow::Ok((new_sst_files, indicies_to_delete))
            })
            .collect::<Result<Vec<_>>>()?;
        for (mut inner_new_sst_files, mut inner_indicies_to_delete) in result {
            new_sst_files.append(&mut inner_new_sst_files);
            indicies_to_delete.append(&mut inner_indicies_to_delete);
        }

        Ok(true)
    }

    pub fn get<K: QueryKey>(&self, family: usize, key: &K) -> Result<Option<ArcSlice<u8>>> {
        let hash = hash_key(key);
        let inner = self.inner.read();
        for sst in inner.static_sorted_files.iter().rev() {
            match sst.lookup(
                family as u32,
                hash,
                key,
                &self.aqmf_cache,
                &self.index_block_cache,
                &self.key_block_cache,
                &self.value_block_cache,
            )? {
                LookupResult::Deleted => {
                    #[cfg(feature = "stats")]
                    self.stats.hits_deleted.fetch_add(1, Ordering::Relaxed);
                    return Ok(None);
                }
                LookupResult::Small { value } => {
                    #[cfg(feature = "stats")]
                    self.stats.hits_small.fetch_add(1, Ordering::Relaxed);
                    return Ok(Some(value));
                }
                LookupResult::Blob { sequence_number } => {
                    #[cfg(feature = "stats")]
                    self.stats.hits_blob.fetch_add(1, Ordering::Relaxed);
                    let blob = self.read_blob(sequence_number)?;
                    return Ok(Some(blob));
                }
                LookupResult::RangeMiss => {
                    #[cfg(feature = "stats")]
                    self.stats.miss_range.fetch_add(1, Ordering::Relaxed);
                }
                LookupResult::QuickFilterMiss => {
                    #[cfg(feature = "stats")]
                    self.stats.miss_aqmf.fetch_add(1, Ordering::Relaxed);
                }
                LookupResult::KeyMiss => {
                    #[cfg(feature = "stats")]
                    self.stats.miss_key.fetch_add(1, Ordering::Relaxed);
                }
            }
        }
        #[cfg(feature = "stats")]
        self.stats.miss_global.fetch_add(1, Ordering::Relaxed);
        Ok(None)
    }

    #[cfg(feature = "stats")]
    pub fn statistics(&self) -> Statistics {
        let inner = self.inner.read();
        Statistics {
            sst_files: inner.static_sorted_files.len(),
            index_block_cache: CacheStatistics::new(&self.index_block_cache),
            key_block_cache: CacheStatistics::new(&self.key_block_cache),
            value_block_cache: CacheStatistics::new(&self.value_block_cache),
            aqmf_cache: CacheStatistics::new(&self.aqmf_cache),
            hits: self.stats.hits_deleted.load(Ordering::Relaxed)
                + self.stats.hits_small.load(Ordering::Relaxed)
                + self.stats.hits_blob.load(Ordering::Relaxed),
            misses: self.stats.miss_global.load(Ordering::Relaxed),
            miss_range: self.stats.miss_range.load(Ordering::Relaxed),
            miss_aqmf: self.stats.miss_aqmf.load(Ordering::Relaxed),
            miss_key: self.stats.miss_key.load(Ordering::Relaxed),
        }
    }

    pub fn shutdown(&self) -> Result<()> {
        #[cfg(feature = "stats")]
        println!("{:#?}", self.statistics());
        Ok(())
    }
}

fn remove_indicies<T>(list: &mut Vec<T>, sorted_indicies: &[usize]) -> Vec<T> {
    let mut r = 0;
    let mut w = 0;
    let mut i = 0;
    while r < list.len() {
        if i < sorted_indicies.len() {
            let idx = sorted_indicies[i];
            if r != idx {
                list.swap(w, r);
                w += 1;
                r += 1;
            } else {
                r += 1;
                i += 1;
            }
        } else {
            list.swap(w, r);
            w += 1;
            r += 1;
        }
    }
    list.split_off(w)
}

#[cfg(test)]
mod tests {
    use crate::db::remove_indicies;

    #[test]
    fn test_remove_indicies() {
        let mut list = vec![1, 2, 3, 4, 5, 6, 7, 8, 9];
        let sorted_indicies = vec![1, 3, 5, 7];
        let removed = remove_indicies(&mut list, &sorted_indicies);
        assert_eq!(list, vec![1, 3, 5, 7, 9]);
        assert_eq!(removed, vec![2, 4, 6, 8]);
    }
}
