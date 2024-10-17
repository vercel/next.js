use std::{
    borrow::{Borrow, Cow},
    fs::{self, File},
    hash::BuildHasherDefault,
    io::{BufWriter, Read},
    mem::transmute,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

use anyhow::{Ok, Result};
use dashmap::DashMap;
use rustc_hash::{FxHashMap, FxHasher};

use crate::database::{
    by_key_space::ByKeySpace,
    key_value_database::{KeySpace, KeyValueDatabase, WriteBatch},
    rw_pair::{read_key_value_pair, write_key_value_pair, PAIR_HEADER_SIZE},
};

const CACHE_SIZE_LIMIT: usize = 100 * 1024 * 1024;

pub enum ValueBuffer<'l, T: KeyValueDatabase>
where
    T: 'l,
{
    Database(T::ValueBuffer<'l>),
    Cached(&'l [u8]),
}

impl<T: KeyValueDatabase> Borrow<[u8]> for ValueBuffer<'_, T> {
    fn borrow(&self) -> &[u8] {
        match self {
            ValueBuffer::Database(value) => value.borrow(),
            ValueBuffer::Cached(value) => value,
        }
    }
}

type Cache = ByKeySpace<DashMap<Vec<u8>, Option<Vec<u8>>, BuildHasherDefault<FxHasher>>>;

pub struct StartupCacheLayer<T: KeyValueDatabase> {
    database: T,
    path: PathBuf,
    fresh_db: bool,
    cache_size: AtomicUsize,
    cache: Cache,
    restored_map: ByKeySpace<FxHashMap<&'static [u8], &'static [u8]>>,
    // Need to be kept around to keep the restored_map reference alive
    _restored: Vec<u8>,
}

impl<T: KeyValueDatabase> StartupCacheLayer<T> {
    pub fn new(database: T, path: PathBuf, fresh_db: bool) -> Result<Self> {
        let mut restored = Vec::new();
        let mut restored_map = ByKeySpace::new(|_| FxHashMap::default());
        if !fresh_db {
            if let Result::Ok(mut cache_file) = File::open(&path) {
                cache_file.read_to_end(&mut restored)?;
                drop(cache_file);
                let mut pos = 0;
                while pos < restored.len() {
                    let (key_space, key, value) = read_key_value_pair(&restored, &mut pos)?;
                    let map = restored_map.get_mut(key_space);
                    unsafe {
                        // Safety: This is a self reference, it's valid as long the `restored`
                        // buffer is alive
                        map.insert(
                            transmute::<&'_ [u8], &'static [u8]>(key),
                            transmute::<&'_ [u8], &'static [u8]>(value),
                        );
                    }
                }
            }
        }
        Ok(Self {
            database,
            path,
            fresh_db,
            cache_size: AtomicUsize::new(0),
            cache: ByKeySpace::new(|key_space| {
                DashMap::with_capacity_and_hasher(
                    match key_space {
                        KeySpace::Infra => 8,
                        KeySpace::TaskMeta => 1024 * 1024,
                        KeySpace::TaskData => 1024 * 1024,
                        KeySpace::ForwardTaskCache => 1024 * 1024,
                        KeySpace::ReverseTaskCache => 1024 * 1024,
                    },
                    Default::default(),
                )
            }),
            _restored: restored,
            restored_map,
        })
    }
}

impl<T: KeyValueDatabase> KeyValueDatabase for StartupCacheLayer<T> {
    type ReadTransaction<'l>
        = T::ReadTransaction<'l>
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        T::lower_read_transaction(tx)
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        self.database.begin_read_transaction()
    }

    type ValueBuffer<'l>
        = ValueBuffer<'l, T>
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        transaction: &'l Self::ReadTransaction<'db>,
        key_space: KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        if self.fresh_db {
            return Ok(self
                .database
                .get(transaction, key_space, key)?
                .map(ValueBuffer::Database));
        }
        let value = {
            if let Some(value) = self.restored_map.get(key_space).get(key) {
                Some(ValueBuffer::Cached(*value))
            } else {
                self.database
                    .get(transaction, key_space, key)?
                    .map(ValueBuffer::Database)
            }
        };
        if let Some(value) = value.as_ref() {
            let value: &[u8] = value.borrow();
            let size = self.cache_size.fetch_add(
                key.len() + value.len() + PAIR_HEADER_SIZE,
                Ordering::Relaxed,
            );
            if size < CACHE_SIZE_LIMIT {
                self.cache
                    .get(key_space)
                    .entry(key.to_vec())
                    .or_insert_with(|| Some(value.to_vec()));
            }
        }
        Ok(value)
    }

    type WriteBatch<'l>
        = StartupCacheWriteBatch<'l, T>
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::WriteBatch<'_>> {
        Ok(StartupCacheWriteBatch {
            batch: self.database.write_batch()?,
            this: self,
        })
    }
}

pub struct StartupCacheWriteBatch<'a, T: KeyValueDatabase> {
    batch: T::WriteBatch<'a>,
    this: &'a StartupCacheLayer<T>,
}

impl<'a, T: KeyValueDatabase> WriteBatch<'a> for StartupCacheWriteBatch<'a, T> {
    fn put(&mut self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()> {
        if !self.this.fresh_db {
            let cache = self.this.cache.get(key_space);
            cache.insert(key.to_vec(), Some(value.to_vec()));
        }
        self.batch.put(key_space, key, value)
    }

    type ValueBuffer<'l>
        = <T::WriteBatch<'a> as WriteBatch<'a>>::ValueBuffer<'l>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        self.batch.get(key_space, key)
    }

    fn delete(&mut self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()> {
        if !self.this.fresh_db {
            let cache = self.this.cache.get(key_space);
            cache.insert(key.to_vec(), None);
        }
        self.batch.delete(key_space, key)
    }

    fn commit(self) -> Result<()> {
        if !self.this.fresh_db {
            // Remove file before writing the new snapshot to database to avoid inconsistency
            let _ = fs::remove_file(&self.this.path);
        }
        self.batch.commit()?;
        if !self.this.fresh_db {
            // write cache to a temp file to avoid corrupted file
            let temp_path = self.this.path.with_extension("cache.tmp");
            let mut writer = BufWriter::new(File::create(&temp_path)?);
            let mut pos = 0;
            for (key_space, cache) in self.this.cache.iter() {
                for entry in cache.iter() {
                    if let (key, Some(value)) = entry.pair() {
                        pos += write_key_value_pair(&mut writer, key_space, key, value)?;
                    }
                }
            }
            for (key_space, map) in self.this.restored_map.iter() {
                let cache = self.this.cache.get(key_space);
                for (key, value) in map.iter() {
                    if !cache.contains_key(*key) {
                        let size = key.len() + value.len() + PAIR_HEADER_SIZE;
                        if pos + size < CACHE_SIZE_LIMIT {
                            pos += write_key_value_pair(&mut writer, key_space, key, value)?;
                            if pos + 24 >= CACHE_SIZE_LIMIT {
                                break;
                            }
                        }
                    }
                }
            }

            // move temp file to the final location
            fs::rename(temp_path, &self.this.path)?;
        }
        Ok(())
    }
}
