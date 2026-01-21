use core::mem::discriminant;
#[cfg(windows)]
use std::io::ErrorKind;
use std::{
    borrow::Cow,
    fmt::{self, Display},
    io,
};

use bincode::{Decode, Encode};
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

use crate::FileSystemPath;

pub type FsResult<T, E = FsError> = Result<T, E>;

#[cfg(windows)]
const ERROR_INVALID_FUNCTION: u32 = 1;

#[turbo_tasks::value]
#[derive(Debug)]
pub struct FsError {
    pub operation: FsErrorOperation,
    pub path: FileSystemPath,
    pub source: FsErrorSource,
}

impl FsError {
    fn io_error(&self) -> Option<&io::Error> {
        match &self.source {
            FsErrorSource::Io(err) => Some(err),
            _ => None,
        }
    }

    // It might be possible for this to return a `StyledString`, but we'd need to move
    // `StyledString` into a standalone crate.
    pub fn hint(&self) -> Option<Cow<'static, str>> {
        match (&self.operation, &self.source) {
            #[cfg(windows)]
            (
                FsErrorOperation::Link {
                    link_type: FsErrorLinkType::Symbolic,
                    ..
                },
                FsErrorSource::Io(err),
            ) if err.kind() == ErrorKind::PermissionDenied => Some(Cow::Borrowed(
                "Creating file symlinks on Windows require developer mode or admin permissions:\n\
                 https://learn.microsoft.com/en-us/windows/advanced-settings/developer-mode",
            )),
            #[cfg(windows)]
            (
                FsErrorOperation::Link {
                    link_type: FsErrorLinkType::Junction,
                    ..
                },
                FsErrorSource::Io(err),
            ) if err.raw_os_error() == Some(ERROR_INVALID_FUNCTION) => Some(Cow::Borrowed(
                "Creating junction points on Windows requires support from the filesystem. Check \
                 that you're using an NTFS filesystem.",
            )),
            _ => None,
        }
    }
}

impl std::error::Error for FsError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.io_error().map(|err| err as &dyn std::error::Error)
    }
}

/// Note: The `Display` implementation for `FsError` exists as a fallback, but is not typically used
/// in Turbopack. Turbopack should usually transform `FsError`s into an `Issue` and use that for
/// display purposes.
///
/// There is an implementation of `Issue` for `FsError` in `turbopack-core/src/issue/fs_error.rs`.
///
/// Some of the `Display` implementations of the fields on `FsError` are used by the `Issue`
/// implementation.
impl Display for FsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Failed to {} at {}: {}",
            self.operation, self.path, self.source,
        )
    }
}

#[derive(Debug, Eq, PartialEq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub enum FsErrorOperation {
    Write,
    Link {
        link_type: FsErrorLinkType,
        target: FileSystemPath,
    },
}

impl Display for FsErrorOperation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Write => write!(f, "write to file"),
            Self::Link { link_type, target } => {
                write!(f, "create a {link_type} pointing to {target}")
            }
        }
    }
}

#[derive(Debug, Eq, PartialEq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub enum FsErrorLinkType {
    Symbolic,
    #[cfg(windows)]
    Junction,
}

impl Display for FsErrorLinkType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Symbolic => write!(f, "symbolic link"),
            #[cfg(windows)]
            Self::Junction => write!(f, "junction point"),
        }
    }
}

#[derive(Debug, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub enum FsErrorSource {
    Io(
        #[bincode(with = "bincode_io_error")]
        #[turbo_tasks(trace_ignore)]
        io::Error,
    ),
    /// During reads, a denied path is treated as non-existent, but during writes, we generate an
    /// error.
    DeniedPath,
    InvalidLinkTarget,
}

impl PartialEq for FsErrorSource {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Io(l), Self::Io(r)) => l.to_string() == r.to_string(),
            _ => discriminant(self) == discriminant(other),
        }
    }
}

impl Eq for FsErrorSource {}

impl Display for FsErrorSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FsErrorSource::Io(err) => err.fmt(f),
            FsErrorSource::DeniedPath => write!(f, "access to this path is restricted"),
            FsErrorSource::InvalidLinkTarget => write!(f, "link target is invalid"),
        }
    }
}

/// Best effort string-based serialization for `io::Error`. Most of the functions that construct an
/// `FsError` are either effects or are marked as session-dependent, so most io errors won't be
/// serialized.
mod bincode_io_error {

    use std::io;

    use bincode::{
        Decode, Encode,
        de::{BorrowDecoder, Decoder},
        enc::Encoder,
        error::{DecodeError, EncodeError},
    };

    pub fn encode<E: Encoder>(err: &io::Error, encoder: &mut E) -> Result<(), EncodeError> {
        err.to_string().encode(encoder)
    }

    pub fn decode<Context, D: Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<io::Error, DecodeError> {
        let message = String::decode(decoder)?;
        Ok(io::Error::other(message))
    }

    pub fn borrow_decode<'de, Context, D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<io::Error, DecodeError> {
        decode(decoder)
    }

    #[cfg(test)]
    mod tests {
        use std::io::{self, ErrorKind};

        use bincode::{Decode, Encode, decode_from_slice, encode_to_vec};

        #[derive(Encode, Decode)]
        struct Wrapper(#[bincode(with = "super")] io::Error);

        #[test]
        fn test_roundtrip() {
            let cfg = bincode::config::standard();

            let err1 = Wrapper(io::Error::new(ErrorKind::NotFound, "file not found"));
            let err2: Wrapper = decode_from_slice(&encode_to_vec(&err1, cfg).unwrap(), cfg)
                .unwrap()
                .0;

            // The `Display` implementation is equivalent
            assert_eq!(err1.0.to_string(), err2.0.to_string());
            // The kind becomes Other after roundtrip
            assert_eq!(err2.0.kind(), ErrorKind::Other);
        }
    }
}
