mod api;

use crate::{common::DICTIONARY_SIZE, lz4, lz4_hc::FavorDecSpeed, Result};
use api::CompressionContext;
use std::{borrow::Cow, cmp, io::Cursor, pin::Pin};

/// Streaming LZ4_HC compressor.
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
/// let mut comp = lz4_hc::Compressor::new()?;
/// let len = comp.next(data, &mut buf)?;
/// let compressed = &buf[..len];
///
/// # let mut buf = [0u8; 256];
/// # let len = lz4::decompress(compressed, &mut buf[..data.len()])?;
/// # assert_eq!(&buf[..len], &data[..]);
/// # Ok::<(), std::io::Error>(())
/// ```
pub struct Compressor<'a> {
    ctx: CompressionContext,
    dict: Pin<Cow<'a, [u8]>>,
    safe_buf: Vec<u8>,
}

impl<'a> Compressor<'a> {
    /// Creates a new `Compressor`.
    pub fn new() -> Result<Self> {
        Ok(Self {
            ctx: CompressionContext::new()?,
            dict: Pin::new(Cow::Borrowed(&[])),
            safe_buf: Vec::new(),
        })
    }

    /// Creates a new `Compressor` with a dictionary.
    pub fn with_dict<D>(dict: D, compression_level: i32) -> Result<Self>
    where
        D: Into<Cow<'a, [u8]>>,
    {
        // Note(sewer56).
        // The LZ4 documentation states the following:
        // - In order for LZ4_loadDictHC() to create the correct data structure,
        //   it is essential to set the compression level _before_ loading the dictionary.
        // Therefore this API requires a `compression_level`.

        let mut comp = Self {
            dict: Pin::new(dict.into()),
            ..Self::new()?
        };

        comp.ctx.set_compression_level(compression_level);
        comp.ctx.load_dict(&comp.dict);
        Ok(comp)
    }

    /// Sets the compression level.
    pub fn set_compression_level(&mut self, level: i32) {
        self.ctx.set_compression_level(level);
    }

    /// Sets the decompression speed mode flag.
    pub fn set_favor_dec_speed(&mut self, dec_speed: FavorDecSpeed) {
        self.ctx
            .set_favor_dec_speed(dec_speed == FavorDecSpeed::Enabled);
    }

    /// Performs LZ4_HC streaming compression.
    ///
    /// Returns the number of bytes written into the destination buffer.
    pub fn next(&mut self, src: &[u8], dst: &mut [u8]) -> Result<usize> {
        self.next_to_ptr(src, dst.as_mut_ptr(), dst.len())
    }

    fn next_to_ptr(&mut self, src: &[u8], dst: *mut u8, dst_len: usize) -> Result<usize> {
        let result = self.ctx.next(src, dst, dst_len)?;
        self.save_dict();
        Ok(result)
    }

    /// Performs LZ4_HC streaming compression to fill `dst`.
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
    ///
    /// let mut smallbuf = [0u8; 32];
    /// assert!(smallbuf.len() < lz4::max_compressed_size(data.len()));
    ///
    /// let mut comp = lz4_hc::Compressor::new()?;
    /// let (read, wrote) = comp.next_fill(data, &mut smallbuf)?;
    /// let remaining_data = &data[read..];
    ///
    /// # let mut buf = [0u8; 256];
    /// # let len = lz4::decompress(&smallbuf, &mut buf)?;
    /// # assert_eq!(&buf[..len], &data[..read]);
    /// # Ok::<(), std::io::Error>(())
    /// ```
    pub fn next_fill(&mut self, src: &[u8], dst: &mut [u8]) -> Result<(usize, usize)> {
        let (src_len, dst_len) = self.ctx.next_partial(src, dst)?;
        self.save_dict();
        Ok((src_len, dst_len))
    }

    /// Compresses data until the destination slice fills up.
    ///
    /// Returns the number of bytes written into the destination buffer.
    #[deprecated(since = "1.1.0", note = "Use next_fill instead.")]
    pub fn next_partial<T>(&mut self, src: &mut Cursor<T>, dst: &mut [u8]) -> Result<usize>
    where
        T: AsRef<[u8]>,
    {
        let src_ref = src.get_ref().as_ref();
        let pos = cmp::min(src_ref.len(), src.position() as usize);
        let src_ref = &src_ref[pos..];
        let (src_len, dst_len) = self.ctx.next_partial(src_ref, dst)?;
        src.set_position(src.position() + src_len as u64);
        self.save_dict();
        Ok(dst_len)
    }

    /// Appends a compressed frame to `Vec<u8>`.
    ///
    /// Returns the number of bytes appended to the given `Vec<u8>`.
    pub fn next_to_vec(&mut self, src: &[u8], dst: &mut Vec<u8>) -> Result<usize> {
        let orig_len = dst.len();
        dst.reserve(lz4::max_compressed_size(src.len()));
        #[allow(unsafe_code)]
        unsafe {
            let result = self.next_to_ptr(
                src,
                dst.as_mut_ptr().add(orig_len),
                dst.capacity() - orig_len,
            );
            dst.set_len(orig_len + result.as_ref().unwrap_or(&0));
            result
        }
    }

    fn save_dict(&mut self) {
        self.safe_buf.resize(DICTIONARY_SIZE, 0);
        self.ctx.save_dict(&mut self.safe_buf);
    }

    /// Attaches a dictionary stream for efficient dictionary reuse.
    ///
    /// This allows efficient re-use of a static dictionary multiple times by referencing
    /// the dictionary stream in-place rather than copying it.
    ///
    /// # Arguments
    ///
    /// * `dict_stream` - The dictionary stream to attach, or None to unset any existing dictionary
    /// * `compression_level` - The compression level to use (CLEVEL_MIN to CLEVEL_MAX)
    ///
    /// # Notes
    ///
    /// - The dictionary stream must have been prepared using `with_dict()`
    /// - The dictionary will only remain attached through the first compression call
    /// - The dictionary stream (and its source buffer) must remain valid through the compression session
    ///
    /// # Example
    ///
    /// ```
    /// use lzzzz::lz4_hc;
    ///
    /// let dict_data = b"dictionary data";
    /// let data = b"data to compress";
    ///
    /// // Create dictionary stream
    /// let dict_comp = lz4_hc::Compressor::with_dict(dict_data, lz4_hc::CLEVEL_DEFAULT)?;
    ///
    /// // Create working stream and attach dictionary
    /// let mut comp = lz4_hc::Compressor::new()?;
    /// comp.attach_dict(Some(&dict_comp), lz4_hc::CLEVEL_DEFAULT);
    ///
    /// // Compress data using the attached dictionary
    /// let mut buf = [0u8; 256];
    /// let len = comp.next(data, &mut buf)?;
    /// # Ok::<(), std::io::Error>(())
    /// ```
    pub fn attach_dict(&mut self, dict_stream: Option<&Compressor<'a>>, compression_level: i32) {
        if let Some(dict) = dict_stream {
            self.ctx.attach_dict(Some(&dict.ctx), compression_level);
        } else {
            self.ctx.attach_dict(None, compression_level);
        }
    }
}
