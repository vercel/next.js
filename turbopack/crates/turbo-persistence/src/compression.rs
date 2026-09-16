use std::{cell::RefCell, ffi::c_char, mem::MaybeUninit, rc::Rc, sync::Arc};

use anyhow::{Context, Result, ensure};
use lz4::liblz4::{LZ4_compress_default, LZ4_compressBound, LZ4_decompress_safe};

/// Compression algorithm used for a family's SST blocks and blob values.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(u8)]
pub enum Compression {
    /// Fast LZ4 compression using the default acceleration level.
    #[default]
    Lz4 = 0,
    /// Zstandard compression at level 3.
    Zstd3 = 1,
}

thread_local! {
    /// Zstd decompression contexts are reusable and relatively expensive to create. Keep one per
    /// worker thread to avoid allocation on every block read without a global lock.
    static ZSTD_DECOMPRESSOR: RefCell<zstd::bulk::Decompressor<'static>> = RefCell::new(
        zstd::bulk::Decompressor::new().expect("zstd decompressor initialization should succeed")
    );
}

/// Decompresses `block` into `dest`, verifying the output length matches `expected_len`.
fn decompress_block(
    compression: Compression,
    block: &[u8],
    dest: &mut [u8],
    expected_len: u32,
) -> Result<()> {
    debug_assert!(
        expected_len > 0,
        "decompress_block called with uncompressed_length=0; uncompressed blocks should use \
         zero-copy mmap path"
    );
    let bytes_written = match compression {
        Compression::Lz4 => {
            let compressed_len = block
                .len()
                .try_into()
                .context("LZ4 compressed length exceeds i32::MAX")?;
            let dest_len = dest
                .len()
                .try_into()
                .context("LZ4 uncompressed length exceeds i32::MAX")?;
            // Safety: both pointers are valid for the checked lengths passed to liblz4, the
            // destination is writable, and liblz4 does not retain either pointer.
            let bytes_written = unsafe {
                LZ4_decompress_safe(
                    block.as_ptr().cast::<c_char>(),
                    dest.as_mut_ptr().cast::<c_char>(),
                    compressed_len,
                    dest_len,
                )
            };
            ensure!(
                bytes_written >= 0,
                "LZ4 decompression failed with code {bytes_written}"
            );
            Ok(bytes_written as usize)
        }
        Compression::Zstd3 => ZSTD_DECOMPRESSOR.with_borrow_mut(|decompressor| {
            decompressor
                .decompress_to_buffer(block, dest)
                .map_err(anyhow::Error::from)
        }),
    }
    .with_context(|| {
        format!(
            "Failed to decompress {compression:?} block ({} bytes compressed, {} bytes \
             uncompressed)",
            block.len(),
            expected_len
        )
    })?;
    ensure!(
        bytes_written == expected_len as usize,
        "Decompressed length does not match expected length: decompressed {bytes_written} bytes, \
         expected {expected_len}"
    );
    Ok(())
}

/// Decompresses a block into an Arc allocation.
///
/// The caller must ensure `uncompressed_length > 0` (i.e., the block is actually compressed).
/// Uncompressed blocks should be handled via zero-copy mmap slices before calling this.
pub(crate) fn decompress_into_arc(
    compression: Compression,
    uncompressed_length: u32,
    block: &[u8],
) -> Result<Arc<[u8]>> {
    // Allocate directly into an Arc to avoid a copy. The buffer is uninitialized;
    // decompression will overwrite it completely (verified by decompress_block).
    let buffer: Arc<[MaybeUninit<u8>]> = Arc::new_uninit_slice(uncompressed_length as usize);
    // Safety: decompression will fully initialize the buffer (verified by the length check in
    // decompress_block).
    let mut buffer = unsafe { buffer.assume_init() };
    // We just created this Arc so refcount is 1; get_mut always succeeds.
    let dest = Arc::get_mut(&mut buffer).expect("Arc refcount should be 1");
    decompress_block(compression, block, dest, uncompressed_length)?;
    Ok(buffer)
}

