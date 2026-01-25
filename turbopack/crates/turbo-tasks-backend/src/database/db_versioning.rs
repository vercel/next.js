use std::{
    env,
    ffi::{OsStr, OsString},
    fs::{DirEntry, read_dir, remove_dir_all, rename},
    path::{Path, PathBuf},
    time::Duration,
};

use anyhow::Result;

/// Information gathered by `vergen_gitcl` in the top-level binary crate and passed down. This
/// information must be computed in the top-level crate for cargo incremental compilation to work
/// correctly.
///
/// See `crates/napi/build.rs` for details.
pub struct GitVersionInfo<'a> {
    /// Output of `git describe --match 'v[0-9]' --dirty`.
    pub describe: &'a str,
    /// Is the git repository dirty? Always forced to `false` when the `CI` environment variable is
    /// set and non-empty.
    pub dirty: bool,
}

/// Specifies many databases that have a different version than the current one are retained.
/// For example if `DEFAULT_MAX_OTHER_DB_VERSIONS` is 2, there can be at most 3 databases in the
/// directory, the current one and two older/newer ones. On CI it never keeps any other versions.
const DEFAULT_MAX_OTHER_DB_VERSIONS: usize = 2;

/// Directories are prefixed with this before being deleted, so that if we fail to fully delete the
/// directory, we can pick up where we left off last time.
const DELETION_PREFIX: &str = "__stale_";

/// Given a base path, creates a version directory for the given `version_info`. Automatically
/// cleans up old/stale databases.
///
/// **Environment Variables**
/// - `TURBO_ENGINE_VERSION`: Forces use of a specific database version.
/// - `TURBO_ENGINE_IGNORE_DIRTY`: Enable filesystem cache in a dirty git repository. Otherwise a
///   temporary directory is created.
/// - `TURBO_ENGINE_DISABLE_VERSIONING`: Ignores versioning and always uses the same "unversioned"
///   database when set.
pub fn handle_db_versioning(
    base_path: &Path,
    version_info: &GitVersionInfo,
    is_ci: bool,
) -> Result<PathBuf> {
    if let Ok(version) = env::var("TURBO_ENGINE_VERSION") {
        return Ok(base_path.join(version));
    }
    let ignore_dirty = env::var("TURBO_ENGINE_IGNORE_DIRTY").ok().is_some();
    let disabled_versioning = env::var("TURBO_ENGINE_DISABLE_VERSIONING").ok().is_some();
    let version = if disabled_versioning {
        println!(
            "WARNING: File System Cache versioning is disabled. Manual removal of the filesystem \
             caching database might be required."
        );
        Some("unversioned")
    } else if !version_info.dirty {
        Some(version_info.describe)
    } else if ignore_dirty {
        println!(
            "WARNING: The git repository is dirty, but File System Cache is still enabled. Manual \
             removal of the filesystem cache database might be required."
        );
        Some(version_info.describe)
    } else {
        println!(
            "WARNING: The git repository is dirty: File System Cache is disabled. Use \
             TURBO_ENGINE_IGNORE_DIRTY=1 to ignore dirtiness of the repository."
        );
        None
    };
    let path;
    if let Some(version) = version {
        path = base_path.join(version);

        let max_other_db_versions = if is_ci {
            0
        } else {
            DEFAULT_MAX_OTHER_DB_VERSIONS
        };

        if let Ok(read_dir) = read_dir(base_path) {
            let mut old_dbs = Vec::new();
            for entry in read_dir {
                let Ok(entry) = entry else { continue };

                // skip our target version (if it exists)
                let name = entry.file_name();
                if name == version {
                    continue;
                }

                // skip non-directories
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                if !file_type.is_dir() {
                    continue;
                }

                // Find and try to finish removing any partially deleted directories
                if name
                    .as_encoded_bytes()
                    .starts_with(AsRef::<OsStr>::as_ref(DELETION_PREFIX).as_encoded_bytes())
                {
                    // failures during cleanup of a cache directory are not fatal
                    let _ = remove_dir_all(entry.path());
                    continue;
                }

                old_dbs.push(entry);
            }

            if old_dbs.len() > max_other_db_versions {
                old_dbs.sort_by_cached_key(|entry| {
                    fn get_age(e: &DirEntry) -> Result<Duration> {
                        let m = e.metadata()?;
                        // Maybe change this: We care more about the atime/mtime of the files inside
                        // the directory than the directory itself. atime is also fragile because it
                        // can be impacted by recursive scanning tools (e.g. ripgrep). It might be
                        // better for us to always explicitly touch a specific file inside the
                        // versioned directory when reading the cache, and then use that file's
                        // mtime.
                        Ok(m.accessed().or_else(|_| m.modified())?.elapsed()?)
                    }
                    get_age(entry).unwrap_or(Duration::MAX)
                });
                for entry in old_dbs.into_iter().skip(max_other_db_versions) {
                    let mut new_name = OsString::from(DELETION_PREFIX);
                    new_name.push(entry.file_name());
                    let new_path = base_path.join(new_name);
                    // rename first, it's an atomic operation
                    let rename_result = rename(entry.path(), &new_path);
                    // Only try to delete the files if the rename succeeded, it's not safe to delete
                    // contents if we didn't manage to first poison the directory by renaming it.
                    if rename_result.is_ok() {
                        // It's okay if this fails, as we've already poisoned the directory.
                        let _ = remove_dir_all(&new_path);
                    }
                }
            }
        }
    } else {
        path = base_path.join("temp");
        if path.exists() {
            // propagate errors: if this fails we may have stale files left over in the temp
            // directory
            remove_dir_all(&path)?;
        }
    }

    Ok(path)
}

