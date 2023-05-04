use std::path::Path;

use crate::{IntoSystem, PathError, PathValidationError, RelativeSystemPathBuf};

pub struct RelativeUnixPath {
    inner: Path,
}

impl RelativeUnixPath {
    pub fn new<P: AsRef<Path>>(value: &P) -> Result<&Self, PathError> {
        let path = value.as_ref();
        if path.is_absolute() {
            return Err(PathValidationError::NotRelative(path.to_owned()).into());
        }
        // copied from stdlib path.rs: relies on the representation of
        // RelativeUnixPath being just a Path, the same way Path relies on
        // just being an OsStr
        Ok(unsafe { &*(path as *const Path as *const Self) })
    }

    pub fn to_system_path(&self) -> Result<RelativeSystemPathBuf, PathError> {
        let system_path = self.inner.into_system()?;
        Ok(RelativeSystemPathBuf::new_unchecked(system_path))
    }
}
