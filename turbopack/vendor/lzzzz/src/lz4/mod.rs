//! LZ4 compression and decompression.
//!
//! LZ4: Extremely fast compression algorithm.
//!
//! # Acceleration factor
//! Some functions take the acceleration factor.
//!
//! Larger value increases the processing speed in exchange for the
//! lesser compression ratio.
//!
//! ```
//! # use lzzzz::lz4;
//! # let data = b"The quick brown fox jumps over the lazy dog.";
//! # let mut buf = Vec::new();
//! // The default factor is 1 so both have the same meaning.
//! lz4::compress_to_vec(data, &mut buf, lz4::ACC_LEVEL_DEFAULT)?;
//! lz4::compress_to_vec(data, &mut buf, 1)?;
//!
//! // Factors lower than 1 are interpreted as 1 so these are also the same as above.
//! lz4::compress_to_vec(data, &mut buf, 0)?;
//! lz4::compress_to_vec(data, &mut buf, -100)?;
//!
//! // Faster but less effective compression.
//! lz4::compress_to_vec(data, &mut buf, 1000)?;
//!
//! # Ok::<(), std::io::Error>(())
//! ```

mod binding;
mod block;
mod stream;

pub use block::*;
pub use stream::*;

/// Predefined acceleration level (1).
pub const ACC_LEVEL_DEFAULT: i32 = 1;
