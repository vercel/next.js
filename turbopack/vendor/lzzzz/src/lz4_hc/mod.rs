//! LZ4_HC compression.
//!
//! LZ4_HC: High compression variant of LZ4.
//!
//! # Decompression
//! The `lz4_hc` module doesn't provide decompression functionality.
//! Use the [`lz4`] module instead.
//!
//! [`lz4`]: ../lz4/index.html

mod binding;
mod block;
mod stream;

pub use block::*;
pub use stream::*;

/// Predefined compression level (3).
pub const CLEVEL_MIN: i32 = 3;

/// Predefined compression level (9).
pub const CLEVEL_DEFAULT: i32 = 9;

/// Predefined compression level (10).
pub const CLEVEL_OPT_MIN: i32 = 10;

/// Predefined compression level (12).
pub const CLEVEL_MAX: i32 = 12;

/// Decompression speed mode flag.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum FavorDecSpeed {
    Disabled,
    Enabled,
}

impl Default for FavorDecSpeed {
    fn default() -> Self {
        Self::Disabled
    }
}
