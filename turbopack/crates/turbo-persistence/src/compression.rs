use std::{mem::MaybeUninit, sync::Arc};

use anyhow::{Context, Result};
use lzzzz::lz4::{ACC_LEVEL_DEFAULT, decompress, decompress_with_dict};

/// Decompresses a block into an Arc allocation.
///
/// The caller must ensure `uncompressed_length > 0` (i.e., the block is actually compressed).
/// Uncompressed blocks should be handled via zero-copy mmap slices before calling this.
pub fn decompress_into_arc(
    uncompressed_length: u32,
    block: &[u8],
    compression_dictionary: Option<&[u8]>,
    _long_term: bool,
) -> Result<Arc<[u8]>> {
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
    let bytes_written = if let Some(dict) = compression_dictionary {
        decompress_with_dict(block, decompressed, dict)?
    } else {
        decompress(block, decompressed)?
    };
    assert_eq!(
        bytes_written, uncompressed_length as usize,
        "Decompressed length does not match expected length"
    );
    Ok(buffer)
}

#[tracing::instrument(level = "trace", skip_all)]
pub fn compress_into_buffer(
    block: &[u8],
    dict: Option<&[u8]>,
    _long_term: bool,
    buffer: &mut Vec<u8>,
) -> Result<()> {
    let mut compressor = if let Some(dict) = dict {
        lzzzz::lz4::Compressor::with_dict(dict)
    } else {
        lzzzz::lz4::Compressor::new()
    }
    .context("LZ4 compressor creation failed")?;
    let acc_factor = ACC_LEVEL_DEFAULT;
    compressor
        .next_to_vec(block, buffer, acc_factor)
        .context("Compression failed")?;
    Ok(())
}
