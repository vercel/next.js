use std::path::PathBuf;

use serde::Serialize;

use crate::{IntoUnix, PathValidationError};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize)]
pub struct RelativeUnixPathBuf(PathBuf);

impl RelativeUnixPathBuf {
    /// Create a new RelativeUnixPathBuf from a PathBuf by calling `into_unix()`
    ///
    /// NOTE: `into_unix` *only* converts Windows paths to Unix paths *on* a
    /// Windows system. Do not pass a Windows path on a Unix system and
    /// assume it'll be converted.
    ///
    /// # Arguments
    ///
    /// * `path`:
    ///
    /// returns: Result<RelativeUnixPathBuf, PathValidationError>
    ///
    /// # Examples
    ///
    /// ```
    /// ```
    pub fn new(path: impl Into<PathBuf>) -> Result<Self, PathValidationError> {
        let path = path.into();
        if path.is_absolute() {
            return Err(PathValidationError::NotRelative(path));
        }

        Ok(RelativeUnixPathBuf(path.into_unix()?))
    }

    pub fn to_str(&self) -> Result<&str, PathValidationError> {
        self.0
            .to_str()
            .ok_or_else(|| PathValidationError::InvalidUnicode(self.0.clone()))
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn test_relative_unix_path_buf() {
        let path = RelativeUnixPathBuf::new(PathBuf::from("foo/bar")).unwrap();
        assert_eq!(path.to_str().unwrap(), "foo/bar");
    }

    #[test]
    fn test_relative_unix_path_buf_with_extension() {
        let path = RelativeUnixPathBuf::new(PathBuf::from("foo/bar.txt")).unwrap();
        assert_eq!(path.to_str().unwrap(), "foo/bar.txt");
    }

    #[test]
    fn test_relative_unix_path_buf_errors() {
        #[cfg(not(windows))]
        assert!(RelativeUnixPathBuf::new(PathBuf::from("/foo/bar")).is_err());
        #[cfg(windows)]
        assert!(RelativeUnixPathBuf::new(PathBuf::from("C:\\foo\\bar")).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn test_convert_from_windows_path() {
        let path = RelativeUnixPathBuf::new(PathBuf::from("foo\\bar")).unwrap();
        assert_eq!(path.0.as_path(), Path::new("foo/bar"));
    }
}
