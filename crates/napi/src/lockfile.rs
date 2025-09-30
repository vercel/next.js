use std::{
    fs::{File, TryLockError},
    mem::ManuallyDrop,
    sync::Mutex,
};

use anyhow::Context;
use napi::bindgen_prelude::External;

/// A wrapper around `File` that is passed to JS, and is set to `None` when [`lockfile_unlock`] is
/// called.
///
/// This uses `ManuallyDrop` to prevent exposing close-on-drop semantics to JS, as its not idiomatic
/// to rely on GC behaviors in JS.
type JsLockfile = Mutex<ManuallyDrop<Option<File>>>;

#[napi(ts_return_type = "{ __napiType: \"Lockfile\" } | null")]
pub fn lockfile_try_acquire_sync(path: String) -> napi::Result<Option<External<JsLockfile>>> {
    let f = File::create(path)?;
    match f.try_lock() {
        Ok(_) => Ok(Some(External::new(Mutex::new(ManuallyDrop::new(Some(f)))))),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(err)) => Err(err.into()),
    }
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
    let f: Option<File> = lockfile
        .lock()
        .expect("poisoned: another thread panicked during `lockfile_unlock_sync`?")
        .take();
    drop(f);
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
