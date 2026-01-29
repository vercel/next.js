use std::cmp::Ordering;

use crate::{
    ArcSlice,
    constants::{MAX_INLINE_VALUE_SIZE, MAX_SMALL_VALUE_SIZE},
    static_sorted_file_builder::{Entry, EntryValue},
};

/// A value from a SST file lookup.
pub enum LookupValue {
    /// The value was deleted.
    Deleted,
    /// The value is stored in the SST file.
    ///
    /// The ArcSlice will be pointing either at a keyblock or a value block in the SST
    Slice { value: ArcSlice<u8> },
    /// The value is stored in a blob file.
    Blob { sequence_number: u32 },
}

/// A value from a SST file lookup.
pub enum LazyLookupValue<'l> {
    /// A LookupValue
    Eager(LookupValue),
    /// A medium sized value that is still compressed.
    Medium {
        uncompressed_size: u32,
        block: &'l [u8],
    },
}

impl LazyLookupValue<'_> {
    /// Returns the size of the value in the SST file.
    pub fn uncompressed_size_in_sst(&self) -> usize {
        match self {
            LazyLookupValue::Eager(LookupValue::Slice { value }) => value.len(),
            LazyLookupValue::Eager(LookupValue::Deleted) => 0,
            LazyLookupValue::Eager(LookupValue::Blob { .. }) => 0,
            LazyLookupValue::Medium {
                uncompressed_size, ..
            } => *uncompressed_size as usize,
        }
    }

    /// Returns true if two values are equal for deduplication purposes.
    ///
    /// For `Medium` values, compares the compressed block bytes directly
    /// (assumes deterministic compression).
    pub fn eq_for_dedup(&self, other: &Self) -> bool {
        self.cmp_for_dedup(other) == Ordering::Equal
    }

    /// Compares two values for ordering purposes during merge sort.
    ///
    /// Order: Deleted < byte-content values (Slice/Medium) < Blob
    /// This ensures entries with the same key are grouped by value for deduplication.
    pub fn cmp_for_dedup(&self, other: &Self) -> Ordering {
        // Assign a type order: Deleted=0, Slice/Medium=1, Blob=2
        fn type_order(v: &LazyLookupValue) -> u8 {
            match v {
                LazyLookupValue::Eager(LookupValue::Deleted) => 0,
                LazyLookupValue::Eager(LookupValue::Slice { .. })
                | LazyLookupValue::Medium { .. } => 1,
                LazyLookupValue::Eager(LookupValue::Blob { .. }) => 2,
            }
        }

        match type_order(self).cmp(&type_order(other)) {
            Ordering::Equal => {
                // Same type category, compare within type
                match (self, other) {
                    (
                        LazyLookupValue::Eager(LookupValue::Deleted),
                        LazyLookupValue::Eager(LookupValue::Deleted),
                    ) => Ordering::Equal,
                    (
                        LazyLookupValue::Eager(LookupValue::Slice { value: a }),
                        LazyLookupValue::Eager(LookupValue::Slice { value: b }),
                    ) => a.as_ref().cmp(b.as_ref()),
                    (
                        LazyLookupValue::Medium { block: a, .. },
                        LazyLookupValue::Medium { block: b, .. },
                    ) => a.cmp(b),
                    (
                        LazyLookupValue::Eager(LookupValue::Slice { value }),
                        LazyLookupValue::Medium { block, .. },
                    ) => {
                        // Cross-type comparison: compare slice bytes with compressed bytes
                        // This shouldn't happen for the same semantic value, but we need a total
                        // order
                        value.as_ref().cmp(*block)
                    }
                    (
                        LazyLookupValue::Medium { block, .. },
                        LazyLookupValue::Eager(LookupValue::Slice { value }),
                    ) => {
                        // Cross-type comparison
                        (*block).cmp(value.as_ref())
                    }
                    (
                        LazyLookupValue::Eager(LookupValue::Blob { sequence_number: a }),
                        LazyLookupValue::Eager(LookupValue::Blob { sequence_number: b }),
                    ) => a.cmp(b),
                    _ => unreachable!("type_order comparison should have handled this"),
                }
            }
            ord => ord,
        }
    }
}

/// An entry from a SST file lookup.
pub struct LookupEntry<'l> {
    /// The hash of the key.
    pub hash: u64,
    /// The key.
    pub key: ArcSlice<u8>,
    /// The value.
    pub value: LazyLookupValue<'l>,
}

impl Entry for LookupEntry<'_> {
    fn key_hash(&self) -> u64 {
        self.hash
    }

    fn key_len(&self) -> usize {
        self.key.len()
    }

    fn write_key_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(&self.key);
    }

    fn value(&self) -> EntryValue<'_> {
        match &self.value {
            LazyLookupValue::Eager(LookupValue::Deleted) => EntryValue::Deleted,
            LazyLookupValue::Eager(LookupValue::Slice { value }) => {
                if value.len() <= MAX_INLINE_VALUE_SIZE {
                    EntryValue::Inline { value }
                } else if value.len() > MAX_SMALL_VALUE_SIZE {
                    EntryValue::Medium { value }
                } else {
                    EntryValue::Small { value }
                }
            }
            LazyLookupValue::Eager(LookupValue::Blob { sequence_number }) => EntryValue::Large {
                blob: *sequence_number,
            },
            LazyLookupValue::Medium {
                uncompressed_size,
                block,
            } => EntryValue::MediumCompressed {
                uncompressed_size: *uncompressed_size,
                block,
            },
        }
    }
}
