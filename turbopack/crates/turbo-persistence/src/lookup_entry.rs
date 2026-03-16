use crate::{
    ArcBytes,
    constants::{MAX_INLINE_VALUE_SIZE, MAX_SMALL_VALUE_SIZE},
    rc_bytes::RcBytes,
    static_sorted_file_builder::{Entry, EntryValue},
};

/// A value from a SST file lookup (lookup path, uses ArcBytes).
#[derive(PartialEq)]
pub enum LookupValue {
    /// The value was deleted.
    Deleted,
    /// The value is stored in the SST file.
    ///
    /// The ArcBytes will be pointing either at a keyblock or a value block in the SST
    Slice { value: ArcBytes },
    /// The value is stored in a blob file.
    Blob { sequence_number: u32 },
}

/// A value from SST file iteration (compaction path, uses RcBytes for
/// non-atomic refcounting).
pub enum IterValue {
    /// The value was deleted.
    Deleted,
    /// The value is stored in the SST file.
    Slice { value: RcBytes },
    /// The value is stored in a blob file.
    Blob { sequence_number: u32 },
    /// A medium sized value that is still compressed.
    Medium {
        uncompressed_size: u32,
        checksum: u32,
        block: RcBytes,
    },
}

/// An entry from SST file iteration (compaction path, uses RcBytes).
pub struct LookupEntry {
    /// The hash of the key.
    pub hash: u64,
    /// The key.
    pub key: RcBytes,
    /// The value.
    pub value: IterValue,
}

impl Entry for LookupEntry {
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
            IterValue::Deleted => EntryValue::Deleted,
            IterValue::Slice { value } => {
                if value.len() <= MAX_INLINE_VALUE_SIZE {
                    EntryValue::Inline { value }
                } else if value.len() > MAX_SMALL_VALUE_SIZE {
                    EntryValue::Medium { value }
                } else {
                    EntryValue::Small { value }
                }
            }
            IterValue::Blob { sequence_number } => EntryValue::Large {
                blob: *sequence_number,
            },
            IterValue::Medium {
                uncompressed_size,
                checksum,
                block,
            } => EntryValue::MediumRaw {
                uncompressed_size: *uncompressed_size,
                checksum: *checksum,
                block: block.as_ref(),
            },
        }
    }
}
