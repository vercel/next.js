use std::{cell::RefCell, mem::MaybeUninit, rc::Rc, sync::Arc};

use anyhow::{Context, Result, ensure};
use lzzzz::{
    lz4::{self, decompress},
    lz4_hc,
};

thread_local! {
    /// Zstd decompression contexts are reusable and relatively expensive to create. Reads can run
    /// concurrently, so keep one context per thread rather than constructing one per block.
    static ZSTD_DECOMPRESSOR: RefCell<zstd::bulk::Decompressor<'static>> = RefCell::new(
        zstd::bulk::Decompressor::new().expect("zstd decompressor initialization should succeed")
    );
}

/// Compression algorithm used for a family's SST blocks and blob values.
///
/// The algorithm is configuration, not part of the on-disk data. A database must be reopened with
/// the same per-family compression configuration that was used to write it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Compression {
    /// Fast LZ4 compression using the default acceleration level.
    #[default]
    Lz4,
    /// LZ4 high-compression mode at the given level (3 through 12).
    Lz4Hc(i32),
    /// Zstandard compression at the given level.
    Zstd(i32),
}

impl Compression {
    fn validate(self) -> Result<()> {
        match self {
            Compression::Lz4 => Ok(()),
            Compression::Lz4Hc(level) => {
                ensure!(
                    (lz4_hc::CLEVEL_MIN..=lz4_hc::CLEVEL_MAX).contains(&level),
                    "Invalid LZ4 HC compression level {level}; expected {} through {}",
                    lz4_hc::CLEVEL_MIN,
                    lz4_hc::CLEVEL_MAX
                );
                Ok(())
            }
            Compression::Zstd(level) => {
                ensure!(
                    zstd::compression_level_range().contains(&level),
                    "Invalid zstd compression level {level}; expected {} through {}",
                    zstd::compression_level_range().start(),
                    zstd::compression_level_range().end()
                );
                Ok(())
            }
        }
    }
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
    compression.validate()?;
    let context = || {
        format!(
            "Failed to decompress {compression:?} block ({} bytes compressed, {} bytes \
             uncompressed)",
            block.len(),
            expected_len
        )
    };
    let bytes_written = match compression {
        Compression::Lz4 | Compression::Lz4Hc(_) => {
            decompress(block, dest).with_context(context)?
        }
        Compression::Zstd(_) => ZSTD_DECOMPRESSOR.with_borrow_mut(|decompressor| {
            decompressor
                .decompress_to_buffer(block, dest)
                .with_context(context)
        })?,
    };
    ensure!(
        bytes_written == expected_len as usize,
        "Decompressed length does not match expected length: wrote {bytes_written} bytes, \
         expected {expected_len}"
    );
    Ok(())
}

/// Decompresses a block into an Arc allocation.
///
/// The caller must ensure `uncompressed_length > 0` (i.e., the block is actually compressed).
/// Uncompressed blocks should be handled via zero-copy mmap slices before calling this.
pub fn decompress_into_arc(
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
pub fn decompress_into_rc(
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
        compression.validate()?;
        let zstd = match compression {
            Compression::Zstd(level) => Some(
                zstd::bulk::Compressor::new(level).context("Failed to create zstd compressor")?,
            ),
            Compression::Lz4 | Compression::Lz4Hc(_) => None,
        };
        Ok(Self { compression, zstd })
    }

    #[tracing::instrument(level = "trace", skip_all)]
    pub(crate) fn compress_into_buffer(
        &mut self,
        block: &[u8],
        buffer: &mut Vec<u8>,
    ) -> Result<()> {
        match self.compression {
            Compression::Lz4 => {
                lz4::compress_to_vec(block, buffer, lz4::ACC_LEVEL_DEFAULT)
                    .context("LZ4 compression failed")?;
            }
            Compression::Lz4Hc(level) => {
                lz4_hc::compress_to_vec(block, buffer, level)
                    .context("LZ4 HC compression failed")?;
            }
            Compression::Zstd(_) => {
                buffer.reserve(zstd::zstd_safe::compress_bound(block.len()));
                self.zstd
                    .as_mut()
                    .expect("zstd compressor initialized")
                    .compress_to_buffer(block, buffer)
                    .context("zstd compression failed")?;
            }
        }
        Ok(())
    }
}

pub fn compress_into_buffer(
    compression: Compression,
    block: &[u8],
    buffer: &mut Vec<u8>,
) -> Result<()> {
    Compressor::new(compression)?.compress_into_buffer(block, buffer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compression_round_trips() {
        let input = b"turbo persistence compression ".repeat(1024);
        for compression in [
            Compression::Lz4,
            Compression::Lz4Hc(4),
            Compression::Zstd(3),
        ] {
            let mut compressed = Vec::new();
            compress_into_buffer(compression, &input, &mut compressed).unwrap();
            let output = decompress_into_arc(compression, input.len() as u32, &compressed).unwrap();
            assert_eq!(&*output, input);
        }
    }

    #[test]
    fn invalid_compression_levels_are_rejected() {
        let mut output = Vec::new();
        assert!(compress_into_buffer(Compression::Lz4Hc(2), b"data", &mut output).is_err());
        assert!(
            compress_into_buffer(
                Compression::Zstd(*zstd::compression_level_range().end() + 1),
                b"data",
                &mut output,
            )
            .is_err()
        );
    }
}
