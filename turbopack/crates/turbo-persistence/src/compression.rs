use std::{
    io,
    mem::MaybeUninit,
    ops::{Deref, DerefMut},
    rc::Rc,
    sync::Arc,
};

use anyhow::{Context, Result, ensure};
use lzzzz::{
    lz4::{self, decompress},
    lz4_hc,
};
use parking_lot::Mutex;

const COMPRESSION_TAG_LZ4: u32 = 0;
const COMPRESSION_TAG_LZ4_HC: u32 = 1;
const COMPRESSION_TAG_ZSTD: u32 = 2;

/// Compression algorithm used for a family's SST blocks and blob values.
///
/// The configuration is recorded once in each meta file and must match the runtime family
/// configuration used to open the database.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Compression {
    /// Fast LZ4 compression using the default acceleration level.
    #[default]
    Lz4,
    /// LZ4 high-compression mode at the given level (3 through 12).
    Lz4Hc(i32),
    /// Zstandard compression at a level in [`zstd::compression_level_range`].
    ///
    /// The range is currently -131072 through 22. Level 0 asks zstd to use its default level
    /// (currently 3).
    Zstd(i32),
}

impl Compression {
    pub(crate) fn validate(self) -> Result<()> {
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
                let range = zstd::compression_level_range();
                ensure!(
                    range.contains(&level),
                    "Invalid zstd compression level {level}; expected {} through {}",
                    range.start(),
                    range.end()
                );
                Ok(())
            }
        }
    }

    pub(crate) fn to_meta_fields(self) -> Result<(u32, i32)> {
        self.validate()?;
        Ok(match self {
            Compression::Lz4 => (COMPRESSION_TAG_LZ4, 0),
            Compression::Lz4Hc(level) => (COMPRESSION_TAG_LZ4_HC, level),
            Compression::Zstd(level) => (COMPRESSION_TAG_ZSTD, level),
        })
    }

    pub(crate) fn from_meta_fields(tag: u32, level: i32) -> Result<Self> {
        let compression = match tag {
            COMPRESSION_TAG_LZ4 => {
                ensure!(
                    level == 0,
                    "LZ4 compression must store level 0, got {level}"
                );
                Compression::Lz4
            }
            COMPRESSION_TAG_LZ4_HC => Compression::Lz4Hc(level),
            COMPRESSION_TAG_ZSTD => Compression::Zstd(level),
            _ => anyhow::bail!("Unknown compression tag {tag}"),
        };
        compression.validate()?;
        Ok(compression)
    }
}

/// Reusable zstd decompression contexts owned by a database.
///
/// A context is about 96 KiB with the linked zstd version. The pool grows only to peak concurrent
/// zstd reads, and all retained contexts are released when the database is dropped.
#[derive(Default)]
pub(crate) struct DecompressionPool {
    zstd: Mutex<Vec<zstd::bulk::Decompressor<'static>>>,
    #[cfg(test)]
    zstd_contexts_created: std::sync::atomic::AtomicUsize,
}

impl DecompressionPool {
    fn checkout_zstd(&self) -> io::Result<PooledZstdDecompressor<'_>> {
        let decompressor = match self.zstd.lock().pop() {
            Some(decompressor) => decompressor,
            None => {
                #[cfg(test)]
                self.zstd_contexts_created
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                zstd::bulk::Decompressor::new()?
            }
        };
        Ok(PooledZstdDecompressor {
            pool: self,
            decompressor: Some(decompressor),
        })
    }

    fn decompress_zstd(&self, block: &[u8], dest: &mut [u8]) -> io::Result<usize> {
        self.checkout_zstd()?.decompress_to_buffer(block, dest)
    }

    #[cfg(test)]
    fn zstd_contexts_created(&self) -> usize {
        self.zstd_contexts_created
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    #[cfg(test)]
    fn available_zstd_contexts(&self) -> usize {
        self.zstd.lock().len()
    }
}

