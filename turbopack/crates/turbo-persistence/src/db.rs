use std::{
    borrow::Cow,
    collections::HashSet,
    fs::{self, File, OpenOptions, ReadDir},
    io::{BufWriter, Write},
    mem::{swap, take},
    ops::RangeInclusive,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, AtomicU32, Ordering},
};

use anyhow::{Context, Result, bail};
use byteorder::{BE, ReadBytesExt, WriteBytesExt};
use dashmap::DashSet;
use jiff::Timestamp;
use memmap2::Mmap;
use nohash_hasher::BuildNoHashHasher;
use parking_lot::{Mutex, RwLock};
use smallvec::SmallVec;

pub use crate::compaction::selector::CompactConfig;
use crate::{
    QueryKey,
    arc_slice::ArcSlice,
    compaction::selector::{Compactable, get_merge_segments},
    compression::decompress_into_arc,
    constants::{
        AMQF_AVG_SIZE, AMQF_CACHE_SIZE, DATA_THRESHOLD_PER_COMPACTED_FILE, KEY_BLOCK_AVG_SIZE,
        KEY_BLOCK_CACHE_SIZE, MAX_ENTRIES_PER_COMPACTED_FILE, VALUE_BLOCK_AVG_SIZE,
        VALUE_BLOCK_CACHE_SIZE,
    },
    key::{StoreKey, hash_key},
    lookup_entry::{LookupEntry, LookupValue},
    merge_iter::MergeIter,
    meta_file::{AmqfCache, MetaEntryFlags, MetaFile, MetaLookupResult, StaticSortedFileRange},
    meta_file_builder::MetaFileBuilder,
    parallel_scheduler::ParallelScheduler,
    sst_filter::SstFilter,
    static_sorted_file::{BlockCache, SstLookupResult},
    static_sorted_file_builder::{StaticSortedFileBuilderMeta, write_static_stored_file},
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
    pub amqf_cache: CacheStatistics,
    pub hits: u64,
    pub misses: u64,
    pub miss_family: u64,
    pub miss_range: u64,
    pub miss_amqf: u64,
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
    miss_amqf: std::sync::atomic::AtomicU64,
    miss_key: std::sync::atomic::AtomicU64,
    miss_global: std::sync::atomic::AtomicU64,
}

/// TurboPersistence is a persistent key-value store. It is limited to a single writer at a time
/// using a single write batch. It allows for concurrent reads.
pub struct TurboPersistence<S: ParallelScheduler, const FAMILIES: usize> {
    parallel_scheduler: S,
    /// The path to the directory where the database is stored
    path: PathBuf,
    /// If true, the database is opened in read-only mode. In this mode, no writes are allowed and
    /// no modification on the database is performed.
    read_only: bool,
    /// The inner state of the database. Writing will update that.
    inner: RwLock<Inner<FAMILIES>>,
    /// A flag to indicate if a write operation is currently active. Prevents multiple concurrent
    /// write operations.
    active_write_operation: AtomicBool,
    /// A cache for deserialized AMQF filters.
    amqf_cache: AmqfCache,
    /// A cache for decompressed key blocks.
    key_block_cache: BlockCache,
    /// A cache for decompressed value blocks.
    value_block_cache: BlockCache,
    /// Statistics for the database.
    #[cfg(feature = "stats")]
    stats: TrackedStats,
}

/// The inner state of the database.
struct Inner<const FAMILIES: usize> {
    /// The list of meta files in the database. This is used to derive the SST files.
    meta_files: Vec<MetaFile>,
    /// The current sequence number for the database.
    current_sequence_number: u32,
    /// The in progress set of hashes of keys that have been accessed.
    /// It will be flushed onto disk (into a meta file) on next commit.
    /// It's a dashset to allow modification while only tracking a read lock on Inner.
    accessed_key_hashes: [DashSet<u64, BuildNoHashHasher<u64>>; FAMILIES],
}

pub struct CommitOptions {
    new_meta_files: Vec<(u32, File)>,
    new_sst_files: Vec<(u32, File)>,
    new_blob_files: Vec<(u32, File)>,
    sst_seq_numbers_to_delete: Vec<u32>,
    blob_seq_numbers_to_delete: Vec<u32>,
    sequence_number: u32,
    keys_written: u64,
}

impl<S: ParallelScheduler + Default, const FAMILIES: usize> TurboPersistence<S, FAMILIES> {
    /// Open a TurboPersistence database at the given path.
    /// This will read the directory and might performance cleanup when the database was not closed
    /// properly. Cleanup only requires to read a few bytes from a few files and to delete
    /// files, so it's fast.
    pub fn open(path: PathBuf) -> Result<Self> {
        Self::open_with_parallel_scheduler(path, Default::default())
    }

    /// Open a TurboPersistence database at the given path in read only mode.
    /// This will read the directory. No Cleanup is performed.
    pub fn open_read_only(path: PathBuf) -> Result<Self> {
        Self::open_read_only_with_parallel_scheduler(path, Default::default())
    }
}

