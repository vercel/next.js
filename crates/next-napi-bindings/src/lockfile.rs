use std::{
    io::{self, Write},
    mem::ManuallyDrop,
    sync::Mutex,
};

use anyhow::Context;
use fs_err::File;
use napi::{
    Env,
    bindgen_prelude::{External, ExternalRef, PromiseRaw},
};
use napi_derive::napi;

/// A wrapper around [`File`] that is passed to JS, and is set to `None` when [`lockfile_unlock`] is
/// called.
///
/// This uses [`ManuallyDrop`] to prevent exposing close-on-drop semantics to JS, as its not
/// idiomatic to rely on GC behaviors in JS.
///
/// When the file is unlocked, the file at that path will be deleted (best-effort).
type JsLockfile = Mutex<ManuallyDrop<Option<File>>>;

/// OS failures are returned as data so JS can distinguish retryable errors from unsupported locks.
#[napi(object, object_from_js = false)]
pub struct LockfileError {
    pub message: String,
    pub transient: bool,
    pub unsupported: bool,
}

impl LockfileError {
    /// Use this for IO errors that occur prior to lock acquition, e.g. during file open or while
    /// writing data.
    fn new_generic(error: io::Error) -> Self {
        Self {
            message: error.to_string(),
            transient: false,
            unsupported: false,
        }
    }

    /// Use this when an error occurs during lock acquition.
    fn new_from_lock_acquire(error: io::Error, path: &str) -> Self {
        let kind = error.kind();

        // LOCK_NB only avoids waiting for a conflicting lock. NFS may still wait for a lock-manager
        // RPC, which can be interrupted by a signal and return EINTR.
        let transient = kind == io::ErrorKind::Interrupted;

        // ENOLCK can mean the NFS lock service is temporarily unavailable or lock resources
        // are exhausted. It doesn't establish that locking is unsupported, so retry it.
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        let transient = {
            #[cfg(target_os = "linux")]
            const ENOLCK: i32 = 37;
            #[cfg(target_os = "macos")]
            const ENOLCK: i32 = 77;
            transient || error.raw_os_error() == Some(ENOLCK)
        };

        let unsupported = kind == io::ErrorKind::Unsupported;

        Self {
            // Unlike other fs_err operations, try_lock forwards errors without path context.
            message: format!("Failed to acquire lockfile at '{path}': {error}"),
            transient,
            unsupported,
        }
    }
}

#[napi(discriminant_case = "camelCase", object_from_js = false)]
pub enum LockfileResult {
    Acquired {
        #[napi(ts_type = "{ __napiType: \"Lockfile\" }")]
        lockfile: External<JsLockfile>,
    },
    WouldBlock,
    Error {
        error: LockfileError,
    },
}

fn lockfile_try_acquire_sync_inner(
    path: &str,
    content: Option<&str>,
) -> io::Result<LockfileResult> {
    #[cfg(windows)]
    let mut file = {
        use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt};

        use windows_sys::Win32::{Foundation, Storage::FileSystem};

        // On Windows, opening with write mode without FILE_SHARE_WRITE acts as the lock.
        // We use truncate(true) here because if we can open the file, we have the lock.
        let mut open_options = OpenOptions::new();
        open_options.write(true).create(true).truncate(true);
        open_options
            .share_mode(FileSystem::FILE_SHARE_READ | FileSystem::FILE_SHARE_DELETE)
            .custom_flags(FileSystem::FILE_FLAG_DELETE_ON_CLOSE);
        // Inspect the raw error before fs_err wraps it, so contention remains distinguishable
        // from other open failures. Use fs_err for subsequent operations on the acquired file.
        match open_options.open(path) {
            Ok(file) => File::from_parts(file, path),
            Err(err)
                if err.raw_os_error()
                    == Some(Foundation::ERROR_SHARING_VIOLATION.try_into().unwrap()) =>
            {
                return Ok(LockfileResult::WouldBlock);
            }
            Err(error) => {
                return Ok(LockfileResult::Error {
                    error: LockfileError::new_from_lock_acquire(error, path),
                });
            }
        }
    };

    #[cfg(not(windows))]
    let mut file = {
        use std::fs::TryLockError;

        // On Unix, we must NOT truncate on open because flock is advisory -
        // opening with truncate would clear another process's lockfile content.
        // Instead, open without truncate, acquire the lock, then truncate.
        let mut open_options = fs_err::OpenOptions::new();
        open_options.write(true).create(true).read(true);

        let file = open_options.open(path)?;
        match file.try_lock() {
            Ok(_) => {
                file.set_len(0)?;
                file
            }
            Err(TryLockError::WouldBlock) => return Ok(LockfileResult::WouldBlock),
            Err(TryLockError::Error(error)) => {
                return Ok(LockfileResult::Error {
                    error: LockfileError::new_from_lock_acquire(error, path),
                });
            }
        }
    };

    if let Some(data) = content {
        file.write_all(data.as_bytes())?;
        file.flush()?;
    }
    Ok(LockfileResult::Acquired {
        lockfile: External::new(Mutex::new(ManuallyDrop::new(Some(file)))),
    })
}

