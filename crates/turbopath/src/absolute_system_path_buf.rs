use std::{
    borrow::{Borrow, Cow},
    ffi::OsStr,
    fmt, fs,
    io::{self, Write},
    path::{Components, Path, PathBuf},
};

use serde::Serialize;

use crate::{
    AbsoluteSystemPath, AnchoredSystemPathBuf, IntoSystem, PathError, PathValidationError,
    RelativeSystemPathBuf,
};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize)]
pub struct AbsoluteSystemPathBuf(pub(crate) PathBuf);

impl Borrow<AbsoluteSystemPath> for AbsoluteSystemPathBuf {
    fn borrow(&self) -> &AbsoluteSystemPath {
        let path = self.as_path();
        unsafe { &*(path as *const Path as *const AbsoluteSystemPath) }
    }
}

impl AsRef<AbsoluteSystemPath> for AbsoluteSystemPathBuf {
    fn as_ref(&self) -> &AbsoluteSystemPath {
        self.borrow()
    }
}

impl AbsoluteSystemPathBuf {
    /// Create a new AbsoluteSystemPathBuf from `unchecked_path`.
    /// Confirms that `unchecked_path` is absolute and converts it to a system
    /// path.
    ///
    /// # Arguments
    ///
    /// * `unchecked_path`: The path to be validated and converted to an
    ///   `AbsoluteSystemPathBuf`.
    ///
    /// returns: Result<AbsoluteSystemPathBuf, PathValidationError>
    ///
    /// # Examples
    ///
    /// ```
    /// use std::path::{Path, PathBuf};
    /// use turbopath::AbsoluteSystemPathBuf;
    /// #[cfg(windows)]
    /// let path = PathBuf::from("C:/Users/user");
    /// #[cfg(not(windows))]
    /// let path = PathBuf::from("/Users/user");
    ///
    /// let absolute_path = AbsoluteSystemPathBuf::new(path).unwrap();
    ///
    /// #[cfg(windows)]
    /// assert_eq!(absolute_path.as_path(), Path::new("C:\\Users\\user"));
    /// #[cfg(not(windows))]
    /// assert_eq!(absolute_path.as_path(), Path::new("/Users/user"));
    /// ```
    pub fn new(unchecked_path: impl Into<PathBuf>) -> Result<Self, PathError> {
        let unchecked_path = unchecked_path.into();
        if !unchecked_path.is_absolute() {
            return Err(PathValidationError::NotAbsolute(unchecked_path).into());
        }

        let system_path = unchecked_path.into_system()?;
        Ok(AbsoluteSystemPathBuf(system_path))
    }

    /// Anchors `path` at `self`.
    ///
    /// # Arguments
    ///
    /// * `path`: The path to be anchored at `self`
    ///
    /// returns: Result<AnchoredSystemPathBuf, PathValidationError>
    ///
    /// # Examples
    ///
    /// ```
    /// use std::path::Path;
    /// use turbopath::{AbsoluteSystemPathBuf, AnchoredSystemPathBuf};
    /// #[cfg(not(windows))]
    /// {
    ///   let base = AbsoluteSystemPathBuf::new("/Users/user").unwrap();
    ///   let anchored_path = AbsoluteSystemPathBuf::new("/Users/user/Documents").unwrap();
    ///   let anchored_path = base.anchor(&anchored_path).unwrap();
    ///   assert_eq!(anchored_path.as_path(), Path::new("Documents"));
    /// }
    ///
    /// #[cfg(windows)]
    /// {
    ///   let base = AbsoluteSystemPathBuf::new("C:\\Users\\user").unwrap();
    ///   let anchored_path = AbsoluteSystemPathBuf::new("C:\\Users\\user\\Documents").unwrap();
    ///   let anchored_path = base.anchor(&anchored_path).unwrap();
    ///  assert_eq!(anchored_path.as_path(), Path::new("Documents"));
    /// }
    /// ```
    pub fn anchor(
        &self,
        path: impl AsRef<AbsoluteSystemPath>,
    ) -> Result<AnchoredSystemPathBuf, PathError> {
        AnchoredSystemPathBuf::new(self, path)
    }

    /// Resolves `path` with `self` as anchor.
    ///
    /// # Arguments
    ///
    /// * `path`: The path to be anchored at `self`
    ///
    /// returns: AbsoluteSystemPathBuf
    ///
    /// # Examples
    ///
    /// ```
    /// use std::path::Path;
    /// use turbopath::{AbsoluteSystemPathBuf, AnchoredSystemPathBuf};
    /// #[cfg(not(windows))]
    /// let absolute_path = AbsoluteSystemPathBuf::new("/Users/user").unwrap();
    /// #[cfg(windows)]
    /// let absolute_path = AbsoluteSystemPathBuf::new("C:\\Users\\user").unwrap();
    ///
    /// let anchored_path = Path::new("Documents").try_into().unwrap();
    /// let resolved_path = absolute_path.resolve(&anchored_path);
    ///
    /// #[cfg(not(windows))]
    /// assert_eq!(resolved_path.as_path(), Path::new("/Users/user/Documents"));
    /// #[cfg(windows)]
    /// assert_eq!(resolved_path.as_path(), Path::new("C:\\Users\\user\\Documents"));
    /// ```
    pub fn resolve(&self, path: &AnchoredSystemPathBuf) -> AbsoluteSystemPathBuf {
        AbsoluteSystemPathBuf(self.0.join(path.as_path()))
    }

    pub fn as_path(&self) -> &Path {
        self.0.as_path()
    }

