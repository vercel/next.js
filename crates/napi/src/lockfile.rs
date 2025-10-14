use std::{
    fs::{File, OpenOptions},
    mem::ManuallyDrop,
    sync::Mutex,
};

use anyhow::Context;
use napi::bindgen_prelude::External;

/// A wrapper around [`File`] that is passed to JS, and is set to `None` when [`lockfile_unlock`] is
/// called.
///
/// This uses [`ManuallyDrop`] to prevent exposing close-on-drop semantics to JS, as its not
/// idiomatic to rely on GC behaviors in JS.
///
/// When the file is unlocked, the file at that path will be deleted (best-effort).
type JsLockfile = Mutex<ManuallyDrop<Option<LockfileInner>>>;

pub struct LockfileInner {
    file: File,
    #[cfg(not(windows))]
    path: std::path::PathBuf,
}

#[napi(ts_return_type = "{ __napiType: \"Lockfile\" } | null")]
pub fn lockfile_try_acquire_sync(path: String) -> napi::Result<Option<External<JsLockfile>>> {
    let mut open_options = OpenOptions::new();
    open_options.write(true).create(true);

    // On Windows, we don't use `File::lock` because that grabs a mandatory lock. That can break
    // tools or code that read the contents of the `.next` directory because the mandatory lock
    // file will fail with EBUSY when read. Instead, we open a file with write mode, but without
    // `FILE_SHARE_WRITE`. That gives us behavior closer to what we get on POSIX platforms.
    //
    // On POSIX platforms, Rust uses `flock` which creates an advisory lock, which can be
    // read/written/deleted.

    #[cfg(windows)]
    return {
        use std::os::windows::fs::OpenOptionsExt;

        use windows_sys::Win32::{Foundation, Storage::FileSystem};

        open_options
            .share_mode(FileSystem::FILE_SHARE_READ | FileSystem::FILE_SHARE_DELETE)
            .custom_flags(FileSystem::FILE_FLAG_DELETE_ON_CLOSE);
        match open_options.open(&path) {
            Ok(file) => Ok(Some(External::new(Mutex::new(ManuallyDrop::new(Some(
                LockfileInner { file },
            )))))),
            Err(err)
                if err.raw_os_error()
                    == Some(Foundation::ERROR_SHARING_VIOLATION.try_into().unwrap()) =>
            {
                Ok(None)
            }
            Err(err) => Err(err.into()),
        }
    };

    #[cfg(not(windows))]
    return {
        use std::fs::TryLockError;

        let file = open_options.open(&path)?;
        match file.try_lock() {
            Ok(_) => Ok(Some(External::new(Mutex::new(ManuallyDrop::new(Some(
                LockfileInner {
                    file,
                    path: path.into(),
                },
            )))))),
            Err(TryLockError::WouldBlock) => Ok(None),
            Err(TryLockError::Error(err)) => Err(err.into()),
        }
    };
}

#[napi(ts_return_type = "Promise<{ __napiType: \"Lockfile\" } | null>")]
pub async fn lockfile_try_acquire(path: String) -> napi::Result<Option<External<JsLockfile>>> {
    tokio::task::spawn_blocking(move || lockfile_try_acquire_sync(path))
        .await
        .context("panicked while attempting to acquire lockfile")?
}

#[napi]
pub fn lockfile_unlock_sync(
    #[napi(ts_arg_type = "{ __napiType: \"Lockfile\" }")] lockfile: External<JsLockfile>,
) {
    // We don't need the file handle anymore, so we don't need to call `File::unlock`. Locks are
    // released during `drop`. Remove it from the `ManuallyDrop` wrapper.
    let Some(inner): Option<LockfileInner> = lockfile
        .lock()
        .expect("poisoned: another thread panicked during `lockfile_unlock_sync`?")
        .take()
    else {
        return;
    };

    // - We use `FILE_FLAG_DELETE_ON_CLOSE` on Windows, so we don't need to delete the file there.
    // - Ignore possible errors while removing the file, it only matters that we release the lock.
    // - Delete *before* releasing the lock to avoid race conditions where we might accidentally
    //   delete another process's lockfile. This relies on POSIX semantics, letting us delete an
    //   open file.
    #[cfg(not(windows))]
    let _ = std::fs::remove_file(inner.path);

    drop(inner.file);
}

#[napi]
pub async fn lockfile_unlock(
    #[napi(ts_arg_type = "{ __napiType: \"Lockfile\" }")] lockfile: External<JsLockfile>,
) -> napi::Result<()> {
    Ok(
        tokio::task::spawn_blocking(move || lockfile_unlock_sync(lockfile))
            .await
            .context("panicked while attempting to unlock lockfile")?,
    )
}
