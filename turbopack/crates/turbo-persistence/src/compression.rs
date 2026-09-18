#[cfg(not(miri))]
use std::cell::RefCell;
use std::{mem::MaybeUninit, rc::Rc, sync::Arc};

#[cfg(not(miri))]
use anyhow::Context;
use anyhow::{Result, ensure};
#[cfg(not(miri))]
use lz4_flex::block::{
    CompressTable, compress_into_with_table, decompress_into, get_maximum_output_size,
};

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

#[cfg(not(miri))]
thread_local! {
    /// Reuse lz4_flex's large hash table across independent blocks. Starting large improves
    /// compression speed and produces faster-to-decode streams for typical persistence blocks.
    static LZ4_COMPRESS_TABLE: RefCell<CompressTable> = RefCell::new(CompressTable::large());

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
        "decompress_block called with uncompressed_length=0; uncompressed blocks are served \
         directly from their backing"
    );
    #[cfg(not(miri))]
    {
        let bytes_written = match compression {
            Compression::Lz4 => decompress_into(block, dest).map_err(anyhow::Error::from),
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
            "Decompressed length does not match expected length: decompressed {bytes_written} \
             bytes, expected {expected_len}"
        );
    }
    #[cfg(miri)]
    {
        // Compression is skipped under Miri, so Miri-created blob payloads are verbatim.
        let _ = compression;
        ensure!(
            block.len() == expected_len as usize,
            "Miri builds skip compression, so a compressed block cannot be read under Miri"
        );
        dest.copy_from_slice(block);
    }
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
    #[cfg(not(miri))]
    zstd: Option<zstd::bulk::Compressor<'static>>,
}

impl Compressor {
    pub(crate) fn new(compression: Compression) -> Result<Self> {
        #[cfg(not(miri))]
        let zstd = match compression {
            Compression::Zstd3 => {
                Some(zstd::bulk::Compressor::new(3).context("Failed to create zstd compressor")?)
            }
            Compression::Lz4 => None,
        };
        Ok(Self {
            compression,
            #[cfg(not(miri))]
            zstd,
        })
    }

    /// Compresses `block` into reusable storage, replacing its contents.
    #[tracing::instrument(level = "trace", skip_all)]
    pub(crate) fn compress_into_buffer(
        &mut self,
        block: &[u8],
        buffer: &mut Vec<u8>,
    ) -> Result<()> {
        buffer.clear();
        #[cfg(not(miri))]
        match self.compression {
            Compression::Lz4 => {
                let max_output_size = get_maximum_output_size(block.len());
                buffer.reserve(max_output_size);
                // SAFETY: `reserve` guarantees at least `max_output_size` writable bytes from
                // `as_mut_ptr`. lz4_flex is built without `safe-encode`; its `SliceSink` explicitly
                // supports possibly uninitialized output and initializes every byte before
                // advancing the returned length. The Vec remains logically empty until compression
                // succeeds, then `set_len` exposes exactly that initialized prefix.
                let output =
                    unsafe { std::slice::from_raw_parts_mut(buffer.as_mut_ptr(), max_output_size) };
                let compressed_len = LZ4_COMPRESS_TABLE
                    .with_borrow_mut(|table| compress_into_with_table(block, output, table))
                    .context("LZ4 compression failed")?;
                // SAFETY: `compress_into_with_table` initialized this many bytes in `buffer` above.
                unsafe { buffer.set_len(compressed_len) };
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
        #[cfg(miri)]
        {
            // Compression is deliberately skipped under Miri. This avoids native Zstd, and using
            // the same raw representation for both algorithms keeps blob reads on the matching
            // copy path above. The caller's savings check stores SST blocks as uncompressed.
            let _ = self.compression;
            buffer.extend_from_slice(block);
        }
        Ok(())
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
}
