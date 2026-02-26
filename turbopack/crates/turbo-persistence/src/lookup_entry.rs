use crate::{
    ArcBytes,
    constants::{MAX_INLINE_VALUE_SIZE, MAX_SMALL_VALUE_SIZE},
    static_sorted_file_builder::{Entry, EntryValue},
};

/// A value from a SST file lookup.
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

/// A value from a SST file lookup.
pub enum LazyLookupValue {
    /// A LookupValue
    Eager(LookupValue),
    /// A medium sized value that is still compressed.
    Medium {
        uncompressed_size: u32,
        block: ArcBytes,
    },
}

impl LazyLookupValue {
    /// Returns the size of the value in the SST file.
    pub fn uncompressed_size_in_sst(&self) -> usize {
        match self {
            LazyLookupValue::Eager(LookupValue::Slice { value }) => value.len(),
            LazyLookupValue::Eager(LookupValue::Deleted) => 0,
            LazyLookupValue::Eager(LookupValue::Blob { .. }) => 0,
            LazyLookupValue::Medium {
                uncompressed_size,
                block,
            } => {
                if *uncompressed_size == 0 {
                    block.len()
                } else {
                    *uncompressed_size as usize
                }
            }
        }
    }

    /// Returns true if this value gets its own dedicated value block.
    pub fn is_medium_value(&self) -> bool {
        match self {
            LazyLookupValue::Eager(LookupValue::Slice { value })
                if value.len() > MAX_SMALL_VALUE_SIZE =>
            {
                true
            }
            LazyLookupValue::Medium { .. } => true,
            _ => false,
        }
    }

    /// Returns the value size if it will be packed into a small value block, or 0 otherwise.
    pub fn small_value_size(&self) -> usize {
        match self {
            LazyLookupValue::Eager(LookupValue::Slice { value })
                if value.len() > MAX_INLINE_VALUE_SIZE && value.len() <= MAX_SMALL_VALUE_SIZE =>
            {
                value.len()
            }
            _ => 0,
        }
    }
}

/// An entry from a SST file lookup.
pub struct LookupEntry {
    /// The hash of the key.
    pub hash: u64,
    /// The key.
    pub key: ArcBytes,
    /// The value.
    pub value: LazyLookupValue,
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
            } => EntryValue::MediumRaw {
                uncompressed_size: *uncompressed_size,
                block: block.as_ref(),
            },
        }
    }
}
