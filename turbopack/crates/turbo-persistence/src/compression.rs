use std::{cell::RefCell, fmt, mem::MaybeUninit, rc::Rc, sync::Arc};

use anyhow::{Context, Result, ensure};
use lzzzz::lz4::{self, decompress};

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

/// Runtime compression configuration for a persistence family.
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum CompressionConfig {
    #[default]
    Lz4,
    Zstd3,
    Zstd3WithDictionary(&'static [u8]),
}

impl fmt::Debug for CompressionConfig {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Lz4 => formatter.write_str("Lz4"),
            Self::Zstd3 => formatter.write_str("Zstd3"),
            Self::Zstd3WithDictionary(_) => formatter
                .debug_struct("Zstd3WithDictionary")
                .field("dictionary_id", &self.dictionary_id())
                .finish(),
        }
    }
}

impl CompressionConfig {
    pub fn algorithm(self) -> Compression {
        match self {
            Self::Lz4 => Compression::Lz4,
            Self::Zstd3 | Self::Zstd3WithDictionary(_) => Compression::Zstd3,
        }
    }

    pub fn dictionary(self) -> Option<&'static [u8]> {
        match self {
            Self::Zstd3WithDictionary(dictionary) => Some(dictionary),
            Self::Lz4 | Self::Zstd3 => None,
        }
    }

    pub fn dictionary_id(self) -> Option<u32> {
        self.dictionary()
            .and_then(zstd::zstd_safe::get_dict_id_from_dict)
            .map(|id| id.get())
    }
}

impl From<Compression> for CompressionConfig {
    fn from(value: Compression) -> Self {
        match value {
            Compression::Lz4 => Self::Lz4,
            Compression::Zstd3 => Self::Zstd3,
        }
    }
}

thread_local! {
    /// Zstd decompression contexts are reusable and relatively expensive to create. Keep one per
    /// worker thread to avoid allocation on every block read without a global lock.
    static ZSTD_DECOMPRESSOR: RefCell<(Option<&'static [u8]>, zstd::bulk::Decompressor<'static>)> = RefCell::new(
        (None, zstd::bulk::Decompressor::new().expect("zstd decompressor initialization should succeed"))
    );
}

/// Decompresses `block` into `dest`, verifying the output length matches `expected_len`.
fn decompress_block(
    compression: CompressionConfig,
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
        CompressionConfig::Lz4 => decompress(block, dest).map_err(anyhow::Error::from),
        CompressionConfig::Zstd3 | CompressionConfig::Zstd3WithDictionary(_) => ZSTD_DECOMPRESSOR
            .with_borrow_mut(|state| {
                let dictionary = compression.dictionary();
                let same_dictionary = match (state.0, dictionary) {
                    (Some(current), Some(next)) => std::ptr::eq(current, next),
                    (None, None) => true,
                    _ => false,
                };
                if !same_dictionary {
                    state
                        .1
                        .set_dictionary(dictionary.unwrap_or_default())
                        .map_err(anyhow::Error::from)?;
                    state.0 = dictionary;
                }
                state
                    .1
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
    compression: CompressionConfig,
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
    compression: CompressionConfig,
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
    compression: CompressionConfig,
    zstd: Option<zstd::bulk::Compressor<'static>>,
}

impl Compressor {
    pub(crate) fn new(compression: CompressionConfig) -> Result<Self> {
        let zstd = match compression {
            CompressionConfig::Zstd3 => {
                Some(zstd::bulk::Compressor::new(3).context("Failed to create zstd compressor")?)
            }
            CompressionConfig::Zstd3WithDictionary(dictionary) => Some(
                zstd::bulk::Compressor::with_dictionary(3, dictionary)
                    .context("Failed to create zstd dictionary compressor")?,
            ),
            CompressionConfig::Lz4 => None,
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
            CompressionConfig::Lz4 => {
                lz4::compress_to_vec(block, buffer, lz4::ACC_LEVEL_DEFAULT)
                    .context("LZ4 compression failed")?;
            }
            CompressionConfig::Zstd3 | CompressionConfig::Zstd3WithDictionary(_) => {
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

    #[test]
    fn dictionary_compression_round_trips() {
        let samples = (0..100)
            .map(|index| format!("export default function Component{index}() {{ return null }}"))
            .collect::<Vec<_>>();
        let dictionary = zstd::dict::from_samples(&samples, 1024).unwrap();
        let dictionary = Box::leak(dictionary.into_boxed_slice());
        let config = CompressionConfig::Zstd3WithDictionary(dictionary);
        assert_eq!(config.algorithm(), Compression::Zstd3);
        assert!(config.dictionary_id().is_some());
        let input = samples.concat();
        let mut compressor = Compressor::new(config).unwrap();
        let mut compressed = Vec::new();
        compressor
            .compress_into_buffer(input.as_bytes(), &mut compressed)
            .unwrap();
        let output = decompress_into_arc(config, input.len() as u32, &compressed).unwrap();
        assert_eq!(&*output, input.as_bytes());
        assert!(
            decompress_into_arc(CompressionConfig::Zstd3, input.len() as u32, &compressed).is_err()
        );
    }

    #[test]
    fn compression_round_trips() {
        let input = b"turbo persistence compression ".repeat(1024);
        for compression in [CompressionConfig::Lz4, CompressionConfig::Zstd3] {
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
