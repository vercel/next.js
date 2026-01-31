use core::mem::discriminant;
#[cfg(windows)]
use std::io::ErrorKind;
use std::{
    borrow::Cow,
    fmt::{self, Display},
    io,
};

use bincode::{Decode, Encode};
use turbo_tasks::{NonLocalValue, ReadRef, trace::TraceRawVcs};

use crate::{FileSystemPath, LinkContent};

pub type FsResult<T, E = FsError> = Result<T, E>;

#[cfg(windows)]
const ERROR_INVALID_FUNCTION: i32 = 1;

#[turbo_tasks::value]
#[derive(Debug)]
pub struct FsError {
    pub operation: FsErrorOperation,
    pub path: FileSystemPath,
    pub source: FsErrorSource,
}

impl FsError {
    // It might be possible for this to return a `StyledString`, but we'd need to move
    // `StyledString` into a standalone crate.
    pub fn hint(&self) -> Option<Cow<'static, str>> {
        #[cfg(windows)]
        use std::io::ErrorKind;
        match (&self.operation, &self.source) {
            #[cfg(windows)]
            (
                FsErrorOperation::Link {
                    creation_method: LinkCreationMethod::Symbolic,
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
                    creation_method: LinkCreationMethod::Junction,
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
        match &self.source {
            FsErrorSource::Io(err) => Some(err as &dyn std::error::Error),
            FsErrorSource::Anyhow(err) => err.source(),
            _ => None,
        }
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
        creation_method: LinkCreationMethod,
        content: ReadRef<LinkContent>,
    },
}

impl Display for FsErrorOperation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Write => write!(f, "write to file"),
            Self::Link {
                creation_method,
                content,
            } => match &**content {
                LinkContent::Link { target, .. } => {
                    write!(f, "create a {creation_method} pointing to {target}")
                }
                LinkContent::Invalid => {
                    write!(f, "create a {creation_method} (invalid target)")
                }
                LinkContent::NotFound => {
                    write!(f, "remove a {creation_method}")
                }
            },
        }
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub enum LinkCreationMethod {
    Symbolic,
    #[cfg(windows)]
    Junction,
    /// The creation method could not be determined.
    Unknown,
}

impl Display for LinkCreationMethod {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Symbolic => write!(f, "symbolic link"),
            #[cfg(windows)]
            Self::Junction => write!(f, "junction point"),
            Self::Unknown => write!(f, "link"),
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
    InvalidLinkTarget,
    /// Path segment exceeds the maximum length (typically 255 bytes on Unix)
    PathSegmentTooLong {
        max_length: usize,
    },
    /// Full path exceeds the maximum length
    PathTooLong {
        max_length: usize,
    },
    /// A catch-all for other errors that haven't been migrated to use structured errors yet.
    Anyhow(#[bincode(with = "bincode_anyhow_error")] anyhow::Error),
}

impl PartialEq for FsErrorSource {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Io(l), Self::Io(r)) => l.to_string() == r.to_string(),
            (Self::Anyhow(l), Self::Anyhow(r)) => l.to_string() == r.to_string(),
            _ => discriminant(self) == discriminant(other),
        }
    }
}

impl Eq for FsErrorSource {}

impl Display for FsErrorSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FsErrorSource::Io(err) => err.fmt(f),
            FsErrorSource::InvalidLinkTarget => write!(f, "link target is invalid"),
            FsErrorSource::PathSegmentTooLong { max_length } => {
                write!(f, "path segment is too long (exceeds {max_length} bytes)")
            }
            FsErrorSource::PathTooLong { max_length } => {
                write!(f, "path is too long (exceeds {max_length} bytes)")
            }
            FsErrorSource::Anyhow(err) => err.fmt(f),
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

/// Best effort string-based serialization for `anyhow::Error`.
mod bincode_anyhow_error {
    use anyhow::anyhow;
    use bincode::{
        Decode, Encode,
        de::{BorrowDecoder, Decoder},
        enc::Encoder,
        error::{DecodeError, EncodeError},
    };

    pub fn encode<E: Encoder>(err: &anyhow::Error, encoder: &mut E) -> Result<(), EncodeError> {
        err.to_string().encode(encoder)
    }

    pub fn decode<Context, D: Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<anyhow::Error, DecodeError> {
        let message = String::decode(decoder)?;
        Ok(anyhow!(message))
    }

    pub fn borrow_decode<'de, Context, D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<anyhow::Error, DecodeError> {
        decode(decoder)
    }
}
