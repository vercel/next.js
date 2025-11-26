use crate::{
    ArcSlice,
    constants::MAX_SMALL_VALUE_SIZE,
    static_sorted_file_builder::{Entry, EntryValue},
};

/// A value from a SST file lookup.
pub enum LookupValue {
    /// The value was deleted.
    Deleted,
    /// The value is stored in the SST file.
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
                if value.len() > MAX_SMALL_VALUE_SIZE {
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
