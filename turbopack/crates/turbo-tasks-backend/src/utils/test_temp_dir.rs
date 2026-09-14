//! A temporary directory for tests that also works on WASI.
//!
//! `std::env::temp_dir()` is unconditionally unsupported on WASI — it panics with "not supported by
//! WASI yet" rather than consulting `TMPDIR` — so `tempfile::tempdir()`, which asks it where to put
//! the directory, aborts every test that uses it.
//!
//! The filesystem itself is fine: a WASI guest can only reach directories the host pre-opens for
//! it, and the test host pre-opens the working directory as `/`. Creating the temporary directory
//! *inside* a pre-opened directory therefore works, and is all these tests actually need — they
//! only ever want a private scratch directory, not the system one.

use std::io;

use tempfile::TempDir;

/// The pre-opened directory to create temporary directories under on WASI.
///
/// The WASI test host (`scripts/wasi-test-host/run.mjs`) pre-opens the process working directory as
/// `/`, so this resolves to a real, writable directory. Keep it in sync with that host.
#[cfg(target_family = "wasm")]
const WASM_TEMP_DIR_BASE: &str = "/";

/// Creates a temporary directory that is removed when the returned [`TempDir`] is dropped.
///
/// Prefer this over [`tempfile::tempdir`] in tests: it behaves identically on native targets and
/// additionally works on WASI, where the system temporary directory does not exist.
pub(crate) fn test_temp_dir() -> io::Result<TempDir> {
    #[cfg(not(target_family = "wasm"))]
    let dir = tempfile::tempdir()?;
    #[cfg(target_family = "wasm")]
    let dir = tempfile::Builder::new().tempdir_in(WASM_TEMP_DIR_BASE)?;
    Ok(dir)
}
