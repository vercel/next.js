pub mod map;
pub mod set;

pub use map::AutoMap;
pub use set::AutoSet;

// Values based on data from https://github.com/yegor256/micromap#benchmark

/// Maximum size of list variant. Must convert to HashMap when bigger.
pub const MAX_LIST_SIZE: usize = 32;
/// Minimum size of HashMap variant. Must convert to List when smaller.
pub const MIN_HASH_SIZE: usize = 16;
