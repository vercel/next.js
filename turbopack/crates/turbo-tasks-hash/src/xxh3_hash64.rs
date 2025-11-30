use std::hash::Hasher;

use twox_hash::XxHash3_64;

use crate::{DeterministicHash, DeterministicHasher};

/// Hash some content with the Xxh3Hash64 non-cryptographic hash function.
pub fn hash_xxh3_hash64<T: DeterministicHash>(input: T) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    input.deterministic_hash(&mut hasher);
    hasher.finish()
}

/// Xxh3Hash64 hasher.
pub struct Xxh3Hash64Hasher(XxHash3_64);

impl Xxh3Hash64Hasher {
    /// Create a new hasher.
    pub fn new() -> Self {
        Self(XxHash3_64::with_seed(0))
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

impl Default for Xxh3Hash64Hasher {
    fn default() -> Self {
        Self::new()
    }
}
