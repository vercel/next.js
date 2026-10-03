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

enum DecompressionTarget<'a> {
    Lz4(&'a mut [u8]),
    Zstd(&'a mut [MaybeUninit<u8>]),
}

impl DecompressionTarget<'_> {
    fn compression(&self) -> Compression {
        match self {
            DecompressionTarget::Lz4(_) => Compression::Lz4,
            DecompressionTarget::Zstd(_) => Compression::Zstd3,
        }
    }
}

/// A Zstd output buffer that keeps its allocation uninitialized until the codec reports which
/// prefix it wrote.
#[cfg(not(miri))]
struct ZstdUninitBuffer<'a> {
    buffer: &'a mut [MaybeUninit<u8>],
    initialized: usize,
}

#[cfg(not(miri))]
impl<'a> ZstdUninitBuffer<'a> {
    fn new(buffer: &'a mut [MaybeUninit<u8>]) -> Self {
        Self {
            buffer,
            initialized: 0,
        }
    }
}

// Safety: `capacity` and `as_mut_ptr` describe the full writable allocation, while `as_slice`
// exposes only the prefix that Zstd has reported initialized through `filled_until`.
#[cfg(not(miri))]
unsafe impl zstd::zstd_safe::WriteBuf for ZstdUninitBuffer<'_> {
    fn as_slice(&self) -> &[u8] {
        // Safety: `initialized` is updated only by `filled_until`, whose caller guarantees that
        // this prefix was written, and it is always at most the allocation length.
        unsafe { self.buffer[..self.initialized].assume_init_ref() }
    }

    fn capacity(&self) -> usize {
        self.buffer.len()
    }

    fn as_mut_ptr(&mut self) -> *mut u8 {
        self.buffer.as_mut_ptr().cast()
    }

    unsafe fn filled_until(&mut self, n: usize) {
        assert!(n <= self.buffer.len());
        self.initialized = n;
    }
}

/// Decompresses `block` into `dest`, verifying the output length matches `expected_len`.
fn decompress_block(block: &[u8], dest: DecompressionTarget<'_>, expected_len: u32) -> Result<()> {
    debug_assert!(
        expected_len > 0,
        "decompress_block called with uncompressed_length=0; uncompressed blocks are served \
         directly from their backing"
    );
    let compression = dest.compression();
    #[cfg(not(miri))]
    {
        let mut dest = dest;
        let bytes_written = match &mut dest {
            DecompressionTarget::Lz4(dest) => {
                decompress_into(block, dest).map_err(anyhow::Error::from)
            }
            DecompressionTarget::Zstd(dest) => ZSTD_DECOMPRESSOR.with_borrow_mut(|decompressor| {
                decompressor
                    .decompress_to_buffer(block, &mut ZstdUninitBuffer::new(dest))
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
        match dest {
            DecompressionTarget::Lz4(dest) => dest.copy_from_slice(block),
            DecompressionTarget::Zstd(dest) => {
                for (dest, &byte) in dest.iter_mut().zip(block) {
                    dest.write(byte);
                }
            }
        }
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
    let buffer: Arc<[MaybeUninit<u8>]> = Arc::new_uninit_slice(uncompressed_length as usize);
    if compression == Compression::Zstd3 {
        let mut buffer = buffer;
        // We just created this Arc, so its refcount is 1 and `get_mut` always succeeds.
        let dest = Arc::get_mut(&mut buffer).expect("Arc refcount should be 1");
        decompress_block(block, DecompressionTarget::Zstd(dest), uncompressed_length)?;
        // Safety: successful Zstd decompression reported that it initialized exactly the full
        // allocation; `decompress_block` checked that before returning.
        return Ok(unsafe { buffer.assume_init() });
    }

    // Safety: decompression will fully initialize the buffer (verified by the length check in
    // decompress_block).
    let mut buffer = unsafe { buffer.assume_init() };
    // We just created this Arc so refcount is 1; get_mut always succeeds.
    let dest = Arc::get_mut(&mut buffer).expect("Arc refcount should be 1");
    decompress_block(block, DecompressionTarget::Lz4(dest), uncompressed_length)?;
    Ok(buffer)
}

/// Like [`decompress_into_arc`] but returns an `Rc<[u8]>` for thread-local use.
pub(crate) fn decompress_into_rc(
    compression: Compression,
    uncompressed_length: u32,
    block: &[u8],
) -> Result<Rc<[u8]>> {
    let buffer: Rc<[MaybeUninit<u8>]> = Rc::new_uninit_slice(uncompressed_length as usize);
    if compression == Compression::Zstd3 {
        let mut buffer = buffer;
        let dest = Rc::get_mut(&mut buffer).expect("Rc refcount should be 1");
        decompress_block(block, DecompressionTarget::Zstd(dest), uncompressed_length)?;
        // Safety: successful Zstd decompression reported that it initialized exactly the full
        // allocation; `decompress_block` checked that before returning.
        return Ok(unsafe { buffer.assume_init() });
    }

    // Safety: decompression will fully initialize the buffer (verified by the length check in
    // decompress_block).
    let mut buffer = unsafe { buffer.assume_init() };
    let dest = Rc::get_mut(&mut buffer).expect("Rc refcount should be 1");
    decompress_block(block, DecompressionTarget::Lz4(dest), uncompressed_length)?;
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

    fn compress_zstd(input: &[u8]) -> Vec<u8> {
        let mut compressor = Compressor::new(Compression::Zstd3).unwrap();
        let mut compressed = Vec::new();
        compressor
            .compress_into_buffer(input, &mut compressed)
            .unwrap();
        compressed
    }

    #[test]
    fn zstd_arc_and_rc_round_trip() {
        let input = b"turbo persistence zstd round trip ".repeat(1024);
        let compressed = compress_zstd(&input);

        let arc = decompress_into_arc(Compression::Zstd3, input.len() as u32, &compressed).unwrap();
        let rc = decompress_into_rc(Compression::Zstd3, input.len() as u32, &compressed).unwrap();

        assert_eq!(&*arc, input);
        assert_eq!(&*rc, input);
    }

    #[cfg(not(miri))]
    fn assert_zstd_error_paths<T>(decompress: impl Fn(u32, &[u8]) -> Result<T>) {
        let input = b"turbo persistence zstd error path ".repeat(128);
        let compressed = compress_zstd(&input);

        assert!(decompress(input.len() as u32, b"not a zstd frame").is_err());
        assert!(
            decompress(
                input.len() as u32,
                &compressed[..compressed.len().saturating_sub(1)]
            )
            .is_err()
        );

        let error = match decompress(input.len() as u32 + 1, &compressed) {
            Ok(_) => panic!("larger expected length should fail"),
            Err(error) => error,
        };
        assert!(
            error
                .to_string()
                .contains("Decompressed length does not match expected length")
        );

        assert!(decompress(input.len() as u32 - 1, &compressed).is_err());
    }

    #[cfg(not(miri))]
    #[test]
    fn zstd_arc_rejects_malformed_or_mismatched_input() {
        assert_zstd_error_paths(|expected_len, compressed| {
            decompress_into_arc(Compression::Zstd3, expected_len, compressed)
        });
    }

    #[cfg(not(miri))]
    #[test]
    fn zstd_rc_rejects_malformed_or_mismatched_input() {
        assert_zstd_error_paths(|expected_len, compressed| {
            decompress_into_rc(Compression::Zstd3, expected_len, compressed)
        });
    }
}
