use std::{
    env,
    fs::{metadata, read_dir, remove_dir_all},
    path::{Path, PathBuf},
    time::Duration,
};

use anyhow::Result;

/// Specifies many databases that have a different version than the current one are retained.
/// For example if MAX_OTHER_DB_VERSIONS is 2, there can be at most 3 databases in the directory,
/// the current one and two older/newer ones.
const MAX_OTHER_DB_VERSIONS: usize = 2;

pub fn handle_db_versioning(base_path: &Path, version_info: &str) -> Result<PathBuf> {
    if let Ok(version) = env::var("TURBO_ENGINE_VERSION") {
        return Ok(base_path.join(version));
    }
    // Database versioning. Pass `TURBO_ENGINE_IGNORE_DIRTY` at runtime to ignore a
    // dirty git repository. Pass `TURBO_ENGINE_DISABLE_VERSIONING` at runtime to disable
    // versioning and always use the same database.
    let (version_info, git_dirty) = if let Some(version_info) = version_info.strip_suffix("-dirty")
    {
        (version_info, true)
    } else {
        (version_info, false)
    };
    let ignore_dirty = env::var("TURBO_ENGINE_IGNORE_DIRTY").ok().is_some();
    let disabled_versioning = env::var("TURBO_ENGINE_DISABLE_VERSIONING").ok().is_some();
    let version = if disabled_versioning {
        println!(
            "WARNING: Persistent Caching versioning is disabled. Manual removal of the persistent \
             caching database might be required."
        );
        Some("unversioned")
    } else if !git_dirty {
        Some(version_info)
    } else if ignore_dirty {
        println!(
            "WARNING: The git repository is dirty, but Persistent Caching is still enabled. \
             Manual removal of the persistent caching database might be required."
        );
        Some(version_info)
    } else {
        println!(
            "WARNING: The git repository is dirty: Persistent Caching is disabled. Use \
             TURBO_ENGINE_IGNORE_DIRTY=1 to ignore dirtyness of the repository."
        );
        None
    };
    let path;
    if let Some(version) = version {
        path = base_path.join(version);

        // Remove old databases if needed
        if let Ok(read_dir) = read_dir(base_path) {
            let old_dbs = read_dir
                .filter_map(|entry| {
                    let entry = entry.ok()?;
                    if !entry.file_type().ok()?.is_dir() {
                        return None;
                    }
                    let name = entry.file_name();
                    let name = name.to_string_lossy();
                    if name == version {
                        return None;
                    }
                    Some(entry.path())
                })
                .collect::<Vec<_>>();
            if old_dbs.len() > MAX_OTHER_DB_VERSIONS {
                let mut old_dbs = old_dbs
                    .iter()
                    .map(|p| {
                        fn get_age(p: &Path) -> Result<Duration> {
                            let m = metadata(p)?;
                            Ok(m.accessed().or_else(|_| m.modified())?.elapsed()?)
                        }
                        (
                            p,
                            get_age(p).unwrap_or(Duration::from_secs(10 * 356 * 24 * 60 * 60)),
                        )
                    })
                    .collect::<Vec<_>>();
                old_dbs.sort_by_key(|(_, age)| *age);
                for (p, _) in old_dbs.into_iter().skip(MAX_OTHER_DB_VERSIONS) {
                    let _ = remove_dir_all(p);
                }
            }
        }
    } else {
        path = base_path.join("temp");
        let _ = remove_dir_all(&path);
    }

    Ok(path)
}
