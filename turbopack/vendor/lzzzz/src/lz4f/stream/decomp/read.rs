use super::BufReadDecompressor;
use crate::lz4f::{FrameInfo, Result};
use std::{
    borrow::Cow,
    fmt,
    io::{BufReader, Read},
};

/// The [`Read`]-based streaming decompressor.
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
/// use lzzzz::lz4f::ReadDecompressor;
/// use std::{fs::File, io::prelude::*};
///
/// let mut f = File::open("foo.lz4")?;
/// let mut r = ReadDecompressor::new(&mut f)?;
///
/// let mut buf = Vec::new();
/// r.read_to_end(&mut buf)?;
/// # Ok::<(), std::io::Error>(())
/// ```
///
/// [`Read`]: https://doc.rust-lang.org/std/io/trait.Read.html
pub struct ReadDecompressor<'a, R: Read> {
    inner: BufReadDecompressor<'a, BufReader<R>>,
}

impl<R> fmt::Debug for ReadDecompressor<'_, R>
where
    R: Read + fmt::Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("ReadDecompressor")
            .field("reader", &self.inner.inner.get_ref())
            .finish()
    }
}

impl<'a, R: Read> ReadDecompressor<'a, R> {
    /// Creates a new `ReadDecompressor<R>`.
    pub fn new(reader: R) -> Result<Self> {
        Ok(Self {
            inner: BufReadDecompressor::new(BufReader::new(reader))?,
        })
    }

    /// Sets the dictionary.
    pub fn set_dict<D>(&mut self, dict: D)
    where
        D: Into<Cow<'a, [u8]>>,
    {
        self.inner.set_dict(dict);
    }

    /// Reads the frame header and returns `FrameInfo`.
    ///
    /// Calling this function before any `Read` operations
    /// does not consume the frame body.
    pub fn read_frame_info(&mut self) -> std::io::Result<FrameInfo> {
        self.inner.read_frame_info()
    }

    /// Returns ownership of the reader.
    pub fn into_inner(self) -> R {
        self.inner.into_inner().into_inner()
    }

    /// Returns a mutable reference to the reader.
    pub fn get_mut(&mut self) -> &mut R {
        self.inner.get_mut().get_mut()
    }

    /// Returns a shared reference to the reader.
    pub fn get_ref(&self) -> &R {
        self.inner.get_ref().get_ref()
    }
}

impl<R: Read> Read for ReadDecompressor<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.inner.read(buf)
    }
}
