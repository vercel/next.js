use std::{convert, error, fmt, io, result};

/// A list specifying general categories of LZ4 error.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ErrorKind {
    /// The state initialization failed for some reason.
    InitializationFailed,
    /// The compression failed for some reason.
    CompressionFailed,
    /// The decompression failed for some reason.
    DecompressionFailed,
    /// The frame header had an invalid value.
    FrameHeaderInvalid,
    /// The decompressor reached unexpected EOF.
    CompressedDataIncomplete,
    /// Dictionary data was not consistent during the streaming decompression.
    DictionaryChangedDuringDecompression,
}

impl fmt::Display for ErrorKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> result::Result<(), fmt::Error> {
        <Self as fmt::Debug>::fmt(self, f)
    }
}

/// The error type for LZ4 operations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Error {
    kind: ErrorKind,
}

impl Error {
    pub(crate) const fn new(kind: ErrorKind) -> Self {
        Self { kind }
    }

    /// Returns the corresponding `ErrorKind` for this error.
    pub const fn kind(self) -> ErrorKind {
        self.kind
    }
}

impl convert::From<Error> for io::Error {
    fn from(err: Error) -> Self {
        Self::new(io::ErrorKind::Other, err)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> result::Result<(), fmt::Error> {
        <ErrorKind as fmt::Display>::fmt(&self.kind, f)
    }
}

impl error::Error for Error {}

/// A specialized [`Result`] type for LZ4 operations.
///
/// [`Result`]: https://doc.rust-lang.org/std/result/enum.Result.html
pub type Result<T> = result::Result<T, Error>;
