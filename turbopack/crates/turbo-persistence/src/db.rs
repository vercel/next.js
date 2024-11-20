use std::{
    fs::{self, File, OpenOptions, ReadDir},
    io::Write,
    mem::{transmute, MaybeUninit},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use anyhow::{bail, Context, Result};
use byteorder::{ReadBytesExt, WriteBytesExt, BE};
use lzzzz::lz4::decompress;
use parking_lot::RwLock;

use crate::{
    arc_slice::ArcSlice,
    constants::{
        AQMF_AVG_SIZE, AQMF_CACHE_SIZE, KEY_BLOCK_AVG_SIZE, KEY_BLOCK_CACHE_SIZE,
        VALUE_BLOCK_AVG_SIZE, VALUE_BLOCK_CACHE_SIZE,
    },
    key::StoreKey,
    static_sorted_file::{AqmfCache, BlockCache, LookupResult, StaticSortedFile},
    write_batch::WriteBatch,
    QueryKey,
};

pub struct TurboPersistence {
    path: PathBuf,
    inner: RwLock<Inner>,
    active_write_operation: AtomicBool,
    aqmf_cache: AqmfCache,
    key_block_cache: BlockCache,
    value_block_cache: BlockCache,
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
                if seq > current {
                    fs::remove_file(&path)?;
                } else {
                    match ext {
                        "sst" => {
                            sst_files.push(seq);
                        }
                        "del" => {
                            // TODO delete files
                            todo!();
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

        sst_files.sort();
        let sst_files = sst_files
            .into_iter()
            .map(|seq| self.open_sst(seq))
            .collect::<Result<Vec<StaticSortedFile>>>()?;
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

    pub fn write_batch<K: StoreKey + Send>(&self) -> Result<WriteBatch<K>> {
        if self
            .active_write_operation
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            bail!(
                "Another write batch already active (Only a single WriteBatch is allowed at a \
                 time)"
            );
        }
        let current = self.inner.read().current_sequence_number;
        Ok(WriteBatch::new(self.path.clone(), current))
    }

    pub fn commit_write_batch<K: StoreKey + Send>(&self, write_batch: WriteBatch<K>) -> Result<()> {
        let (seq, new_sst_files) = write_batch.finish()?;
        let new_sst_files = new_sst_files
            .into_iter()
            .map(|(seq, file)| {
                file.sync_all()?;
                self.open_sst(seq)
            })
            .collect::<Result<Vec<StaticSortedFile>>>()?;
        {
            let mut inner = self.inner.write();
            inner.current_sequence_number = seq;
            inner.static_sorted_files.extend(new_sst_files);
        }
        let mut current_file = OpenOptions::new()
            .write(true)
            .truncate(false)
            .read(false)
            .open(self.path.join("CURRENT"))?;
        current_file.write_u32::<BE>(seq)?;
        current_file.sync_all()?;
        self.active_write_operation.store(false, Ordering::Release);
        Ok(())
    }

    pub fn get<K: QueryKey>(&self, key: &K) -> Result<Option<ArcSlice<u8>>> {
        let inner = self.inner.read();
        for sst in inner.static_sorted_files.iter().rev() {
            match sst.lookup(
                key,
                &self.aqmf_cache,
                &self.key_block_cache,
                &self.value_block_cache,
            )? {
                LookupResult::Deleted => {
                    return Ok(None);
                }
                LookupResult::Small { value } => {
                    return Ok(Some(value));
                }
                LookupResult::Blob { sequence_number } => {
                    let blob = self.read_blob(sequence_number)?;
                    return Ok(Some(blob));
                }
                LookupResult::QuickFilterMiss | LookupResult::RangeMiss => {}
                LookupResult::KeyMiss => {
                    // TODO track lookup chain
                }
            }
        }
        Ok(None)
    }
}
