use crate::{
    constants::MAX_SMALL_VALUE_SIZE,
    static_sorted_file_builder::{Entry, EntryValue},
    ArcSlice,
};

pub enum LookupValue {
    Deleted,
    Small { value: ArcSlice<u8> },
    Blob { sequence_number: u32 },
}

impl LookupValue {
    pub fn len(&self) -> usize {
        match self {
            LookupValue::Small { value } => value.len(),
            LookupValue::Deleted => 0,
            LookupValue::Blob { .. } => 0,
        }
    }
}

pub struct LookupEntry {
    pub hash: u64,
    pub key: ArcSlice<u8>,
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
            LookupValue::Small { value } => {
                if value.len() > MAX_SMALL_VALUE_SIZE {
                    EntryValue::Medium { value: &value }
                } else {
                    EntryValue::Small { value: &value }
                }
            }
            LookupValue::Blob { sequence_number } => EntryValue::Large {
                blob: *sequence_number,
            },
        }
    }
}
