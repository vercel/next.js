use std::mem::replace;

use crate::{
    collector_entry::{CollectorEntry, CollectorEntryValue, EntryKey},
    constants::{
        DATA_THRESHOLD_PER_INITIAL_FILE, MAX_ENTRIES_PER_INITIAL_FILE, MAX_SMALL_VALUE_SIZE,
    },
    key::{hash_key, StoreKey},
};

pub struct Collector<K: StoreKey> {
    total_key_size: usize,
    total_value_size: usize,
    entries: Vec<CollectorEntry<K>>,
}

impl<K: StoreKey> Collector<K> {
    pub fn new() -> Self {
        Self {
            total_key_size: 0,
            total_value_size: 0,
            entries: Vec::with_capacity(MAX_ENTRIES_PER_INITIAL_FILE),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn is_full(&self) -> bool {
        self.entries.len() >= MAX_ENTRIES_PER_INITIAL_FILE
            || self.total_key_size + self.total_value_size > DATA_THRESHOLD_PER_INITIAL_FILE
    }

    pub fn put(&mut self, key: K, value: Vec<u8>) {
        let key = EntryKey {
            hash: hash_key(&key),
            data: key,
        };
        let value = if value.len() > MAX_SMALL_VALUE_SIZE {
            CollectorEntryValue::Medium { value }
        } else {
            CollectorEntryValue::Small { value }
        };
        self.total_key_size += key.len();
        self.total_value_size += value.len();
        self.entries.push(CollectorEntry { key, value });
    }

    pub fn put_blob(&mut self, key: K, blob: u32) {
        let key = EntryKey {
            hash: hash_key(&key),
            data: key,
        };
        self.total_key_size += key.len();
        self.entries.push(CollectorEntry {
            key,
            value: CollectorEntryValue::Large { blob },
        });
    }

    pub fn delete(&mut self, key: K) {
        let key = EntryKey {
            hash: hash_key(&key),
            data: key,
        };
        self.total_key_size += key.len();
        self.entries.push(CollectorEntry {
            key,
            value: CollectorEntryValue::Deleted,
        });
    }

    pub fn add_entry(&mut self, entry: CollectorEntry<K>) {
        self.total_key_size += entry.key.len();
        self.total_value_size += entry.value.len();
        self.entries.push(entry);
    }

    pub fn drain_sorted(&mut self) -> (Vec<CollectorEntry<K>>, usize, usize) {
        self.entries.sort_by(|a, b| a.key.cmp(&b.key));
        let entries = replace(
            &mut self.entries,
            Vec::with_capacity(MAX_ENTRIES_PER_INITIAL_FILE),
        );
        let key_size = replace(&mut self.total_key_size, 0);
        let value_size = replace(&mut self.total_value_size, 0);
        (entries, key_size, value_size)
    }

    pub fn into_entries(self) -> Vec<CollectorEntry<K>> {
        self.entries
    }
}
