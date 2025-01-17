use std::{
    borrow::Cow,
    io::{self, ErrorKind},
    path::Path,
};

use anyhow::{anyhow, Context, Result};
use turbo_tasks::Vc;

use crate::{DiskFileSystem, FileSystemPath};

/// Joins two /-separated paths into a normalized path.
/// Paths are concatenated with /.
///
/// see also [normalize_path] for normalization.
pub fn join_path(fs_path: &str, join: &str) -> Option<String> {
    // Paths that we join are written as source code (eg, `join_path(fs_path,
    // "foo/bar.js")`) and it's expected that they will never contain a
    // backslash.
    debug_assert!(
        !join.contains('\\'),
        "joined path {} must not contain a Windows directory '\\', it must be normalized to Unix \
         '/'",
        join
    );

    // TODO: figure out why this freezes the benchmarks.
    // // an absolute path would leave the file system root
    // if Path::new(join).is_absolute() {
    //     return None;
    // }

    if fs_path.is_empty() {
        normalize_path(join)
    } else if join.is_empty() {
        normalize_path(fs_path)
    } else {
        normalize_path(&[fs_path, "/", join].concat())
    }
}

/// Converts System paths into Unix paths. This is a noop on Unix systems, and
/// replaces backslash directory separators with forward slashes on Windows.
#[inline]
pub fn sys_to_unix(path: &str) -> Cow<'_, str> {
    #[cfg(not(target_family = "windows"))]
    {
        Cow::from(path)
    }
    #[cfg(target_family = "windows")]
    {
        Cow::Owned(path.replace(std::path::MAIN_SEPARATOR_STR, "/"))
    }
}

/// Converts Unix paths into System paths. This is a noop on Unix systems, and
/// replaces forward slash directory separators with backslashes on Windows.
#[inline]
pub fn unix_to_sys(path: &str) -> Cow<'_, str> {
    #[cfg(not(target_family = "windows"))]
    {
        Cow::from(path)
    }
    #[cfg(target_family = "windows")]
    {
        Cow::Owned(path.replace('/', std::path::MAIN_SEPARATOR_STR))
    }
}

/// Normalizes a /-separated path into a form that contains no leading /, no
/// double /, no "." segment, no ".." segment.
///
/// Returns None if the path would need to start with ".." to be equal.
pub fn normalize_path(str: &str) -> Option<String> {
    let mut segments = Vec::new();
    for segment in str.split('/') {
        match segment {
            "." | "" => {}
            ".." => {
                segments.pop()?;
            }
            segment => {
                segments.push(segment);
            }
        }
    }
    Some(segments.join("/"))
}

/// Normalizes a /-separated request into a form that contains no leading /, no
/// double /, and no "." or ".." segments in the middle of the request.
///
/// A request might only start with a single "." segment and no ".." segments, or
/// any positive number of ".." segments but no "." segment.
pub fn normalize_request(str: &str) -> String {
    let mut segments = vec!["."];
    // Keeps track of our directory depth so that we can pop directories when
    // encountering a "..". If this is positive, then we're inside a directory
    // and we can pop that. If it's 0, then we can't pop the directory and we must
    // keep the ".." in our segments. This is not the same as the segments.len(),
    // because we cannot pop a kept ".." when encountering another "..".
    let mut depth = 0;
    let mut popped_dot = false;
    for segment in str.split('/') {
        match segment {
            "." => {}
            ".." => {
                if depth > 0 {
                    depth -= 1;
                    segments.pop();
                } else {
                    // The first time we push a "..", we need to remove the "." we include by
                    // default.
                    if !popped_dot {
                        popped_dot = true;
                        segments.pop();
                    }
                    segments.push(segment);
                }
            }
            segment => {
                segments.push(segment);
                depth += 1;
            }
        }
    }
    segments.join("/")
}

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

pub async fn uri_from_file(root: Vc<FileSystemPath>, path: Option<&str>) -> Result<String> {
    let root_fs = root.fs();
    let root_fs = &*Vc::try_resolve_downcast_type::<DiskFileSystem>(root_fs)
        .await?
        .context("Expected root to have a DiskFileSystem")?
        .await?;

    Ok(format!(
        "file://{}",
        &sys_to_unix(
            &root_fs
                .to_sys_path(match path {
                    Some(path) => root.join(path.into()),
                    None => root,
                })
                .await?
                .to_string_lossy()
        )
        .split('/')
        .map(|s| urlencoding::encode(s))
        .collect::<Vec<_>>()
        .join("/")
    ))
}
