use std::{
    fs::{self, read_dir},
    io,
    path::Path,
};

const INVALIDATION_MARKER: &str = "__turbo_tasks_invalidated_db";

/// Atomically write an invalidation marker.
///
/// Because attempting to delete currently open database files could cause issues, actual deletion
/// of files is deferred until the next start-up (in [`check_db_invalidation`]).
///
/// In the case that no database is currently open (e.g. via a separate CLI subcommand), you should
/// call [`cleanup_db`] after this to eagerly remove the database files.
///
/// This should be run with the base (non-versioned) path, as that likely aligns closest with user
/// expectations (e.g. if they're clearing the cache for disk space reasons).
pub fn invalidate_db(base_path: &Path) -> io::Result<()> {
    fs::write(base_path.join(INVALIDATION_MARKER), [0u8; 0])?;
    Ok(())
}

/// Called during startup. See if the db is in a partially-completed invalidation state. Find and
/// delete any invalidated database files.
///
/// This should be run with the base (non-versioned) path.
pub fn check_db_invalidation_and_cleanup(base_path: &Path) -> io::Result<()> {
    if fs::exists(base_path.join(INVALIDATION_MARKER))? {
        // if this cleanup fails, we might try to open an invalid database later, so it's best to
        // just propagate the error here.
        cleanup_db(base_path)?;
    };
    Ok(())
}

/// Helper for `invalidate_db` and `check_db_invalidation`.
pub fn cleanup_db(base_path: &Path) -> io::Result<()> {
    let Ok(contents) = read_dir(base_path) else {
        return Ok(());
    };

    // delete everything except the invalidation marker
    for entry in contents {
        let entry = entry?;
        if entry.file_name() != INVALIDATION_MARKER {
            let _ = fs::remove_dir_all(entry.path());
        }
    }

    // delete the invalidation marker last, once we're sure everything is cleaned up
    fs::remove_file(base_path.join(INVALIDATION_MARKER))?;
    Ok(())
}
