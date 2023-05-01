#![feature(assert_matches)]

mod absolute_system_path_buf;
mod anchored_system_path_buf;
mod relative_system_path_buf;
mod relative_unix_path_buf;

use std::{
    io,
    path::{Path, PathBuf},
};

pub use absolute_system_path_buf::AbsoluteSystemPathBuf;
pub use anchored_system_path_buf::AnchoredSystemPathBuf;
use path_slash::{PathBufExt, PathExt};
pub use relative_system_path_buf::RelativeSystemPathBuf;
pub use relative_unix_path_buf::RelativeUnixPathBuf;

#[derive(Debug, thiserror::Error)]
pub enum PathError {
    #[error("Path validation failed: {0}")]
    PathValidationError(#[from] PathValidationError),
    #[error("IO Error {0}")]
    IO(#[from] io::Error),
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
    NotRelative(PathBuf),
    #[error("Path {0} is not parent of {1}")]
    NotParent(String, String),
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
