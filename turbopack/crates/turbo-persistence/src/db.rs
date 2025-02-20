use std::{
    any::{Any, TypeId},
    collections::HashSet,
    fs::{self, File, OpenOptions, ReadDir},
    io::Write,
    mem::{swap, transmute, MaybeUninit},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc,
    },
};

use anyhow::{bail, Context, Result};
use byteorder::{ReadBytesExt, WriteBytesExt, BE};
use lzzzz::lz4::decompress;
use memmap2::Mmap;
use parking_lot::{Mutex, RwLock};
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};

use crate::{
    arc_slice::ArcSlice,
    compaction::selector::{
        get_compaction_jobs, total_coverage, CompactConfig, Compactable, CompactionJobs,
    },
    constants::{
        AQMF_AVG_SIZE, AQMF_CACHE_SIZE, DATA_THRESHOLD_PER_COMPACTED_FILE, KEY_BLOCK_AVG_SIZE,
        KEY_BLOCK_CACHE_SIZE, MAX_ENTRIES_PER_COMPACTED_FILE, VALUE_BLOCK_AVG_SIZE,
        VALUE_BLOCK_CACHE_SIZE,
    },
    key::{hash_key, StoreKey},
    lookup_entry::LookupEntry,
    merge_iter::MergeIter,
    static_sorted_file::{
        AqmfCache, BlockCache, LookupResult, StaticSortedFile, StaticSortedFileRange,
    },
    static_sorted_file_builder::StaticSortedFileBuilder,
    write_batch::{FinishResult, WriteBatch},
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

/// TurboPersistence is a persistent key-value store. It is limited to a single writer at a time
/// using a single write batch. It allows for concurrent reads.
pub struct TurboPersistence {
    /// The path to the directory where the database is stored
    path: PathBuf,
    /// The inner state of the database. Writing will update that.
    inner: RwLock<Inner>,
    /// A cache for the last WriteBatch. It is used to avoid reallocation of buffers for the
    /// WriteBatch.
    idle_write_batch: Mutex<Option<(TypeId, Box<dyn Any + Send + Sync>)>>,
    /// A flag to indicate if a write operation is currently active. Prevents multiple concurrent
    /// write operations.
    active_write_operation: AtomicBool,
    /// A cache for deserialized AQMF filters.
    aqmf_cache: AqmfCache,
    /// A cache for decompressed key blocks.
    key_block_cache: BlockCache,
    /// A cache for decompressed value blocks.
    value_block_cache: BlockCache,
    /// Statistics for the database.
    #[cfg(feature = "stats")]
    stats: TrackedStats,
}

/// The inner state of the database.
struct Inner {
    /// The list of SST files in the database in order.
    static_sorted_files: Vec<StaticSortedFile>,
    /// The current sequence number for the database.
    current_sequence_number: u32,
}

impl TurboPersistence {
    /// Open a TurboPersistence database at the given path.
    /// This will read the directory and might performance cleanup when the database was not closed
    /// properly. Cleanup only requires to read a few bytes from a few files and to delete
    /// files, so it's fast.
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

    /// Performas the initial check on the database directory.
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

    /// Creates the directory and initializes it.
    fn create_and_init_directory(&mut self) -> Result<()> {
        fs::create_dir_all(&self.path)?;
        self.init_directory()
    }

    /// Initializes the directory by creating the CURRENT file.
    fn init_directory(&mut self) -> Result<()> {
        let mut current = File::create(self.path.join("CURRENT"))?;
        current.write_u32::<BE>(0)?;
        current.flush()?;
        Ok(())
    }

    /// Loads an existing database directory and performs cleanup if necessary.
    fn load_directory(&mut self, entries: ReadDir) -> Result<bool> {
        let mut sst_files = Vec::new();
        let mut current_file = match File::open(self.path.join("CURRENT")) {
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
                                let sst_file = self.path.join(format!("{:08}.sst", seq));
                                let blob_file = self.path.join(format!("{:08}.blob", seq));
                                for path in [sst_file, blob_file] {
                                    if fs::exists(&path)? {
                                        fs::remove_file(path)?;
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
                            if !path
                                .file_name()
                                .is_some_and(|s| s.as_encoded_bytes().starts_with(b"."))
                            {
                                bail!("Unexpected file in persistence directory: {:?}", path);
                            }
                        }
                    }
                }
            } else {
                match path.file_stem().and_then(|s| s.to_str()) {
                    Some("CURRENT") => {
                        // Already read
                    }
                    _ => {
                        if !path
                            .file_name()
                            .is_some_and(|s| s.as_encoded_bytes().starts_with(b"."))
                        {
                            bail!("Unexpected file in persistence directory: {:?}", path);
                        }
                    }
                }
            }
        }

        sst_files.retain(|seq| !deleted_files.contains(seq));
        sst_files.sort_unstable();
        let sst_files = sst_files
            .into_iter()
            .map(|seq| self.open_sst(seq))
            .collect::<Result<Vec<StaticSortedFile>>>()?;
        #[cfg(feature = "print_stats")]
        {
            for sst in sst_files.iter() {
                let crate::static_sorted_file::StaticSortedFileRange {
                    family,
                    min_hash,
                    max_hash,
                } = sst.range()?;
                println!(
                    "SST {}  {} {:016x} - {:016x}  {:016x}",
                    sst.sequence_number(),
                    family,
                    min_hash,
                    max_hash,
                    max_hash - min_hash
                );
            }
        }
        let inner = self.inner.get_mut();
        inner.static_sorted_files = sst_files;
        inner.current_sequence_number = current;
        Ok(true)
    }

    /// Opens a single SST file. This memory maps the file, but doesn't read it yet.
    fn open_sst(&self, seq: u32) -> Result<StaticSortedFile> {
        let path = self.path.join(format!("{:08}.sst", seq));
        StaticSortedFile::open(seq, path)
            .with_context(|| format!("Unable to open sst file {:08}.sst", seq))
    }

    /// Reads and decompresses a blob file. This is not backed by any cache.
    fn read_blob(&self, seq: u32) -> Result<ArcSlice<u8>> {
        let path = self.path.join(format!("{:08}.blob", seq));
        let mmap = unsafe { Mmap::map(&File::open(&path)?)? };
        #[cfg(unix)]
        mmap.advise(memmap2::Advice::Sequential)?;
        #[cfg(unix)]
        mmap.advise(memmap2::Advice::WillNeed)?;
        #[cfg(target_os = "linux")]
        mmap.advise(memmap2::Advice::DontFork)?;
        #[cfg(target_os = "linux")]
        mmap.advise(memmap2::Advice::Unmergeable)?;
        let mut compressed = &mmap[..];
        let uncompressed_length = compressed.read_u32::<BE>()? as usize;

        let buffer = Arc::new_zeroed_slice(uncompressed_length);
        // Safety: MaybeUninit<u8> can be safely transmuted to u8.
        let mut buffer = unsafe { transmute::<Arc<[MaybeUninit<u8>]>, Arc<[u8]>>(buffer) };
        // Safety: We know that the buffer is not shared yet.
        let decompressed = unsafe { Arc::get_mut_unchecked(&mut buffer) };
        decompress(compressed, decompressed)?;
        Ok(ArcSlice::from(buffer))
    }

    /// Returns true if the database is empty.
    pub fn is_empty(&self) -> bool {
        self.inner.read().static_sorted_files.is_empty()
    }

    /// Starts a new WriteBatch for the database. Only a single write operation is allowed at a
    /// time. The WriteBatch need to be committed with [`TurboPersistence::commit_write_batch`].
    /// Note that the WriteBatch might start writing data to disk while it's filled up with data.
    /// This data will only become visible after the WriteBatch is committed.
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

    /// Commits a WriteBatch to the database. This will finish writing the data to disk and make it
    /// visible to readers.
    pub fn commit_write_batch<K: StoreKey + Send + Sync + 'static, const FAMILIES: usize>(
        &self,
        mut write_batch: WriteBatch<K, FAMILIES>,
    ) -> Result<()> {
        let FinishResult {
            sequence_number,
            new_sst_files,
            new_blob_files,
        } = write_batch.finish()?;
        self.commit(new_sst_files, new_blob_files, vec![], sequence_number)?;
        self.active_write_operation.store(false, Ordering::Release);
        self.idle_write_batch.lock().replace((
            TypeId::of::<WriteBatch<K, FAMILIES>>(),
            Box::new(write_batch),
        ));
        Ok(())
    }

    /// fsyncs the new files and updates the CURRENT file. Updates the database state to include the
    /// new files.
    fn commit(
        &self,
        mut new_sst_files: Vec<(u32, File)>,
        new_blob_files: Vec<File>,
        mut indicies_to_delete: Vec<usize>,
        mut seq: u32,
    ) -> Result<(), anyhow::Error> {
        new_sst_files.sort_unstable_by_key(|(seq, _)| *seq);

        let mut new_sst_files = new_sst_files
            .into_iter()
            .map(|(seq, file)| {
                file.sync_all()?;
                self.open_sst(seq)
            })
            .collect::<Result<Vec<_>>>()?;

        for file in new_blob_files {
            file.sync_all()?;
        }

        if !indicies_to_delete.is_empty() {
            seq += 1;
        }

        let removed_ssts;

        {
            let mut inner = self.inner.write();
            inner.current_sequence_number = seq;
            indicies_to_delete.sort_unstable();
            removed_ssts = remove_indicies(&mut inner.static_sorted_files, &indicies_to_delete);
            inner.static_sorted_files.append(&mut new_sst_files);
        }

        let mut removed_ssts = removed_ssts
            .into_iter()
            .map(|sst| sst.sequence_number())
            .collect::<Vec<_>>();
        removed_ssts.sort_unstable();

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
            fs::remove_file(self.path.join(format!("{seq:08}.sst")))?;
        }

        Ok(())
    }

    /// Runs a full compaction on the database. This will rewrite all SST files, removing all
    /// duplicate keys and separating all key ranges into unique files.
    pub fn full_compact(&self) -> Result<()> {
        self.compact(0.0, usize::MAX)?;
        Ok(())
    }

    /// Runs a (partial) compaction. Compaction will only be performed if the coverage of the SST
    /// files is above the given threshold. The coverage is the average number of SST files that
    /// need to be read to find a key. It also limits the maximum number of SST files that are
    /// merged at once, which is the main factor for the runtime of the compaction.
    pub fn compact(&self, max_coverage: f32, max_merge_sequence: usize) -> Result<()> {
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
            sequence_number = AtomicU32::new(inner.current_sequence_number);
            self.compact_internal(
                &inner.static_sorted_files,
                &sequence_number,
                &mut new_sst_files,
                &mut indicies_to_delete,
                max_coverage,
                max_merge_sequence,
            )?;
        }

        self.commit(
            new_sst_files,
            Vec::new(),
            indicies_to_delete,
            *sequence_number.get_mut(),
        )?;

        self.active_write_operation.store(false, Ordering::Release);

        Ok(())
    }

    /// Internal function to perform a compaction.
    fn compact_internal(
        &self,
        static_sorted_files: &[StaticSortedFile],
        sequence_number: &AtomicU32,
        new_sst_files: &mut Vec<(u32, File)>,
        indicies_to_delete: &mut Vec<usize>,
        max_coverage: f32,
        max_merge_sequence: usize,
    ) -> Result<bool> {
        if static_sorted_files.is_empty() {
            return Ok(false);
        }

        struct SstWithRange {
            index: usize,
            range: StaticSortedFileRange,
        }

        impl Compactable for SstWithRange {
            fn range(&self) -> (u64, u64) {
                (self.range.min_hash, self.range.max_hash)
            }
        }

        let ssts_with_ranges = static_sorted_files
            .iter()
            .enumerate()
            .flat_map(|(index, sst)| sst.range().ok().map(|range| SstWithRange { index, range }))
            .collect::<Vec<_>>();

        let families = ssts_with_ranges
            .iter()
            .map(|s| s.range.family)
            .max()
            .unwrap() as usize
            + 1;

        let mut sst_by_family = Vec::with_capacity(families);
        sst_by_family.resize_with(families, Vec::new);

        for sst in ssts_with_ranges {
            sst_by_family[sst.range.family as usize].push(sst);
        }

        let key_block_cache = &self.key_block_cache;
        let value_block_cache = &self.value_block_cache;
        let path = &self.path;

        let result = sst_by_family
            .into_par_iter()
            .with_min_len(1)
            .enumerate()
            .map(|(family, ssts_with_ranges)| {
                let coverage = total_coverage(&ssts_with_ranges, (0, u64::MAX));
                if coverage <= max_coverage {
                    return Ok((Vec::new(), Vec::new()));
                }

                let CompactionJobs {
                    merge_jobs,
                    move_jobs,
                } = get_compaction_jobs(
                    &ssts_with_ranges,
                    &CompactConfig {
                        max_merge: max_merge_sequence,
                        min_merge: 2,
                    },
                );

                // Later we will remove the merged and moved files
                let indicies_to_delete = merge_jobs
                    .iter()
                    .flat_map(|l| l.iter().copied())
                    .chain(move_jobs.iter().copied())
                    .map(|index| ssts_with_ranges[index].index)
                    .collect::<Vec<_>>();

                // Merge SST files
                let merge_result = merge_jobs
                    .into_par_iter()
                    .with_min_len(1)
                    .map(|indicies| {
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
                                entries,
                                total_key_size,
                                total_value_size,
                            )?;
                            Ok((seq, builder.write(&path.join(format!("{:08}.sst", seq)))?))
                        }

                        let mut new_sst_files = Vec::new();

                        // Iterate all SST files
                        let iters = indicies
                            .iter()
                            .map(|&index| {
                                let index = ssts_with_ranges[index].index;
                                let sst = &static_sorted_files[index];
                                sst.iter(key_block_cache, value_block_cache)
                            })
                            .collect::<Result<Vec<_>>>()?;

                        let iter = MergeIter::new(iters.into_iter())?;

                        let mut total_key_size = 0;
                        let mut total_value_size = 0;
                        let mut current: Option<LookupEntry> = None;
                        let mut entries = Vec::new();
                        let mut last_entries = Vec::new();
                        let mut last_entries_total_sizes = (0, 0);
                        for entry in iter {
                            let entry = entry?;

                            // Remove duplicates
                            if let Some(current) = current.take() {
                                if current.key != entry.key {
                                    let key_size = current.key.len();
                                    let value_size = current.value.size_in_sst();
                                    total_key_size += key_size;
                                    total_value_size += value_size;

                                    if total_key_size + total_value_size
                                        > DATA_THRESHOLD_PER_COMPACTED_FILE
                                        || entries.len() >= MAX_ENTRIES_PER_COMPACTED_FILE
                                    {
                                        let (selected_total_key_size, selected_total_value_size) =
                                            last_entries_total_sizes;
                                        swap(&mut entries, &mut last_entries);
                                        last_entries_total_sizes = (
                                            total_key_size - key_size,
                                            total_value_size - value_size,
                                        );
                                        total_key_size = key_size;
                                        total_value_size = value_size;

                                        if !entries.is_empty() {
                                            let seq =
                                                sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

                                            new_sst_files.push(create_sst_file(
                                                family as u32,
                                                &entries,
                                                selected_total_key_size,
                                                selected_total_value_size,
                                                path,
                                                seq,
                                            )?);

                                            entries.clear();
                                        }
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
                            total_value_size += entry.value.size_in_sst();
                            entries.push(entry);
                        }

                        // If we have one set of entries left, write them to a new SST file
                        if last_entries.is_empty() && !entries.is_empty() {
                            let seq = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

                            new_sst_files.push(create_sst_file(
                                family as u32,
                                &entries,
                                total_key_size,
                                total_value_size,
                                path,
                                seq,
                            )?);
                        } else
                        // If we have two sets of entries left, merge them and
                        // split it into two SST files, to avoid having a
                        // single SST file that is very small.
                        if !last_entries.is_empty() {
                            last_entries.append(&mut entries);

                            last_entries_total_sizes.0 += total_key_size;
                            last_entries_total_sizes.1 += total_value_size;

                            let (part1, part2) = last_entries.split_at(last_entries.len() / 2);

                            let seq1 = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
                            let seq2 = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

                            new_sst_files.push(create_sst_file(
                                family as u32,
                                part1,
                                // We don't know the exact sizes so we estimate them
                                last_entries_total_sizes.0 / 2,
                                last_entries_total_sizes.1 / 2,
                                path,
                                seq1,
                            )?);

                            new_sst_files.push(create_sst_file(
                                family as u32,
                                part2,
                                last_entries_total_sizes.0 / 2,
                                last_entries_total_sizes.1 / 2,
                                path,
                                seq2,
                            )?);
                        }
                        Ok(new_sst_files)
                    })
                    .collect::<Result<Vec<_>>>()?;

                let move_jobs = move_jobs
                    .into_iter()
                    .map(|index| {
                        let seq = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
                        (index, seq)
                    })
                    .collect::<Vec<_>>();

                // Move SST files
                let mut new_sst_files = move_jobs
                    .into_par_iter()
                    .with_min_len(1)
                    .map(|(index, seq)| {
                        let index = ssts_with_ranges[index].index;
                        let sst = &static_sorted_files[index];
                        let src_path = self.path.join(format!("{:08}.sst", sst.sequence_number()));
                        let dst_path = self.path.join(format!("{:08}.sst", seq));
                        if fs::hard_link(&src_path, &dst_path).is_err() {
                            fs::copy(src_path, &dst_path)?;
                        }
                        Ok((seq, File::open(dst_path)?))
                    })
                    .collect::<Result<Vec<_>>>()?;

                new_sst_files.extend(merge_result.into_iter().flatten());
                Ok((new_sst_files, indicies_to_delete))
            })
            .collect::<Result<Vec<_>>>()?;

        for (mut inner_new_sst_files, mut inner_indicies_to_delete) in result {
            new_sst_files.append(&mut inner_new_sst_files);
            indicies_to_delete.append(&mut inner_indicies_to_delete);
        }

        Ok(true)
    }

    /// Get a value from the database. Returns None if the key is not found. The returned value
    /// might hold onto a block of the database and it should not be hold long-term.
    pub fn get<K: QueryKey>(&self, family: usize, key: &K) -> Result<Option<ArcSlice<u8>>> {
        let hash = hash_key(key);
        let inner = self.inner.read();
        for sst in inner.static_sorted_files.iter().rev() {
            match sst.lookup(
                family as u32,
                hash,
                key,
                &self.aqmf_cache,
                &self.key_block_cache,
                &self.value_block_cache,
            )? {
                LookupResult::Deleted => {
                    #[cfg(feature = "stats")]
                    self.stats.hits_deleted.fetch_add(1, Ordering::Relaxed);
                    return Ok(None);
                }
                LookupResult::Slice { value } => {
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

    /// Returns database statistics.
    #[cfg(feature = "stats")]
    pub fn statistics(&self) -> Statistics {
        let inner = self.inner.read();
        Statistics {
            sst_files: inner.static_sorted_files.len(),
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

    /// Shuts down the database. This will print statistics if the `print_stats` feature is enabled.
    pub fn shutdown(&self) -> Result<()> {
        #[cfg(feature = "print_stats")]
        println!("{:#?}", self.statistics());
        Ok(())
    }
}

/// Helper method to remove certain indicies from a list while keeping the order.
/// This is similar to the `remove` method on Vec, but it allows to remove multiple indicies at
/// once. It returns the removed elements in unspecified order.
///
/// Note: The `sorted_indicies` list needs to be sorted.
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
        assert!(removed.contains(&2));
        assert!(removed.contains(&4));
        assert!(removed.contains(&6));
        assert!(removed.contains(&8));
        assert_eq!(removed.len(), 4);
    }

    #[test]
    fn test_remove_indicies2() {
        let mut list = vec![1, 2, 3, 4, 5, 6, 7, 8, 9];
        let sorted_indicies = vec![0, 1, 2, 6, 7, 8];
        let removed = remove_indicies(&mut list, &sorted_indicies);
        assert_eq!(list, vec![4, 5, 6]);
        assert!(removed.contains(&1));
        assert!(removed.contains(&2));
        assert!(removed.contains(&3));
        assert!(removed.contains(&7));
        assert!(removed.contains(&8));
        assert!(removed.contains(&9));
        assert_eq!(removed.len(), 6);
    }
}
