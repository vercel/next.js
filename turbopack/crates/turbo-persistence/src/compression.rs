use std::{mem::MaybeUninit, sync::Arc};

use anyhow::{Context, Result};
use lzzzz::lz4::{ACC_LEVEL_DEFAULT, decompress, decompress_with_dict};

#[tracing::instrument(level = "trace", skip_all, name = "decompress database block")]
pub fn decompress_into_arc(
    uncompressed_length: u32,
    block: &[u8],
    compression_dictionary: Option<&[u8]>,
    _long_term: bool,
) -> Result<Arc<[u8]>> {
    // We directly allocate the buffer in an Arc to avoid copying it into an Arc and avoiding
    // double indirection. This is a dynamically sized arc.
    let buffer: Arc<[MaybeUninit<u8>]> = Arc::new_zeroed_slice(uncompressed_length as usize);
    // Assume that the buffer is initialized.
    let buffer = Arc::into_raw(buffer);
    // Safety: Assuming that the buffer is initialized is safe because we just created it as
    // zeroed slice and u8 doesn't require initialization.
    let mut buffer = unsafe { Arc::from_raw(buffer as *mut [u8]) };
    // Safety: We know that the buffer is not shared yet.
    let decompressed = unsafe { Arc::get_mut_unchecked(&mut buffer) };
    let bytes_writes = if let Some(dict) = compression_dictionary {
        // Safety: decompress_with_dict will only write to `decompressed` and not read from it.
        decompress_with_dict(block, decompressed, dict)?
    } else {
        // Safety: decompress will only write to `decompressed` and not read from it.
        decompress(block, decompressed)?
    };
    assert_eq!(
        bytes_writes, uncompressed_length as usize,
        "Decompressed length does not match expected length"
    );
    // Safety: The buffer is now fully initialized and can be used.
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
