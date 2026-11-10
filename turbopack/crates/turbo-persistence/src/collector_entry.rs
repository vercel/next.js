use std::cmp::Ordering;

use crate::{
    constants::MAX_INLINE_VALUE_SIZE,
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
    /// Tiny value stored inline (≤22 bytes, no heap allocation)
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
    KeyDeleted,
    /// Key-value tombstone: deletes only this one value from the key's group. MultiValue only.
    /// The deleted value is stored inline, so it is capped at [`MAX_INLINE_VALUE_SIZE`].
    KeyValueDeleted {
        value: [u8; MAX_INLINE_VALUE_SIZE],
        len: u8,
    },
}

impl CollectorEntryValue {
    pub fn len(&self) -> usize {
        match self {
            CollectorEntryValue::KeyValueDeleted { len, .. }
            | CollectorEntryValue::Tiny { len, .. } => *len as usize,
            CollectorEntryValue::Small { value } => value.len(),
            CollectorEntryValue::Medium { value } => value.len(),
            CollectorEntryValue::Large { blob: _ } => 0,
            CollectorEntryValue::KeyDeleted => 0,
        }
    }

    /// Returns true if this value gets its own dedicated value block.
    pub fn is_medium_value(&self) -> bool {
        matches!(self, CollectorEntryValue::Medium { .. })
    }

    /// The value bytes, or `None` for variants that carry no value data of their own (blob
    /// references and key tombstones).
    #[cfg(feature = "verify_sst_content")]
    pub fn as_bytes(&self) -> Option<&[u8]> {
        match self {
            // Separate arms: the inline buffers have different sizes, so they cannot be bound by
            // a single or-pattern.
            CollectorEntryValue::Tiny { value, len } => Some(&value[..*len as usize]),
            CollectorEntryValue::KeyValueDeleted { value, len } => Some(&value[..*len as usize]),
            CollectorEntryValue::Small { value } | CollectorEntryValue::Medium { value } => {
                Some(value)
            }
            CollectorEntryValue::Large { .. } | CollectorEntryValue::KeyDeleted => None,
        }
    }

    /// Returns the value size if it will be packed into a small value block, or 0 otherwise.
    pub fn small_value_size(&self) -> usize {
        match self {
            CollectorEntryValue::Tiny { len, .. } if (*len as usize) > MAX_INLINE_VALUE_SIZE => {
                *len as usize
            }
            CollectorEntryValue::Small { value } => value.len(),
            _ => 0,
        }
    }

    /// Sort rank within a key group. The two tombstone kinds sit at opposite ends:
    ///
    /// - Key-value tombstones (rank 0) go **first**, so a reader collects them before the values
    ///   they filter and can apply them in one forward pass.
    /// - Values (rank 1) go in the middle.
    /// - Key tombstones (rank 2) go **last**, because they shadow only entries older than
    ///   themselves — including entries in this same SST. A batch doing `put(A); delete; put(B)`
    ///   must keep A and B, so a reader that stops at the first key tombstone it sees still returns
    ///   the same-batch values it already collected.
    pub fn sort_rank(&self) -> u8 {
        match self {
            CollectorEntryValue::KeyValueDeleted { .. } => 0,
            CollectorEntryValue::KeyDeleted => 2,
            _ => 1,
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

    fn key_bytes(&self) -> &[u8] {
        self.key.data.as_slice()
    }

    fn value(&self) -> EntryValue<'_> {
        match &self.value {
            CollectorEntryValue::Tiny { value, len } => {
                let slice = &value[..*len as usize];
                if slice.len() <= MAX_INLINE_VALUE_SIZE {
                    EntryValue::Inline { value: slice }
                } else {
                    EntryValue::Small { value: slice }
                }
            }
            CollectorEntryValue::Small { value } => {
                if value.len() <= MAX_INLINE_VALUE_SIZE {
                    EntryValue::Inline { value }
                } else {
                    EntryValue::Small { value }
                }
            }
            CollectorEntryValue::Medium { value } => EntryValue::Medium { value },
            CollectorEntryValue::Large { blob } => EntryValue::Large { blob: *blob },
            CollectorEntryValue::KeyDeleted => EntryValue::KeyDeleted,
            CollectorEntryValue::KeyValueDeleted { value, len } => EntryValue::KeyValueDeleted {
                value: &value[..*len as usize],
            },
        }
    }
}
