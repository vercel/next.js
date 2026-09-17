use std::{cell::RefCell, mem::MaybeUninit, rc::Rc, sync::Arc};

use anyhow::{Context, Result, ensure};
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

thread_local! {
    /// Reuse lz4_flex's hash table across independent blocks. lz4_flex transparently upgrades a
    /// small table when a large input requires it.
    static LZ4_COMPRESS_TABLE: RefCell<CompressTable> = RefCell::new(CompressTable::small());

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

    /// Compresses `block` into reusable storage, replacing its contents.
    #[tracing::instrument(level = "trace", skip_all)]
    pub(crate) fn compress_into_buffer(
        &mut self,
        block: &[u8],
        buffer: &mut Vec<u8>,
    ) -> Result<()> {
        buffer.clear();
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
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIBLZ4_FIXTURE_INPUT: &[u8] =
        b"turbo persistence lz4 compatibility turbo persistence lz4 compatibility";
    const LIBLZ4_FIXTURE: &[u8] = &[
        255, 21, 116, 117, 114, 98, 111, 32, 112, 101, 114, 115, 105, 115, 116, 101, 110, 99, 101,
        32, 108, 122, 52, 32, 99, 111, 109, 112, 97, 116, 105, 98, 105, 108, 105, 116, 121, 32, 36,
        0, 11, 80, 105, 108, 105, 116, 121,
    ];

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
    fn compression_round_trips() {
        let input = b"turbo persistence compression ".repeat(1024);
        for compression in [Compression::Lz4, Compression::Zstd3] {
            let mut compressor = Compressor::new(compression).unwrap();
            let mut storage = Vec::new();
            compressor
                .compress_into_buffer(&input, &mut storage)
                .unwrap();
            let output = decompress_into_arc(compression, input.len() as u32, &storage).unwrap();
            assert_eq!(&*output, input);
        }
    }

    #[test]
    fn lz4_decodes_liblz4_raw_block() {
        let output = decompress_into_arc(
            Compression::Lz4,
            LIBLZ4_FIXTURE_INPUT.len() as u32,
            LIBLZ4_FIXTURE,
        )
        .unwrap();
        assert_eq!(&*output, LIBLZ4_FIXTURE_INPUT);
    }

    #[test]
    fn repeated_lz4_compression_reuses_output_allocation() {
        let inputs = [patterned_input(8 * 1024, 1), patterned_input(70 * 1024, 2)];
        let max_output_size = inputs
            .iter()
            .map(|input| get_maximum_output_size(input.len()))
            .max()
            .unwrap();
        let mut compressor = Compressor::new(Compression::Lz4).unwrap();
        let mut storage = Vec::with_capacity(max_output_size);
        storage.extend_from_slice(b"old contents that must be replaced");
        let storage_ptr = storage.as_ptr();
        let storage_capacity = storage.capacity();

        for _ in 0..4 {
            for input in &inputs {
                compressor
                    .compress_into_buffer(input, &mut storage)
                    .unwrap();
                assert_eq!(storage.as_ptr(), storage_ptr);
                assert_eq!(storage.capacity(), storage_capacity);
                assert!(storage.len() < input.len());
                assert_eq!(
                    &*decompress_into_arc(Compression::Lz4, input.len() as u32, &storage).unwrap(),
                    input
                );
            }
        }
    }

    #[test]
    fn lz4_compression_table_is_independent_per_thread() {
        let input = Arc::new(patterned_input(12 * 1024, 3));
        let threads = (0..4)
            .map(|_| {
                let input = Arc::clone(&input);
                std::thread::spawn(move || {
                    let mut compressor = Compressor::new(Compression::Lz4).unwrap();
                    let mut storage = Vec::new();
                    for _ in 0..8 {
                        compressor
                            .compress_into_buffer(&input, &mut storage)
                            .unwrap();
                        assert_eq!(
                            &*decompress_into_arc(Compression::Lz4, input.len() as u32, &storage,)
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
    fn malformed_lz4_blocks_return_errors() {
        let mut truncated = LIBLZ4_FIXTURE.to_vec();
        truncated.truncate(truncated.len() / 2);
        assert!(
            decompress_into_arc(
                Compression::Lz4,
                LIBLZ4_FIXTURE_INPUT.len() as u32,
                &truncated,
            )
            .is_err()
        );
        assert!(
            decompress_into_arc(
                Compression::Lz4,
                (LIBLZ4_FIXTURE_INPUT.len() - 1) as u32,
                LIBLZ4_FIXTURE,
            )
            .is_err()
        );
        assert!(
            decompress_into_arc(
                Compression::Lz4,
                (LIBLZ4_FIXTURE_INPUT.len() + 1) as u32,
                LIBLZ4_FIXTURE,
            )
            .is_err()
        );
    }
}
