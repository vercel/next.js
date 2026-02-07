use std::cmp::Ordering;

use crate::{
    key::StoreKey,
    static_sorted_file_builder::{Entry, EntryValue},
};

pub struct CollectorEntry<K: StoreKey> {
    pub key: EntryKey<K>,
    pub value: CollectorEntryValue,
}

/// The size threshold for inline storage in CollectorEntryValue, this is the largest value that can
/// be stored inline without inflating the size of the enum
pub const TINY_VALUE_THRESHOLD: usize = 22;

pub enum CollectorEntryValue {
    /// Tiny value stored inline (22 16 bytes, no heap allocation)
    Tiny {
        value: [u8; TINY_VALUE_THRESHOLD],
        len: u8,
    },
    /// Small value that fits in shared value blocks (> 16 bytes, ≤ MAX_SMALL_VALUE_SIZE)
    Small {
        value: Box<[u8]>,
    },
    /// Medium value that gets its own value block (> MAX_SMALL_VALUE_SIZE)
    Medium {
        value: Box<[u8]>,
    },
    Large {
        blob: u32,
    },
    Deleted,
}

impl CollectorEntryValue {
    pub fn len(&self) -> usize {
        match self {
            CollectorEntryValue::Tiny { len, .. } => *len as usize,
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
            // Tiny values are stored the same way as Small in the SST file, they just have an
            // optimized representation here
            CollectorEntryValue::Tiny { value, len } => EntryValue::Small {
                value: &value[..*len as usize],
            },
            CollectorEntryValue::Small { value } => EntryValue::Small { value },
            CollectorEntryValue::Medium { value } => EntryValue::Medium { value },
            CollectorEntryValue::Large { blob } => EntryValue::Large { blob: *blob },
            CollectorEntryValue::Deleted => EntryValue::Deleted,
        }
    }
}
