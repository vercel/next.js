pub mod map;
pub mod set;

pub use map::AutoMap;
pub use set::AutoSet;

/// Maximum size of list variant. Must convert to HashMap when bigger.
pub const MAX_LIST_SIZE: usize = 16;
/// Minimum size of HashMap variant. Must convert to List when smaller.
pub const MIN_HASH_SIZE: usize = 8;