#[cfg(test)]
mod tests {
    use std::{fs, thread::sleep};

    use rstest::rstest;
    use tempfile::TempDir;

    use super::*;

    fn count_entries(base_path: &Path) -> usize {
        fs::read_dir(base_path)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
            .len()
    }

    #[rstest]
    #[case::not_ci(false, DEFAULT_MAX_OTHER_DB_VERSIONS)]
    #[case::ci(true, 0)]
    fn test_max_versions(#[case] is_ci: bool, #[case] max_other_db_versions: usize) {
        let tmp_dir = TempDir::new().unwrap();
        let base_path = tmp_dir.path();
        let current_version_name = "mock-version";

        let version_info = GitVersionInfo {
            describe: current_version_name,
            dirty: false,
        };

        fs::create_dir(base_path.join(current_version_name)).unwrap();

        // sleep to ensure `current_version_name` has the oldest atime/mtime
        // it should be preserved regardless of atime/mtime
        sleep(Duration::from_millis(100));

        let num_other_dirs = max_other_db_versions + 3;
        for i in 0..num_other_dirs {
            fs::create_dir(base_path.join(format!("other-dir-{i}"))).unwrap();
        }

        assert_eq!(
            count_entries(base_path),
            num_other_dirs + 1, // +1 for current version
        );

        let versioned_path = handle_db_versioning(base_path, &version_info, is_ci).unwrap();

        assert_eq!(versioned_path, base_path.join(current_version_name));
        assert!(base_path.join(current_version_name).exists());
        assert_eq!(
            count_entries(base_path),
            max_other_db_versions + 1, // +1 for current version
        );
    }

    #[test]
    fn test_cleanup_of_prefixed_items() {
        let tmp_dir = TempDir::new().unwrap();
        let base_path = tmp_dir.path();
        let current_version_name = "mock-version";

        let version_info = GitVersionInfo {
            describe: current_version_name,
            dirty: false,
        };

        for i in 0..5 {
            fs::create_dir(base_path.join(format!("{DELETION_PREFIX}other-dir-{i}"))).unwrap();
        }

        assert_eq!(count_entries(base_path), 5);

        handle_db_versioning(base_path, &version_info, /* is_ci */ false).unwrap();

        assert_eq!(count_entries(base_path), 0);
    }
}
