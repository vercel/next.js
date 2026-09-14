//! LZ4 Frame Compressor/Decompressor

use super::{api, Result};
use crate::{common::DEFAULT_BUF_SIZE, lz4f::Preferences, Error, ErrorKind};
use std::{cell::RefCell, ops::Deref};

/// Calculates the maximum size of the compressed output.
///
/// If `original_size` is too large to compress, this returns `0`.
///
/// Returned values are reliable only for [`compress`] and [`compress_to_vec`].
/// Streaming compressors may produce larger compressed frames.
///
/// [`compress`]: fn.compress.html
/// [`compress_to_vec`]: fn.compress_to_vec.html
#[must_use]
pub fn max_compressed_size(original_size: usize, prefs: &Preferences) -> usize {
    api::compress_frame_bound(original_size, prefs)
}

/// Performs LZ4F compression.
///
/// Ensure that the destination slice has enough capacity.
/// If `dst.len()` is smaller than `lz4f::max_compressed_size(src.len())`,
/// this function may fail.
///
/// Returns the number of bytes written into the destination buffer.
///
/// # Example
///
/// Compress data with the default compression mode:
/// ```
/// use lzzzz::lz4f;
///
/// let prefs = lz4f::Preferences::default();
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = [0u8; 2048];
///
/// // The slice should have enough capacity.
/// assert!(buf.len() >= lz4f::max_compressed_size(data.len(), &prefs));
///
/// let len = lz4f::compress(data, &mut buf, &prefs)?;
/// let compressed = &buf[..len];
/// # let mut buf = Vec::new();
/// # lz4f::decompress_to_vec(compressed, &mut buf)?;
/// # assert_eq!(buf.as_slice(), &data[..]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn compress(src: &[u8], dst: &mut [u8], prefs: &Preferences) -> Result<usize> {
    compress_to_ptr(src, dst.as_mut_ptr(), dst.len(), prefs)
}

fn compress_to_ptr(src: &[u8], dst: *mut u8, dst_len: usize, prefs: &Preferences) -> Result<usize> {
    let mut prefs = *prefs;
    if prefs.frame_info().content_size() > 0 {
        prefs.set_content_size(src.len());
    }
    api::compress(src, dst, dst_len, &prefs)
}

/// Appends a compressed frame to `Vec<u8>`.
///
/// Returns the number of bytes appended to the given `Vec<u8>`.
///
/// # Example
///
/// Compress data with the default compression mode:
/// ```
/// use lzzzz::lz4f;
///
/// let prefs = lz4f::Preferences::default();
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = Vec::new();
///
/// let len = lz4f::compress_to_vec(data, &mut buf, &prefs)?;
/// let compressed = &buf;
/// # let mut buf = Vec::new();
/// # lz4f::decompress_to_vec(compressed, &mut buf)?;
/// # assert_eq!(buf.as_slice(), &data[..]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn compress_to_vec(src: &[u8], dst: &mut Vec<u8>, prefs: &Preferences) -> Result<usize> {
    let orig_len = dst.len();
    dst.reserve(max_compressed_size(src.len(), prefs));
    #[allow(unsafe_code)]
    unsafe {
        let result = compress_to_ptr(
            src,
            dst.as_mut_ptr().add(orig_len),
            dst.capacity() - orig_len,
            prefs,
        );
        dst.set_len(orig_len + result.as_ref().unwrap_or(&0));
        result
    }
}

/// Decompresses an LZ4 frame.
///
/// Returns the number of bytes appended to the given `Vec<u8>`.
///
/// # Example
///
/// ```
/// use lzzzz::lz4f;
///
/// const COMPRESSED_DATA: &str =
///     "BCJNGGBAgiwAAIBUaGUgcXVpY2sgYnJvd24gZm94IGp1bXBzIG92ZXIgdGhlIGxhenkgZG9nLgAAAAA=";
///
/// let data = base64::decode(COMPRESSED_DATA).unwrap();
/// let mut buf = Vec::new();
///
/// lz4f::decompress_to_vec(&data[..], &mut buf)?;
///
/// assert_eq!(
///     &buf[..],
///     &b"The quick brown fox jumps over the lazy dog."[..]
/// );
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn decompress_to_vec(src: &[u8], dst: &mut Vec<u8>) -> Result<usize> {
    let header_len = dst.len();
    let mut src_offset = 0;
    let mut dst_offset = header_len;
    DecompressionCtx::with(|ctx| {
        let mut ctx = ctx.borrow_mut();
        ctx.reset();
        loop {
            dst.resize_with(dst.len() + DEFAULT_BUF_SIZE, Default::default);
            match ctx.decompress_dict(&src[src_offset..], &mut dst[dst_offset..], &[], false) {
                Ok((src_len, dst_len, expected)) => {
                    src_offset += src_len;
                    dst_offset += dst_len;
                    if expected == 0 {
                        dst.resize_with(dst_offset, Default::default);
                        return Ok(dst_offset - header_len);
                    } else if src_offset >= src.len() {
                        dst.resize_with(header_len, Default::default);
                        return Err(Error::new(ErrorKind::CompressedDataIncomplete).into());
                    }
                }
                Err(err) => {
                    dst.resize_with(header_len, Default::default);
                    return Err(err);
                }
            }
        }
    })
}

struct DecompressionCtx(RefCell<api::DecompressionContext>);

impl DecompressionCtx {
    fn new() -> Self {
        Self(RefCell::new(api::DecompressionContext::new().unwrap()))
    }

    fn with<F, R>(f: F) -> R
    where
        F: FnOnce(&RefCell<api::DecompressionContext>) -> R,
    {
        DECOMPRESSION_CTX.with(|state| (f)(state))
    }
}

impl Deref for DecompressionCtx {
    type Target = RefCell<api::DecompressionContext>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

thread_local!(static DECOMPRESSION_CTX: DecompressionCtx = DecompressionCtx::new());