impl<S: ParallelScheduler, const FAMILIES: usize> TurboPersistence<S, FAMILIES> {
    fn new(path: PathBuf, read_only: bool, parallel_scheduler: S) -> Self {
        Self {
            parallel_scheduler,
            path,
            read_only,
            inner: RwLock::new(Inner {
                meta_files: Vec::new(),
                current_sequence_number: 0,
                accessed_key_hashes: [(); FAMILIES]
                    .map(|_| DashSet::with_hasher(BuildNoHashHasher::default())),
            }),
            active_write_operation: AtomicBool::new(false),
            amqf_cache: AmqfCache::with(
                AMQF_CACHE_SIZE as usize / AMQF_AVG_SIZE,
                AMQF_CACHE_SIZE,
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
        }
    }

    /// Open a TurboPersistence database at the given path.
    /// This will read the directory and might performance cleanup when the database was not closed
    /// properly. Cleanup only requires to read a few bytes from a few files and to delete
    /// files, so it's fast.
    pub fn open_with_parallel_scheduler(path: PathBuf, parallel_scheduler: S) -> Result<Self> {
        let mut db = Self::new(path, false, parallel_scheduler);
        db.open_directory(false)?;
        Ok(db)
    }

    /// Open a TurboPersistence database at the given path in read only mode.
    /// This will read the directory. No Cleanup is performed.
    pub fn open_read_only_with_parallel_scheduler(
        path: PathBuf,
        parallel_scheduler: S,
    ) -> Result<Self> {
        let mut db = Self::new(path, true, parallel_scheduler);
        db.open_directory(false)?;
        Ok(db)
    }

    /// Performs the initial check on the database directory.
    fn open_directory(&mut self, read_only: bool) -> Result<()> {
        match fs::read_dir(&self.path) {
            Ok(entries) => {
                if !self
                    .load_directory(entries, read_only)
                    .context("Loading persistence directory failed")?
                {
                    if read_only {
                        bail!("Failed to open database");
                    }
                    self.init_directory()
                        .context("Initializing persistence directory failed")?;
                }
                Ok(())
            }
            Err(e) => {
                if !read_only && e.kind() == std::io::ErrorKind::NotFound {
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
    fn load_directory(&mut self, entries: ReadDir, read_only: bool) -> Result<bool> {
        let mut meta_files = Vec::new();
        let mut current_file = match File::open(self.path.join("CURRENT")) {
            Ok(file) => file,
            Err(e) => {
                if !read_only && e.kind() == std::io::ErrorKind::NotFound {
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
                    if !read_only {
                        fs::remove_file(&path)?;
                    }
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
                                if !read_only {
                                    // Remove the files that are marked for deletion
                                    let sst_file = self.path.join(format!("{seq:08}.sst"));
                                    let meta_file = self.path.join(format!("{seq:08}.meta"));
                                    let blob_file = self.path.join(format!("{seq:08}.blob"));
                                    for path in [sst_file, meta_file, blob_file] {
                                        if fs::exists(&path)? {
                                            fs::remove_file(path)?;
                                            no_existing_files = false;
                                        }
                                    }
                                }
                            }
                            if !read_only && no_existing_files {
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
        let mut meta_files = self
            .parallel_scheduler
            .parallel_map_collect::<_, _, Result<Vec<MetaFile>>>(&meta_files, |&seq| {
                let meta_file = MetaFile::open(&self.path, seq)?;
                Ok(meta_file)
            })?;

        let mut sst_filter = SstFilter::new();
        for meta_file in meta_files.iter_mut().rev() {
            sst_filter.apply_filter(meta_file);
        }

        let inner = self.inner.get_mut();
        inner.meta_files = meta_files;
        inner.current_sequence_number = current;
        Ok(true)
    }

    /// Reads and decompresses a blob file. This is not backed by any cache.
    #[tracing::instrument(level = "info", name = "reading database blob", skip_all)]
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
        let uncompressed_length = compressed.read_u32::<BE>()?;

        let buffer = decompress_into_arc(uncompressed_length, compressed, None, true)?;
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
    pub fn write_batch<K: StoreKey + Send + Sync + 'static>(
        &self,
    ) -> Result<WriteBatch<K, S, FAMILIES>> {
        if self.read_only {
            bail!("Cannot write to a read-only database");
        }
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
        Ok(WriteBatch::new(
            self.path.clone(),
            current,
            self.parallel_scheduler.clone(),
        ))
    }

    fn open_log(&self) -> Result<BufWriter<File>> {
        if self.read_only {
            unreachable!("Only write operations can open the log file");
        }
        let log_path = self.path.join("LOG");
        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)?;
        Ok(BufWriter::new(log_file))
    }

    /// Commits a WriteBatch to the database. This will finish writing the data to disk and make it
    /// visible to readers.
    pub fn commit_write_batch<K: StoreKey + Send + Sync + 'static>(
        &self,
        mut write_batch: WriteBatch<K, S, FAMILIES>,
    ) -> Result<()> {
        if self.read_only {
            unreachable!("It's not possible to create a write batch for a read-only database");
        }
        let FinishResult {
            sequence_number,
            new_meta_files,
            new_sst_files,
            new_blob_files,
            keys_written,
        } = write_batch.finish(|family| {
            let inner = self.inner.read();
            let set = &inner.accessed_key_hashes[family as usize];
            // len is only a snapshot at that time and it can change while we create the filter.
            // So we give it 5% more space to make resizes less likely.
            let initial_capacity = set.len() * 20 / 19;
            let mut amqf =
                qfilter::Filter::with_fingerprint_size(initial_capacity as u64, u64::BITS as u8)
                    .unwrap();
            // This drains items from the set. But due to concurrency it might not be empty
            // afterwards, but that's fine. It will be part of the next commit.
            set.retain(|hash| {
                // Performance-wise it would usually be better to insert sorted fingerprints, but we
                // assume that hashes are equally distributed, which makes it unnecessary.
                // Good for cache locality is that we insert in the order of the dashset's buckets.
                amqf.insert_fingerprint(false, *hash)
                    .expect("Failed to insert fingerprint");
                false
            });
            amqf
        })?;
        self.commit(CommitOptions {
            new_meta_files,
            new_sst_files,
            new_blob_files,
            sst_seq_numbers_to_delete: vec![],
            blob_seq_numbers_to_delete: vec![],
            sequence_number,
            keys_written,
        })?;
        self.active_write_operation.store(false, Ordering::Release);
        Ok(())
    }

    /// fsyncs the new files and updates the CURRENT file. Updates the database state to include the
    /// new files.
    fn commit(
        &self,
        CommitOptions {
            mut new_meta_files,
            new_sst_files,
            mut new_blob_files,
            mut sst_seq_numbers_to_delete,
            mut blob_seq_numbers_to_delete,
            sequence_number: mut seq,
            keys_written,
        }: CommitOptions,
    ) -> Result<(), anyhow::Error> {
        let time = Timestamp::now();

        new_meta_files.sort_unstable_by_key(|(seq, _)| *seq);

        let sync_span = tracing::info_span!("sync new files").entered();
        let mut new_meta_files = self
            .parallel_scheduler
            .parallel_map_collect_owned::<_, _, Result<Vec<_>>>(new_meta_files, |(seq, file)| {
                file.sync_all()?;
                let meta_file = MetaFile::open(&self.path, seq)?;
                Ok(meta_file)
            })?;

        let mut sst_filter = SstFilter::new();
        for meta_file in new_meta_files.iter_mut().rev() {
            sst_filter.apply_filter(meta_file);
        }

        self.parallel_scheduler.block_in_place(|| {
            for (_, file) in new_sst_files.iter() {
                file.sync_all()?;
            }
            for (_, file) in new_blob_files.iter() {
                file.sync_all()?;
            }
            anyhow::Ok(())
        })?;
        drop(sync_span);

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
                        let flags = entry.flags();
                        (seq, range.min_hash, range.max_hash, size, flags)
                    })
                    .collect::<Vec<_>>();
                (
                    meta.sequence_number(),
                    meta.family(),
                    ssts,
                    meta.obsolete_sst_files().to_vec(),
                )
            })
            .collect::<Vec<_>>();

        let has_delete_file;
        let mut meta_seq_numbers_to_delete = Vec::new();

        {
            let mut inner = self.inner.write();
            for meta_file in inner.meta_files.iter_mut().rev() {
                sst_filter.apply_filter(meta_file);
            }
            inner.meta_files.append(&mut new_meta_files);
            // apply_and_get_remove need to run in reverse order
            inner.meta_files.reverse();
            inner.meta_files.retain(|meta| {
                if sst_filter.apply_and_get_remove(meta) {
                    meta_seq_numbers_to_delete.push(meta.sequence_number());
                    false
                } else {
                    true
                }
            });
            inner.meta_files.reverse();
            has_delete_file = !sst_seq_numbers_to_delete.is_empty()
                || !blob_seq_numbers_to_delete.is_empty()
                || !meta_seq_numbers_to_delete.is_empty();
            if has_delete_file {
                seq += 1;
            }
            inner.current_sequence_number = seq;
        }

        self.parallel_scheduler.block_in_place(|| {
            if has_delete_file {
                sst_seq_numbers_to_delete.sort_unstable();
                meta_seq_numbers_to_delete.sort_unstable();
                blob_seq_numbers_to_delete.sort_unstable();
                // Write *.del file, marking the selected files as to delete
                let mut buf = Vec::with_capacity(
                    (sst_seq_numbers_to_delete.len()
                        + meta_seq_numbers_to_delete.len()
                        + blob_seq_numbers_to_delete.len())
                        * size_of::<u32>(),
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
                writeln!(log, "FAM | META SEQ | SST SEQ         | RANGE")?;
                for (meta_seq, family, ssts, obsolete) in new_meta_info {
                    for (seq, min, max, size, flags) in ssts {
                        writeln!(
                            log,
                            "{family:3} | {meta_seq:08} | {seq:08} SST    | {} ({} MiB, {})",
                            range_to_str(min, max),
                            size / 1024 / 1024,
                            flags
                        )?;
                    }
                    for obsolete in obsolete.chunks(15) {
                        write!(log, "{family:3} | {meta_seq:08} |")?;
                        for seq in obsolete {
                            write!(log, " {seq:08}")?;
                        }
                        writeln!(log, " OBSOLETE SST")?;
                    }
                }

                fn write_seq_numbers<W: std::io::Write, T, I>(
                    log: &mut W,
                    items: I,
                    label: &str,
                    extract_seq: fn(&T) -> u32,
                ) -> std::io::Result<()>
                where
                    I: IntoIterator<Item = T>,
                {
                    let items: Vec<T> = items.into_iter().collect();
                    for chunk in items.chunks(15) {
                        write!(log, "    |          |")?;
                        for item in chunk {
                            write!(log, " {:08}", extract_seq(item))?;
                        }
                        writeln!(log, " {}", label)?;
                    }
                    Ok(())
                }

                new_blob_files.sort_unstable_by_key(|(seq, _)| *seq);
                write_seq_numbers(&mut log, new_blob_files, "NEW BLOB", |&(seq, _)| seq)?;
                write_seq_numbers(
                    &mut log,
                    blob_seq_numbers_to_delete,
                    "BLOB DELETED",
                    |&seq| seq,
                )?;
                write_seq_numbers(&mut log, sst_seq_numbers_to_delete, "SST DELETED", |&seq| {
                    seq
                })?;
                write_seq_numbers(
                    &mut log,
                    meta_seq_numbers_to_delete,
                    "META DELETED",
                    |&seq| seq,
                )?;
                #[cfg(feature = "verbose_log")]
                {
                    writeln!(log, "New database state:")?;
                    writeln!(log, "FAM | META SEQ | SST SEQ  FLAGS | RANGE")?;
                    let inner = self.inner.read();
                    let families = inner.meta_files.iter().map(|meta| meta.family()).filter({
                        let mut set = HashSet::new();
                        move |family| set.insert(*family)
                    });
                    for family in families {
                        for meta in inner.meta_files.iter() {
                            if meta.family() != family {
                                continue;
                            }
                            let meta_seq = meta.sequence_number();
                            for entry in meta.entries().iter() {
                                let seq = entry.sequence_number();
                                let range = entry.range();
                                writeln!(
                                    log,
                                    "{family:3} | {meta_seq:08} | {seq:08} {:>6} | {}",
                                    entry.flags(),
                                    range_to_str(range.min_hash, range.max_hash)
                                )?;
                            }
                        }
                    }
                }
            }
            anyhow::Ok(())
        })?;
        Ok(())
    }

    /// Runs a full compaction on the database. This will rewrite all SST files, removing all
    /// duplicate keys and separating all key ranges into unique files.
    pub fn full_compact(&self) -> Result<()> {
        self.compact(&CompactConfig {
            min_merge_count: 2,
            optimal_merge_count: usize::MAX,
            max_merge_count: usize::MAX,
            max_merge_bytes: u64::MAX,
            min_merge_duplication_bytes: 0,
            optimal_merge_duplication_bytes: u64::MAX,
            max_merge_segment_count: usize::MAX,
        })?;
        Ok(())
    }

    /// Runs a (partial) compaction. Compaction will only be performed if the coverage of the SST
    /// files is above the given threshold. The coverage is the average number of SST files that
    /// need to be read to find a key. It also limits the maximum number of SST files that are
    /// merged at once, which is the main factor for the runtime of the compaction.
    pub fn compact(&self, compact_config: &CompactConfig) -> Result<bool> {
        if self.read_only {
            bail!("Compaction is not allowed on a read only database");
        }
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
                compact_config,
            )
            .context("Failed to compact database")?;
        }

        let has_changes = !new_meta_files.is_empty();
        if has_changes {
            self.commit(CommitOptions {
                new_meta_files,
                new_sst_files,
                new_blob_files: Vec::new(),
                sst_seq_numbers_to_delete,
                blob_seq_numbers_to_delete,
                sequence_number: *sequence_number.get_mut(),
                keys_written,
            })
            .context("Failed to commit the database compaction")?;
        }

        self.active_write_operation.store(false, Ordering::Release);

        Ok(has_changes)
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
        compact_config: &CompactConfig,
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
            flags: MetaEntryFlags,
        }

