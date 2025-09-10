use std::cmp::Ordering;

use smallvec::SmallVec;

use crate::{
    key::StoreKey,
    static_sorted_file_builder::{Entry, EntryValue},
};

pub struct CollectorEntry<K: StoreKey> {
    pub key: EntryKey<K>,
    pub value: CollectorEntryValue,
}

pub enum CollectorEntryValue {
    Small { value: SmallVec<[u8; 16]> },
    Medium { value: Vec<u8> },
    Large { blob: u32 },
    Deleted,
}

impl CollectorEntryValue {
    pub fn len(&self) -> usize {
        match self {
            CollectorEntryValue::Small { value } => value.len(),
            CollectorEntryValue::Medium { value } => value.len(),
            CollectorEntryValue::Large { blob: _ } => 0,
            CollectorEntryValue::Deleted => 0,
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
        self.hash == other.hash && self.data == other.data
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
        self.hash
            .cmp(&other.hash)
            .then_with(|| self.data.cmp(&other.data))
    }
}

impl<K: StoreKey> Entry for CollectorEntry<K> {
    fn key_hash(&self) -> u64 {
        self.key.hash
    }

    fn key_len(&self) -> usize {
        self.key.data.len()
    }

    fn write_key_to(&self, buf: &mut Vec<u8>) {
        self.key.data.write_to(buf);
    }

    fn value(&self) -> EntryValue<'_> {
        match &self.value {
            CollectorEntryValue::Small { value } => EntryValue::Small { value },
            CollectorEntryValue::Medium { value } => EntryValue::Medium { value },
            CollectorEntryValue::Large { blob } => EntryValue::Large { blob: *blob },
            CollectorEntryValue::Deleted => EntryValue::Deleted,
        }
    }
}