    pub fn as_absolute_path(&self) -> &AbsoluteSystemPath {
        self.borrow()
    }

    pub fn components(&self) -> Components<'_> {
        self.0.components()
    }

    pub fn parent(&self) -> Option<Self> {
        self.0
            .parent()
            .map(|p| AbsoluteSystemPathBuf(p.to_path_buf()))
    }

    pub fn starts_with<P: AsRef<Path>>(&self, base: P) -> bool {
        self.0.starts_with(base.as_ref())
    }

    pub fn ends_with<P: AsRef<Path>>(&self, child: P) -> bool {
        self.0.ends_with(child.as_ref())
    }

    pub fn join_relative(&self, path: RelativeSystemPathBuf) -> AbsoluteSystemPathBuf {
        AbsoluteSystemPathBuf(self.0.join(path.as_path()))
    }

    pub fn join_literal(&self, segment: &str) -> Self {
        AbsoluteSystemPathBuf(self.0.join(segment))
    }

    pub fn join_unix_path_literal<S: AsRef<str>>(
        &self,
        unix_path: S,
    ) -> Result<AbsoluteSystemPathBuf, PathError> {
        let tail = Path::new(unix_path.as_ref()).into_system()?;
        Ok(AbsoluteSystemPathBuf(self.0.join(tail)))
    }

    pub fn ensure_dir(&self) -> Result<(), io::Error> {
        if let Some(parent) = self.0.parent() {
            fs::create_dir_all(parent)
        } else {
            Ok(())
        }
    }

    pub fn create_dir_all(&self) -> Result<(), io::Error> {
        fs::create_dir_all(self.0.as_path())
    }

    pub fn remove(&self) -> Result<(), io::Error> {
        fs::remove_file(self.0.as_path())
    }

    pub fn set_readonly(&self) -> Result<(), PathError> {
        let metadata = fs::symlink_metadata(self)?;
        let mut perms = metadata.permissions();
        perms.set_readonly(true);
        fs::set_permissions(self.0.as_path(), perms)?;
        Ok(())
    }

    pub fn is_readonly(&self) -> Result<bool, PathError> {
        Ok(self.0.symlink_metadata()?.permissions().readonly())
    }

    pub fn create_with_contents(&self, contents: &str) -> Result<(), io::Error> {
        let mut f = fs::File::create(self.0.as_path())?;
        write!(f, "{}", contents)?;
        Ok(())
    }

    pub fn to_str(&self) -> Result<&str, PathValidationError> {
        self.0
            .to_str()
            .ok_or_else(|| PathValidationError::InvalidUnicode(self.0.clone()))
    }

    pub fn to_string_lossy(&self) -> Cow<'_, str> {
        self.0.to_string_lossy()
    }

    pub fn file_name(&self) -> Option<&OsStr> {
        self.0.file_name()
    }

    pub fn exists(&self) -> bool {
        self.0.exists()
    }

    pub fn extension(&self) -> Option<&OsStr> {
        self.0.extension()
    }

    pub fn open(&self) -> Result<fs::File, PathError> {
        Ok(fs::File::open(&self.0)?)
    }

    pub fn to_realpath(&self) -> Result<Self, PathError> {
        let realpath = fs::canonicalize(&self.0)?;
        Ok(Self(realpath))
    }

    pub fn symlink_to_file(&self, target: impl AsRef<Path>) -> Result<(), PathError> {
        self.as_absolute_path().symlink_to_file(target)
    }

    pub fn symlink_to_dir(&self, target: impl AsRef<Path>) -> Result<(), PathError> {
        self.as_absolute_path().symlink_to_dir(target)
    }
}

impl From<AbsoluteSystemPathBuf> for PathBuf {
    fn from(path: AbsoluteSystemPathBuf) -> Self {
        path.0
    }
}

impl fmt::Display for AbsoluteSystemPathBuf {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.display().fmt(f)
    }
}

impl AsRef<Path> for AbsoluteSystemPathBuf {
    fn as_ref(&self) -> &Path {
        self.0.as_path()
    }
}

#[cfg(test)]
mod tests {
    use std::assert_matches::assert_matches;

    use crate::{AbsoluteSystemPathBuf, PathError, PathValidationError};

    #[cfg(not(windows))]
    #[test]
    fn test_absolute_system_path_buf_on_unix() {
        assert!(AbsoluteSystemPathBuf::new("/Users/user").is_ok());
        assert_matches!(
            AbsoluteSystemPathBuf::new("./Users/user/"),
            Err(PathError::PathValidationError(
                PathValidationError::NotAbsolute(_)
            ))
        );

        assert_matches!(
            AbsoluteSystemPathBuf::new("Users"),
            Err(PathError::PathValidationError(
                PathValidationError::NotAbsolute(_)
            ))
        );
    }

    #[cfg(windows)]
    #[test]
    fn test_absolute_system_path_buf_on_windows() {
        assert!(AbsoluteSystemPathBuf::new("C:\\Users\\user").is_ok());
        assert_matches!(
            AbsoluteSystemPathBuf::new(".\\Users\\user\\"),
            Err(PathError::PathValidationError(
                PathValidationError::NotAbsolute(_)
            ))
        );
        assert_matches!(
            AbsoluteSystemPathBuf::new("Users"),
            Err(PathError::PathValidationError(
                PathValidationError::NotAbsolute(_)
            ))
        );
        assert_matches!(
            AbsoluteSystemPathBuf::new("/Users/home"),
            Err(PathError::PathValidationError(
                PathValidationError::NotAbsolute(_)
            ))
        )
    }
}