        impl Compactable for SstWithRange {
            fn range(&self) -> RangeInclusive<u64> {
                self.range.min_hash..=self.range.max_hash
            }

            fn size(&self) -> u64 {
                self.size
            }

            fn category(&self) -> u8 {
                // Cold and non-cold files are placed separately so we pass different category
                // values to ensure they are not merged together.
                if self.flags.cold() { 1 } else { 0 }
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
                        flags: entry.flags(),
                    })
            })
            .collect::<Vec<_>>();

        let mut sst_by_family = [(); FAMILIES].map(|_| Vec::new());

        for sst in ssts_with_ranges {
            sst_by_family[sst.range.family as usize].push(sst);
        }

        let key_block_cache = &self.key_block_cache;
        let value_block_cache = &self.value_block_cache;
        let path = &self.path;

        let log_mutex = Mutex::new(());

        struct PartialResultPerFamily {
            new_meta_file: Option<(u32, File)>,
            new_sst_files: Vec<(u32, File)>,
            sst_seq_numbers_to_delete: Vec<u32>,
            blob_seq_numbers_to_delete: Vec<u32>,
            keys_written: u64,
        }

        let mut compact_config = compact_config.clone();
        let merge_jobs = sst_by_family
            .into_iter()
            .enumerate()
            .filter_map(|(family, ssts_with_ranges)| {
                if compact_config.max_merge_segment_count == 0 {
                    return None;
                }
                let (merge_jobs, real_merge_job_size) =
                    get_merge_segments(&ssts_with_ranges, &compact_config);
                compact_config.max_merge_segment_count -= real_merge_job_size;
                Some((family, ssts_with_ranges, merge_jobs))
            })
            .collect::<Vec<_>>();

        let mut used_key_hashes = [(); FAMILIES].map(|_| Vec::new());

        {
            for &(family, ..) in merge_jobs.iter() {
                used_key_hashes[family].extend(
                    meta_files
                        .iter()
                        .filter(|m| m.family() == family as u32)
                        .filter_map(|meta_file| {
                            meta_file.deserialize_used_key_hashes_amqf().transpose()
                        })
                        .collect::<Result<Vec<_>>>()?,
                );
            }
        }

        let result = self
            .parallel_scheduler
            .parallel_map_collect_owned::<_, _, Result<Vec<_>>>(
                merge_jobs,
                |(family, ssts_with_ranges, merge_jobs)| {
                    let family = family as u32;

                    if merge_jobs.is_empty() {
                        return Ok(PartialResultPerFamily {
                            new_meta_file: None,
                            new_sst_files: Vec::new(),
                            sst_seq_numbers_to_delete: Vec::new(),
                            blob_seq_numbers_to_delete: Vec::new(),
                            keys_written: 0,
                        });
                    }

                    // Later we will remove the merged files
                    let sst_seq_numbers_to_delete = merge_jobs
                        .iter()
                        .filter(|l| l.len() > 1)
                        .flat_map(|l| l.iter().copied())
                        .map(|index| ssts_with_ranges[index].seq)
                        .collect::<Vec<_>>();

                    // Merge SST files
                    let span = tracing::trace_span!("merge files");
                    enum PartialMergeResult<'l> {
                        Merged {
                            new_sst_files: Vec<(u32, File, StaticSortedFileBuilderMeta<'static>)>,
                            blob_seq_numbers_to_delete: Vec<u32>,
                            keys_written: u64,
                            indicies: SmallVec<[usize; 1]>,
                        },
                        Move {
                            seq: u32,
                            meta: StaticSortedFileBuilderMeta<'l>,
                        },
                    }
                    let merge_result = self
                        .parallel_scheduler
                        .parallel_map_collect_owned::<_, _, Result<Vec<_>>>(
                            merge_jobs,
                            |indicies| {
                                let _span = span.clone().entered();
                                if indicies.len() == 1 {
                                    // If we only have one file, we can just move it
                                    let index = indicies[0];
                                    let meta_index = ssts_with_ranges[index].meta_index;
                                    let index_in_meta = ssts_with_ranges[index].index_in_meta;
                                    let meta_file = &meta_files[meta_index];
                                    let entry = meta_file.entry(index_in_meta);
                                    let amqf = Cow::Borrowed(entry.raw_amqf(meta_file.amqf_data()));
                                    let meta = StaticSortedFileBuilderMeta {
                                        min_hash: entry.min_hash(),
                                        max_hash: entry.max_hash(),
                                        amqf,
                                        key_compression_dictionary_length: entry
                                            .key_compression_dictionary_length(),
                                        block_count: entry.block_count(),
                                        size: entry.size(),
                                        flags: entry.flags(),
                                        entries: 0,
                                    };
                                    return Ok(PartialMergeResult::Move {
                                        seq: entry.sequence_number(),
                                        meta,
                                    });
                                }

                                fn create_sst_file<'l, S: ParallelScheduler>(
                                    parallel_scheduler: &S,
                                    entries: &[LookupEntry<'l>],
                                    total_key_size: usize,
                                    path: &Path,
                                    seq: u32,
                                    flags: MetaEntryFlags,
                                ) -> Result<(u32, File, StaticSortedFileBuilderMeta<'static>)>
                                {
                                    let _span =
                                        tracing::trace_span!("write merged sst file").entered();
                                    let (meta, file) = parallel_scheduler.block_in_place(|| {
                                        write_static_stored_file(
                                            entries,
                                            total_key_size,
                                            &path.join(format!("{seq:08}.sst")),
                                            flags,
                                        )
                                    })?;
                                    Ok((seq, file, meta))
                                }

                                // Iterate all SST files
                                let iters = indicies
                                    .iter()
                                    .map(|&index| {
                                        let meta_index = ssts_with_ranges[index].meta_index;
                                        let index_in_meta = ssts_with_ranges[index].index_in_meta;
                                        let meta = &meta_files[meta_index];
                                        meta.entry(index_in_meta)
                                            .sst(meta)?
                                            .iter(key_block_cache, value_block_cache)
                                    })
                                    .collect::<Result<Vec<_>>>()?;

                                let iter = MergeIter::new(iters.into_iter())?;

                                // TODO figure out how to delete blobs when they are no longer
                                // referenced
                                let blob_seq_numbers_to_delete: Vec<u32> = Vec::new();

                                let mut keys_written = 0;

                                let mut current: Option<LookupEntry<'_>> = None;

                                #[derive(Default)]
                                struct Collector<'l> {
                                    entries: Vec<LookupEntry<'l>>,
                                    total_key_size: usize,
                                    total_value_size: usize,
                                    last_entries: Vec<LookupEntry<'l>>,
                                    last_entries_total_key_size: usize,
                                    new_sst_files:
                                        Vec<(u32, File, StaticSortedFileBuilderMeta<'static>)>,
                                }
                                let mut used_collector = Collector::default();
                                let mut unused_collector = Collector::default();
                                for entry in iter {
                                    let entry = entry?;

                                    // Remove duplicates
                                    if let Some(current) = current.take() {
                                        if current.key != entry.key {
                                            let is_used =
                                                used_key_hashes[family as usize].iter().any(
                                                    |amqf| amqf.contains_fingerprint(current.hash),
                                                );
                                            let collector = if is_used {
                                                &mut used_collector
                                            } else {
                                                &mut unused_collector
                                            };
                                            let key_size = current.key.len();
                                            let value_size =
                                                current.value.uncompressed_size_in_sst();
                                            collector.total_key_size += key_size;
                                            collector.total_value_size += value_size;

                                            if collector.total_key_size + collector.total_value_size
                                                > DATA_THRESHOLD_PER_COMPACTED_FILE
                                                || collector.entries.len()
                                                    >= MAX_ENTRIES_PER_COMPACTED_FILE
                                            {
                                                let selected_total_key_size =
                                                    collector.last_entries_total_key_size;
                                                swap(
                                                    &mut collector.entries,
                                                    &mut collector.last_entries,
                                                );
                                                collector.last_entries_total_key_size =
                                                    collector.total_key_size - key_size;
                                                collector.total_key_size = key_size;
                                                collector.total_value_size = value_size;

                                                if !collector.entries.is_empty() {
                                                    let seq = sequence_number
                                                        .fetch_add(1, Ordering::SeqCst)
                                                        + 1;

                                                    keys_written += collector.entries.len() as u64;

                                                    let mut flags = MetaEntryFlags::default();
                                                    flags.set_cold(!is_used);
                                                    collector.new_sst_files.push(create_sst_file(
                                                        &self.parallel_scheduler,
                                                        &collector.entries,
                                                        selected_total_key_size,
                                                        path,
                                                        seq,
                                                        flags,
                                                    )?);

                                                    collector.entries.clear();
                                                }
                                            }

                                            collector.entries.push(current);
                                        } else {
                                            // Override value
                                            // TODO delete blob file
                                        }
                                    }
                                    current = Some(entry);
                                }
                                if let Some(entry) = current {
                                    let is_used = used_key_hashes[family as usize]
                                        .iter()
                                        .any(|amqf| amqf.contains_fingerprint(entry.hash));
                                    let collector = if is_used {
                                        &mut used_collector
                                    } else {
                                        &mut unused_collector
                                    };

                                    collector.total_key_size += entry.key.len();
                                    // Obsolete as we no longer need total_value_size
                                    // total_value_size += entry.value.uncompressed_size_in_sst();
                                    collector.entries.push(entry);
                                }

                                // If we have one set of entries left, write them to a new SST file
                                for (collector, flags) in [
                                    (&mut used_collector, MetaEntryFlags::WARM),
                                    (&mut unused_collector, MetaEntryFlags::COLD),
                                ] {
                                    if collector.last_entries.is_empty()
                                        && !collector.entries.is_empty()
                                    {
                                        let seq =
                                            sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

                                        keys_written += collector.entries.len() as u64;
                                        collector.new_sst_files.push(create_sst_file(
                                            &self.parallel_scheduler,
                                            &collector.entries,
                                            collector.total_key_size,
                                            path,
                                            seq,
                                            flags,
                                        )?);
                                    } else
                                    // If we have two sets of entries left, merge them and
                                    // split it into two SST files, to avoid having a
                                    // single SST file that is very small.
                                    if !collector.last_entries.is_empty() {
                                        collector.last_entries.append(&mut collector.entries);

                                        collector.last_entries_total_key_size +=
                                            collector.total_key_size;

                                        let (part1, part2) = collector
                                            .last_entries
                                            .split_at(collector.last_entries.len() / 2);

                                        let seq1 =
                                            sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
                                        let seq2 =
                                            sequence_number.fetch_add(1, Ordering::SeqCst) + 1;

                                        keys_written += part1.len() as u64;
                                        collector.new_sst_files.push(create_sst_file(
                                            &self.parallel_scheduler,
                                            part1,
                                            // We don't know the exact sizes so we estimate them
                                            collector.last_entries_total_key_size / 2,
                                            path,
                                            seq1,
                                            flags,
                                        )?);

                                        keys_written += part2.len() as u64;
                                        collector.new_sst_files.push(create_sst_file(
                                            &self.parallel_scheduler,
                                            part2,
                                            collector.last_entries_total_key_size / 2,
                                            path,
                                            seq2,
                                            flags,
                                        )?);
                                    }
                                }
                                let mut new_sst_files = take(&mut unused_collector.new_sst_files);
                                new_sst_files.append(&mut used_collector.new_sst_files);
                                Ok(PartialMergeResult::Merged {
                                    new_sst_files,
                                    blob_seq_numbers_to_delete,
                                    keys_written,
                                    indicies,
                                })
                            },
                        )
                        .with_context(|| {
                            format!("Failed to merge database files for family {family}")
                        })?;

                    let Some((sst_files_len, blob_delete_len)) = merge_result
                        .iter()
                        .map(|r| {
                            if let PartialMergeResult::Merged {
                                new_sst_files,
                                blob_seq_numbers_to_delete,
                                indicies: _,
                                keys_written: _,
                            } = r
                            {
                                (new_sst_files.len(), blob_seq_numbers_to_delete.len())
                            } else {
                                (0, 0)
                            }
                        })
                        .reduce(|(a1, a2), (b1, b2)| (a1 + b1, a2 + b2))
                    else {
                        unreachable!()
                    };

                    let mut new_sst_files = Vec::with_capacity(sst_files_len);
                    let mut blob_seq_numbers_to_delete = Vec::with_capacity(blob_delete_len);

                    let meta_seq = sequence_number.fetch_add(1, Ordering::SeqCst) + 1;
                    let mut meta_file_builder = MetaFileBuilder::new(family);

                    let mut keys_written = 0;
                    self.parallel_scheduler.block_in_place(|| {
                        let guard = log_mutex.lock();
                        let mut log = self.open_log()?;
                        writeln!(log, "{family:3} | {meta_seq:08} | Compaction:",)?;
                        for result in merge_result {
                            match result {
                                PartialMergeResult::Merged {
                                    new_sst_files: merged_new_sst_files,
                                    blob_seq_numbers_to_delete: merged_blob_seq_numbers_to_delete,
                                    keys_written: merged_keys_written,
                                    indicies,
                                } => {
                                    writeln!(
                                        log,
                                        "{family:3} | {meta_seq:08} | MERGE \
                                         ({merged_keys_written} keys):"
                                    )?;
                                    for i in indicies.iter() {
                                        let seq = ssts_with_ranges[*i].seq;
                                        let (min, max) = ssts_with_ranges[*i].range().into_inner();
                                        writeln!(
                                            log,
                                            "{family:3} | {meta_seq:08} | {seq:08} INPUT  | {}",
                                            range_to_str(min, max)
                                        )?;
                                    }
                                    for (seq, file, meta) in merged_new_sst_files {
                                        let min = meta.min_hash;
                                        let max = meta.max_hash;
                                        writeln!(
                                            log,
                                            "{family:3} | {meta_seq:08} | {seq:08} OUTPUT | {} \
                                             ({})",
                                            range_to_str(min, max),
                                            meta.flags
                                        )?;

                                        meta_file_builder.add(seq, meta);
                                        new_sst_files.push((seq, file));
                                    }
                                    blob_seq_numbers_to_delete
                                        .extend(merged_blob_seq_numbers_to_delete);
                                    keys_written += merged_keys_written;
                                }
                                PartialMergeResult::Move { seq, meta } => {
                                    let min = meta.min_hash;
                                    let max = meta.max_hash;
                                    writeln!(
                                        log,
                                        "{family:3} | {meta_seq:08} | {seq:08} MOVED  | {}",
                                        range_to_str(min, max)
                                    )?;

                                    meta_file_builder.add(seq, meta);
                                }
                            }
                        }
                        drop(log);
                        drop(guard);

                        anyhow::Ok(())
                    })?;

                    for &seq in sst_seq_numbers_to_delete.iter() {
                        meta_file_builder.add_obsolete_sst_file(seq);
                    }

                    let meta_file = {
                        let _span = tracing::trace_span!("write meta file").entered();
                        self.parallel_scheduler
                            .block_in_place(|| meta_file_builder.write(&self.path, meta_seq))?
                    };

                    Ok(PartialResultPerFamily {
                        new_meta_file: Some((meta_seq, meta_file)),
                        new_sst_files,
                        sst_seq_numbers_to_delete,
                        blob_seq_numbers_to_delete,
                        keys_written,
                    })
                },
            )?;

        for PartialResultPerFamily {
            new_meta_file: inner_new_meta_file,
            new_sst_files: mut inner_new_sst_files,
            sst_seq_numbers_to_delete: mut inner_sst_seq_numbers_to_delete,
            blob_seq_numbers_to_delete: mut inner_blob_seq_numbers_to_delete,
            keys_written: inner_keys_written,
        } in result
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
        debug_assert!(family < FAMILIES, "Family index out of bounds");
        let span =
            tracing::trace_span!("database read", family, result_size = tracing::field::Empty)
                .entered();
        let hash = hash_key(key);
        let inner = self.inner.read();
        for meta in inner.meta_files.iter().rev() {
            match meta.lookup(
                family as u32,
                hash,
                key,
                &self.amqf_cache,
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
                    self.stats.miss_amqf.fetch_add(1, Ordering::Relaxed);
                }
                MetaLookupResult::SstLookup(result) => match result {
                    SstLookupResult::Found(result) => {
                        inner.accessed_key_hashes[family].insert(hash);
                        match result {
                            LookupValue::Deleted => {
                                #[cfg(feature = "stats")]
                                self.stats.hits_deleted.fetch_add(1, Ordering::Relaxed);
                                span.record("result_size", "deleted");
                                return Ok(None);
                            }
                            LookupValue::Slice { value } => {
                                #[cfg(feature = "stats")]
                                self.stats.hits_small.fetch_add(1, Ordering::Relaxed);
                                span.record("result_size", value.len());
                                return Ok(Some(value));
                            }
                            LookupValue::Blob { sequence_number } => {
                                #[cfg(feature = "stats")]
                                self.stats.hits_blob.fetch_add(1, Ordering::Relaxed);
                                let blob = self.read_blob(sequence_number)?;
                                span.record("result_size", blob.len());
                                return Ok(Some(blob));
                            }
                        }
                    }
                    SstLookupResult::NotFound => {
                        #[cfg(feature = "stats")]
                        self.stats.miss_key.fetch_add(1, Ordering::Relaxed);
                    }
                },
            }
        }
        #[cfg(feature = "stats")]
        self.stats.miss_global.fetch_add(1, Ordering::Relaxed);
        span.record("result_size", "not found");
        Ok(None)
    }

    pub fn batch_get<K: QueryKey>(
        &self,
        family: usize,
        keys: &[K],
    ) -> Result<Vec<Option<ArcSlice<u8>>>> {
        debug_assert!(family < FAMILIES, "Family index out of bounds");
        let span = tracing::trace_span!(
            "database batch read",
            family,
            keys = keys.len(),
            not_found = tracing::field::Empty,
            deleted = tracing::field::Empty,
            result_size = tracing::field::Empty
        )
        .entered();
        let mut cells: Vec<(u64, usize, Option<LookupValue>)> = Vec::with_capacity(keys.len());
        let mut empty_cells = keys.len();
        for (index, key) in keys.iter().enumerate() {
            let hash = hash_key(key);
            cells.push((hash, index, None));
        }
        cells.sort_by_key(|(hash, _, _)| *hash);
        let inner = self.inner.read();
        for meta in inner.meta_files.iter().rev() {
            let _result = meta.batch_lookup(
                family as u32,
                keys,
                &mut cells,
                &mut empty_cells,
                &self.amqf_cache,
                &self.key_block_cache,
                &self.value_block_cache,
            )?;

            #[cfg(feature = "stats")]
            {
                let crate::meta_file::MetaBatchLookupResult {
                    family_miss,
                    range_misses,
                    quick_filter_misses,
                    sst_misses,
                    hits: _,
                } = _result;
                if family_miss {
                    self.stats.miss_family.fetch_add(1, Ordering::Relaxed);
                }
                if range_misses > 0 {
                    self.stats
                        .miss_range
                        .fetch_add(range_misses as u64, Ordering::Relaxed);
                }
                if quick_filter_misses > 0 {
                    self.stats
                        .miss_amqf
                        .fetch_add(quick_filter_misses as u64, Ordering::Relaxed);
                }
                if sst_misses > 0 {
                    self.stats
                        .miss_key
                        .fetch_add(sst_misses as u64, Ordering::Relaxed);
                }
            }

            if empty_cells == 0 {
                break;
            }
        }
        let mut deleted = 0;
        let mut not_found = 0;
        let mut result_size = 0;
        let mut results = vec![None; keys.len()];
        for (hash, index, result) in cells {
            if let Some(result) = result {
                inner.accessed_key_hashes[family].insert(hash);
                let result = match result {
                    LookupValue::Deleted => {
                        #[cfg(feature = "stats")]
                        self.stats.hits_deleted.fetch_add(1, Ordering::Relaxed);
                        deleted += 1;
                        None
                    }
                    LookupValue::Slice { value } => {
                        #[cfg(feature = "stats")]
                        self.stats.hits_small.fetch_add(1, Ordering::Relaxed);
                        result_size += value.len();
                        Some(value)
                    }
                    LookupValue::Blob { sequence_number } => {
                        #[cfg(feature = "stats")]
                        self.stats.hits_blob.fetch_add(1, Ordering::Relaxed);
                        let blob = self.read_blob(sequence_number)?;
                        result_size += blob.len();
                        Some(blob)
                    }
                };
                results[index] = result;
            } else {
                #[cfg(feature = "stats")]
                self.stats.miss_global.fetch_add(1, Ordering::Relaxed);
                not_found += 1;
            }
        }
        span.record("not_found", not_found);
        span.record("deleted", deleted);
        span.record("result_size", result_size);
        Ok(results)
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
            amqf_cache: CacheStatistics::new(&self.amqf_cache),
            hits: self.stats.hits_deleted.load(Ordering::Relaxed)
                + self.stats.hits_small.load(Ordering::Relaxed)
                + self.stats.hits_blob.load(Ordering::Relaxed),
            misses: self.stats.miss_global.load(Ordering::Relaxed),
            miss_family: self.stats.miss_family.load(Ordering::Relaxed),
            miss_range: self.stats.miss_range.load(Ordering::Relaxed),
            miss_amqf: self.stats.miss_amqf.load(Ordering::Relaxed),
            miss_key: self.stats.miss_key.load(Ordering::Relaxed),
        }
    }

    pub fn meta_info(&self) -> Result<Vec<MetaFileInfo>> {
        Ok(self
            .inner
            .read()
            .meta_files
            .iter()
            .rev()
            .map(|meta_file| {
                let entries = meta_file
                    .entries()
                    .iter()
                    .map(|entry| {
                        let amqf = entry.raw_amqf(meta_file.amqf_data());
                        MetaFileEntryInfo {
                            sequence_number: entry.sequence_number(),
                            min_hash: entry.min_hash(),
                            max_hash: entry.max_hash(),
                            sst_size: entry.size(),
                            flags: entry.flags(),
                            amqf_size: entry.amqf_size(),
                            amqf_entries: amqf.len(),
                            key_compression_dictionary_size: entry
                                .key_compression_dictionary_length(),
                            block_count: entry.block_count(),
                        }
                    })
                    .collect();
                MetaFileInfo {
                    sequence_number: meta_file.sequence_number(),
                    family: meta_file.family(),
                    obsolete_sst_files: meta_file.obsolete_sst_files().to_vec(),
                    entries,
                }
            })
            .collect())
    }

    /// Shuts down the database. This will print statistics if the `print_stats` feature is enabled.
    pub fn shutdown(&self) -> Result<()> {
        #[cfg(feature = "print_stats")]
        println!("{:#?}", self.statistics());
        Ok(())
    }
}

