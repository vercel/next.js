use std::{
    any::{Any, TypeId},
    collections::HashSet,
    fs::{self, File, OpenOptions, ReadDir},
    io::{BufWriter, Write},
    mem::{MaybeUninit, swap, transmute},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU32, Ordering},
    },
};

use anyhow::{Context, Result, bail};
use byteorder::{BE, ReadBytesExt, WriteBytesExt};
use jiff::Timestamp;
use lzzzz::lz4::decompress;
use memmap2::Mmap;
use parking_lot::{Mutex, RwLock};
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};
use rustc_hash::FxHashSet;
use tracing::Span;

use crate::{
    QueryKey,
    arc_slice::ArcSlice,
    compaction::selector::{
        CompactConfig, Compactable, CompactionJobs, get_compaction_jobs, total_coverage,
    },
    constants::{
        AQMF_AVG_SIZE, AQMF_CACHE_SIZE, DATA_THRESHOLD_PER_COMPACTED_FILE, KEY_BLOCK_AVG_SIZE,
        KEY_BLOCK_CACHE_SIZE, MAX_ENTRIES_PER_COMPACTED_FILE, VALUE_BLOCK_AVG_SIZE,
        VALUE_BLOCK_CACHE_SIZE,
    },
    key::{StoreKey, hash_key},
    lookup_entry::{LookupEntry, LookupValue},
    merge_iter::MergeIter,
    meta_file::{
        ApplySstFilterResult, AqmfCache, MetaFile, MetaLookupResult, StaticSortedFileRange,
    },
    meta_file_builder::MetaFileBuilder,
    static_sorted_file::{BlockCache, SstLookupResult},
    static_sorted_file_builder::{StaticSortedFileBuilder, StaticSortedFileBuilderMetaResult},
    write_batch::{FinishResult, WriteBatch},
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
    pub meta_files: usize,
    pub sst_files: usize,
    pub key_block_cache: CacheStatistics,
    pub value_block_cache: CacheStatistics,
    pub aqmf_cache: CacheStatistics,
    pub hits: u64,
    pub misses: u64,
    pub miss_family: u64,
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
    miss_family: std::sync::atomic::AtomicU64,
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
    /// The list of meta files in the database. This is used to derive the SST files.
    meta_files: Vec<MetaFile>,
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
                meta_files: Vec::new(),
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
        let mut meta_files = Vec::new();
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
                        "meta" => {
                            meta_files.push(seq);
                        }
                        "del" => {
                            let mut content = &*fs::read(&path)?;
                            let mut no_existing_files = true;
                            while !content.is_empty() {
                                let seq = content.read_u32::<BE>()?;
                                deleted_files.insert(seq);
                                let sst_file = self.path.join(format!("{seq:08}.sst"));
                                let meta_file = self.path.join(format!("{seq:08}.meta"));
                                let blob_file = self.path.join(format!("{seq:08}.blob"));
                                for path in [sst_file, blob_file, meta_file] {
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
                        "blob" | "sst" => {
                            // ignore blobs and sst, they are read when needed
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
                    Some("LOG") => {
                        // Ignored, write-only
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

        meta_files.retain(|seq| !deleted_files.contains(seq));
        meta_files.sort_unstable();
        let span = Span::current();
        let mut meta_files = meta_files
            .into_par_iter()
            .with_min_len(1)
            .map(|seq| {
                let _span = span.enter();
                let meta_file = MetaFile::open(&self.path, seq)?;
                Ok(meta_file)
            })
            .collect::<Result<Vec<MetaFile>>>()?;

        let mut open_sst_seq_numbers = FxHashSet::default();
        meta_files.retain_mut(|meta_file| {
            !matches!(
                meta_file.apply_sst_filter(|seq| open_sst_seq_numbers.insert(seq)),
                ApplySstFilterResult::Empty
            )
        });

        let inner = self.inner.get_mut();
        inner.meta_files = meta_files;
        inner.current_sequence_number = current;
        Ok(true)
    }

    /// Reads and decompresses a blob file. This is not backed by any cache.
    fn read_blob(&self, seq: u32) -> Result<ArcSlice<u8>> {
        let path = self.path.join(format!("{seq:08}.blob"));
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
        self.inner.read().meta_files.is_empty()
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

    fn open_log(&self) -> Result<BufWriter<File>> {
        let log_path = self.path.join("LOG");
        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)?;
        Ok(BufWriter::new(log_file))
    }

    /// Commits a WriteBatch to the database. This will finish writing the data to disk and make it
    /// visible to readers.
    pub fn commit_write_batch<K: StoreKey + Send + Sync + 'static, const FAMILIES: usize>(
        &self,
        mut write_batch: WriteBatch<K, FAMILIES>,
    ) -> Result<()> {
        let FinishResult {
            sequence_number,
            new_meta_files,
            new_sst_files,
            new_blob_files,
            keys_written,
        } = write_batch.finish()?;
        self.commit(
            new_meta_files,
            new_sst_files,
            new_blob_files,
            vec![],
            vec![],
            sequence_number,
            keys_written,
        )?;
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
        mut new_meta_files: Vec<(u32, File)>,
        mut new_sst_files: Vec<(u32, File)>,
        mut new_blob_files: Vec<(u32, File)>,
        mut sst_seq_numbers_to_delete: Vec<u32>,
        mut blob_seq_numbers_to_delete: Vec<u32>,
        mut seq: u32,
        keys_written: u64,
    ) -> Result<(), anyhow::Error> {
        let time = Timestamp::now();

        new_meta_files.sort_unstable_by_key(|(seq, _)| *seq);

        let mut new_sst_seq_numbers = FxHashSet::default();
        let mut new_meta_files = new_meta_files
            .into_par_iter()
            .with_min_len(1)
            .map(|(seq, file)| {
                file.sync_all()?;
                let meta_file = MetaFile::open(&self.path, seq)?;
                Ok(meta_file)
            })
            .collect::<Result<Vec<_>>>()?;

        for meta_file in new_meta_files.iter_mut() {
            let result = meta_file.apply_sst_filter(|seq| new_sst_seq_numbers.insert(seq));
            debug_assert_eq!(result, ApplySstFilterResult::Unmodified);
        }

        for (_, file) in new_sst_files.iter() {
            file.sync_all()?;
        }
        for (_, file) in new_blob_files.iter() {
            file.sync_all()?;
        }

        let new_meta_info = new_meta_files
            .iter()
            .map(|meta| {
                let ssts = meta
                    .entries()
                    .iter()
                    .map(|entry| {
                        let seq = entry.sequence_number();
                        let range = entry.range();
                        let size = entry.size();
                        (seq, range.min_hash, range.max_hash, size)
                    })
                    .collect::<Vec<_>>();
                (meta.sequence_number(), meta.family(), ssts)
            })
            .collect::<Vec<_>>();

        let has_delete_file;
        let mut meta_seq_numbers_to_delete = Vec::new();

        {
            let mut inner = self.inner.write();
            inner.meta_files.retain_mut(|meta| {
                if matches!(
                    meta.apply_sst_filter(|seq| !new_sst_seq_numbers.contains(&seq)),
                    ApplySstFilterResult::Empty
                ) {
                    meta_seq_numbers_to_delete.push(meta.sequence_number());
                    false
                } else {
                    true
                }
            });
            has_delete_file = !sst_seq_numbers_to_delete.is_empty()
                || !blob_seq_numbers_to_delete.is_empty()
                || !meta_seq_numbers_to_delete.is_empty();
            if has_delete_file {
                seq += 1;
            }
            inner.current_sequence_number = seq;
            inner.meta_files.append(&mut new_meta_files);
        }

        if has_delete_file {
            sst_seq_numbers_to_delete.sort_unstable();
            meta_seq_numbers_to_delete.sort_unstable();
            blob_seq_numbers_to_delete.sort_unstable();
            // Write *.del file, marking the selected files as to delete
            let mut buf = Vec::with_capacity(
                (sst_seq_numbers_to_delete.len()
                    + meta_seq_numbers_to_delete.len()
                    + blob_seq_numbers_to_delete.len())
                    * 4,
            );
            for seq in sst_seq_numbers_to_delete.iter() {
                buf.write_u32::<BE>(*seq)?;
            }
            for seq in meta_seq_numbers_to_delete.iter() {
                buf.write_u32::<BE>(*seq)?;
            }
            for seq in blob_seq_numbers_to_delete.iter() {
                buf.write_u32::<BE>(*seq)?;
            }
            let mut file = File::create(self.path.join(format!("{seq:08}.del")))?;
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

        for seq in sst_seq_numbers_to_delete.iter() {
            fs::remove_file(self.path.join(format!("{seq:08}.sst")))?;
        }
        for seq in meta_seq_numbers_to_delete.iter() {
            fs::remove_file(self.path.join(format!("{seq:08}.meta")))?;
        }
        for seq in blob_seq_numbers_to_delete.iter() {
            fs::remove_file(self.path.join(format!("{seq:08}.blob")))?;
        }

        {
            let mut log = self.open_log()?;
            writeln!(log, "Time {time}")?;
            let span = time.until(Timestamp::now())?;
            writeln!(log, "Commit {seq:08} {keys_written} keys in {span:#}")?;
            for (seq, family, ssts) in new_meta_info {
                writeln!(log, "{seq:08} META family:{family}",)?;
                for (seq, min, max, size) in ssts {
                    writeln!(
                        log,
                        "  {seq:08} SST  {min:016x}-{max:016x} {} MiB",
                        size / 1024 / 1024
                    )?;
                }
            }
            new_sst_files.sort_unstable_by_key(|(seq, _)| *seq);
            for (seq, _) in new_sst_files.iter() {
                writeln!(log, "{seq:08} NEW SST")?;
            }
            new_blob_files.sort_unstable_by_key(|(seq, _)| *seq);
            for (seq, _) in new_blob_files.iter() {
                writeln!(log, "{seq:08} NEW BLOB")?;
            }
            for seq in sst_seq_numbers_to_delete.iter() {
                writeln!(log, "{seq:08} SST DELETED")?;
            }
            for seq in meta_seq_numbers_to_delete.iter() {
                writeln!(log, "{seq:08} META DELETED")?;
            }
            for seq in blob_seq_numbers_to_delete.iter() {
                writeln!(log, "{seq:08} BLOB DELETED")?;
            }
        }

        Ok(())
    }

    /// Runs a full compaction on the database. This will rewrite all SST files, removing all
    /// duplicate keys and separating all key ranges into unique files.
    pub fn full_compact(&self) -> Result<()> {
        self.compact(0.0, usize::MAX, u64::MAX)?;
        Ok(())
    }

    /// Runs a (partial) compaction. Compaction will only be performed if the coverage of the SST
    /// files is above the given threshold. The coverage is the average number of SST files that
    /// need to be read to find a key. It also limits the maximum number of SST files that are
    /// merged at once, which is the main factor for the runtime of the compaction.
    pub fn compact(
        &self,
        max_coverage: f32,
        max_merge_sequence: usize,
        max_merge_size: u64,
    ) -> Result<()> {
        let _span = tracing::info_span!("compact database").entered();
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
        let mut new_meta_files = Vec::new();
        let mut new_sst_files = Vec::new();
        let mut sst_seq_numbers_to_delete = Vec::new();
        let mut blob_seq_numbers_to_delete = Vec::new();
        let mut keys_written = 0;

        {
            let inner = self.inner.read();
            sequence_number = AtomicU32::new(inner.current_sequence_number);
            self.compact_internal(
                &inner.meta_files,
                &sequence_number,
                &mut new_meta_files,
                &mut new_sst_files,
                &mut sst_seq_numbers_to_delete,
                &mut blob_seq_numbers_to_delete,
                &mut keys_written,
                max_coverage,
                max_merge_sequence,
                max_merge_size,
            )?;
        }

        if !new_meta_files.is_empty() {
            self.commit(
                new_meta_files,
                new_sst_files,
                Vec::new(),
                sst_seq_numbers_to_delete,
                blob_seq_numbers_to_delete,
                *sequence_number.get_mut(),
                keys_written,
            )?;
        }

        self.active_write_operation.store(false, Ordering::Release);

        Ok(())
    }

    /// Internal function to perform a compaction.
    fn compact_internal(
        &self,
        meta_files: &[MetaFile],
        sequence_number: &AtomicU32,
        new_meta_files: &mut Vec<(u32, File)>,
        new_sst_files: &mut Vec<(u32, File)>,
        sst_seq_numbers_to_delete: &mut Vec<u32>,
        blob_seq_numbers_to_delete: &mut Vec<u32>,
        keys_written: &mut u64,
        max_coverage: f32,
        max_merge_sequence: usize,
        max_merge_size: u64,
    ) -> Result<()> {
        if meta_files.is_empty() {
            return Ok(());
        }

        struct SstWithRange {
            meta_index: usize,
            index_in_meta: u32,
            seq: u32,
            range: StaticSortedFileRange,
            size: u64,
        }

        impl Compactable for SstWithRange {
            fn range(&self) -> (u64, u64) {
                (self.range.min_hash, self.range.max_hash)
            }

            fn size(&self) -> u64 {
                self.size
            }
        }

        let ssts_with_ranges = meta_files
            .iter()
            .enumerate()
            .flat_map(|(meta_index, meta)| {
                meta.entries()
                    .iter()
                    .enumerate()
                    .map(move |(index_in_meta, entry)| SstWithRange {
                        meta_index,
                        index_in_meta: index_in_meta as u32,
                        seq: entry.sequence_number(),
                        range: entry.range(),
                        size: entry.size(),
                    })
            })
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

        let log_mutex = Mutex::new(());
        let span = Span::current();
        let result = sst_by_family
            .into_par_iter()
            .with_min_len(1)
            .enumerate()
            .map(|(family, ssts_with_ranges)| {
                let family = family as u32;
                let _span = span.clone().entered();
                let coverage = total_coverage(&ssts_with_ranges, (0, u64::MAX));
                if coverage <= max_coverage {
                    return Ok((None, Vec::new(), Vec::new(), Vec::new(), 0));
                }

                let CompactionJobs {
                    merge_jobs,
                    move_jobs,
                } = get_compaction_jobs(
                    &ssts_with_ranges,
                    &CompactConfig {
                        min_merge: 2,
                        max_merge: max_merge_sequence,
                        max_merge_size,
                    },
                );

                if !merge_jobs.is_empty() {
                    let guard = log_mutex.lock();
                    let mut log = self.open_log()?;
                    writeln!(
                        log,
                        "Compaction for family {family} (coverage: {coverage}):"
                    )?;
                    for job in merge_jobs.iter() {
                        writeln!(log, "  merge")?;
                        for i in job.iter() {
                            let seq = ssts_with_ranges[*i].seq;
                            let (min, max) = ssts_with_ranges[*i].range();
                            writeln!(log, "    {seq:08} {min:016x}-{max:016x}")?;
                        }
                    }
                    drop(guard);
                }

                // Later we will remove the merged files
                let sst_seq_numbers_to_delete = merge_jobs
                    .iter()
                    .flat_map(|l| l.iter().copied())
                    .map(|index| ssts_with_ranges[index].seq)
                    .collect::<Vec<_>>();

                let meta_file_builder = Mutex::new(MetaFileBuilder::new(family));

                // Merge SST files
                let span = tracing::trace_span!("merge files");
                let merge_result = merge_jobs
                    .into_par_iter()
                    .with_min_len(1)
                    .map(|indicies| {
                        let _span = span.clone().entered();
                        fn create_sst_file(
                            entries: &[LookupEntry],
                            total_key_size: usize,
                            total_value_size: usize,
                            path: &Path,
                            seq: u32,
                            meta_file_builder: &Mutex<MetaFileBuilder>,
                        ) -> Result<(u32, File)> {
                            let _span = tracing::trace_span!("write merged sst file").entered();
                            let builder = StaticSortedFileBuilder::new(
                                entries,
                                total_key_size,
                                total_value_size,
                            )?;
                            let (meta, file) =
                                builder.write(&path.join(format!("{seq:08}.sst")))?;
                            meta_file_builder.lock().add(seq, meta);
                            Ok((seq, file))
                        }

                        let mut new_sst_files = Vec::new();

                        // Iterate all SST files
                        let iters = indicies
                            .iter()
                            .map(|&index| {
                                let meta_index = ssts_with_ranges[index].meta_index;
                                let index_in_meta = ssts_with_ranges[index].index_in_meta;
                                let meta = &meta_files[meta_index];
                                meta.entry(index_in_meta)
                                    .sst(&self.path)?
                                    .iter(key_block_cache, value_block_cache)
                            })
                            .collect::<Result<Vec<_>>>()?;

                        let iter = MergeIter::new(iters.into_iter())?;

                        // TODO figure out how to delete blobs when they are no longer referenced
                        let blob_seq_numbers_to_delete: Vec<u32> = Vec::new();

                        let mut keys_written = 0;

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

                                            keys_written += entries.len() as u64;
                                            new_sst_files.push(create_sst_file(
                                                &entries,
                                                selected_total_key_size,
                                                selected_total_value_size,
                                                path,
                                                seq,
                                                &meta_file_builder,
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

                            keys_written += entries.len() as u64;
                            new_sst_files.push(create_sst_file(
                                &entries,
                                total_key_size,
                                total_value_size,
                                path,
                                seq,
                                &meta_file_builder,
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

                            keys_written += part1.len() as u64;
                            new_sst_files.push(create_sst_file(
                                part1,
                                // We don't know the exact sizes so we estimate them
                                last_entries_total_sizes.0 / 2,
                                last_entries_total_sizes.1 / 2,
                                path,
                                seq1,
                                &meta_file_builder,
                            )?);

                            keys_written += part2.len() as u64;
                            new_sst_files.push(create_sst_file(
                                part2,
                                last_entries_total_sizes.0 / 2,
                                last_entries_total_sizes.1 / 2,
                                path,
                                seq2,
                                &meta_file_builder,
                            )?);
                        }
                        Ok((new_sst_files, blob_seq_numbers_to_delete, keys_written))
                    })
                    .collect::<Result<Vec<_>>>()?;

                let mut meta_file_builder = meta_file_builder.into_inner();

                // Move SST files
                let span = tracing::trace_span!("query moved sst files").entered();
                for index in move_jobs {
                    let meta_index = ssts_with_ranges[index].meta_index;
                    let index_in_meta = ssts_with_ranges[index].index_in_meta;
                    let meta_file = &meta_files[meta_index];
                    let entry = meta_file.entry(index_in_meta);
                    let aqmf = entry.aqmf(meta_file.aqmf_data()).to_vec();
                    let meta = StaticSortedFileBuilderMetaResult {
                        min_hash: entry.min_hash(),
                        max_hash: entry.max_hash(),
                        aqmf,
                        key_compression_dictionary_length: entry
                            .key_compression_dictionary_length(),
                        value_compression_dictionary_length: entry
                            .value_compression_dictionary_length(),
                        block_count: entry.block_count(),
                        size: entry.size(),
                        entries: 0,
                    };
                    meta_file_builder.add(entry.sequence_number(), meta);
                }
                drop(span);

                let span = tracing::trace_span!("write meta file").entered();
                let seq = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
                let meta_file =
                    meta_file_builder.write(&self.path.join(format!("{seq:08}.meta")))?;
                drop(span);

                let mut new_sst_files =
                    Vec::with_capacity(merge_result.iter().map(|(v, _, _)| v.len()).sum());
                let mut blob_seq_numbers_to_delete =
                    Vec::with_capacity(merge_result.iter().map(|(_, v, _)| v.len()).sum());
                let mut keys_written = 0;
                for (
                    merged_new_sst_files,
                    merged_blob_seq_numbers_to_delete,
                    merged_keys_written,
                ) in merge_result
                {
                    new_sst_files.extend(merged_new_sst_files);
                    blob_seq_numbers_to_delete.extend(merged_blob_seq_numbers_to_delete);
                    keys_written += merged_keys_written;
                }
                Ok((
                    Some((seq, meta_file)),
                    new_sst_files,
                    sst_seq_numbers_to_delete,
                    blob_seq_numbers_to_delete,
                    keys_written,
                ))
            })
            .collect::<Result<Vec<_>>>()?;

        for (
            inner_new_meta_file,
            mut inner_new_sst_files,
            mut inner_sst_seq_numbers_to_delete,
            mut inner_blob_seq_numbers_to_delete,
            inner_keys_written,
        ) in result
        {
            new_meta_files.extend(inner_new_meta_file);
            new_sst_files.append(&mut inner_new_sst_files);
            sst_seq_numbers_to_delete.append(&mut inner_sst_seq_numbers_to_delete);
            blob_seq_numbers_to_delete.append(&mut inner_blob_seq_numbers_to_delete);
            *keys_written += inner_keys_written;
        }

        Ok(())
    }

    /// Get a value from the database. Returns None if the key is not found. The returned value
    /// might hold onto a block of the database and it should not be hold long-term.
    pub fn get<K: QueryKey>(&self, family: usize, key: &K) -> Result<Option<ArcSlice<u8>>> {
        let hash = hash_key(key);
        let inner = self.inner.read();
        for meta in inner.meta_files.iter().rev() {
            match meta.lookup(
                family as u32,
                hash,
                key,
                &self.aqmf_cache,
                &self.key_block_cache,
                &self.value_block_cache,
            )? {
                MetaLookupResult::FamilyMiss => {
                    #[cfg(feature = "stats")]
                    self.stats.miss_family.fetch_add(1, Ordering::Relaxed);
                }
                MetaLookupResult::RangeMiss => {
                    #[cfg(feature = "stats")]
                    self.stats.miss_range.fetch_add(1, Ordering::Relaxed);
                }
                MetaLookupResult::QuickFilterMiss => {
                    #[cfg(feature = "stats")]
                    self.stats.miss_aqmf.fetch_add(1, Ordering::Relaxed);
                }
                MetaLookupResult::SstLookup(result) => match result {
                    SstLookupResult::Found(result) => match result {
                        LookupValue::Deleted => {
                            #[cfg(feature = "stats")]
                            self.stats.hits_deleted.fetch_add(1, Ordering::Relaxed);
                            return Ok(None);
                        }
                        LookupValue::Slice { value } => {
                            #[cfg(feature = "stats")]
                            self.stats.hits_small.fetch_add(1, Ordering::Relaxed);
                            return Ok(Some(value));
                        }
                        LookupValue::Blob { sequence_number } => {
                            #[cfg(feature = "stats")]
                            self.stats.hits_blob.fetch_add(1, Ordering::Relaxed);
                            let blob = self.read_blob(sequence_number)?;
                            return Ok(Some(blob));
                        }
                    },
                    SstLookupResult::NotFound => {
                        #[cfg(feature = "stats")]
                        self.stats.miss_key.fetch_add(1, Ordering::Relaxed);
                    }
                },
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
            meta_files: inner.meta_files.len(),
            sst_files: inner.meta_files.iter().map(|m| m.entries().len()).sum(),
            key_block_cache: CacheStatistics::new(&self.key_block_cache),
            value_block_cache: CacheStatistics::new(&self.value_block_cache),
            aqmf_cache: CacheStatistics::new(&self.aqmf_cache),
            hits: self.stats.hits_deleted.load(Ordering::Relaxed)
                + self.stats.hits_small.load(Ordering::Relaxed)
                + self.stats.hits_blob.load(Ordering::Relaxed),
            misses: self.stats.miss_global.load(Ordering::Relaxed),
            miss_family: self.stats.miss_family.load(Ordering::Relaxed),
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
