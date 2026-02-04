use std::hash::{Hash, Hasher};

use byteorder::ByteOrder;
use lmdb::{Database, RwTransaction, Transaction, WriteFlags};
use rustc_hash::FxHasher;

const MAX_KEY_SIZE: usize = 511;
const SHARED_KEY: usize = MAX_KEY_SIZE - 8;

pub fn get<'tx, T: Transaction>(
    tx: &'tx T,
    database: Database,
    key: &[u8],
) -> lmdb::Result<&'tx [u8]> {
    if key.len() > MAX_KEY_SIZE - 1 {
        let hashed_key = hashed_key(key);
        let data = tx.get(database, &hashed_key)?;
        let iter = ExtendedValueIter::new(data);
        for (k, v) in iter {
            if k == key {
                return Ok(v);
            }
        }
        Err(lmdb::Error::NotFound)
    } else {
        tx.get(database, &key)
    }
}

pub fn put(
    tx: &mut RwTransaction<'_>,
    database: Database,
    key: &[u8],
    value: &[u8],
    flags: WriteFlags,
) -> lmdb::Result<()> {
    if key.len() > MAX_KEY_SIZE - 1 {
        let hashed_key = hashed_key(key);

        let size = key.len() - SHARED_KEY + value.len() + 8;
        let old = tx.get(database, &hashed_key);
        let old_size = old.map_or(0, |v| v.len());
        let mut data = Vec::with_capacity(old_size + size);
        data.extend_from_slice(&((key.len() - SHARED_KEY) as u32).to_be_bytes());
        data.extend_from_slice(&(value.len() as u32).to_be_bytes());
        data.extend_from_slice(&key[SHARED_KEY..]);
        data.extend_from_slice(value);
        if let Ok(old) = old {
            let iter = ExtendedValueIter::new(old);
            for (k, v) in iter {
                if k != &key[SHARED_KEY..] {
                    data.extend_from_slice(&(k.len() as u32).to_be_bytes());
                    data.extend_from_slice(&(v.len() as u32).to_be_bytes());
                    data.extend_from_slice(k);
                    data.extend_from_slice(v);
                }
            }
        };

        tx.put(database, &hashed_key, &data, flags)?;
        Ok(())
    } else {
        tx.put(database, &key, &value, flags)
    }
}

pub fn delete(
    tx: &mut RwTransaction<'_>,
    database: Database,
    key: &[u8],
    flags: WriteFlags,
) -> lmdb::Result<()> {
    if key.len() > MAX_KEY_SIZE - 1 {
        let hashed_key = hashed_key(key);

        let old = match tx.get(database, &hashed_key) {
            Ok(data) => data,
            Err(lmdb::Error::NotFound) => return Ok(()),
            Err(err) => return Err(err),
        };
        let mut data = Vec::with_capacity(old.len());
        let iter = ExtendedValueIter::new(old);
        for (k, v) in iter {
            if k != &key[SHARED_KEY..] {
                data.extend_from_slice(&(k.len() as u32).to_be_bytes());
                data.extend_from_slice(&(v.len() as u32).to_be_bytes());
                data.extend_from_slice(k);
                data.extend_from_slice(v);
            }
        }
        if data.is_empty() {
            tx.del(database, &hashed_key, None)?;
            Ok(())
        } else if data.len() != old.len() {
            tx.put(database, &hashed_key, &data, flags)?;
            Ok(())
        } else {
            Ok(())
        }
    } else {
        tx.del(database, &key, None)
    }
}

fn hashed_key(key: &[u8]) -> [u8; MAX_KEY_SIZE] {
    let mut result = [0; MAX_KEY_SIZE];
    let mut hash = FxHasher::default();
    key.hash(&mut hash);
    byteorder::BigEndian::write_u64(&mut result, hash.finish());
    result[8..].copy_from_slice(&key[0..SHARED_KEY]);
    result
}

struct ExtendedValueIter<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Iterator for ExtendedValueIter<'a> {
    type Item = (&'a [u8], &'a [u8]);

    fn next(&mut self) -> Option<Self::Item> {
        if self.pos >= self.data.len() {
            return None;
        }
        let key_len = byteorder::BigEndian::read_u32(&self.data[self.pos..]) as usize;
        self.pos += 4;
        let value_len = byteorder::BigEndian::read_u32(&self.data[self.pos..]) as usize;
        self.pos += 4;
        let key = &self.data[self.pos..self.pos + key_len];
        self.pos += key_len;
        let value = &self.data[self.pos..self.pos + value_len];
        self.pos += value_len;
        Some((key, value))
    }
}

impl<'a> ExtendedValueIter<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }
}
