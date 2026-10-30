pub mod map;
pub mod set;
pub mod storage;
pub mod tiny_vec;

use std::hash::BuildHasherDefault;

use hashbrown::HashMap;
use indexmap::IndexMap;
pub use map::RawAutoMap;
use rustc_hash::FxHasher;
pub use set::RawAutoSet;
pub use storage::{BackingListStorage, BackingMapIter, BackingMapStorage};
pub use tiny_vec::TinyVec;

/// Unordered [`RawAutoMap`] backed by a [`HashMap`] and an `I`-inline [`TinyVec`].
pub type AutoMap<K, V, H = BuildHasherDefault<FxHasher>, const I: usize = 0> =
    RawAutoMap<K, V, HashMap<K, V, H>, TinyVec<(K, V), I, MAX_USEFUL_LINEAR_SCAN>>;

/// Insertion ordered [`RawAutoMap`] backed by an [`IndexMap`] and an `I`-inline [`TinyVec`].
///
/// Equality is order sensitive and removals preserve the order of the remaining entries.
pub type AutoIndexMap<K, V, H = BuildHasherDefault<FxHasher>, const I: usize = 0> =
    RawAutoMap<K, V, IndexMap<K, V, H>, TinyVec<(K, V), I, MAX_USEFUL_LINEAR_SCAN>>;

/// Unordered [`RawAutoSet`] backed by a [`HashMap`] and an `I`-inline [`TinyVec`].
pub type AutoSet<K, H = BuildHasherDefault<FxHasher>, const I: usize = 0> =
    RawAutoSet<K, HashMap<K, (), H>, TinyVec<(K, ()), I, MAX_USEFUL_LINEAR_SCAN>>;

/// Insertion ordered [`RawAutoSet`] backed by an [`IndexMap`] and an `I`-inline [`TinyVec`].
///
/// Equality is order sensitive (`{a, b} != {b, a}`) and removals preserve the order of the
/// remaining items.
pub type AutoIndexSet<K, H = BuildHasherDefault<FxHasher>, const I: usize = 0> =
    RawAutoSet<K, IndexMap<K, (), H>, TinyVec<(K, ()), I, MAX_USEFUL_LINEAR_SCAN>>;

// Values based on data from https://github.com/yegor256/micromap#benchmark

/// Maximum size of list variant. Must convert to HashMap when bigger.
pub(crate) const MAX_USEFUL_LINEAR_SCAN: usize = 32;
/// Minimum size of HashMap variant. Must convert to List when smaller.
pub(crate) const MIN_HASH_SIZE: usize = 16;
