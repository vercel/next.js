use std::{
    borrow::Borrow,
    fs::{self, File},
    io::{BufWriter, Read, Write},
    mem::transmute,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

use anyhow::{Ok, Result};
use byteorder::WriteBytesExt;
use rustc_hash::FxHashMap;
use turbo_tasks::FxDashMap;

use crate::database::{
    by_key_space::ByKeySpace,
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{
        BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch, WriteBuffer,
    },
};

const CACHE_SIZE_LIMIT: usize = 100 * 1024 * 1024;
const PAIR_HEADER_SIZE: usize = 9;

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

type Cache = ByKeySpace<FxDashMap<Vec<u8>, Option<Vec<u8>>>>;

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
                FxDashMap::with_capacity_and_hasher(
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

    fn is_empty(&self) -> bool {
        self.database.is_empty()
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
                Some(ValueBuffer::Cached(value))
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

    type SerialWriteBatch<'l>
        = StartupCacheWriteBatch<'l, T::SerialWriteBatch<'l>>
    where
        Self: 'l;

    type ConcurrentWriteBatch<'l>
        = StartupCacheWriteBatch<'l, T::ConcurrentWriteBatch<'l>>
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        Ok(match self.database.write_batch()? {
            WriteBatch::Serial(batch) => WriteBatch::serial(StartupCacheWriteBatch {
                batch,
                path: &self.path,
                fresh_db: self.fresh_db,
                cache: &self.cache,
                restored_map: &self.restored_map,
            }),
            WriteBatch::Concurrent(batch, _) => WriteBatch::concurrent(StartupCacheWriteBatch {
                batch,
                path: &self.path,
                fresh_db: self.fresh_db,
                cache: &self.cache,
                restored_map: &self.restored_map,
            }),
        })
    }
}

pub struct StartupCacheWriteBatch<'a, B> {
    batch: B,
    path: &'a PathBuf,
    fresh_db: bool,
    cache: &'a Cache,
    restored_map: &'a ByKeySpace<FxHashMap<&'static [u8], &'static [u8]>>,
}

impl<'a, B: BaseWriteBatch<'a>> BaseWriteBatch<'a> for StartupCacheWriteBatch<'a, B> {
    type ValueBuffer<'l>
        = B::ValueBuffer<'l>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        self.batch.get(key_space, key)
    }

    fn commit(self) -> Result<()> {
        if !self.fresh_db {
            // Remove file before writing the new snapshot to database to avoid inconsistency
            let _ = fs::remove_file(self.path);
        }
        self.batch.commit()?;
        if !self.fresh_db {
            // write cache to a temp file to avoid corrupted file
            let temp_path = self.path.with_extension("cache.tmp");
            let mut writer = BufWriter::new(File::create(&temp_path)?);
            let mut size_buffer = [0u8; 4];
            let mut pos = 0;
            for (key_space, cache) in self.cache.iter() {
                for entry in cache.iter() {
                    if let (key, Some(value)) = entry.pair() {
                        pos += write_key_value_pair(
                            &mut writer,
                            key_space,
                            key,
                            value,
                            &mut size_buffer,
                        )?;
                    }
                }
            }
            for (key_space, map) in self.restored_map.iter() {
                let cache = self.cache.get(key_space);
                for (key, value) in map.iter() {
                    if !cache.contains_key(*key) {
                        let size = key.len() + value.len() + PAIR_HEADER_SIZE;
                        if pos + size < CACHE_SIZE_LIMIT {
                            pos += write_key_value_pair(
                                &mut writer,
                                key_space,
                                key,
                                value,
                                &mut size_buffer,
                            )?;
                            if pos + 24 >= CACHE_SIZE_LIMIT {
                                break;
                            }
                        }
                    }
                }
            }

            // move temp file to the final location
            fs::rename(temp_path, self.path)?;
        }
        Ok(())
    }
}

impl<'a, B: SerialWriteBatch<'a>> SerialWriteBatch<'a> for StartupCacheWriteBatch<'a, B> {
    fn put(
        &mut self,
        key_space: KeySpace,
        key: WriteBuffer<'_>,
        value: WriteBuffer<'_>,
    ) -> Result<()> {
        if !self.fresh_db {
            let cache = self.cache.get(key_space);
            cache.insert(key.to_vec(), Some(value.to_vec()));
        }
        self.batch.put(key_space, key, value)
    }

    fn delete(&mut self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        if !self.fresh_db {
            let cache = self.cache.get(key_space);
            cache.insert(key.to_vec(), None);
        }
        self.batch.delete(key_space, key)
    }

    fn flush(&mut self, key_space: KeySpace) -> Result<()> {
        self.batch.flush(key_space)
    }
}

impl<'a, B: ConcurrentWriteBatch<'a>> ConcurrentWriteBatch<'a> for StartupCacheWriteBatch<'a, B> {
    fn put(&self, key_space: KeySpace, key: WriteBuffer<'_>, value: WriteBuffer<'_>) -> Result<()> {
        if !self.fresh_db {
            let cache = self.cache.get(key_space);
            cache.insert(key.to_vec(), Some(value.to_vec()));
        }
        self.batch.put(key_space, key, value)
    }

    fn delete(&self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        if !self.fresh_db {
            let cache = self.cache.get(key_space);
            cache.insert(key.to_vec(), None);
        }
        self.batch.delete(key_space, key)
    }

    unsafe fn flush(&self, key_space: KeySpace) -> Result<()> {
        unsafe { self.batch.flush(key_space) }
    }
}

fn write_key_value_pair(
    writer: &mut BufWriter<File>,
    key_space: KeySpace,
    key: &[u8],
    value: &[u8],
    size_buffer: &mut [u8; 4],
) -> Result<usize> {
    writer.write_u8(match key_space {
        KeySpace::Infra => 0,
        KeySpace::TaskMeta => 1,
        KeySpace::TaskData => 2,
        KeySpace::ForwardTaskCache => 3,
        KeySpace::ReverseTaskCache => 4,
    })?;
    let key_len = key.len();
    size_buffer.copy_from_slice(&(key_len as u32).to_be_bytes());
    writer.write_all(&*size_buffer)?;
    let value_len = value.len();
    size_buffer.copy_from_slice(&(value_len as u32).to_be_bytes());
    writer.write_all(&*size_buffer)?;
    writer.write_all(key)?;
    writer.write_all(value)?;
    Ok(9 + key_len + value_len)
}

fn read_key_value_pair<'l>(
    buffer: &'l [u8],
    pos: &mut usize,
) -> Result<(KeySpace, &'l [u8], &'l [u8])> {
    let key_space = match buffer[*pos] {
        0 => KeySpace::Infra,
        1 => KeySpace::TaskMeta,
        2 => KeySpace::TaskData,
        3 => KeySpace::ForwardTaskCache,
        4 => KeySpace::ReverseTaskCache,
        _ => return Err(anyhow::anyhow!("Invalid key space")),
    };
    *pos += 1;
    let key_len = u32::from_be_bytes(buffer[*pos..*pos + 4].try_into()?);
    *pos += 4;
    let value_len = u32::from_be_bytes(buffer[*pos..*pos + 4].try_into()?);
    *pos += 4;
    let key = &buffer[*pos..*pos + key_len as usize];
    *pos += key_len as usize;
    let value = &buffer[*pos..*pos + value_len as usize];
    *pos += value_len as usize;
    Ok((key_space, key, value))
}
