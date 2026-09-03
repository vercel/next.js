use std::hash::Hasher;

use xxhash_rust::xxh3::Xxh3Default;

use crate::{DeterministicHash, DeterministicHasher};

/// Hash some content with the Xxh3Hash64 non-cryptographic hash function.
pub fn hash_xxh3_hash64<T: DeterministicHash>(input: T) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    input.deterministic_hash(&mut hasher);
    hasher.finish()
}

/// Xxh3Hash64 hasher.
pub struct Xxh3Hash64Hasher(Xxh3Default);

impl Xxh3Hash64Hasher {
    /// Create a new hasher.
    pub fn new() -> Self {
        Self(Xxh3Default::new())
    }

    /// Uses the DeterministicHash trait to hash the input in a
    /// cross-platform way.
    pub fn write_value<T: DeterministicHash>(&mut self, input: T) {
        input.deterministic_hash(self);
    }

    /// Uses the DeterministicHash trait to hash the input in a
    /// cross-platform way.
    pub fn write_ref<T: DeterministicHash>(&mut self, input: &T) {
        input.deterministic_hash(self);
    }

    /// Finish the hash computation and return the digest.
    pub fn finish(&self) -> u64 {
        self.0.finish()
    }
}

impl DeterministicHasher for Xxh3Hash64Hasher {
    fn finish(&self) -> u64 {
        self.0.finish()
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        self.0.write(bytes);
    }
}

impl Hasher for Xxh3Hash64Hasher {
    fn finish(&self) -> u64 {
        self.0.finish()
    }

    fn write(&mut self, bytes: &[u8]) {
        self.0.write(bytes);
    }

    fn write_u8(&mut self, i: u8) {
        DeterministicHasher::write_u8(self, i);
    }

    fn write_u16(&mut self, i: u16) {
        DeterministicHasher::write_u16(self, i);
    }

    fn write_u32(&mut self, i: u32) {
        DeterministicHasher::write_u32(self, i);
    }

    fn write_u64(&mut self, i: u64) {
        DeterministicHasher::write_u64(self, i);
    }

    fn write_u128(&mut self, i: u128) {
        DeterministicHasher::write_u128(self, i);
    }

    fn write_usize(&mut self, i: usize) {
        DeterministicHasher::write_usize(self, i);
    }

    fn write_i8(&mut self, i: i8) {
        DeterministicHasher::write_i8(self, i);
    }

    fn write_i16(&mut self, i: i16) {
        DeterministicHasher::write_i16(self, i);
    }

    fn write_i32(&mut self, i: i32) {
        DeterministicHasher::write_i32(self, i);
    }

    fn write_i64(&mut self, i: i64) {
        DeterministicHasher::write_i64(self, i);
    }

    fn write_i128(&mut self, i: i128) {
        DeterministicHasher::write_i128(self, i);
    }

    fn write_isize(&mut self, i: isize) {
        DeterministicHasher::write_isize(self, i);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_same(write_typed: impl FnOnce(&mut Xxh3Hash64Hasher), bytes: &[u8]) {
        let mut typed = Xxh3Hash64Hasher::new();
        write_typed(&mut typed);
        let mut raw = Xxh3Hash64Hasher::new();
        raw.write_bytes(bytes);
        assert_eq!(typed.finish(), raw.finish());
    }

    #[test]
    fn std_hasher_uses_deterministic_integer_encoding() {
        assert_same(|h| Hasher::write(h, b"bytes"), b"bytes");
        assert_same(|h| Hasher::write_u8(h, 0x12), &[0x12]);
        assert_same(|h| Hasher::write_u16(h, 0x1234), &0x1234u16.to_le_bytes());
        assert_same(
            |h| Hasher::write_u32(h, 0x1234_5678),
            &0x1234_5678u32.to_le_bytes(),
        );
        assert_same(
            |h| Hasher::write_u64(h, 0x1234_5678),
            &0x1234_5678u64.to_le_bytes(),
        );
        assert_same(
            |h| Hasher::write_u128(h, 0x1234_5678),
            &0x1234_5678u128.to_le_bytes(),
        );
        assert_same(|h| Hasher::write_usize(h, 0x1234), &0x1234u64.to_le_bytes());
        assert_same(|h| Hasher::write_i8(h, -0x12), &(-0x12i8).to_le_bytes());
        assert_same(
            |h| Hasher::write_i16(h, -0x1234),
            &(-0x1234i16).to_le_bytes(),
        );
        assert_same(
            |h| Hasher::write_i32(h, -0x1234),
            &(-0x1234i32).to_le_bytes(),
        );
        assert_same(
            |h| Hasher::write_i64(h, -0x1234),
            &(-0x1234i64).to_le_bytes(),
        );
        assert_same(
            |h| Hasher::write_i128(h, -0x1234),
            &(-0x1234i128).to_le_bytes(),
        );
        assert_same(
            |h| Hasher::write_isize(h, -0x1234),
            &(-0x1234i64).to_le_bytes(),
        );
    }
}

impl Default for Xxh3Hash64Hasher {
    fn default() -> Self {
        Self::new()
    }
}
