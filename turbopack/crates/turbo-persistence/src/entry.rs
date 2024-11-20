pub enum EntryValue {
    Small { value: Vec<u8> },
    Large { blob: u32 },
    Deleted,
}

pub struct Entry {
    pub key: Vec<u8>,
    pub value: EntryValue,
}
