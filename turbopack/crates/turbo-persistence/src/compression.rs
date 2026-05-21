use std::{mem::MaybeUninit, rc::Rc, sync::Arc};

use anyhow::{Context, Result};
use lzzzz::lz4::{self, decompress};

/// Decompresses `block` into `dest`, verifying the output length matches `expected_len`.
fn decompress_block(block: &[u8], dest: &mut [u8], expected_len: u32) -> Result<()> {
    debug_assert!(
        expected_len > 0,
        "decompress_block called with uncompressed_length=0; uncompressed blocks should use \
         zero-copy mmap path"
    );
    let bytes_written = decompress(block, dest).with_context(|| {
        format!(
            "Failed to decompress block ({} bytes compressed, {} bytes uncompressed)",
            block.len(),
            expected_len
        )
    })?;
    assert_eq!(
        bytes_written, expected_len as usize,
        "Decompressed length does not match expected length"
    );
    Ok(())
}

/// Decompresses a block into an Arc allocation.
///
/// The caller must ensure `uncompressed_length > 0` (i.e., the block is actually compressed).
/// Uncompressed blocks should be handled via zero-copy mmap slices before calling this.
pub fn decompress_into_arc(uncompressed_length: u32, block: &[u8]) -> Result<Arc<[u8]>> {
    // Allocate directly into an Arc to avoid a copy. The buffer is uninitialized;
    // decompression will overwrite it completely (verified by decompress_block).
    let buffer: Arc<[MaybeUninit<u8>]> = Arc::new_uninit_slice(uncompressed_length as usize);
    // Safety: decompression will fully initialize the buffer (verified by the assert in
    // decompress_block).
    let mut buffer = unsafe { buffer.assume_init() };
    // We just created this Arc so refcount is 1; get_mut always succeeds.
    let dest = Arc::get_mut(&mut buffer).expect("Arc refcount should be 1");
    decompress_block(block, dest, uncompressed_length)?;
    Ok(buffer)
}

/// Like [`decompress_into_arc`] but returns an `Rc<[u8]>` for thread-local use.
pub fn decompress_into_rc(uncompressed_length: u32, block: &[u8]) -> Result<Rc<[u8]>> {
    let buffer: Rc<[MaybeUninit<u8>]> = Rc::new_uninit_slice(uncompressed_length as usize);
    // Safety: decompression will fully initialize the buffer (verified by the assert in
    // decompress_block).
    let mut buffer = unsafe { buffer.assume_init() };
    let dest = Rc::get_mut(&mut buffer).expect("Rc refcount should be 1");
    decompress_block(block, dest, uncompressed_length)?;
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
