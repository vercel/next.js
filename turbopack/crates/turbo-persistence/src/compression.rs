use std::{
    cell::RefCell,
    ffi::{c_char, c_int, c_void},
    mem::{MaybeUninit, size_of},
    rc::Rc,
    sync::Arc,
};

use anyhow::{Context, Result, ensure};
use lz4::liblz4::{LZ4_compressBound, LZ4_decompress_safe};

unsafe extern "C" {
    // These are part of liblz4's static-linking API but are not exposed by lz4-sys.
    fn LZ4_sizeofState() -> c_int;
    fn LZ4_compress_fast_extState(
        state: *mut c_void,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
        acceleration: c_int,
    ) -> c_int;
    fn LZ4_compress_fast_extState_fastReset(
        state: *mut c_void,
        src: *const c_char,
        dst: *mut c_char,
        src_size: c_int,
        dst_capacity: c_int,
        acceleration: c_int,
    ) -> c_int;
}

struct Lz4CompressionState {
    // u64 gives the allocation the alignment required by LZ4_stream_t.
    storage: Box<[u64]>,
    initialized: bool,
}

impl Lz4CompressionState {
    fn new() -> Self {
        // Safety: LZ4_sizeofState takes no arguments and has no preconditions.
        let byte_len = unsafe { LZ4_sizeofState() };
        assert!(
            byte_len > 0,
            "LZ4 compression state size should be positive"
        );
        let word_len = (byte_len as usize).div_ceil(size_of::<u64>());
        Self {
            storage: vec![0; word_len].into_boxed_slice(),
            initialized: false,
        }
    }

    fn as_mut_ptr(&mut self) -> *mut c_void {
        self.storage.as_mut_ptr().cast()
    }
}

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
    /// LZ4's default compression entry point creates and initializes a 16 KiB stream state on every
    /// call. Keep one state per worker thread so later independent blocks can use the fast-reset
    /// entry point without a global lock.
    static LZ4_COMPRESSION_STATE: RefCell<Lz4CompressionState> = RefCell::new(
        Lz4CompressionState::new()
    );

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
                let bytes_written = LZ4_COMPRESSION_STATE.with_borrow_mut(|state| {
                    // Safety: the state allocation is at least LZ4_sizeofState() bytes and u64
                    // aligned. The input pointer is valid for input_len bytes. reserve()
                    // established at least bound bytes of writable spare capacity. liblz4 retains
                    // none of the pointers and reports how many destination bytes it initialized.
                    // The fast-reset entry point is used only after the full initialization call
                    // has successfully prepared the state.
                    let bytes_written = unsafe {
                        if state.initialized {
                            LZ4_compress_fast_extState_fastReset(
                                state.as_mut_ptr(),
                                block.as_ptr().cast::<c_char>(),
                                buffer.spare_capacity_mut().as_mut_ptr().cast::<c_char>(),
                                input_len,
                                bound,
                                1,
                            )
                        } else {
                            LZ4_compress_fast_extState(
                                state.as_mut_ptr(),
                                block.as_ptr().cast::<c_char>(),
                                buffer.spare_capacity_mut().as_mut_ptr().cast::<c_char>(),
                                input_len,
                                bound,
                                1,
                            )
                        }
                    };
                    if bytes_written > 0 {
                        state.initialized = true;
                    }
                    bytes_written
                });
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

    fn patterned_input(len: usize, salt: usize) -> Vec<u8> {
        let pattern = b"turbo-persistence:block/key/value/";
        (0..len)
            .map(|i| {
                if i % 10 < 7 {
                    pattern[(i + salt) % pattern.len()]
                } else {
                    ((i.wrapping_mul(31) + salt) & 0xff) as u8
                }
            })
            .collect()
    }

    #[test]
    fn repeated_lz4_compression_matches_independent_raw_blocks() {
        let inputs = [patterned_input(8 * 1024, 1), patterned_input(70 * 1024, 2)];
        let expected = inputs
            .each_ref()
            .map(|input| lz4::block::compress(input, None, false).unwrap());
        let mut compressor = Compressor::new(Compression::Lz4).unwrap();
        let mut compressed = Vec::new();

        for _ in 0..4 {
            for (input, expected) in inputs.iter().zip(&expected) {
                compressor
                    .compress_into_buffer(input, &mut compressed)
                    .unwrap();
                assert_eq!(&compressed, expected);
                assert_eq!(
                    &*decompress_into_arc(Compression::Lz4, input.len() as u32, &compressed)
                        .unwrap(),
                    input
                );
            }
        }
    }

    #[test]
    fn lz4_compression_state_is_independent_per_thread() {
        let input = Arc::new(patterned_input(12 * 1024, 3));
        let expected = Arc::new(lz4::block::compress(&input, None, false).unwrap());
        let threads = (0..4)
            .map(|_| {
                let input = Arc::clone(&input);
                let expected = Arc::clone(&expected);
                std::thread::spawn(move || {
                    let mut compressor = Compressor::new(Compression::Lz4).unwrap();
                    let mut compressed = Vec::new();
                    for _ in 0..8 {
                        compressor
                            .compress_into_buffer(&input, &mut compressed)
                            .unwrap();
                        assert_eq!(&compressed, &*expected);
                        assert_eq!(
                            &*decompress_into_arc(
                                Compression::Lz4,
                                input.len() as u32,
                                &compressed,
                            )
                            .unwrap(),
                            &*input
                        );
                    }
                })
            })
            .collect::<Vec<_>>();

        for thread in threads {
            thread.join().unwrap();
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
