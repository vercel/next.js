use super::Decompressor;
use crate::lz4f::{FrameInfo, Result};
use std::{
    borrow::Cow,
    fmt,
    io::{BufRead, Read},
};

/// The [`BufRead`]-based streaming decompressor.
///
/// # Example
///
/// ```
/// # use std::env;
/// # use std::path::Path;
/// # use lzzzz::{Error, Result};
/// # use assert_fs::prelude::*;
/// # let tmp_dir = assert_fs::TempDir::new().unwrap().into_persistent();
/// # env::set_current_dir(tmp_dir.path()).unwrap();
/// #
/// # let mut buf = Vec::new();
/// # lzzzz::lz4f::compress_to_vec(b"Hello world!", &mut buf, &Default::default())?;
/// # tmp_dir.child("foo.lz4").write_binary(&buf).unwrap();
/// #
/// use lzzzz::lz4f::BufReadDecompressor;
/// use std::{
///     fs::File,
///     io::{prelude::*, BufReader},
/// };
///
/// let mut f = File::open("foo.lz4")?;
/// let mut b = BufReader::new(f);
/// let mut r = BufReadDecompressor::new(&mut b)?;
///
/// let mut buf = Vec::new();
/// r.read_to_end(&mut buf)?;
/// # Ok::<(), std::io::Error>(())
/// ```
///
/// [`BufRead`]: https://doc.rust-lang.org/std/io/trait.BufRead.html
pub struct BufReadDecompressor<'a, R: BufRead> {
    pub(super) inner: R,
    decomp: Decompressor<'a>,
    consumed: usize,
}

impl<'a, R: BufRead> BufReadDecompressor<'a, R> {
    /// Creates a new `BufReadDecompressor<R>`.
    pub fn new(reader: R) -> Result<Self> {
        Ok(Self {
            inner: reader,
            decomp: Decompressor::new()?,
            consumed: 0,
        })
    }

    /// Sets the dictionary.
    pub fn set_dict<D>(&mut self, dict: D)
    where
        D: Into<Cow<'a, [u8]>>,
    {
        self.decomp.set_dict(dict);
    }

    /// Reads the frame header and returns `FrameInfo`.
    ///
    /// Calling this function before any `Read` or `BufRead` operations
    /// does not consume the frame body.
    pub fn read_frame_info(&mut self) -> std::io::Result<FrameInfo> {
        loop {
            if let Some(frame) = self.decomp.frame_info() {
                return Ok(frame);
            }
            self.decomp.decode_header_only(true);
            let _ = self.read(&mut [])?;
            self.decomp.decode_header_only(false);
        }
    }

    /// Returns ownership of the reader.
    pub fn into_inner(self) -> R {
        self.inner
    }

    /// Returns a mutable reference to the reader.
    pub fn get_mut(&mut self) -> &mut R {
        &mut self.inner
    }

    /// Returns a shared reference to the reader.
    pub fn get_ref(&self) -> &R {
        &self.inner
    }
}

impl<R> fmt::Debug for BufReadDecompressor<'_, R>
where
    R: BufRead + fmt::Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("BufReadDecompressor")
            .field("reader", &self.inner)
            .finish()
    }
}

impl<R: BufRead> Read for BufReadDecompressor<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        loop {
            let inner_buf = self.inner.fill_buf()?;
            let consumed = self.decomp.decompress(inner_buf)?;
            self.inner.consume(consumed);
            if consumed == 0 {
                break;
            }
        }

        let len = std::cmp::min(buf.len(), self.decomp.buf().len() - self.consumed);
        buf[..len].copy_from_slice(&self.decomp.buf()[self.consumed..][..len]);
        self.consumed += len;
        if self.consumed >= self.decomp.buf().len() {
            self.decomp.clear_buf();
            self.consumed = 0;
        }
        Ok(len)
    }
}

impl<R: BufRead> BufRead for BufReadDecompressor<'_, R> {
    fn fill_buf(&mut self) -> std::io::Result<&[u8]> {
        let _ = self.read(&mut [])?;
        Ok(&self.decomp.buf()[self.consumed..])
    }

    fn consume(&mut self, amt: usize) {
        self.consumed += amt;
        if self.consumed >= self.decomp.buf().len() {
            self.decomp.clear_buf();
            self.consumed = 0;
        }
    }
}