fn range_to_str(min: u64, max: u64) -> String {
    use std::fmt::Write;
    const DISPLAY_SIZE: usize = 100;
    const TOTAL_SIZE: u64 = u64::MAX;
    let start_pos = (min as u128 * DISPLAY_SIZE as u128 / TOTAL_SIZE as u128) as usize;
    let end_pos = (max as u128 * DISPLAY_SIZE as u128 / TOTAL_SIZE as u128) as usize;
    let mut range_str = String::new();
    for i in 0..DISPLAY_SIZE {
        if i == start_pos && i == end_pos {
            range_str.push('O');
        } else if i == start_pos {
            range_str.push('[');
        } else if i == end_pos {
            range_str.push(']');
        } else if i > start_pos && i < end_pos {
            range_str.push('=');
        } else {
            range_str.push(' ');
        }
    }
    write!(range_str, " | {min:016x}-{max:016x}").unwrap();
    range_str
}

pub struct MetaFileInfo {
    pub sequence_number: u32,
    pub family: u32,
    pub obsolete_sst_files: Vec<u32>,
    pub entries: Vec<MetaFileEntryInfo>,
}

pub struct MetaFileEntryInfo {
    pub sequence_number: u32,
    pub min_hash: u64,
    pub max_hash: u64,
    pub amqf_size: u32,
    pub amqf_entries: usize,
    pub sst_size: u64,
    pub flags: MetaEntryFlags,
    pub key_compression_dictionary_size: u16,
    pub block_count: u16,
}
