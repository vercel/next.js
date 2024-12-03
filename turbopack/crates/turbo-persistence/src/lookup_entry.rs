use crate::{
    constants::MAX_SMALL_VALUE_SIZE,
    static_sorted_file_builder::{Entry, EntryValue},
    ArcSlice,
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

impl LookupValue {
    /// Returns the size of the value in the SST file.
    pub fn size_in_sst(&self) -> usize {
        match self {
            LookupValue::Slice { value } => value.len(),
            LookupValue::Deleted => 0,
            LookupValue::Blob { .. } => 0,
        }
    }
}

/// An entry from a SST file lookup.
pub struct LookupEntry {
    /// The hash of the key.
    pub hash: u64,
    /// The key.
    pub key: ArcSlice<u8>,
    /// The value.
    pub value: LookupValue,
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
            LookupValue::Deleted => EntryValue::Deleted,
            LookupValue::Slice { value } => {
                if value.len() > MAX_SMALL_VALUE_SIZE {
                    EntryValue::Medium { value }
                } else {
                    EntryValue::Small { value }
                }
            }
            LookupValue::Blob { sequence_number } => EntryValue::Large {
                blob: *sequence_number,
            },
        }
    }
}
