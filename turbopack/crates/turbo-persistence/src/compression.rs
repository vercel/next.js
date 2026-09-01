use std::{cell::RefCell, mem::MaybeUninit, rc::Rc, sync::Arc};

use anyhow::{Context, Result, ensure};
use lzzzz::lz4::{self, decompress};

/// Compression algorithm used for a family's SST blocks and blob values.
///
/// The discriminants are stored in meta files, so existing values must not be changed. New
/// algorithms get a new discriminant.
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
        Compression::Lz4 => decompress(block, dest).map_err(anyhow::Error::from),
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
        "Decompressed length does not match expected length: wrote {bytes_written} bytes, \
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
            Compression::Zstd3 => {
                buffer.reserve(zstd::zstd_safe::compress_bound(block.len()));
                self.zstd
                    .as_mut()
                    .expect("zstd compressor not initialized")
                    .compress_to_buffer(block, buffer)
                    .context("zstd compression failed")?;
            }
        }
        Ok(())
    }
}

pub(crate) fn compress_into_buffer(
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
        for compression in [Compression::Lz4, Compression::Zstd3] {
            let mut compressed = Vec::new();
            compress_into_buffer(compression, &input, &mut compressed).unwrap();
            let output = decompress_into_arc(compression, input.len() as u32, &compressed).unwrap();
            assert_eq!(&*output, input);
        }
    }
}
