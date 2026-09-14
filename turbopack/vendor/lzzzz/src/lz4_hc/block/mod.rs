mod api;

use crate::{lz4, Error, ErrorKind, Result};
use api::ExtState;
use std::{cmp, io::Cursor};

/// Performs LZ4_HC block compression.
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
/// use lzzzz::{lz4, lz4_hc};
///
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = [0u8; 256];
///
/// // The slice should have enough capacity.
/// assert!(buf.len() >= lz4::max_compressed_size(data.len()));
///
/// let len = lz4_hc::compress(data, &mut buf, lz4_hc::CLEVEL_DEFAULT)?;
/// let compressed = &buf[..len];
///
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(
/// #     compressed,
/// #     &mut buf[..data.len()],
/// # )?;
/// # assert_eq!(&buf[..len], &data[..]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn compress(src: &[u8], dst: &mut [u8], level: i32) -> Result<usize> {
    compress_to_ptr(src, dst.as_mut_ptr(), dst.len(), level)
}

fn compress_to_ptr(src: &[u8], dst: *mut u8, dst_len: usize, level: i32) -> Result<usize> {
    if src.is_empty() {
        return Ok(0);
    }
    let len = ExtState::with(|state, reset| {
        if reset {
            api::compress_ext_state_fast_reset(&mut state.borrow_mut(), src, dst, dst_len, level)
        } else {
            api::compress_ext_state(&mut state.borrow_mut(), src, dst, dst_len, level)
        }
    });
    if len > 0 {
        Ok(len)
    } else {
        Err(Error::new(ErrorKind::CompressionFailed))
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
/// use lzzzz::{lz4, lz4_hc};
///
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = [0u8; 256];
///
/// // This slice should have enough capacity.
/// assert!(buf.len() >= lz4::max_compressed_size(data.len()));
///
/// let (read, wrote) = lz4_hc::compress_fill(data, &mut buf, lz4_hc::CLEVEL_DEFAULT)?;
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
/// let (read, wrote) = lz4_hc::compress_fill(data, &mut smallbuf, lz4_hc::CLEVEL_DEFAULT)?;
/// assert_eq!(wrote, smallbuf.len());
/// let remaining_data = &data[read..];
///
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(&smallbuf, &mut buf)?;
/// # assert_eq!(&buf[..len], &data[..read]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn compress_fill(src: &[u8], dst: &mut [u8], level: i32) -> Result<(usize, usize)> {
    if src.is_empty() {
        return Ok((0, 0));
    }
    let (read, wrote) = ExtState::with(|state, _reset| {
        api::compress_dest_size(&mut state.borrow_mut(), src, dst, level)
    });
    if wrote > 0 {
        Ok((read, wrote))
    } else {
        Err(Error::new(ErrorKind::CompressionFailed))
    }
}

/// Compresses data until the destination slice fills up.
///
/// Returns the number of bytes written into the destination buffer.
///
/// # Example
///
/// ```
/// use lzzzz::{lz4, lz4_hc};
/// use std::io::Cursor;
///
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = [0u8; 16];
///
/// let mut src = Cursor::new(&data[..]);
/// let len = lz4_hc::compress_partial(&mut src, &mut buf, lz4_hc::CLEVEL_DEFAULT)?;
/// let compressed = &buf[..len];
///
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(
/// #     compressed,
/// #     &mut buf[..data.len()],
/// # )?;
/// # assert_eq!(&buf[..len], &data[..src.position() as usize]);
/// # Ok::<(), std::io::Error>(())
/// ```
#[deprecated(since = "1.1.0", note = "Use compress_fill instead.")]
pub fn compress_partial<T>(src: &mut Cursor<T>, dst: &mut [u8], level: i32) -> Result<usize>
where
    T: AsRef<[u8]>,
{
    let src_ref = src.get_ref().as_ref();
    let pos = cmp::min(src_ref.len(), src.position() as usize);
    let src_ref = &src_ref[pos..];
    if src_ref.is_empty() || dst.is_empty() {
        return Ok(0);
    }
    let (src_len, dst_len) = ExtState::with(|state, _| {
        api::compress_dest_size(&mut state.borrow_mut(), src_ref, dst, level)
    });
    src.set_position(src.position() + src_len as u64);
    Ok(dst_len)
}

/// Appends compressed data to `Vec<u8>`.
///
/// Returns the number of bytes appended to the given `Vec<u8>`.
///
/// # Example
///
/// ```
/// use lzzzz::{lz4, lz4_hc};
///
/// let data = b"The quick brown fox jumps over the lazy dog.";
/// let mut buf = Vec::new();
///
/// lz4_hc::compress_to_vec(data, &mut buf, lz4_hc::CLEVEL_DEFAULT)?;
///
/// # let compressed = &buf;
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(
/// #     compressed,
/// #     &mut buf[..data.len()],
/// # )?;
/// # assert_eq!(&buf[..len], &data[..]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn compress_to_vec(src: &[u8], dst: &mut Vec<u8>, level: i32) -> Result<usize> {
    let orig_len = dst.len();
    dst.reserve(lz4::max_compressed_size(src.len()));
    #[allow(unsafe_code)]
    unsafe {
        let result = compress_to_ptr(
            src,
            dst.as_mut_ptr().add(orig_len),
            dst.capacity() - orig_len,
            level,
        );
        dst.set_len(orig_len + result.as_ref().unwrap_or(&0));
        result
    }
}
