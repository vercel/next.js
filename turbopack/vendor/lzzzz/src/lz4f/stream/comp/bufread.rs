use super::{Compressor, Dictionary, Preferences};
use crate::lz4f::Result;
use std::{
    fmt,
    io::{BufRead, Read},
};

/// The [`BufRead`]-based streaming compressor.
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
/// # tmp_dir.child("foo.txt").write_str("Hello").unwrap();
/// #
/// use lzzzz::lz4f::BufReadCompressor;
/// use std::{
///     fs::File,
///     io::{prelude::*, BufReader},
/// };
///
/// let mut f = File::open("foo.txt")?;
/// let mut b = BufReader::new(f);
/// let mut r = BufReadCompressor::new(&mut b, Default::default())?;
///
/// let mut buf = Vec::new();
/// r.read_to_end(&mut buf)?;
/// # Ok::<(), std::io::Error>(())
/// ```
///
/// [`BufRead`]: https://doc.rust-lang.org/std/io/trait.BufRead.html
pub struct BufReadCompressor<R: BufRead> {
    pub(super) inner: R,
    pub(super) comp: Compressor,
    consumed: usize,
}

impl<R: BufRead> BufReadCompressor<R> {
    /// Creates a new `BufReadCompressor<R>`.
    pub fn new(reader: R, prefs: Preferences) -> Result<Self> {
        Ok(Self {
            inner: reader,
            comp: Compressor::new(prefs, None)?,
            consumed: 0,
        })
    }

    /// Creates a new `BufReadCompressor<R>` with a dictionary.
    pub fn with_dict(reader: R, prefs: Preferences, dict: Dictionary) -> Result<Self> {
        Ok(Self {
            inner: reader,
            comp: Compressor::new(prefs, Some(dict))?,
            consumed: 0,
        })
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

impl<R> fmt::Debug for BufReadCompressor<R>
where
    R: BufRead + fmt::Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("BufReadCompressor")
            .field("reader", &self.inner)
            .field("prefs", &self.comp.prefs())
            .finish()
    }
}

impl<R: BufRead> Read for BufReadCompressor<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let consumed = {
            let inner_buf = self.inner.fill_buf()?;
            if inner_buf.is_empty() {
                self.comp.end(false)?;
                if self.comp.buf().is_empty() {
                    return Ok(0);
                }
                0
            } else {
                self.comp.update(inner_buf, false)?;
                inner_buf.len()
            }
        };
        self.inner.consume(consumed);

        let len = std::cmp::min(buf.len(), self.comp.buf().len() - self.consumed);
        buf[..len].copy_from_slice(&self.comp.buf()[self.consumed..][..len]);
        self.consumed += len;
        if self.consumed >= self.comp.buf().len() {
            self.comp.clear_buf();
            self.consumed = 0;
        }
        Ok(len)
    }
}

impl<R: BufRead> BufRead for BufReadCompressor<R> {
    fn fill_buf(&mut self) -> std::io::Result<&[u8]> {
        let _ = self.read(&mut [])?;
        Ok(&self.comp.buf()[self.consumed..])
    }

    fn consume(&mut self, amt: usize) {
        self.consumed += amt;
        if self.consumed >= self.comp.buf().len() {
            self.comp.clear_buf();
            self.consumed = 0;
        }
    }
}
