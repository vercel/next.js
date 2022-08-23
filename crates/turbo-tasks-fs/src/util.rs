use std::{borrow::Cow, path::MAIN_SEPARATOR};

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
pub fn sys_to_unix(path: &str) -> Cow<'_, str> {
    if MAIN_SEPARATOR != '\\' {
        return Cow::from(path);
    }
    Cow::Owned(path.replace(MAIN_SEPARATOR, "/"))
}

/// Converts System paths into Unix paths. This is a noop on Unix systems, and
/// replaces backslash directory separators with forward slashes on Windows.
pub fn unix_to_sys(path: &str) -> Cow<'_, str> {
    if MAIN_SEPARATOR != '\\' {
        return Cow::from(path);
    }
    Cow::Owned(path.replace('/', &MAIN_SEPARATOR.to_string()))
}

/// Normalizes a /-separated path into a form that contains no leading /, no
/// double /, no "." seqment, no ".." seqment.
///
/// Returns None if the path would need to start with ".." to be equal.
pub fn normalize_path(str: &str) -> Option<String> {
    let mut seqments = Vec::new();
    for seqment in str.split('/') {
        match seqment {
            "." | "" => {}
            ".." => {
                seqments.pop()?;
            }
            seqment => {
                seqments.push(seqment);
            }
        }
    }
    Some(seqments.join("/"))
}

/// Normalizes a /-separated request into a form that contains no leading /, no
/// double /, and no "." or ".." seqments in the middle of the request. A
/// request might only start with a single "." seqment and no ".." segements, or
/// any positive number of ".." seqments but no "." seqment.
pub fn normalize_request(str: &str) -> String {
    let mut seqments = vec!["."];
    // Keeps track of our directory depth so that we can pop directories when
    // encountering a "..". If this is positive, then we're inside a directory
    // and we can pop that. If it's 0, then we can't pop the directory and we must
    // keep the ".." in our seqments. This is not the same as the seqments.len(),
    // because we cannot pop a kept ".." when encountering another "..".
    let mut depth = 0;
    let mut popped_dot = false;
    for seqment in str.split('/') {
        match seqment {
            "." => {}
            ".." => {
                if depth > 0 {
                    depth -= 1;
                    seqments.pop();
                } else {
                    // The first time we push a "..", we need to remove the "." we include by
                    // default.
                    if !popped_dot {
                        popped_dot = true;
                        seqments.pop();
                    }
                    seqments.push(seqment);
                }
            }
            seqment => {
                seqments.push(seqment);
                depth += 1;
            }
        }
    }
    seqments.join("/")
}