#[napi]
pub fn lockfile_try_acquire_sync(path: String, content: Option<String>) -> LockfileResult {
    lockfile_try_acquire_sync_inner(&path, content.as_deref()).unwrap_or_else(|error| {
        LockfileResult::Error {
            // this is a normal IO error on some operation other than actually acquiring the lock
            error: LockfileError::new_generic(error),
        }
    })
}

#[napi]
pub async fn lockfile_try_acquire(
    path: String,
    content: Option<String>,
) -> napi::Result<LockfileResult> {
    Ok(
        tokio::task::spawn_blocking(move || lockfile_try_acquire_sync(path, content))
            .await
            .context("panicked while attempting to acquire lockfile")?,
    )
}

#[napi]
pub fn lockfile_unlock_sync(
    #[napi(ts_arg_type = "{ __napiType: \"Lockfile\" }")] lockfile: ExternalRef<JsLockfile>,
) {
    let Some(file) = take_lockfile(&lockfile) else {
        return;
    };
    unlock_file(file);
}

#[napi]
pub fn lockfile_unlock<'env>(
    env: &'env Env,
    #[napi(ts_arg_type = "{ __napiType: \"Lockfile\" }")] lockfile: ExternalRef<JsLockfile>,
) -> napi::Result<PromiseRaw<'env, ()>> {
    // Take the owned file out on the JS thread (the `ExternalRef` is `!Send`), then release the
    // lock on the blocking pool: the unlink and close can block (e.g. NFS), and must not stall the
    // Node.js event loop.
    let file = take_lockfile(&lockfile);
    env.spawn_future(async move {
        let Some(file) = file else {
            return Ok(());
        };
        tokio::task::spawn_blocking(move || unlock_file(file))
            .await
            .context("panicked while attempting to unlock lockfile")?;
        Ok(())
    })
}

/// Removes the [`File`] from the `ManuallyDrop` wrapper, leaving `None` behind so a
/// second unlock call is a no-op.
fn take_lockfile(lockfile: &JsLockfile) -> Option<File> {
    lockfile
        .lock()
        .expect("poisoned: another thread panicked while unlocking this lockfile")
        .take()
}

fn unlock_file(file: File) {
    // We don't need the file handle anymore, so we don't need to call `File::unlock`. Locks are
    // released during `drop`.
    //
    // - We use `FILE_FLAG_DELETE_ON_CLOSE` on Windows, so we don't need to delete the file there.
    // - Ignore possible errors while removing the file, it only matters that we release the lock.
    // - Delete *before* releasing the lock to avoid race conditions where we might accidentally
    //   delete another process's lockfile. This relies on POSIX semantics, letting us delete an
    //   open file.
    #[cfg(not(windows))]
    let _ = fs_err::remove_file(file.path());

    drop(file);
}
