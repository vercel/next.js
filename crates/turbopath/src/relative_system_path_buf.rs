use std::{
    ffi::OsStr,
    fmt,
    path::{Components, Path, PathBuf},
};

use serde::Serialize;

use crate::{IntoSystem, PathValidationError};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize)]
pub struct RelativeSystemPathBuf(PathBuf);

impl RelativeSystemPathBuf {
    /// Create a new RelativeSystemPathBuf from `unchecked_path`.
    /// Validates that `unchecked_path` is relative and converts it to a system
    /// path
    ///
    /// # Arguments
    ///
    /// * `unchecked_path`: Path to be converted to a RelativeSystemPathBuf
    ///
    /// returns: Result<RelativeSystemPathBuf, PathValidationError>
    ///
    /// # Examples
    ///
    /// ```
    /// use std::path::{Path, PathBuf};
    /// use turbopath::RelativeSystemPathBuf;
    /// let path = PathBuf::from("Users/user");
    /// let relative_path = RelativeSystemPathBuf::new(path).unwrap();
    /// #[cfg(windows)]
    /// assert_eq!(relative_path.as_path(), Path::new("Users\\user"));
    /// assert_eq!(relative_path.as_path(), Path::new("Users/user"));
    /// ```
    pub fn new(unchecked_path: impl Into<PathBuf>) -> Result<Self, PathValidationError> {
        let unchecked_path = unchecked_path.into();
        if unchecked_path.is_absolute() {
            return Err(PathValidationError::NotRelative(unchecked_path));
        }

        let system_path = unchecked_path.into_system()?;
        Ok(RelativeSystemPathBuf(system_path))
    }

    pub(crate) fn new_unchecked(unchecked_path: impl Into<PathBuf>) -> Self {
        Self(unchecked_path.into())
    }

    pub fn as_path(&self) -> &Path {
        &self.0
    }

    pub fn components(&self) -> Components<'_> {
        self.0.components()
    }

    pub fn parent(&self) -> Option<Self> {
        self.0
            .parent()
            .map(|p| RelativeSystemPathBuf(p.to_path_buf()))
    }

    pub fn starts_with<P: AsRef<Path>>(&self, base: P) -> bool {
        self.0.starts_with(base.as_ref())
    }

    pub fn ends_with<P: AsRef<Path>>(&self, child: P) -> bool {
        self.0.ends_with(child.as_ref())
    }

    pub fn join<P: AsRef<Path>>(&self, path: P) -> RelativeSystemPathBuf {
        RelativeSystemPathBuf(self.0.join(path))
    }

    pub fn to_str(&self) -> Result<&str, PathValidationError> {
        self.0
            .to_str()
            .ok_or_else(|| PathValidationError::InvalidUnicode(self.0.clone()))
    }

    pub fn file_name(&self) -> Option<&OsStr> {
        self.0.file_name()
    }

    pub fn into_path_buf(self) -> PathBuf {
        self.0
    }

    pub fn extension(&self) -> Option<&OsStr> {
        self.0.extension()
    }
}

impl fmt::Display for RelativeSystemPathBuf {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.display().fmt(f)
    }
}

impl AsRef<Path> for RelativeSystemPathBuf {
    fn as_ref(&self) -> &Path {
        self.0.as_ref()
    }
}
