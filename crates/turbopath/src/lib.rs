#![feature(assert_matches)]

mod absolute_system_path_buf;
mod anchored_system_path_buf;
mod relative_system_path_buf;
mod relative_unix_path;
mod relative_unix_path_buf;

use std::{
    io,
    path::{Path, PathBuf, StripPrefixError},
};

pub use absolute_system_path_buf::AbsoluteSystemPathBuf;
pub use anchored_system_path_buf::AnchoredSystemPathBuf;
use path_slash::{PathBufExt, PathExt};
pub use relative_system_path_buf::RelativeSystemPathBuf;
pub use relative_unix_path::RelativeUnixPath;
pub use relative_unix_path_buf::RelativeUnixPathBuf;

#[derive(Debug, thiserror::Error)]
pub enum PathError {
    #[error("Path validation failed: {0}")]
    PathValidationError(#[from] PathValidationError),
    #[error("IO Error {0}")]
    IO(#[from] io::Error),
    #[error("Path prefix error: {0}")]
    PrefixError(#[from] StripPrefixError),
    #[error("Invalid UTF8: {0:?}")]
    Utf8Error(Vec<u8>),
}

impl From<std::string::FromUtf8Error> for PathError {
    fn from(value: std::string::FromUtf8Error) -> Self {
        PathError::Utf8Error(value.into_bytes())
    }
}

impl PathError {
    pub fn is_io_error(&self, kind: io::ErrorKind) -> bool {
        match self {
            PathError::IO(err) => err.kind() == kind,
            _ => false,
        }
    }
}

// Custom error type for path validation errors
#[derive(Debug, thiserror::Error)]
pub enum PathValidationError {
    #[error("Path is non-UTF-8: {0}")]
    InvalidUnicode(PathBuf),
    #[error("Path is not absolute: {0}")]
    NotAbsolute(PathBuf),
    #[error("Path is not relative: {0}")]
    NotRelative(String),
    #[error("Path {0} is not parent of {1}")]
    NotParent(String, String),
    #[error("Path {0} is not a unix path")]
    NotUnix(String),
    #[error("{0} is not a prefix for {1}")]
    PrefixError(String, String),
}

impl PathValidationError {
    pub(crate) fn not_relative_error(bytes: &[u8]) -> PathValidationError {
        let s = String::from_utf8_lossy(bytes).to_string();
        PathValidationError::NotRelative(s)
    }
}

trait IntoSystem {
    fn into_system(self) -> Result<PathBuf, PathValidationError>;
}

trait IntoUnix {
    fn into_unix(self) -> Result<PathBuf, PathValidationError>;
}

impl IntoSystem for &Path {
    fn into_system(self) -> Result<PathBuf, PathValidationError> {
        let path_str = self
            .to_str()
            .ok_or_else(|| PathValidationError::InvalidUnicode(self.to_owned()))?;

        Ok(PathBuf::from_slash(path_str))
    }
}

impl IntoUnix for &Path {
    /// NOTE: `into_unix` *only* converts Windows paths to Unix paths *on* a
    /// Windows system. Do not pass a Windows path on a Unix system and
    /// assume it'll be converted.
    fn into_unix(self) -> Result<PathBuf, PathValidationError> {
        Ok(PathBuf::from(
            self.to_slash()
                .ok_or_else(|| PathValidationError::InvalidUnicode(self.to_owned()))?
                .as_ref(),
        ))
    }
}
