use std::hash::Hasher;

use twox_hash::xxh3;

use crate::DeterministicHash;

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

    /// Uses the DeterministicHash trait to to hash the input in a
    /// cross-platform way.
    pub fn write_value<T: DeterministicHash>(&mut self, input: T) {
        input.deterministic_hash(self);
    }

    /// Uses the DeterministicHash trait to to hash the input in a
    /// cross-platform way.
    pub fn write_ref<T: DeterministicHash>(&mut self, input: &T) {
        input.deterministic_hash(self);
    }

    /// Finish the hash computation and return the digest.
    ///
    /// This method name intentionally clashes with [Hasher::finish], to make
    /// this struct unusable when the Hasher trait is in scope.
    pub fn finish(&mut self) -> u64 {
        self.0.finish()
    }
}

impl Hasher for Xxh3Hash64Hasher {
    fn finish(&self) -> u64 {
        // To prevent us from accidentally importing the Hasher trait and using the
        // non-safe `write` directly, we do not implement the `finish` method.
        // Because this trait method's name clashes with the struct impl's
        // method name, importing Hasher makes the Xxh3Hash64Hasher unusable.
        unimplemented!(
            "Xxh3Hash64Hasher must not be used to hash non-deterministic values. This can be \
             manually performed by calling hasher.write_value() with a DeterministicHash \
             implementor or hasher.write() directly with the value bytes."
        )
    }

    fn write(&mut self, bytes: &[u8]) {
        self.0.write(bytes);
    }
}

impl Default for Xxh3Hash64Hasher {
    fn default() -> Self {
        Self::new()
    }
}
