pub mod map;
pub mod set;
pub mod storage;
pub mod tiny_vec;

pub use map::{AutoIndexMap, AutoMap, RawAutoMap};
pub use set::{AutoIndexSet, AutoSet, RawAutoSet};
pub use storage::{BackingListStorage, BackingMapStorage};
pub use tiny_vec::TinyVec;

// Values based on data from https://github.com/yegor256/micromap#benchmark

/// Maximum size of list variant. Must convert to HashMap when bigger.
pub(crate) const MAX_USEFUL_LINEAR_SCAN: usize = 32;
/// Minimum size of HashMap variant. Must convert to List when smaller.
pub(crate) const MIN_HASH_SIZE: usize = 16;
