//! Hashing and encoding functions for turbopack.
//!
//! An example use of this module is hashing a file's content for cache
//! invalidation, and encoding the hash to an hexadecimal string for use in a
//! file name.

mod deterministic_hash;
mod hex;
mod xxh3_hash64;

pub use crate::{
    deterministic_hash::{DeterministicHash, DeterministicHasher},
    hex::encode_hex,
    xxh3_hash64::{Xxh3Hash64Hasher, hash_xxh3_hash64},
};
