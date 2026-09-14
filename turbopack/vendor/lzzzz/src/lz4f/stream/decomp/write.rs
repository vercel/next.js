use crate::lz4f::{Decompressor, FrameInfo, Result};
use std::{borrow::Cow, fmt, io::Write};

/// The [`Write`]-based streaming decompressor.
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
/// use lzzzz::lz4f::{compress_to_vec, WriteDecompressor};
/// use std::{fs::File, io::prelude::*};
///
/// let mut f = File::create("foo.txt")?;
/// let mut w = WriteDecompressor::new(&mut f)?;
///
/// let mut buf = Vec::new();
/// compress_to_vec(b"Hello world!", &mut buf, &Default::default())?;
///
/// w.write_all(&buf)?;
/// # Ok::<(), std::io::Error>(())
/// ```
///
/// [`Write`]: https://doc.rust-lang.org/std/io/trait.Write.html
pub struct WriteDecompressor<'a, W: Write> {
    inner: W,
    decomp: Decompressor<'a>,
}

impl<'a, W: Write> WriteDecompressor<'a, W> {
    /// Creates a new `WriteDecompressor<W>`.
    pub fn new(writer: W) -> Result<Self> {
        Ok(Self {
            inner: writer,
            decomp: Decompressor::new()?,
        })
    }

    /// Sets the dictionary.
    pub fn set_dict<D>(&mut self, dict: D)
    where
        D: Into<Cow<'a, [u8]>>,
    {
        self.decomp.set_dict(dict);
    }

    /// Returns `FrameInfo` if the frame header is already decoded.
    /// Otherwise, returns `None`.
    pub fn frame_info(&self) -> Option<FrameInfo> {
        self.decomp.frame_info()
    }

    /// Sets the 'header-only' mode.
    ///
    /// When the 'header-only' mode is enabled, the decompressor doesn't
    /// consume the frame body and `write()` always returns `Ok(0)`
    /// if the frame header is already decoded.
    pub fn decode_header_only(&mut self, flag: bool) {
        self.decomp.decode_header_only(flag);
    }

    /// Returns a mutable reference to the writer.
    pub fn get_mut(&mut self) -> &mut W {
        &mut self.inner
    }

    /// Returns a shared reference to the writer.
    pub fn get_ref(&self) -> &W {
        &self.inner
    }

    /// Returns ownership of the writer.
    pub fn into_inner(self) -> W {
        self.inner
    }
}

impl<W> fmt::Debug for WriteDecompressor<'_, W>
where
    W: Write + fmt::Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("WriteDecompressor")
            .field("writer", &self.inner)
            .finish()
    }
}

impl<W: Write> Write for WriteDecompressor<'_, W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let report = self.decomp.decompress(buf)?;
        self.inner.write_all(self.decomp.buf())?;
        self.decomp.clear_buf();
        Ok(report)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}
