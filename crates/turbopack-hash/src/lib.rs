//! Hashing and encoding functions for turbopack.
//!
//! An example use of this module is hashing a file's content for cache
//! invalidation, and encoding the hash to an hexadecimal string for use in a
//! file name.

mod base16;
mod hex;
mod md4;
mod xxh3_hash64;

pub use crate::{
    base16::encode_base16,
    hex::encode_hex,
    md4::hash_md4,
    xxh3_hash64::{hash_xxh3_hash64, Xxh3Hash64Hasher},
};
