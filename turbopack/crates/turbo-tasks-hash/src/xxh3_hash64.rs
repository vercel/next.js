use std::hash::Hasher;

use twox_hash::xxh3::{self, HasherExt};

use crate::{DeterministicHash, DeterministicHasher};

/// Hash some content with the Xxh3Hash64 non-cryptographic hash function.
pub fn hash_xxh3_hash64<T: DeterministicHash>(input: T) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    input.deterministic_hash(&mut hasher);
    hasher.finish()
}

/// Hash some content with the Xxh3Hash128 non-cryptographic hash function. This longer hash is
/// useful for avoiding collisions.
pub fn hash_xxh3_hash128<T: DeterministicHash>(input: T) -> u128 {
    // this isn't fully compatible with the 64-bit Hasher/DeterministicHasher APIs, so just use a
    // private impl for this
    struct Xxh3Hash128Hasher(xxh3::Hash128);

    impl DeterministicHasher for Xxh3Hash128Hasher {
        fn finish(&self) -> u64 {
            unimplemented!("call self.0.finish_ext() instead!")
        }

        fn write_bytes(&mut self, bytes: &[u8]) {
            self.0.write(bytes);
        }
    }

    let mut hasher = Xxh3Hash128Hasher(xxh3::Hash128::with_seed(0));
    input.deterministic_hash(&mut hasher);
    hasher.0.finish_ext()
}

/// Xxh3Hash64 hasher.
pub struct Xxh3Hash64Hasher(xxh3::Hash64);

impl Xxh3Hash64Hasher {
    /// Create a new hasher.
    pub fn new() -> Self {
        Self(xxh3::Hash64::with_seed(0))
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
