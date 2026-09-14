mod api;

use crate::{Error, ErrorKind, Result};
use api::ExtState;
use std::cmp;

/// Calculates the maximum size of the compressed output.
///
/// If `original_size` is too large to compress, this returns `0`.
#[must_use]
pub const fn max_compressed_size(original_size: usize) -> usize {
    api::compress_bound(original_size)
}

/// Performs LZ4 block compression.
///
/// Ensure that the destination slice has enough capacity.
/// If `dst.len()` is smaller than `lz4::max_compressed_size(src.len())`,
/// this function may fail.
///
/// Returns the number of bytes written into the destination buffer.
///
/// # Example
///
/// ```
/// use lzzzz::lz4;
///
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = [0u8; 256];
///
/// // The slice should have enough capacity.
/// assert!(buf.len() >= lz4::max_compressed_size(data.len()));
///
/// let len = lz4::compress(data, &mut buf, lz4::ACC_LEVEL_DEFAULT)?;
/// let compressed = &buf[..len];
///
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(compressed, &mut buf[..data.len()])?;
/// # assert_eq!(&buf[..len], &data[..]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn compress(src: &[u8], dst: &mut [u8], acc: i32) -> Result<usize> {
    compress_to_ptr(src, dst.as_mut_ptr(), dst.len(), acc)
}

fn compress_to_ptr(src: &[u8], dst: *mut u8, dst_len: usize, acc: i32) -> Result<usize> {
    if src.is_empty() {
        return Ok(0);
    }

    let acc = cmp::min(acc, 33_554_431);

    let len = ExtState::with(|state, reset| {
        let mut state = state.borrow_mut();
        if reset {
            api::compress_fast_ext_state_fast_reset(&mut state, src, dst, dst_len, acc)
        } else {
            api::compress_fast_ext_state(&mut state, src, dst, dst_len, acc)
        }
    });
    if len > 0 {
        Ok(len)
    } else {
        Err(Error::new(ErrorKind::CompressionFailed))
    }
}

/// Appends compressed data to `Vec<u8>`.
///
/// Returns the number of bytes appended to the given `Vec<u8>`.
///
/// # Example
///
/// ```
/// use lzzzz::lz4;
///
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = Vec::new();
///
/// lz4::compress_to_vec(data, &mut buf, lz4::ACC_LEVEL_DEFAULT)?;
/// # let compressed = &buf;
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(compressed, &mut buf[..data.len()])?;
/// # assert_eq!(&buf[..len], &data[..]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn compress_to_vec(src: &[u8], dst: &mut Vec<u8>, acc: i32) -> Result<usize> {
    let orig_len = dst.len();
    dst.reserve(max_compressed_size(src.len()));
    #[allow(unsafe_code)]
    unsafe {
        let result = compress_to_ptr(
            src,
            dst.as_mut_ptr().add(orig_len),
            dst.capacity() - orig_len,
            acc,
        );
        dst.set_len(orig_len + result.as_ref().unwrap_or(&0));
        result
    }
}

/// Compress data to fill `dst`.
///
/// This function either compresses the entire `src` buffer into `dst` if it's
/// large enough, or will fill `dst` with as much data as possible from `src`.
///
/// Returns a pair `(read, wrote)` giving the number of bytes read from `src`
/// and the number of bytes written to `dst`.
///
/// # Example
///
/// ```
/// use lzzzz::lz4;
///
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = [0u8; 256];
///
/// // This slice should have enough capacity.
/// assert!(buf.len() >= lz4::max_compressed_size(data.len()));
///
/// let (read, wrote) = lz4::compress_fill(data, &mut buf)?;
/// assert_eq!(read, data.len());
/// let compressed = &buf[..wrote];
///
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(compressed, &mut buf[..data.len()])?;
/// # assert_eq!(&buf[..len], &data[..]);
///
/// // This slice doesn't have enough capacity, but we can fill it.
/// let mut smallbuf = [0u8; 32];
/// assert!(smallbuf.len() < lz4::max_compressed_size(data.len()));
///
/// let (read, wrote) = lz4::compress_fill(data, &mut smallbuf)?;
/// assert_eq!(wrote, smallbuf.len());
/// let remaining_data = &data[read..];
///
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(&smallbuf, &mut buf)?;
/// # assert_eq!(&buf[..len], &data[..read]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn compress_fill(src: &[u8], dst: &mut [u8]) -> Result<(usize, usize)> {
    api::compress_dest_size(src, dst)
}

