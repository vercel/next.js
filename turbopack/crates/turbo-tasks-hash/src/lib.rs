//! Hashing and encoding functions for turbopack.
//!
//! An example use of this module is hashing a file's content for cache
//! invalidation, and encoding the hash to a base40 or hexadecimal string for
//! use in a file name.

mod base40;
mod base64;
mod deterministic_hash;
mod hex;
mod sha;
mod xxh3_hash128;
mod xxh3_hash64;

use bincode::{Decode, Encode};

#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Hash, Decode, Encode)]
pub enum HashAlgorithm {
    /// The default hash algorithm is using xxh3, which is a fast non-cryptographic hash function.
    #[default]
    Xxh3Hash64Hex,
    Xxh3Hash128Hex,
    /// xxh3 64-bit hash encoded as a 13-character base40 string (0-9 a-z _ - ~ .)
    Xxh3Hash64Base40,
    /// xxh3 128-bit hash encoded as a 25-character base40 string (0-9 a-z _ - ~ .)
    Xxh3Hash128Base40,
    /// Used for [Subresource Integrity (SRI)][sri].
    ///
    /// [sri]: https://nextjs.org/docs/app/guides/content-security-policy#enabling-sri
    Sha256Base64,
    /// Used for [Subresource Integrity (SRI)][sri].
    ///
    /// [sri]: https://nextjs.org/docs/app/guides/content-security-policy#enabling-sri
    Sha384Base64,
    /// Used for [Subresource Integrity (SRI)][sri].
    ///
    /// [sri]: https://nextjs.org/docs/app/guides/content-security-policy#enabling-sri
    Sha512Base64,
}

pub fn deterministic_hash<T: DeterministicHash>(input: T, algorithm: HashAlgorithm) -> String {
    match algorithm {
        HashAlgorithm::Xxh3Hash64Hex => {
            let mut hasher = Xxh3Hash64Hasher::new();
            input.deterministic_hash(&mut hasher);
            encode_hex(hasher.finish())
        }
        HashAlgorithm::Xxh3Hash128Hex => {
            let mut hasher = Xxh3Hash128Hasher::new();
            input.deterministic_hash(&mut hasher);
            encode_hex_128(hasher.finish())
        }
        HashAlgorithm::Xxh3Hash64Base40 => {
            let mut hasher = Xxh3Hash64Hasher::new();
            input.deterministic_hash(&mut hasher);
            encode_base40(hasher.finish())
        }
        HashAlgorithm::Xxh3Hash128Base40 => {
            let mut hasher = Xxh3Hash128Hasher::new();
            input.deterministic_hash(&mut hasher);
            encode_base40_128(hasher.finish())
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
    base40::{BASE40_LEN_64, BASE40_LEN_128, encode_base40, encode_base40_128},
    base64::encode_base64,
    deterministic_hash::{DeterministicHash, DeterministicHasher},
    hex::{encode_hex, encode_hex_128},
    sha::ShaHasher,
    xxh3_hash64::{Xxh3Hash64Hasher, hash_xxh3_hash64},
    xxh3_hash128::{Xxh3Hash128Hasher, hash_xxh3_hash128},
};
