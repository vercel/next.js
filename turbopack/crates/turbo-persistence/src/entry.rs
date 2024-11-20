use crate::key::StoreKey;

pub enum EntryValue {
    Small { value: Vec<u8> },
    Large { blob: u32 },
    Deleted,
}

pub struct Entry<K: StoreKey> {
    pub key: K,
    pub value: EntryValue,
}
