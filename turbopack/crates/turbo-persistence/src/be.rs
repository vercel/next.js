//! Big-endian integer parsing helpers.
//!
//! Each function reads a fixed-width big-endian integer from the prefix of
//! a byte slice. Panics if the slice is too short (single bounds check via
//! `first_chunk`).

#[inline(always)]
pub fn read_u8(s: &[u8]) -> u8 {
    s[0]
}

#[inline(always)]
pub fn read_u16(s: &[u8]) -> u16 {
    u16::from_be_bytes(*s.first_chunk().unwrap())
}

#[inline(always)]
pub fn read_u24(s: &[u8]) -> u32 {
    let &[a, b, c] = s.first_chunk().unwrap();
    u32::from_be_bytes([0, a, b, c])
}

#[inline(always)]
pub fn read_u32(s: &[u8]) -> u32 {
    u32::from_be_bytes(*s.first_chunk().unwrap())
}

#[inline(always)]
pub fn read_u64(s: &[u8]) -> u64 {
    u64::from_be_bytes(*s.first_chunk().unwrap())
}
