use std::{
    env,
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
    time::Duration,
};

use anyhow::Result;
use fs_err::{DirEntry, read_dir, remove_dir_all, rename};
use jiff::Timestamp;
use turbo_persistence::read_current_version;

/// Information gathered by `vergen_gitcl` in the top-level binary crate and passed down. This
/// information must be computed in the top-level crate for cargo incremental compilation to work
/// correctly.
///
/// See `crates/next-napi-bindings/build.rs` for details.
pub struct GitVersionInfo<'a> {
    /// Output of `git describe --match 'v[0-9]' --dirty`.
    pub describe: &'a str,
    /// Is the git repository dirty? Always forced to `false` when the `CI` environment variable is
    /// set and non-empty.
    pub dirty: bool,
}

/// How many days a database with a version other than the current one is retained since it was
/// last used. Overridable via the `TURBO_ENGINE_VERSION_TTL_DAYS` environment variable.
const DEFAULT_OTHER_DB_VERSION_TTL_DAYS: u64 = 3;

/// Directories are prefixed with this before being deleted, so that if we fail to fully delete the
/// directory, we can pick up where we left off last time.
const DELETION_PREFIX: &str = "__stale_";

/// Given a base path, creates a version directory for the given `version_info`. Automatically
/// cleans up old/stale databases.
///
/// The current version is always retained. Alongside it, exactly one database whose version isn't
/// the current one is kept — the most recently used, and only if it was used within
/// [`DEFAULT_OTHER_DB_VERSION_TTL_DAYS`] — so that switching back to a branch you recently left
/// still finds its cache intact. On CI none are retained.
///
/// **Environment Variables**
/// - `TURBO_ENGINE_VERSION`: Forces use of a specific database version.
/// - `TURBO_ENGINE_IGNORE_DIRTY`: Enable filesystem cache in a dirty git repository. Otherwise a
///   temporary directory is created.
/// - `TURBO_ENGINE_DISABLE_VERSIONING`: Ignores versioning and always uses the same "unversioned"
///   database when set.
/// - `TURBO_ENGINE_VERSION_TTL_DAYS`: How many days to retain a database whose version isn't the
///   current one, as a whole number. Overrides [`DEFAULT_OTHER_DB_VERSION_TTL_DAYS`].
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

        // On CI nothing is ever switched back to, so no other version is worth its disk.
        let ttl = if is_ci {
            None
        } else {
            Some(other_db_version_ttl())
        };

        if let Ok(read_dir) = read_dir(base_path) {
            let evict = |entry: DirEntry| {
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
            };

            // Of the other versions we keep only the most recently used one, and only if it's
            // within the TTL.
            let mut newest: Option<(Duration, DirEntry)> = None;
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

                // With no TTL nothing is retained, so don't read an age that can't change the
                // outcome — which also means a corrupt `CURRENT` can't fail the run.
                let Some(ttl) = ttl else {
                    evict(entry);
                    continue;
                };

                let age = time_since_last_commit(&entry)?;
                if age > ttl {
                    evict(entry);
                    continue;
                }
                match &newest {
                    Some((newest_age, _)) if *newest_age <= age => evict(entry),
                    _ => {
                        if let Some((_, previous)) = newest.replace((age, entry)) {
                            evict(previous);
                        }
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

/// How long to retain a database whose version isn't the current one. Falls back to
/// [`DEFAULT_OTHER_DB_VERSION_TTL_DAYS`] if `TURBO_ENGINE_VERSION_TTL_DAYS` is unset or unparsable.
fn other_db_version_ttl() -> Duration {
    let Ok(raw) = env::var("TURBO_ENGINE_VERSION_TTL_DAYS") else {
        return ttl_from_days(DEFAULT_OTHER_DB_VERSION_TTL_DAYS);
    };
    match raw.trim().parse::<u64>() {
        Ok(days) => ttl_from_days(days),
        Err(_) => {
            eprintln!(
                "WARNING: Ignoring TURBO_ENGINE_VERSION_TTL_DAYS={raw:?}, expected a whole number \
                 of days."
            );
            ttl_from_days(DEFAULT_OTHER_DB_VERSION_TTL_DAYS)
        }
    }
}

fn ttl_from_days(days: u64) -> Duration {
    Duration::from_secs(days.saturating_mul(24 * 60 * 60))
}

/// How long ago the version directory `entry` was last committed to, read from the `commit_time`
/// its `CURRENT` file records. A cache that's in use gets written to, so this stands in for how
/// recently the version was used.
///
/// A directory with no `CURRENT` isn't a database we finished writing — access to the cache root is
/// serialized, so it can't be one that's mid-initialization — and gets [`Duration::MAX`] so it's
/// evicted ahead of any real cache. A `CURRENT` that exists but can't be read is corruption or IO
/// failure: the error propagates rather than turning into a deletion.
///
/// A stamp in the future (clock skew) reads as age zero, so a version is never evicted for looking
/// too new.
fn time_since_last_commit(entry: &DirEntry) -> Result<Duration> {
    let Some(version) = read_current_version(&entry.path())? else {
        return Ok(Duration::MAX);
    };
    Ok(Timestamp::now()
        .duration_since(version.commit_time)
        .try_into()
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use rstest::rstest;
    use tempfile::TempDir;
    use turbo_persistence::CurrentDbVersion;

    use super::*;

    const CURRENT_VERSION: &str = "mock-version";

    fn version_info() -> GitVersionInfo<'static> {
        GitVersionInfo {
            describe: CURRENT_VERSION,
            dirty: false,
        }
    }

    /// Creates a version directory that looks like a real database (i.e. has a `CURRENT` file),
    /// last committed to `committed_ago` in the past.
    fn create_version_dir(base_path: &Path, name: &str, committed_ago: Duration) {
        let path = base_path.join(name);
        fs::create_dir(&path).unwrap();
        let commit_time = Timestamp::now() - jiff::SignedDuration::try_from(committed_ago).unwrap();
        fs::write(
            path.join("CURRENT"),
            serde_json::to_vec(&CurrentDbVersion {
                max_sequence_number: 0,
                commit_time,
            })
            .unwrap(),
        )
        .unwrap();
    }

    fn entry_names(base_path: &Path) -> Vec<String> {
        let mut names = fs::read_dir(base_path)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect::<Vec<_>>();
        names.sort();
        names
    }

    /// Only the most recently used other version survives, and the current version survives
    /// regardless of how stale it is. On CI no other version survives at all.
    #[rstest]
    #[case::not_ci(false, &["mock-version", "other-dir-0"])]
    #[case::ci(true, &["mock-version"])]
    fn test_only_most_recently_used_other_version_is_retained(
        #[case] is_ci: bool,
        #[case] expected: &[&str],
    ) {
        let tmp_dir = TempDir::new().unwrap();
        let base_path = tmp_dir.path();

        // the least recently used of all, and preserved anyway
        create_version_dir(base_path, CURRENT_VERSION, Duration::from_secs(60 * 60));

        for i in 0..4 {
            // `other-dir-0` is the most recently used, so it's the one retained
            create_version_dir(
                base_path,
                &format!("other-dir-{i}"),
                Duration::from_secs(i + 1),
            );
        }

        let versioned_path = handle_db_versioning(base_path, &version_info(), is_ci).unwrap();
        assert_eq!(versioned_path, base_path.join(CURRENT_VERSION));
        assert_eq!(entry_names(base_path), expected);
    }

    /// A version that hasn't been used within the TTL is evicted, even with the retention slot
    /// free.
    #[test]
    fn test_ttl_evicts_unused_version() {
        let tmp_dir = TempDir::new().unwrap();
        let base_path = tmp_dir.path();

        create_version_dir(base_path, CURRENT_VERSION, Duration::ZERO);
        create_version_dir(
            base_path,
            "stale-version",
            ttl_from_days(DEFAULT_OTHER_DB_VERSION_TTL_DAYS) + Duration::from_secs(60),
        );

        handle_db_versioning(base_path, &version_info(), /* is_ci */ false).unwrap();

        assert_eq!(entry_names(base_path), vec![CURRENT_VERSION]);
    }

    /// A directory with no `CURRENT` file isn't one of ours, so it's evicted rather than occupying
    /// the single retention slot — even when it holds recently written files.
    #[rstest]
    #[case::empty(false)]
    #[case::with_recent_data_file(true)]
    fn test_version_without_stamp_is_evicted(#[case] with_data_file: bool) {
        let tmp_dir = TempDir::new().unwrap();
        let base_path = tmp_dir.path();

        create_version_dir(base_path, CURRENT_VERSION, Duration::ZERO);

        let unstamped = base_path.join("unstamped-version");
        fs::create_dir(&unstamped).unwrap();
        if with_data_file {
            fs::write(unstamped.join("00000001.sst"), b"data").unwrap();
        }

        handle_db_versioning(base_path, &version_info(), /* is_ci */ false).unwrap();

        assert_eq!(entry_names(base_path), vec![CURRENT_VERSION]);
    }

    /// A `CURRENT` that exists but can't be parsed is an unexpected failure, not something to
    /// silently act on: the error propagates instead of the directory being deleted.
    #[test]
    fn test_corrupt_current_propagates_error() {
        let tmp_dir = TempDir::new().unwrap();
        let base_path = tmp_dir.path();

        create_version_dir(base_path, CURRENT_VERSION, Duration::ZERO);
        let corrupt = base_path.join("corrupt-version");
        fs::create_dir(&corrupt).unwrap();
        fs::write(corrupt.join("CURRENT"), b"not json").unwrap();

        assert!(
            handle_db_versioning(base_path, &version_info(), /* is_ci */ false).is_err(),
            "an unreadable CURRENT should surface as an error"
        );
        assert!(
            entry_names(base_path).contains(&"corrupt-version".to_string()),
            "the directory should not have been deleted"
        );
    }

    /// On CI every other version is evicted regardless of age, so an unreadable `CURRENT` in one of
    /// them is never consulted and can't fail the run.
    #[test]
    fn test_ci_ignores_unreadable_current() {
        let tmp_dir = TempDir::new().unwrap();
        let base_path = tmp_dir.path();

        create_version_dir(base_path, CURRENT_VERSION, Duration::ZERO);
        let corrupt = base_path.join("corrupt-version");
        fs::create_dir(&corrupt).unwrap();
        fs::write(corrupt.join("CURRENT"), b"not json").unwrap();

        handle_db_versioning(base_path, &version_info(), /* is_ci */ true).unwrap();

        assert_eq!(entry_names(base_path), vec![CURRENT_VERSION]);
    }

    #[test]
    fn test_cleanup_of_prefixed_items() {
        let tmp_dir = TempDir::new().unwrap();
        let base_path = tmp_dir.path();

        for i in 0..5 {
            fs::create_dir(base_path.join(format!("{DELETION_PREFIX}other-dir-{i}"))).unwrap();
        }

        handle_db_versioning(base_path, &version_info(), /* is_ci */ false).unwrap();

        assert!(entry_names(base_path).is_empty());
    }
}
