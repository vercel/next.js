#[repr(C)]
pub struct DeterministicBytes<'a> {
    size: u64,
    data: &'a [u8],
}

impl<'a> DeterministicBytes<'a> {
    pub fn new(size: usize, data: &'a [u8]) -> Self {
        Self {
            size: size as u64,
            data,
        }
    }
}

impl<'a> AsRef<[u8]> for DeterministicBytes<'a> {
    fn as_ref(&self) -> &[u8] {
        &self.data[std::mem::size_of::<u64>()..][..self.size as usize]
    }
}
