pub mod edge_set;
pub mod map;
pub mod set;
pub mod storage;
pub mod tiny_vec;

use std::hash::BuildHasherDefault;

pub use edge_set::EdgeSet;
use hashbrown::HashMap;
use indexmap::IndexMap;
pub use map::RawAutoMap;
use rustc_hash::FxHasher;
pub use set::RawAutoSet;
pub use storage::{
    BackingListStorage, BackingMapIter, BackingMapStorage, Equivalent, IndexedBackingMapStorage,
};
pub use tiny_vec::TinyVec;

/// Unordered [`RawAutoMap`] backed by a [`HashMap`] and an `I`-inline [`TinyVec`].
pub type AutoMap<K, V, H = BuildHasherDefault<FxHasher>, const I: usize = 0> =
    RawAutoMap<K, V, HashMap<K, V, H>, TinyVec<(K, V), I, MAX_USEFUL_LINEAR_SCAN>>;

/// Insertion ordered [`RawAutoMap`] backed by an [`IndexMap`] and an `I`-inline [`TinyVec`].
///
/// Equality is order sensitive and removals preserve the order of the remaining entries.
pub type OrderedAutoMap<K, V, H = BuildHasherDefault<FxHasher>, const I: usize = 0> =
    RawAutoMap<K, V, IndexMap<K, V, H>, TinyVec<(K, V), I, MAX_USEFUL_LINEAR_SCAN>>;

/// Unordered [`RawAutoSet`] backed by a [`HashMap`] and an `I`-inline [`TinyVec`].
pub type AutoSet<K, H = BuildHasherDefault<FxHasher>, const I: usize = 0> =
    RawAutoSet<K, HashMap<K, (), H>, TinyVec<(K, ()), I, MAX_USEFUL_LINEAR_SCAN>>;

/// Insertion ordered [`RawAutoSet`] backed by an [`IndexMap`] and an `I`-inline [`TinyVec`].
///
/// Equality is order sensitive (`{a, b} != {b, a}`) and removals preserve the order of the
/// remaining items.
pub type OrderedAutoSet<K, H = BuildHasherDefault<FxHasher>, const I: usize = 0> =
    RawAutoSet<K, IndexMap<K, (), H>, TinyVec<(K, ()), I, MAX_USEFUL_LINEAR_SCAN>>;

// Values based on data from https://github.com/yegor256/micromap#benchmark

/// Maximum number of entries in the list variant of a [`RawAutoMap`]. It converts to the map
/// variant when it grows beyond this. A [`BackingListStorage`] never holds more items than this.
pub const MAX_USEFUL_LINEAR_SCAN: usize = 32;
/// Size threshold for converting the map variant of a [`RawAutoMap`] back into the list variant
/// in `shrink_amortized`: maps with fewer entries convert back. The `shrink_to_fit` methods
/// convert maps that fit into the list (at most [`MAX_USEFUL_LINEAR_SCAN`] entries). Nothing
/// else converts back: not removals, nor `extend`/`collect` with an overstated size hint.
pub(crate) const MIN_HASH_SIZE: usize = 16;
