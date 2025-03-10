//! turbo-prehash
//!
//! A small wrapper around `std::hash::Hasher` that allows you to pre-hash a
//! value before hashing it.
//!
//! This is useful for when you want to hash a value that is expensive to
//! compute (e.g. a large string) but you want to avoid re-hashing it every
//! time.
//!
//! # Example
//!
//! ```
//! use std::hash::{BuildHasherDefault, RandomState, Hash};
//!
//! use rustc_hash::FxHashMap;
//! use turbo_prehash::{BuildHasherExt, PreHashed};
//!
//! /// hash a key, returning a prehashed value
//! fn hash_key<T: Hash>(key: T) -> PreHashed<T> {
//!     RandomState::new().prehash(key)
//! }
//!
//! // create hashmap to hold pre-hashed values
//! let mut map: FxHashMap<PreHashed<String>, String> = FxHashMap::default();
//!
//! // insert a prehashed value
//! let hashed_key = hash_key("hello".to_string());
//! map.insert(hashed_key.clone(), "world".to_string());
//!
//! // get the value
//! assert_eq!(map.get(&hashed_key), Some(&"world".to_string()));
//! ```

use std::{
    fmt,
    hash::{BuildHasher, Hash, Hasher},
    ops::Deref,
};

/// A wrapper type that hashes some `inner` on creation, implementing [Hash]
/// by simply returning the pre-computed hash.
#[derive(Copy, Debug, Clone)]
pub struct PreHashed<I, H = u64> {
    hash: H,
    inner: I,
}

impl<I, H> PreHashed<I, H> {
    /// Create a new [PreHashed] value with the given hash and inner value.
    ///
    /// SAFETY: The hash must be a valid hash of the inner value.
    pub fn new(hash: H, inner: I) -> Self {
        Self { hash, inner }
    }

    /// Split the [PreHashed] value into its hash and inner value.
    pub fn into_parts(self) -> (H, I) {
        (self.hash, self.inner)
    }

    fn inner(&self) -> &I {
        &self.inner
    }
}

impl<I: Hash> PreHashed<I, u64> {
    /// Create a new [PreHashed] value from a [BuildHasher].
    fn new_from_builder<B: BuildHasher>(hasher: &B, inner: I) -> Self {
        Self::new(hasher.hash_one(&inner), inner)
    }
}

impl<I> Deref for PreHashed<I> {
    type Target = I;

    fn deref(&self) -> &Self::Target {
        self.inner()
    }
}

impl<I, H> AsRef<I> for PreHashed<I, H> {
    fn as_ref(&self) -> &I {
        self.inner()
    }
}

impl<I, H: Hash> Hash for PreHashed<I, H> {
    fn hash<S: Hasher>(&self, state: &mut S) {
        self.hash.hash(state)
    }
}

impl<I: Eq, H> Eq for PreHashed<I, H> {}

impl<I: PartialEq, H> PartialEq for PreHashed<I, H> {
    // note: we compare the values, not the hashes
    fn eq(&self, other: &Self) -> bool {
        self.inner.eq(&other.inner)
    }
}

impl<I: fmt::Display, H> fmt::Display for PreHashed<I, H> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        self.inner.fmt(f)
    }
}

/// An implementer of [Hash] that simply returns the pre-computed hash.
#[derive(Copy, Clone, Debug, Default)]
pub struct PassThroughHash(u64);

impl PassThroughHash {
    pub fn new() -> Self {
        Default::default()
    }
}

impl Hasher for PassThroughHash {
    fn write(&mut self, _bytes: &[u8]) {
        unimplemented!("do not use")
    }

    fn write_u64(&mut self, i: u64) {
        self.0 = i;
    }

    fn finish(&self) -> u64 {
        self.0
    }
}

/// An extension trait for [BuildHasher] that provides the
/// [BuildHasherExt::prehash] method.
pub trait BuildHasherExt: BuildHasher {
    type Hash;

    fn prehash<T: Hash>(&self, value: T) -> PreHashed<T, Self::Hash>;
}

impl<B: BuildHasher> BuildHasherExt for B {
    type Hash = u64;

    fn prehash<T: Hash>(&self, value: T) -> PreHashed<T, Self::Hash> {
        PreHashed::new_from_builder(self, value)
    }
}
