use std::hash::Hasher;

use twox_hash::xxh3;

/// Hash some content with the Xxh3Hash64 non-cryptographic hash function.
pub fn hash_xxh3_hash64(input: &[u8]) -> u64 {
    xxh3::hash64(input)
}

/// Xxh3Hash64 hasher.
pub struct Xxh3Hash64Hasher(xxh3::Hash64);

impl Xxh3Hash64Hasher {
    /// Create a new hasher.
    pub fn new() -> Self {
        Self(xxh3::Hash64::with_seed(0))
    }

    /// Add input bytes to the hash.
    pub fn write(&mut self, input: &[u8]) {
        self.0.write(input);
    }

    /// Finish the hash computation and return the digest.
    pub fn finish(&mut self) -> u64 {
        self.0.finish()
    }
}

impl Default for Xxh3Hash64Hasher {
    fn default() -> Self {
        Self::new()
    }
}
