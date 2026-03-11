use std::{mem::MaybeUninit, sync::Arc};

use anyhow::{Context, Result};
use lzzzz::lz4::{self, decompress};

/// Decompresses a block into an Arc allocation.
///
/// The caller must ensure `uncompressed_length > 0` (i.e., the block is actually compressed).
/// Uncompressed blocks should be handled via zero-copy mmap slices before calling this.
pub fn decompress_into_arc(uncompressed_length: u32, block: &[u8]) -> Result<Arc<[u8]>> {
    debug_assert!(
        uncompressed_length > 0,
        "decompress_into_arc called with uncompressed_length=0; uncompressed blocks should use \
         zero-copy mmap path"
    );

    // Allocate directly into an Arc to avoid a copy. The buffer is uninitialized;
    // decompression will overwrite it completely (verified by the assert below).
    let buffer: Arc<[MaybeUninit<u8>]> = Arc::new_uninit_slice(uncompressed_length as usize);
    // Safety: decompression will fully initialize the buffer we verify with an assert
    let mut buffer = unsafe { buffer.assume_init() };
    // We just created this Arc so refcount is 1; get_mut always succeeds.
    let decompressed = Arc::get_mut(&mut buffer).expect("Arc refcount should be 1");
    let bytes_written = decompress(block, decompressed).with_context(|| {
        format!(
            "Failed to decompress block ({} bytes compressed, {} bytes uncompressed)",
            block.len(),
            uncompressed_length
        )
    })?;
    assert_eq!(
        bytes_written, uncompressed_length as usize,
        "Decompressed length does not match expected length"
    );
    Ok(buffer)
}

/// Computes a CRC32 checksum of a byte slice.
pub fn checksum_block(data: &[u8]) -> u32 {
    crc32fast::hash(data)
}

#[tracing::instrument(level = "trace", skip_all)]
pub fn compress_into_buffer(block: &[u8], buffer: &mut Vec<u8>) -> Result<()> {
    lz4::compress_to_vec(block, buffer, lz4::ACC_LEVEL_DEFAULT).context("Compression failed")?;
    Ok(())
}