/// Decompresses an LZ4 block.
///
/// The length of the destination slice must be equal to the original data length.
///
/// Returns the number of bytes written into the destination buffer.
///
/// # Example
///
/// ```
/// use lzzzz::lz4;
///
/// const ORIGINAL_SIZE: usize = 44;
/// const COMPRESSED_DATA: &str =
///     "8B1UaGUgcXVpY2sgYnJvd24gZm94IGp1bXBzIG92ZXIgdGhlIGxhenkgZG9nLg==";
///
/// let data = base64::decode(COMPRESSED_DATA).unwrap();
/// let mut buf = [0u8; ORIGINAL_SIZE];
///
/// lz4::decompress(&data[..], &mut buf[..])?;
///
/// assert_eq!(
///     &buf[..],
///     &b"The quick brown fox jumps over the lazy dog."[..]
/// );
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn decompress(src: &[u8], dst: &mut [u8]) -> Result<usize> {
    api::decompress_safe(src, dst)
}

/// Decompresses an LZ4 block until the destination slice fills up.
///
/// Returns the number of bytes written into the destination buffer.
///
/// # Example
///
/// ```
/// use lzzzz::lz4;
///
/// const ORIGINAL_SIZE: usize = 44;
/// const COMPRESSED_DATA: &str =
///     "8B1UaGUgcXVpY2sgYnJvd24gZm94IGp1bXBzIG92ZXIgdGhlIGxhenkgZG9nLg==";
///
/// let data = base64::decode(COMPRESSED_DATA).unwrap();
/// let mut buf = [0u8; 24];
///
/// lz4::decompress_partial(&data[..], &mut buf[..], ORIGINAL_SIZE)?;
///
/// assert_eq!(&buf[..], &b"The quick brown fox jump"[..]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn decompress_partial(src: &[u8], dst: &mut [u8], original_size: usize) -> Result<usize> {
    api::decompress_safe_partial(src, dst, original_size)
}

/// Decompresses an LZ4 block with a dictionary.
///
/// Returns the number of bytes written into the destination buffer.
///
/// # Example
///
/// ```
/// use lzzzz::lz4;
///
/// const ORIGINAL_SIZE: usize = 44;
/// const COMPRESSED_DATA: &str = "DywAFFAgZG9nLg==";
/// const DICT_DATA: &[u8] = b"The quick brown fox jumps over the lazy cat.";
///
/// let data = base64::decode(COMPRESSED_DATA).unwrap();
/// let mut buf = [0u8; ORIGINAL_SIZE];
///
/// lz4::decompress_with_dict(&data[..], &mut buf[..], DICT_DATA)?;
///
/// assert_eq!(
///     &buf[..],
///     &b"The quick brown fox jumps over the lazy dog."[..]
/// );
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn decompress_with_dict(src: &[u8], dst: &mut [u8], dict: &[u8]) -> Result<usize> {
    api::decompress_safe_using_dict(src, dst, dict)
}

/// Decompresses an LZ4 block with a dictionary until the destination slice fills up.
///
/// Returns the number of bytes written into the destination buffer.
///
/// # Example
///
/// ```
/// use lzzzz::lz4;
///
/// const ORIGINAL_SIZE: usize = 44;
/// const COMPRESSED_DATA: &str = "DywAFFAgZG9nLg==";
/// const DICT_DATA: &[u8] = b"The quick brown fox jumps over the lazy cat.";
///
/// let data = base64::decode(COMPRESSED_DATA).unwrap();
/// let mut buf = [0u8; 24];
///
/// lz4::decompress_partial_with_dict(&data[..], &mut buf[..], ORIGINAL_SIZE, DICT_DATA)?;
///
/// assert_eq!(
///     &buf[..],
///     &b"The quick brown fox jump"[..]
/// );
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn decompress_partial_with_dict(
    src: &[u8],
    dst: &mut [u8],
    original_size: usize,
    dict: &[u8],
) -> Result<usize> {
    api::decompress_safe_partial_using_dict(src, dst, original_size, dict)
}
