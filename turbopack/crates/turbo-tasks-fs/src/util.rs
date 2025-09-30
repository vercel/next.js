use std::{
    io::{self, ErrorKind},
    path::Path,
};

use anyhow::{Result, anyhow};

/// Converts a disk access Result<T> into a Result<Some<T>>, where a NotFound
/// error results in a None value. This is purely to reduce boilerplate code
/// comparing NotFound errors against all other errors.
pub fn extract_disk_access<T>(value: io::Result<T>, path: &Path) -> Result<Option<T>> {
    match value {
        Ok(v) => Ok(Some(v)),
        Err(e) if matches!(e.kind(), ErrorKind::NotFound | ErrorKind::InvalidFilename) => Ok(None),
        Err(e) => Err(anyhow!(e).context(format!("reading file {}", path.display()))),
    }
}