/// Like [`decompress_into_arc`] but returns an `Rc<[u8]>` for thread-local use.
pub(crate) fn decompress_into_rc(
    compression: Compression,
    uncompressed_length: u32,
    block: &[u8],
) -> Result<Rc<[u8]>> {
    let buffer: Rc<[MaybeUninit<u8>]> = Rc::new_uninit_slice(uncompressed_length as usize);
    // Safety: decompression will fully initialize the buffer (verified by the length check in
    // decompress_block).
    let mut buffer = unsafe { buffer.assume_init() };
    let dest = Rc::get_mut(&mut buffer).expect("Rc refcount should be 1");
    decompress_block(compression, block, dest, uncompressed_length)?;
    Ok(buffer)
}

/// Computes a CRC32 checksum of a byte slice.
pub fn checksum_block(data: &[u8]) -> u32 {
    crc32fast::hash(data)
}

/// Reusable compressor for a stream of blocks using the same family configuration.
pub(crate) struct Compressor {
    compression: Compression,
    zstd: Option<zstd::bulk::Compressor<'static>>,
}

impl Compressor {
    pub(crate) fn new(compression: Compression) -> Result<Self> {
        let zstd = match compression {
            Compression::Zstd3 => {
                Some(zstd::bulk::Compressor::new(3).context("Failed to create zstd compressor")?)
            }
            Compression::Lz4 => None,
        };
        Ok(Self { compression, zstd })
    }

    /// Compresses `block` into `buffer`.
    #[tracing::instrument(level = "trace", skip_all)]
    pub(crate) fn compress_into_buffer(
        &mut self,
        block: &[u8],
        buffer: &mut Vec<u8>,
    ) -> Result<()> {
        match self.compression {
            Compression::Lz4 => {
                let input_len = block
                    .len()
                    .try_into()
                    .context("LZ4 input length exceeds i32::MAX")?;
                // Safety: LZ4_compressBound only reads its integer argument.
                let bound = unsafe { LZ4_compressBound(input_len) };
                ensure!(bound > 0, "LZ4 input is too large");

                buffer.clear();
                buffer.reserve(bound as usize);
                // Safety: the input pointer is valid for input_len bytes. reserve() established at
                // least bound bytes of spare capacity, whose pointer is writable. liblz4 does not
                // retain either pointer and reports how many destination bytes it initialized.
                let bytes_written = unsafe {
                    LZ4_compress_default(
                        block.as_ptr().cast::<c_char>(),
                        buffer.spare_capacity_mut().as_mut_ptr().cast::<c_char>(),
                        input_len,
                        bound,
                    )
                };
                ensure!(
                    bytes_written > 0 && bytes_written <= bound,
                    "LZ4 compression failed with invalid output length {bytes_written}"
                );
                // Safety: liblz4 initialized exactly bytes_written bytes, and the check above
                // verifies that they fit within the reserved bound.
                unsafe { buffer.set_len(bytes_written as usize) };
                Ok(())
            }
            Compression::Zstd3 => {
                buffer.clear();
                buffer.reserve(zstd::zstd_safe::compress_bound(block.len()));
                self.zstd
                    .as_mut()
                    .expect("zstd compressor not initialized")
                    .compress_to_buffer(block, buffer)
                    .context("zstd compression failed")?;
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compression_round_trips() {
        let input = b"turbo persistence compression ".repeat(1024);
        for compression in [Compression::Lz4, Compression::Zstd3] {
            let mut compressor = Compressor::new(compression).unwrap();
            let mut compressed = Vec::new();
            compressor
                .compress_into_buffer(&input, &mut compressed)
                .unwrap();
            let output = decompress_into_arc(compression, input.len() as u32, &compressed).unwrap();
            assert_eq!(&*output, input);
        }
    }

    #[test]
    fn truncated_lz4_block_returns_an_error() {
        let input = b"turbo persistence compression ".repeat(1024);
        let mut compressed = Vec::new();
        Compressor::new(Compression::Lz4)
            .unwrap()
            .compress_into_buffer(&input, &mut compressed)
            .unwrap();
        compressed.truncate(compressed.len() / 2);

        assert!(decompress_into_arc(Compression::Lz4, input.len() as u32, &compressed).is_err());
    }
}
