use std::hash::Hasher;

use xxhash_rust::xxh3::Xxh3Default;

use crate::{DeterministicHash, DeterministicHasher};

/// Hash some content with the Xxh3Hash128 non-cryptographic hash function.
pub fn hash_xxh3_hash128<T: DeterministicHash>(input: T) -> [u8; 16] {
    let mut hasher = Xxh3Hash128Hasher::new();
    input.deterministic_hash(&mut hasher);
    hasher.finish_bytes()
}

/// Xxh3Hash128 hasher.
pub struct Xxh3Hash128Hasher(Xxh3Default);

impl Xxh3Hash128Hasher {
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

    /// Finish the hash computation and return the digest as bytes.
    pub fn finish_bytes(&self) -> [u8; 16] {
        self.0.digest128().to_ne_bytes()
    }

    /// Finish the hash computation and return the digest as u128.
    pub fn finish(&self) -> u128 {
        self.0.digest128()
    }
}

impl DeterministicHasher for Xxh3Hash128Hasher {
    fn finish(&self) -> u64 {
        panic!("use the Xxh3Hash128Hasher non-trait function instead");
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        Xxh3Default::write(&mut self.0, bytes);
    }
}

impl Default for Xxh3Hash128Hasher {
    fn default() -> Self {
        Self::new()
    }
}
