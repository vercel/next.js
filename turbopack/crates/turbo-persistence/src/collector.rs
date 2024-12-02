use crate::{
    collector_entry::{CollectorEntry, CollectorEntryValue, EntryKey},
    constants::{
        DATA_THRESHOLD_PER_INITIAL_FILE, MAX_ENTRIES_PER_INITIAL_FILE, MAX_SMALL_VALUE_SIZE,
    },
    key::{hash_key, StoreKey},
};

/// A collector accumulates entries that should be eventually written to a file. It keeps track of
/// count and size of the entries to decide when it's "full". Accessing the entries sorts them.
pub struct Collector<K: StoreKey> {
    total_key_size: usize,
    total_value_size: usize,
    entries: Vec<CollectorEntry<K>>,
}

impl<K: StoreKey> Collector<K> {
    /// Creates a new collector. Note that this allocates the full capacity for the entries.
    pub fn new() -> Self {
        Self {
            total_key_size: 0,
            total_value_size: 0,
            entries: Vec::with_capacity(MAX_ENTRIES_PER_INITIAL_FILE),
        }
    }

    /// Returns true if the collector has no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Returns true if the collector is full.
    pub fn is_full(&self) -> bool {
        self.entries.len() >= MAX_ENTRIES_PER_INITIAL_FILE
            || self.total_key_size + self.total_value_size > DATA_THRESHOLD_PER_INITIAL_FILE
    }

    /// Adds a normal key-value pair to the collector.
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

    /// Adds a blob key-value pair to the collector.
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

    /// Adds a tombstone pair to the collector.
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

    /// Adds an entry from another collector to this collector.
    pub fn add_entry(&mut self, entry: CollectorEntry<K>) {
        self.total_key_size += entry.key.len();
        self.total_value_size += entry.value.len();
        self.entries.push(entry);
    }

    /// Sorts the entries and returns them along with the total key and value sizes. This doesn't
    /// clear the entries.
    pub fn sorted(&mut self) -> (&[CollectorEntry<K>], usize, usize) {
        self.entries.sort_by(|a, b| a.key.cmp(&b.key));
        (&self.entries, self.total_key_size, self.total_value_size)
    }

    /// Clears the collector.
    pub fn clear(&mut self) {
        self.entries.clear();
        self.total_key_size = 0;
        self.total_value_size = 0;
    }

    /// Drains all entries from the collector in un-sorted order. This can be used to move the
    /// entries into another collector.
    pub fn drain(&mut self) -> impl Iterator<Item = CollectorEntry<K>> + '_ {
        self.total_key_size = 0;
        self.total_value_size = 0;
        self.entries.drain(..)
    }

    /// Returns the number of entries in the collector.
    pub fn len(&self) -> usize {
        self.entries.len()
    }
}
