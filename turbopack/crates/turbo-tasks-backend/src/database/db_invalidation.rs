use std::{
    fs::{self, read_dir},
    io,
    path::Path,
};

use anyhow::Context;

const INVALIDATION_MARKER: &str = "__turbo_tasks_invalidated_db";

/// Atomically write an invalidation marker.
///
/// Because attempting to delete currently open database files could cause issues, actual deletion
/// of files is deferred until the next start-up (in [`check_db_invalidation_and_cleanup`]).
///
/// In the case that no database is currently open (e.g. via a separate CLI subcommand), you should
/// call [`cleanup_db`] *after* this to eagerly remove the database files.
///
/// This should be run with the base (non-versioned) path, as that likely aligns closest with user
/// expectations (e.g. if they're clearing the cache for disk space reasons).
pub fn invalidate_db(base_path: &Path) -> anyhow::Result<()> {
    fs::write(base_path.join(INVALIDATION_MARKER), [0u8; 0])?;
    Ok(())
}

/// Called during startup. See if the db is in a partially-completed invalidation state. Find and
/// delete any invalidated database files.
///
/// This should be run with the base (non-versioned) path.
pub fn check_db_invalidation_and_cleanup(base_path: &Path) -> anyhow::Result<()> {
    if fs::exists(base_path.join(INVALIDATION_MARKER))? {
        // if this cleanup fails, we might try to open an invalid database later, so it's best to
        // just propagate the error here.
        cleanup_db(base_path)?;
    };
    Ok(())
}

/// Helper for [`check_db_invalidation_and_cleanup`]. You can call this to explicitly clean up a
/// database after running [`invalidate_db`] when turbo-tasks is not running.
///
/// You should not run this if the database has not yet been invalidated, as this operation is not
/// atomic and could result in a partially-deleted and corrupted database.
pub fn cleanup_db(base_path: &Path) -> anyhow::Result<()> {
    cleanup_db_inner(base_path).with_context(|| {
        format!(
            "Unable to remove invalid database. If this issue persists you can work around by \
             deleting {base_path:?}."
        )
    })
}

fn cleanup_db_inner(base_path: &Path) -> io::Result<()> {
    let Ok(contents) = read_dir(base_path) else {
        return Ok(());
    };

    // delete everything except the invalidation marker
    for entry in contents {
        let entry = entry?;
        if entry.file_name() != INVALIDATION_MARKER {
            fs::remove_dir_all(entry.path())?;
        }
    }

    // delete the invalidation marker last, once we're sure everything is cleaned up
    fs::remove_file(base_path.join(INVALIDATION_MARKER))?;
    Ok(())
}
