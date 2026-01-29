use std::mem::take;

use crate::{
    ValueBuffer,
    collector_entry::{CollectorEntry, CollectorEntryValue, EntryKey, TINY_VALUE_THRESHOLD},
    constants::{MAX_ENTRIES_PER_INITIAL_FILE, MAX_SMALL_VALUE_SIZE},
    key::{StoreKey, hash_key},
};

/// A collector accumulates entries that should be eventually written to a file. It keeps track of
/// count and size of the entries to decide when it's "full". Accessing the entries sorts them.
pub struct Collector<K: StoreKey, const SIZE_SHIFT: usize = 0> {
    total_key_size: usize,
    total_value_size: usize,
    entries: Vec<CollectorEntry<K>>,
    /// Maximum number of entries before the collector is considered full
    max_entries: usize,
    /// Maximum total data size (keys + values) before the collector is considered full
    data_threshold: usize,
}

impl<K: StoreKey, const SIZE_SHIFT: usize> Collector<K, SIZE_SHIFT> {
    /// Creates a new collector with custom limits.
    ///
    /// The limits are shifted right by `SIZE_SHIFT` to support thread-local collectors
    /// that use smaller buffers.
    pub fn with_config(max_entries: usize, data_threshold: usize) -> Self {
        let max_entries = max_entries >> SIZE_SHIFT;
        let data_threshold = data_threshold >> SIZE_SHIFT;
        Self {
            total_key_size: 0,
            total_value_size: 0,
            entries: Vec::with_capacity(
                max_entries.min(MAX_ENTRIES_PER_INITIAL_FILE >> SIZE_SHIFT),
            ),
            max_entries,
            data_threshold,
        }
    }

    /// Returns true if the collector has no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Returns true if the collector is full.
    pub fn is_full(&self) -> bool {
        self.entries.len() >= self.max_entries
            || self.total_key_size + self.total_value_size > self.data_threshold
    }

    /// Adds a normal key-value pair to the collector.
    pub fn put(&mut self, key: K, value: ValueBuffer) {
        let key = EntryKey {
            hash: hash_key(&key),
            data: key,
        };
        let value = if value.len() > MAX_SMALL_VALUE_SIZE {
            CollectorEntryValue::Medium {
                value: value.into_boxed_slice(),
            }
        } else if value.len() <= TINY_VALUE_THRESHOLD {
            let slice: &[u8] = &value;
            let mut arr = [0u8; TINY_VALUE_THRESHOLD];
            arr[..slice.len()].copy_from_slice(slice);
            CollectorEntryValue::Tiny {
                value: arr,
                len: slice.len() as u8,
            }
        } else {
            CollectorEntryValue::Small {
                value: value.into_boxed_slice(),
            }
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

    /// Sorts the entries and returns them along with the total key size. This doesn't
    /// clear the entries.
    pub fn sorted(&mut self) -> (&[CollectorEntry<K>], usize) {
        self.entries.sort_unstable_by(|a, b| a.key.cmp(&b.key));
        (&self.entries, self.total_key_size)
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

    /// Clears the collector and drops the capacity
    pub fn drop_contents(&mut self) {
        drop(take(&mut self.entries));
        self.total_key_size = 0;
        self.total_value_size = 0;
    }
}
