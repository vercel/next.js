use std::mem::take;

use crate::{
    FamilyKind, ValueBuffer,
    collector_entry::{CollectorEntry, CollectorEntryValue, EntryKey, TINY_VALUE_THRESHOLD},
    constants::{
        DATA_THRESHOLD_PER_INITIAL_FILE, MAX_ENTRIES_PER_INITIAL_FILE, MAX_SMALL_VALUE_SIZE,
    },
    key::{StoreKey, hash_key},
    value_block_count_tracker::ValueBlockCountTracker,
};

/// A collector accumulates entries that should be eventually written to a file. It keeps track of
/// count and size of the entries to decide when it's "full". Accessing the entries sorts them.
pub struct Collector<K: StoreKey, const SIZE_SHIFT: usize = 0> {
    total_key_size: usize,
    total_value_size: usize,
    value_block_tracker: ValueBlockCountTracker,
    entries: Vec<CollectorEntry<K>>,
}

impl<K: StoreKey, const SIZE_SHIFT: usize> Collector<K, SIZE_SHIFT> {
    /// Creates a new collector. Note that this allocates the full capacity for the entries.
    pub fn new() -> Self {
        Self {
            total_key_size: 0,
            total_value_size: 0,
            value_block_tracker: ValueBlockCountTracker::new(),
            entries: Vec::with_capacity(MAX_ENTRIES_PER_INITIAL_FILE >> SIZE_SHIFT),
        }
    }

    /// Returns true if the collector has no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Returns true if the collector is full.
    pub fn is_full(&self) -> bool {
        self.entries.len() >= MAX_ENTRIES_PER_INITIAL_FILE >> SIZE_SHIFT
            || self.total_key_size + self.total_value_size
                > DATA_THRESHOLD_PER_INITIAL_FILE >> SIZE_SHIFT
            || self.value_block_tracker.is_full()
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
        self.value_block_tracker
            .track(value.is_medium_value(), value.small_value_size());
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
        self.value_block_tracker.track(
            entry.value.is_medium_value(),
            entry.value.small_value_size(),
        );
        self.entries.push(entry);
    }

    /// Sorts the entries, deduplicates same-key entries based on family semantics, and returns
    /// them along with the total key size.
    ///
    /// Uses a stable sort so insertion order is preserved for equal keys — the last entry for a
    /// given key is the newest.
    ///
    /// Dedup rules:
    /// - SingleValue: keep only the newest (last) entry per key.
    /// - MultiValue: keep entries from the last tombstone onward (the tombstone shadows all older
    ///   entries for that key). If there is no tombstone, all entries are kept.
    pub fn sorted(&mut self, family_kind: FamilyKind) -> (&[CollectorEntry<K>], usize) {
        self.entries.sort_by(|a, b| a.key.cmp(&b.key));

        // Deduplicate in-place using a write pointer. We scan forward to find runs of same-key
        // entries, then decide which entries from each run to keep.
        let mut write = 0;
        let mut read = 0;
        let len = self.entries.len();
        while read < len {
            // Find the end of the run of entries with the same key
            let run = &self.entries[read..];
            let run_len = 1 + run[1..].iter().take_while(|e| e.key == run[0].key).count();
            let run_end = read + run_len;

            let keep_start = match family_kind {
                FamilyKind::SingleValue => {
                    // Keep only the last (newest) entry
                    run_end - 1
                }
                FamilyKind::MultiValue => {
                    // Find the last tombstone in the run; keep from there onward
                    let last_tombstone = self.entries[read..run_end]
                        .iter()
                        .rposition(|e| matches!(e.value, CollectorEntryValue::Deleted));
                    last_tombstone.map_or(read, |p| read + p)
                }
            };

            // Subtract sizes of dropped entries
            for e in &self.entries[read..keep_start] {
                self.total_key_size -= e.key.len();
                self.total_value_size -= e.value.len();
            }

            // Move kept entries into place
            for i in keep_start..run_end {
                if i != write {
                    self.entries.swap(write, i);
                }
                write += 1;
            }

            read = run_end;
        }
        self.entries.truncate(write);

        (&self.entries, self.total_key_size)
    }

    /// Clears the collector.
    pub fn clear(&mut self) {
        self.entries.clear();
        self.total_key_size = 0;
        self.total_value_size = 0;
        self.value_block_tracker.reset();
    }

    /// Drains all entries from the collector in un-sorted order. This can be used to move the
    /// entries into another collector.
    pub fn drain(&mut self) -> impl Iterator<Item = CollectorEntry<K>> + '_ {
        self.total_key_size = 0;
        self.total_value_size = 0;
        self.value_block_tracker.reset();
        self.entries.drain(..)
    }

    /// Clears the collector and drops the capacity
    pub fn drop_contents(&mut self) {
        drop(take(&mut self.entries));
        self.total_key_size = 0;
        self.total_value_size = 0;
        self.value_block_tracker.reset();
    }
}
