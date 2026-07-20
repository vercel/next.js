//! Hashing and encoding functions for turbopack.
//!
//! An example use of this module is hashing a file's content for cache
//! invalidation, and encoding the hash to a base38 or hexadecimal string for
//! use in a file name.

mod base38;
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
    /// xxh3 64-bit hash encoded as a 13-character base38 string (0-9 a-z _ -)
    Xxh3Hash64Base38,
    /// xxh3 128-bit hash encoded as a 25-character base38 string (0-9 a-z _ -)
    Xxh3Hash128Base38,
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

/// Feed `salt` (if non-empty) then `input` into `hasher` in a single pass, then return it.
/// An empty salt writes zero bytes, which produces the same result as calling with no prefix.
fn feed<H: DeterministicHasher, T: DeterministicHash>(mut h: H, salt: &str, input: T) -> H {
    h.write_bytes(salt.as_bytes());
    input.deterministic_hash(&mut h);
    h
}

/// Hash `input` with `algorithm`. If `salt` is non-empty it is written into
/// the hasher before the content so the two are mixed in a single pass —
/// never as a hash-of-hash composition. An empty salt produces the same
/// result as hashing without a prefix.
pub fn deterministic_hash<T: DeterministicHash>(
    salt: &str,
    input: T,
    algorithm: HashAlgorithm,
) -> String {
    // Each arm feeds salt+input into the appropriate hasher and encodes the output.
    // The inherent finish() methods on the hasher types are used (not the trait method,
    // which panics for 128-bit and SHA hashers).
    match algorithm {
        HashAlgorithm::Xxh3Hash64Hex => {
            encode_hex(feed(Xxh3Hash64Hasher::new(), salt, &input).finish())
        }
        HashAlgorithm::Xxh3Hash128Hex => {
            encode_hex_128(feed(Xxh3Hash128Hasher::new(), salt, &input).finish())
        }
        HashAlgorithm::Xxh3Hash64Base38 => {
            encode_base38(feed(Xxh3Hash64Hasher::new(), salt, &input).finish())
        }
        HashAlgorithm::Xxh3Hash128Base38 => {
            encode_base38_128(feed(Xxh3Hash128Hasher::new(), salt, &input).finish())
        }
        HashAlgorithm::Sha256Base64 => feed(ShaHasher::new_sha256(), salt, &input).finish_base64(),
        HashAlgorithm::Sha384Base64 => feed(ShaHasher::new_sha384(), salt, &input).finish_base64(),
        HashAlgorithm::Sha512Base64 => feed(ShaHasher::new_sha512(), salt, &input).finish_base64(),
    }
}

pub use crate::{
    base38::{BASE38_LEN_64, BASE38_LEN_128, encode_base38, encode_base38_128},
    base64::encode_base64,
    deterministic_hash::{DeterministicHash, DeterministicHasher},
    hex::{encode_hex, encode_hex_128},
    sha::ShaHasher,
    xxh3_hash64::{Xxh3Hash64Hasher, hash_xxh3_hash64},
    xxh3_hash128::{Xxh3Hash128Hasher, hash_xxh3_hash128},
};
