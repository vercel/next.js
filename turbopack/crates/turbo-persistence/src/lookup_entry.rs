use crate::{
    ArcBytes,
    constants::{MAX_INLINE_VALUE_SIZE, MAX_SMALL_VALUE_SIZE},
    rc_bytes::RcBytes,
    static_sorted_file_builder::{Entry, EntryValue},
};

/// A value from a SST file. Generic over the byte representation, defaulting to
/// `ArcBytes` for the lookup path. The compaction/iteration path uses
/// `LookupValue<RcBytes>` which is convertible to `IterValue`.
#[derive(PartialEq)]
pub enum LookupValue<B = ArcBytes> {
    /// The value was deleted.
    KeyDeleted,
    /// A single value was deleted from this key's group (MultiValue families only). Other values
    /// for the same key are unaffected. The bytes are the deleted value.
    KeyValueDeleted { value: B },
    /// The value is stored in the SST file.
    ///
    /// The bytes will be pointing either at a keyblock or a value block in the SST
    Slice { value: B },
    /// The value is stored in a blob file.
    Blob { sequence_number: u32 },
}

/// A value from SST file iteration (compaction path, uses RcBytes for
/// non-atomic refcounting).
pub enum IterValue {
    /// The value was deleted.
    KeyDeleted,
    /// A single value was deleted from this key's group (MultiValue families only).
    KeyValueDeleted { value: RcBytes },
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
impl From<LookupValue<RcBytes>> for IterValue {
    fn from(v: LookupValue<RcBytes>) -> Self {
        match v {
            LookupValue::KeyDeleted => IterValue::KeyDeleted,
            LookupValue::KeyValueDeleted { value } => IterValue::KeyValueDeleted { value },
            LookupValue::Slice { value } => IterValue::Slice { value },
            LookupValue::Blob { sequence_number } => IterValue::Blob { sequence_number },
        }
    }
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

    fn key_bytes(&self) -> &[u8] {
        &self.key
    }

    fn value(&self) -> EntryValue<'_> {
        match &self.value {
            IterValue::KeyDeleted => EntryValue::KeyDeleted,
            IterValue::KeyValueDeleted { value } => EntryValue::KeyValueDeleted { value },
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
