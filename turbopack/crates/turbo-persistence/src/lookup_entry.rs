use crate::{
    ArcBytes,
    constants::{MAX_INLINE_VALUE_SIZE, MAX_SMALL_VALUE_SIZE},
    static_sorted_file_builder::{Entry, EntryValue},
};

/// A value from an SST file lookup.
#[derive(PartialEq)]
pub enum LookupValue {
    /// The key and all of its values were deleted.
    KeyDeleted,
    /// A single value was deleted from this key's group (MultiValue families only).
    KeyValueDeleted { value: ArcBytes<'static> },
    /// The value is stored in the SST file.
    Slice { value: ArcBytes<'static> },
    /// The value is stored in a blob file.
    Blob { sequence_number: u32 },
}

/// A value from an SST file lookup that may still be compressed.
pub enum LazyLookupValue {
    Eager(LookupValue),
    /// A medium-sized value that is still compressed.
    Medium {
        uncompressed_size: u32,
        checksum: u32,
        block: ArcBytes<'static>,
    },
}

/// An entry from an SST file lookup.
pub struct LookupEntry {
    pub hash: u64,
    pub key: ArcBytes<'static>,
    pub value: LazyLookupValue,
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
            LazyLookupValue::Eager(LookupValue::KeyDeleted) => EntryValue::KeyDeleted,
            LazyLookupValue::Eager(LookupValue::KeyValueDeleted { value }) => {
                EntryValue::KeyValueDeleted { value }
            }
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