struct PooledZstdDecompressor<'a> {
    pool: &'a DecompressionPool,
    decompressor: Option<zstd::bulk::Decompressor<'static>>,
}

impl Deref for PooledZstdDecompressor<'_> {
    type Target = zstd::bulk::Decompressor<'static>;

    fn deref(&self) -> &Self::Target {
        self.decompressor
            .as_ref()
            .expect("decompressor checked out")
    }
}

impl DerefMut for PooledZstdDecompressor<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.decompressor
            .as_mut()
            .expect("decompressor checked out")
    }
}

impl Drop for PooledZstdDecompressor<'_> {
    fn drop(&mut self) {
        self.pool
            .zstd
            .lock()
            .push(self.decompressor.take().expect("decompressor checked out"));
    }
}

/// Decompresses `block` into `dest`, verifying the output length matches `expected_len`.
fn decompress_block(
    pool: &DecompressionPool,
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
    let result: Result<usize> = match compression {
        Compression::Lz4 | Compression::Lz4Hc(_) => {
            decompress(block, dest).map_err(anyhow::Error::from)
        }
        Compression::Zstd(_) => pool
            .decompress_zstd(block, dest)
            .map_err(anyhow::Error::from),
    };
    let bytes_written = result.with_context(|| {
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
    pool: &DecompressionPool,
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
    decompress_block(pool, compression, block, dest, uncompressed_length)?;
    Ok(buffer)
}

/// Like [`decompress_into_arc`] but returns an `Rc<[u8]>` for thread-local use.
pub(crate) fn decompress_into_rc(
    pool: &DecompressionPool,
    compression: Compression,
    uncompressed_length: u32,
    block: &[u8],
) -> Result<Rc<[u8]>> {
    let buffer: Rc<[MaybeUninit<u8>]> = Rc::new_uninit_slice(uncompressed_length as usize);
    // Safety: decompression will fully initialize the buffer (verified by the length check in
    // decompress_block).
    let mut buffer = unsafe { buffer.assume_init() };
    let dest = Rc::get_mut(&mut buffer).expect("Rc refcount should be 1");
    decompress_block(pool, compression, block, dest, uncompressed_length)?;
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
        let pool = DecompressionPool::default();
        for compression in [
            Compression::Lz4,
            Compression::Lz4Hc(4),
            Compression::Zstd(3),
        ] {
            let mut compressed = Vec::new();
            compress_into_buffer(compression, &input, &mut compressed).unwrap();
            let output =
                decompress_into_arc(&pool, compression, input.len() as u32, &compressed).unwrap();
            assert_eq!(&*output, input);
        }
    }

    #[test]
    fn compression_meta_fields_round_trip() {
        for compression in [
            Compression::Lz4,
            Compression::Lz4Hc(3),
            Compression::Lz4Hc(12),
            Compression::Zstd(0),
            Compression::Zstd(3),
        ] {
            let (tag, level) = compression.to_meta_fields().unwrap();
            assert_eq!(
                Compression::from_meta_fields(tag, level).unwrap(),
                compression
            );
        }
        assert!(Compression::from_meta_fields(99, 0).is_err());
        assert!(Compression::from_meta_fields(COMPRESSION_TAG_LZ4, 1).is_err());
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

    #[test]
    fn decompression_pool_reuses_and_releases_contexts() {
        let pool = Arc::new(DecompressionPool::default());

        {
            let first = pool.checkout_zstd().unwrap();
            let second = pool.checkout_zstd().unwrap();
            assert_eq!(pool.zstd_contexts_created(), 2);
            assert_eq!(pool.available_zstd_contexts(), 0);
            drop((first, second));
        }
        assert_eq!(pool.available_zstd_contexts(), 2);

        let reused = pool.checkout_zstd().unwrap();
        assert_eq!(pool.zstd_contexts_created(), 2);
        drop(reused);
        assert_eq!(pool.available_zstd_contexts(), 2);

        let weak = Arc::downgrade(&pool);
        drop(pool);
        assert!(weak.upgrade().is_none());
    }
}
