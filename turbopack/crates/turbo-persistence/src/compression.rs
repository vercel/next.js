use std::{cell::RefCell, mem::MaybeUninit, rc::Rc, sync::Arc};

use anyhow::{Context, Result, ensure};
use bincode::{Decode, Encode};
use lzzzz::{
    lz4::{self, decompress},
    lz4_hc,
};
use thread_local::ThreadLocal;

/// Compression preset used for a family's SST blocks and blob values.
///
/// Variant order is part of the meta-file format. New presets must be appended without reordering
/// existing variants.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Encode, Decode)]
pub enum Compression {
    /// Fast LZ4 compression using the default acceleration level.
    #[default]
    Lz4,
    /// LZ4 high-compression mode at level 4.
    Lz4Hc4,
    /// Zstandard compression at level 3.
    Zstd3,
}

impl Compression {
    pub const fn lz4() -> Self {
        Self::Lz4
    }

    pub const fn lz4_hc4() -> Self {
        Self::Lz4Hc4
    }

    pub const fn zstd_3() -> Self {
        Self::Zstd3
    }

    pub(crate) fn encode(self) -> Result<Vec<u8>> {
        bincode::encode_to_vec(self, bincode::config::standard())
            .context("Failed to encode compression preset")
    }

    pub(crate) fn decode(bytes: &[u8]) -> Result<Self> {
        let (compression, consumed) =
            bincode::decode_from_slice(bytes, bincode::config::standard())
                .context("Failed to decode compression preset")?;
        ensure!(
            consumed == bytes.len(),
            "Compression preset has {} trailing bytes",
            bytes.len() - consumed
        );
        Ok(compression)
    }
}

/// Reusable zstd decompression contexts owned by one database.
///
/// A context is about 96 KiB with the linked zstd version. Each participating thread lazily creates
/// one lock-free context, and dropping this object releases all of them.
#[derive(Default)]
pub(crate) struct DecompressionContext {
    zstd: ThreadLocal<RefCell<zstd::bulk::Decompressor<'static>>>,
    #[cfg(test)]
    zstd_contexts_created: std::sync::atomic::AtomicUsize,
}

impl DecompressionContext {
    fn decompress_zstd(&self, block: &[u8], dest: &mut [u8]) -> std::io::Result<usize> {
        let decompressor = self.zstd.get_or_try(|| {
            #[cfg(test)]
            self.zstd_contexts_created
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            zstd::bulk::Decompressor::new().map(RefCell::new)
        })?;
        decompressor
            .try_borrow_mut()
            .expect("zstd decompressor used recursively")
            .decompress_to_buffer(block, dest)
    }

    #[cfg(test)]
    fn zstd_contexts_created(&self) -> usize {
        self.zstd_contexts_created
            .load(std::sync::atomic::Ordering::Relaxed)
    }
}

/// Decompresses `block` into `dest`, verifying the output length matches `expected_len`.
fn decompress_block(
    decompression_context: &DecompressionContext,
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
    let result: Result<usize> = match compression {
        Compression::Lz4 | Compression::Lz4Hc4 => {
            decompress(block, dest).map_err(anyhow::Error::from)
        }
        Compression::Zstd3 => decompression_context
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
    decompression_context: &DecompressionContext,
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
    decompress_block(
        decompression_context,
        compression,
        block,
        dest,
        uncompressed_length,
    )?;
    Ok(buffer)
}

/// Like [`decompress_into_arc`] but returns an `Rc<[u8]>` for thread-local use.
pub(crate) fn decompress_into_rc(
    decompression_context: &DecompressionContext,
    compression: Compression,
    uncompressed_length: u32,
    block: &[u8],
) -> Result<Rc<[u8]>> {
    let buffer: Rc<[MaybeUninit<u8>]> = Rc::new_uninit_slice(uncompressed_length as usize);
    // Safety: decompression will fully initialize the buffer (verified by the length check in
    // decompress_block).
    let mut buffer = unsafe { buffer.assume_init() };
    let dest = Rc::get_mut(&mut buffer).expect("Rc refcount should be 1");
    decompress_block(
        decompression_context,
        compression,
        block,
        dest,
        uncompressed_length,
    )?;
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
            Compression::Lz4 | Compression::Lz4Hc4 => None,
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
            Compression::Lz4Hc4 => {
                lz4_hc::compress_to_vec(block, buffer, 4).context("LZ4 HC compression failed")?;
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
    use std::{sync::Barrier, thread};

    use super::*;

    #[test]
    fn compression_round_trips() {
        let input = b"turbo persistence compression ".repeat(1024);
        let decompression_context = DecompressionContext::default();
        for compression in [
            Compression::lz4(),
            Compression::lz4_hc4(),
            Compression::zstd_3(),
        ] {
            let mut compressed = Vec::new();
            compress_into_buffer(compression, &input, &mut compressed).unwrap();
            let output = decompress_into_arc(
                &decompression_context,
                compression,
                input.len() as u32,
                &compressed,
            )
            .unwrap();
            assert_eq!(&*output, input);
        }
    }

    #[test]
    fn compression_bincode_round_trip() {
        for compression in [
            Compression::lz4(),
            Compression::lz4_hc4(),
            Compression::zstd_3(),
        ] {
            let encoded = compression.encode().unwrap();
            assert_eq!(Compression::decode(&encoded).unwrap(), compression);
        }
        assert!(Compression::decode(&[99]).is_err());
        assert!(Compression::decode(&[0, 0]).is_err());
    }

    #[test]
    fn decompression_context_is_reused_per_thread_and_released() {
        let input = b"thread local zstd context".repeat(1024);
        let mut compressed = Vec::new();
        compress_into_buffer(Compression::zstd_3(), &input, &mut compressed).unwrap();
        let compressed = Arc::new(compressed);
        let decompression_context = Arc::new(DecompressionContext::default());

        let mut output = vec![0; input.len()];
        decompression_context
            .decompress_zstd(&compressed, &mut output)
            .unwrap();
        decompression_context
            .decompress_zstd(&compressed, &mut output)
            .unwrap();
        assert_eq!(decompression_context.zstd_contexts_created(), 1);

        let barrier = Arc::new(Barrier::new(3));
        let threads = (0..2)
            .map(|_| {
                let decompression_context = decompression_context.clone();
                let compressed = compressed.clone();
                let barrier = barrier.clone();
                let output_len = input.len();
                thread::spawn(move || {
                    let mut output = vec![0; output_len];
                    decompression_context
                        .decompress_zstd(&compressed, &mut output)
                        .unwrap();
                    barrier.wait();
                })
            })
            .collect::<Vec<_>>();
        barrier.wait();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(decompression_context.zstd_contexts_created(), 3);

        let weak = Arc::downgrade(&decompression_context);
        drop(decompression_context);
        assert!(weak.upgrade().is_none());
    }
}
