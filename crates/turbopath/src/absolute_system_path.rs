#[cfg(not(windows))]
use std::os::unix::fs::symlink as symlink_file;
#[cfg(not(windows))]
use std::os::unix::fs::symlink as symlink_dir;
#[cfg(windows)]
use std::os::windows::fs::{symlink_dir, symlink_file};
use std::{
    borrow::Cow,
    fmt, fs,
    fs::Metadata,
    io,
    path::{Path, PathBuf},
};

use path_slash::CowExt;

use crate::{
    AbsoluteSystemPathBuf, AnchoredSystemPathBuf, IntoSystem, PathError, PathValidationError,
    RelativeSystemPathBuf, RelativeUnixPath,
};

pub struct AbsoluteSystemPath(Path);

impl ToOwned for AbsoluteSystemPath {
    type Owned = AbsoluteSystemPathBuf;

    fn to_owned(&self) -> Self::Owned {
        AbsoluteSystemPathBuf(self.0.to_owned())
    }
}

impl AsRef<AbsoluteSystemPath> for AbsoluteSystemPath {
    fn as_ref(&self) -> &AbsoluteSystemPath {
        self
    }
}

impl fmt::Display for AbsoluteSystemPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.display().fmt(f)
    }
}

impl AsRef<Path> for AbsoluteSystemPath {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

impl AbsoluteSystemPath {
    /// Creates a path that is known to be absolute and a system path.
    /// If either of these conditions are not met, we error.
    /// Does *not* do automatic conversion like `AbsoluteSystemPathBuf::new`
    /// does
    ///
    /// # Arguments
    ///
    /// * `value`: The path to convert to an absolute system path
    ///
    /// returns: Result<&AbsoluteSystemPath, PathError>
    ///
    /// # Examples
    ///
    /// ```
    /// use turbopath::AbsoluteSystemPath;
    /// #[cfg(unix)]
    /// {
    ///   assert!(AbsoluteSystemPath::new("/foo/bar").is_ok());
    ///   assert!(AbsoluteSystemPath::new("foo/bar").is_err());
    ///   assert!(AbsoluteSystemPath::new("C:\\foo\\bar").is_err());
    /// }
    ///
    /// #[cfg(windows)]
    /// {
    ///   assert!(AbsoluteSystemPath::new("C:\\foo\\bar").is_ok());
    ///   assert!(AbsoluteSystemPath::new("foo\\bar").is_err());
    ///   assert!(AbsoluteSystemPath::new("/foo/bar").is_err());
    /// }
    /// ```
    pub fn new<P: AsRef<Path> + ?Sized>(value: &P) -> Result<&Self, PathError> {
        let path = value.as_ref();
        if path.is_relative() {
            return Err(PathValidationError::NotAbsolute(path.to_owned()).into());
        }
        let path_str = path.to_str().ok_or_else(|| {
            PathError::PathValidationError(PathValidationError::InvalidUnicode(path.to_owned()))
        })?;

        let system_path = Cow::from_slash(path_str);

        match system_path {
            Cow::Owned(path) => {
                Err(PathValidationError::NotSystem(path.to_string_lossy().to_string()).into())
            }
            Cow::Borrowed(path) => {
                let path = Path::new(path);
                // copied from stdlib path.rs: relies on the representation of
                // AbsoluteSystemPath being just a Path, the same way Path relies on
                // just being an OsStr
                let absolute_system_path = unsafe { &*(path as *const Path as *const Self) };
                Ok(absolute_system_path)
            }
        }
    }

    pub fn as_path(&self) -> &Path {
        &self.0
    }

    pub fn join_relative(&self, path: &RelativeSystemPathBuf) -> AbsoluteSystemPathBuf {
        let path = self.0.join(path.as_path());
        AbsoluteSystemPathBuf(path)
    }

    pub fn join_literal(&self, segment: &str) -> AbsoluteSystemPathBuf {
        AbsoluteSystemPathBuf(self.0.join(segment))
    }

    pub fn join_unix_path(
        &self,
        unix_path: &RelativeUnixPath,
    ) -> Result<AbsoluteSystemPathBuf, PathError> {
        let tail = unix_path.to_system_path()?;
        Ok(AbsoluteSystemPathBuf(self.0.join(tail.as_path())))
    }

    pub fn anchor(&self, path: &AbsoluteSystemPath) -> Result<AnchoredSystemPathBuf, PathError> {
        AnchoredSystemPathBuf::new(self, path)
    }

    pub fn ensure_dir(&self) -> Result<(), io::Error> {
        if let Some(parent) = self.0.parent() {
            fs::create_dir_all(parent)
        } else {
            Ok(())
        }
    }

    pub fn symlink_to_file<P: AsRef<Path>>(&self, to: P) -> Result<(), PathError> {
        let system_path = to.as_ref();
        let system_path = system_path.into_system()?;
        symlink_file(system_path, &self.0)?;
        Ok(())
    }

    pub fn symlink_to_dir<P: AsRef<Path>>(&self, to: P) -> Result<(), PathError> {
        let system_path = to.as_ref();
        let system_path = system_path.into_system()?;
        symlink_dir(&system_path, &self.0)?;
        Ok(())
    }

    pub fn resolve(&self, path: &AnchoredSystemPathBuf) -> AbsoluteSystemPathBuf {
        let path = self.0.join(path.as_path());
        AbsoluteSystemPathBuf(path)
    }

    // note that this is *not* lstat. If this is a symlink, it
    // will return metadata for the target.
    pub fn stat(&self) -> Result<Metadata, PathError> {
        Ok(fs::metadata(&self.0)?)
    }

    pub fn symlink_metadata(&self) -> Result<Metadata, PathError> {
        Ok(fs::symlink_metadata(&self.0)?)
    }

    pub fn read_link(&self) -> Result<PathBuf, io::Error> {
        fs::read_link(&self.0)
    }

    pub fn remove_file(&self) -> Result<(), io::Error> {
        fs::remove_file(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;

    use super::*;

    #[test]
    fn test_create_absolute_path() -> Result<()> {
        #[cfg(unix)]
        {
            let absolute_path = AbsoluteSystemPath::new("/foo/bar")?;
            assert_eq!(absolute_path.to_string(), "/foo/bar");
        }

        #[cfg(windows)]
        {
            let absolute_path = AbsoluteSystemPath::new(r"C:\foo\bar")?;
            assert_eq!(absolute_path.to_string(), r"C:\foo\bar");
        }

        Ok(())
    }
}
