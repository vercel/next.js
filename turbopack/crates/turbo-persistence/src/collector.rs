use std::mem::replace;

use crate::{
    constants::{DATA_THRESHOLD_PER_FILE, MAX_ENTRIES_PER_FILE, MAX_SMALL_VALUE_SIZE},
    entry::{Entry, EntryValue},
    key::StoreKey,
};

pub struct Collector<K: StoreKey> {
    total_key_size: usize,
    total_value_size: usize,
    entries: Vec<Entry<K>>,
}

impl<K: StoreKey> Collector<K> {
    pub fn new() -> Self {
        Self {
            total_key_size: 0,
            total_value_size: 0,
            entries: Vec::with_capacity(MAX_ENTRIES_PER_FILE),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn is_full(&self) -> bool {
        self.entries.len() >= MAX_ENTRIES_PER_FILE
            || self.total_key_size + self.total_value_size > DATA_THRESHOLD_PER_FILE
    }

    pub fn put(&mut self, key: K, value: Vec<u8>) {
        self.total_key_size += key.len();
        self.total_value_size += value.len();
        self.entries.push(Entry {
            key,
            value: if value.len() > MAX_SMALL_VALUE_SIZE {
                EntryValue::Medium { value }
            } else {
                EntryValue::Small { value }
            },
        });
    }

    pub fn put_blob(&mut self, key: K, blob: u32) {
        self.total_key_size += key.len();
        self.entries.push(Entry {
            key,
            value: EntryValue::Large { blob },
        });
    }

    pub fn delete(&mut self, key: K) {
        self.total_key_size += key.len();
        self.entries.push(Entry {
            key,
            value: EntryValue::Deleted,
        });
    }

    pub fn add_entry(&mut self, entry: Entry<K>) {
        self.total_key_size += entry.key.len();
        if let EntryValue::Small { value } | EntryValue::Medium { value } = &entry.value {
            self.total_value_size += value.len();
        }
        self.entries.push(entry);
    }

    pub fn drain_sorted(&mut self) -> (Vec<Entry<K>>, usize, usize) {
        self.entries.sort_by(|a, b| a.key.cmp(&b.key));
        let entries = replace(&mut self.entries, Vec::with_capacity(MAX_ENTRIES_PER_FILE));
        let key_size = replace(&mut self.total_key_size, 0);
        let value_size = replace(&mut self.total_value_size, 0);
        (entries, key_size, value_size)
    }

    pub fn into_entries(self) -> Vec<Entry<K>> {
        self.entries
    }
}
