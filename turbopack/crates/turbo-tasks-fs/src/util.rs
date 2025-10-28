use std::{
    io::{self, ErrorKind},
    path::Path,
};

use anyhow::{Context, Result, anyhow};
use turbo_tasks::ResolvedVc;

use crate::{DiskFileSystem, FileSystemPath};

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

#[cfg(not(target_os = "windows"))]
pub async fn uri_from_file(root: FileSystemPath, path: Option<&str>) -> Result<String> {
    use turbo_unix_path::sys_to_unix;

    let root_fs = root.fs;
    let root_fs = &*ResolvedVc::try_downcast_type::<DiskFileSystem>(root_fs)
        .context("Expected root to have a DiskFileSystem")?
        .await?;

    let path = match path {
        Some(path) => root.join(path)?,
        None => root,
    };

    let sys_path = root_fs.to_sys_path(&path);
    let sys_path = sys_path.to_string_lossy();

    Ok(format!(
        "file://{}",
        sys_to_unix(&sys_path)
            .split('/')
            .map(|s| urlencoding::encode(s))
            .collect::<Vec<_>>()
            .join("/")
    ))
}

#[cfg(target_os = "windows")]
pub async fn uri_from_file(root: FileSystemPath, path: Option<&str>) -> Result<String> {
    let root_fs = root.fs;
    let root_fs = &*ResolvedVc::try_downcast_type::<DiskFileSystem>(root_fs)
        .context("Expected root to have a DiskFileSystem")?
        .await?;

    let sys_path = match path {
        Some(path) => root.join(path.into())?,
        None => root,
    };
    let sys_path = root_fs.to_sys_path(&sys_path);

    let raw_path = sys_path.to_string_lossy().to_string();
    let normalized_path = raw_path.replace('\\', "/");

    let mut segments = normalized_path.split('/');

    let first = segments.next().unwrap_or_default(); // e.g., "C:"
    let encoded_path = std::iter::once(first.to_string()) // keep "C:" intact
        .chain(segments.map(|s| urlencoding::encode(s).into_owned()))
        .collect::<Vec<_>>()
        .join("/");

    let uri = format!("file:///{}", encoded_path);

    Ok(uri)
}
