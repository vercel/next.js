use twox_hash::XxHash3_128;

use crate::{DeterministicHash, DeterministicHasher};

/// Hash some content with the Xxh3Hash128 non-cryptographic hash function.
pub fn hash_xxh3_hash128<T: DeterministicHash>(input: T) -> u128 {
    let mut hasher = Xxh3Hash128Hasher::new();
    input.deterministic_hash(&mut hasher);
    hasher.finish()
}

/// Xxh3Hash128 hasher.
pub struct Xxh3Hash128Hasher(XxHash3_128);

impl Xxh3Hash128Hasher {
    /// Create a new hasher.
    pub fn new() -> Self {
        Self(XxHash3_128::with_seed(0))
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
    pub fn finish(&self) -> u128 {
        self.0.finish_128()
    }
}

impl DeterministicHasher for Xxh3Hash128Hasher {
    fn finish(&self) -> u64 {
        panic!("use the Xxh3Hash128Hasher non-trait function instead");
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        self.0.write(bytes);
    }
}

impl Default for Xxh3Hash128Hasher {
    fn default() -> Self {
        Self::new()
    }
}
