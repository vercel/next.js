use std::cmp::Ordering;

use crate::key::StoreKey;

pub struct Entry<K: StoreKey> {
    pub key: EntryKey<K>,
    pub value: EntryValue,
}

pub enum EntryValue {
    Small { value: Vec<u8> },
    Medium { value: Vec<u8> },
    Large { blob: u32 },
    Deleted,
}

impl EntryValue {
    pub fn len(&self) -> usize {
        match self {
            EntryValue::Small { value } => value.len(),
            EntryValue::Medium { value } => value.len(),
            EntryValue::Large { blob: _ } => 0,
            EntryValue::Deleted => 0,
        }
    }
}

pub struct EntryKey<K: StoreKey> {
    pub hash: u64,
    pub data: K,
}

impl<K: StoreKey> EntryKey<K> {
    pub fn len(&self) -> usize {
        std::mem::size_of::<u64>() + self.data.len()
    }
}

impl<K: StoreKey> PartialEq for EntryKey<K> {
    fn eq(&self, other: &Self) -> bool {
        // self.hash == other.hash && self.data == other.data
        self.data == other.data
    }
}

impl<K: StoreKey> Eq for EntryKey<K> {}

impl<K: StoreKey> PartialOrd for EntryKey<K> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<K: StoreKey> Ord for EntryKey<K> {
    fn cmp(&self, other: &Self) -> Ordering {
        // self.hash
        //     .cmp(&other.hash)
        //     .then_with(|| self.data.cmp(&other.data))
        self.data.cmp(&other.data)
    }
}
