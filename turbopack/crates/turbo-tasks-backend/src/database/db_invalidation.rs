use std::{
    borrow::Cow,
    fs::{self, File, read_dir},
    io::{self, BufReader, BufWriter, ErrorKind, Write},
    path::Path,
};

use anyhow::Context;
use serde::{Deserialize, Serialize};

const INVALIDATION_MARKER: &str = "__turbo_tasks_invalidated_db";

const EXPLANATION: &str = "The cache database has been invalidated. The existence of this file \
                           will cause the cache directory to be cleaned up the next time \
                           Turbopack starts up.";
const EASTER_EGG: &str =
    "you just wrote me, and this is crazy, but if you see me, delete everything maybe?";

/// The data written to the file at [`INVALIDATION_MARKER`].
#[derive(Serialize, Deserialize)]
struct InvalidationFile<'a> {
    #[serde(skip_deserializing)]
    _explanation: Option<&'static str>,
    #[serde(skip_deserializing)]
    _easter_egg: Option<&'static str>,
    /// See [`StartupCacheState::Invalidated::reason_code`].
    reason_code: Cow<'a, str>,
}

/// Information about if there's was a pre-existing cache or if the cache was detected as
/// invalidated during startup.
///
/// If the cache was invalidated, the application may choose to show a warning to the user or log it
/// to telemetry.
///
/// This value is returned by [`crate::turbo_backing_storage`] and
/// [`crate::default_backing_storage`].
pub enum StartupCacheState {
    NoCache,
    Cached,
    Invalidated {
        /// A short code passed to [`BackingStorage::invalidate`]. This value is
        /// application-specific.
        ///
        /// If the value is `None` or doesn't match an expected value, the application should just
        /// treat this reason as unknown. The invalidation file may have been corrupted or
        /// modified by an external tool.
        ///
        /// See [`invalidation_reasons`] for some common reason codes.
        ///
        /// [`BackingStorage::invalidate`]: crate::BackingStorage::invalidate
        reason_code: Option<String>,
    },
}

/// Common invalidation reason codes. The application or libraries it uses may choose to use these
/// reasons, or it may define it's own reasons.
pub mod invalidation_reasons {
    /// This invalidation reason is used by [`crate::turbo_backing_storage`] when the database was
    /// invalidated by a panic.
    pub const PANIC: &str = concat!(module_path!(), "::PANIC");
    /// Indicates that the user explicitly clicked a button or ran a command that invalidates the
    /// cache.
    pub const USER_REQUEST: &str = concat!(module_path!(), "::USER_REQUEST");
}

/// Atomically create an invalidation marker.
///
/// Makes a best-effort attempt to write `reason_code` to the file, but ignores any failure with
/// writing to the file.
///
/// Because attempting to delete currently open database files could cause issues, actual deletion
/// of files is deferred until the next start-up (in [`check_db_invalidation_and_cleanup`]).
///
/// In the case that no database is currently open (e.g. via a separate CLI subcommand), you should
/// call [`cleanup_db`] *after* this to eagerly remove the database files.
///
/// This should be run with the base (non-versioned) path, as that likely aligns closest with user
/// expectations (e.g. if they're clearing the cache for disk space reasons).
///
/// In most cases, you should prefer a higher-level API like [`crate::BackingStorage::invalidate`]
/// to this one.
pub(crate) fn invalidate_db(base_path: &Path, reason_code: &str) -> anyhow::Result<()> {
    match File::create_new(base_path.join(INVALIDATION_MARKER)) {
        Ok(file) => {
            let mut writer = BufWriter::new(file);
            // ignore errors: We've already successfully invalidated the cache just by creating the
            // marker file, writing the reason_code is best-effort.
            let _ = serde_json::to_writer_pretty(
                &mut writer,
                &InvalidationFile {
                    _explanation: Some(EXPLANATION),
                    _easter_egg: Some(EASTER_EGG),
                    reason_code: Cow::Borrowed(reason_code),
                },
            );
            let _ = writer.flush();
            Ok(())
        }
        // the database was already invalidated, avoid overwriting that reason or risking concurrent
        // writes to the same file.
        Err(err) if err.kind() == ErrorKind::AlreadyExists => Ok(()),
        // just ignore if the cache directory doesn't exist at all
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err).context("Failed to invalidate database"),
    }
}

/// Called during startup. See if the db is in a partially-completed invalidation state. Find and
/// delete any invalidated database files.
///
/// This should be run with the base (non-versioned) path.
///
/// In most cases, you should prefer a higher-level API like
/// [`crate::KeyValueDatabaseBackingStorage::open_versioned_on_disk`] to this one.
pub(crate) fn check_db_invalidation_and_cleanup(
    base_path: &Path,
) -> anyhow::Result<StartupCacheState> {
    match File::open(base_path.join(INVALIDATION_MARKER)) {
        Ok(file) => {
            // Best-effort: Try to read the reason_code from the file, if the file format is
            // corrupted (or anything else) just use `None`.
            let reason_code = serde_json::from_reader::<_, InvalidationFile>(BufReader::new(file))
                .ok()
                .map(|contents| contents.reason_code.into_owned());
            // `file` is dropped at this point: That's important for Windows where we can't delete
            // open files.

            // if this cleanup fails, we might try to open an invalid database later, so it's best
            // to just propagate the error here.
            cleanup_db(base_path)?;
            Ok(StartupCacheState::Invalidated { reason_code })
        }
        Err(err) if err.kind() == ErrorKind::NotFound => {
            if fs::exists(base_path)? {
                Ok(StartupCacheState::Cached)
            } else {
                Ok(StartupCacheState::NoCache)
            }
        }
        Err(err) => Err(err)
            .with_context(|| format!("Failed to check for {INVALIDATION_MARKER} in {base_path:?}")),
    }
}

/// Helper for [`check_db_invalidation_and_cleanup`]. You can call this to explicitly clean up a
/// database after running [`invalidate_db`] when turbo-tasks is not running.
///
/// You should not run this if the database has not yet been invalidated, as this operation is not
/// atomic and could result in a partially-deleted and corrupted database.
pub(crate) fn cleanup_db(base_path: &Path) -> anyhow::Result<()> {
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
            if entry.file_type()?.is_dir() {
                fs::remove_dir_all(entry.path())?;
            } else {
                fs::remove_file(entry.path())?;
            }
        }
    }

    // delete the invalidation marker last, once we're sure everything is cleaned up
    fs::remove_file(base_path.join(INVALIDATION_MARKER))?;
    Ok(())
}
