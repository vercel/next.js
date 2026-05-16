use std::io::Write;

use anyhow::Result;
use flate2::{Compression, write::DeflateEncoder};
use turbo_rcstr::RcStr;

/// Compresses an asset's content with default-level (level 6) deflate/gzip.
/// Returns the size in bytes in the compressed output
pub fn compressed_size_bytes(content: RcStr) -> Result<u32> {
    // Use deflate over gzip to prevent individual file headers/footers from
    // skewing the size results.
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(content.as_ref())?;
    let compressed = encoder.finish()?;

    Ok(compressed.len() as u32)
}
