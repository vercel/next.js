#![doc = include_str!("../README.md")]

use std::borrow::Cow;

/// Converts system paths into Unix paths. This is a noop on Unix systems, and replaces backslash
/// directory separators with forward slashes on Windows.
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

/// Converts Unix paths into system paths. This is a noop on Unix systems, and replaces forward
/// slash directory separators with backslashes on Windows.
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

/// Joins two /-separated paths into a normalized path.
/// Paths are concatenated with /.
///
/// see also [normalize_path] for normalization.
/// Returns `None` if the joined path would leave the filesystem root.
pub fn join_path(fs_path: &str, join: &str) -> Option<String> {
    // Paths that we join are written as source code (eg, `join_path(fs_path, "foo/bar.js")`) and
    // it's expected that they will never contain a backslash.
    debug_assert!(
        !join.contains('\\'),
        "joined path {join} must not contain a Windows directory '\\', it must be normalized to \
         Unix '/'"
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

/// Normalizes a /-separated path into a form that contains no leading /, no double /, no "."
/// segment, no ".." segment.
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

/// Normalizes a /-separated request into a form that contains no leading /, no double /, and no "."
/// or ".." segments in the middle of the request.
///
/// A request might only start with a single "." segment and no ".." segments, or any positive
/// number of ".." segments but no "." segment.
pub fn normalize_request(str: &str) -> String {
    let mut segments = vec!["."];
    // Keeps track of our directory depth so that we can pop directories when encountering a "..".
    // If this is positive, then we're inside a directory and we can pop that. If it's 0, then we
    // can't pop the directory and we must keep the ".." in our segments. This is not the same as
    // the segments.len(), because we cannot pop a kept ".." when encountering another "..".
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

pub fn get_relative_path_to(from: &str, target: &str) -> String {
    fn split(s: &str) -> impl Iterator<Item = &str> {
        let empty = s.is_empty();
        let mut iterator = s.split('/');
        if empty {
            iterator.next();
        }
        iterator
    }

    let mut from_segments = split(from).peekable();
    let mut target_segments = split(target).peekable();
    while from_segments.peek() == target_segments.peek() {
        from_segments.next();
        if target_segments.next().is_none() {
            return ".".to_string();
        }
    }
    let mut result = Vec::new();
    if from_segments.peek().is_none() {
        result.push(".");
    } else {
        while from_segments.next().is_some() {
            result.push("..");
        }
    }
    for segment in target_segments {
        result.push(segment);
    }
    result.join("/")
}

pub fn get_parent_path(path: &str) -> &str {
    match str::rfind(path, '/') {
        Some(index) => &path[..index],
        None => "",
    }
}

#[cfg(test)]
mod tests {

    use rstest::*;

    use super::*;

    #[rstest]
    #[case("file.js")]
    #[case("a/b/c/d/e/file.js")]
    fn test_normalize_path_no_op(#[case] path: &str) {
        assert_eq!(path, normalize_path(path).unwrap());
    }

    #[rstest]
    #[case("/file.js", "file.js")]
    #[case("./file.js", "file.js")]
    #[case("././file.js", "file.js")]
    #[case("a/../c/../file.js", "file.js")]
    fn test_normalize_path(#[case] path: &str, #[case] normalized: &str) {
        assert_eq!(normalized, normalize_path(path).unwrap());
    }

    #[rstest]
    #[case("../file.js")]
    #[case("a/../../file.js")]
    fn test_normalize_path_invalid(#[case] path: &str) {
        assert_eq!(None, normalize_path(path));
    }
}
