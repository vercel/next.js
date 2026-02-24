//! Hashing and encoding functions for turbopack.
//!
//! An example use of this module is hashing a file's content for cache
//! invalidation, and encoding the hash to an hexadecimal string for use in a
//! file name.

mod deterministic_hash;
mod hex;
mod sha;
mod xxh3_hash64;

use bincode::{Decode, Encode};

#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Hash, Decode, Encode)]
pub enum HashAlgorithm {
    /// The default hash algorithm, use this when the exact hashing algorithm doesn't matter.
    #[default]
    Xxh3Hash64Hex,
    /// Used for https://nextjs.org/docs/app/guides/content-security-policy#enabling-sri
    Sha256Base64,
    /// Used for https://nextjs.org/docs/app/guides/content-security-policy#enabling-sri
    Sha384Base64,
    /// Used for https://nextjs.org/docs/app/guides/content-security-policy#enabling-sri
    Sha512Base64,
}

pub fn deterministic_hash<T: DeterministicHash>(input: T, algorithm: HashAlgorithm) -> String {
    match algorithm {
        HashAlgorithm::Xxh3Hash64Hex => {
            let mut hasher = Xxh3Hash64Hasher::new();
            input.deterministic_hash(&mut hasher);
            encode_hex(hasher.finish())
        }
        HashAlgorithm::Sha256Base64 => {
            let mut hasher = ShaHasher::new_sha256();
            input.deterministic_hash(&mut hasher);
            hasher.finish_base64()
        }
        HashAlgorithm::Sha384Base64 => {
            let mut hasher = ShaHasher::new_sha384();
            input.deterministic_hash(&mut hasher);
            hasher.finish_base64()
        }
        HashAlgorithm::Sha512Base64 => {
            let mut hasher = ShaHasher::new_sha512();
            input.deterministic_hash(&mut hasher);
            hasher.finish_base64()
        }
    }
}

pub use crate::{
    deterministic_hash::{DeterministicHash, DeterministicHasher},
    hex::encode_hex,
    sha::ShaHasher,
    xxh3_hash64::{Xxh3Hash64Hasher, hash_xxh3_hash64},
};
