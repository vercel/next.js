//! A temporary directory for tests that also works on WASI.
//!
//! `std::env::temp_dir()` is unconditionally unsupported on WASI — it panics with "not supported by
//! WASI yet" rather than consulting `TMPDIR` — so `tempfile::tempdir()`, which asks it where to put
//! the directory, aborts every test that uses it.
//!
//! The filesystem itself is fine: the WASI test host pre-opens the host's real temporary directory
//! and exposes its guest path through `TMPDIR`. Creating a private directory there keeps test
//! debris out of the checkout while remaining reachable from every WASI pthread instance.

use std::io;

use tempfile::TempDir;

#[cfg(target_family = "wasm")]
const WASM_TEMP_DIR_ENV: &str = "TMPDIR";

/// Creates a temporary directory that is removed when the returned [`TempDir`] is dropped.
///
/// Prefer this over [`tempfile::tempdir`] in tests: it behaves identically on native targets and
/// additionally works on WASI, where the system temporary directory does not exist.
pub(crate) fn test_temp_dir() -> io::Result<TempDir> {
    #[cfg(not(target_family = "wasm"))]
    let dir = tempfile::tempdir()?;
    #[cfg(target_family = "wasm")]
    let dir = {
        let base = std::env::var_os(WASM_TEMP_DIR_ENV).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("WASI test host did not provide {WASM_TEMP_DIR_ENV}"),
            )
        })?;
        tempfile::Builder::new().tempdir_in(base)?
    };
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::test_temp_dir;

    #[test]
    fn creates_a_private_test_directory() {
        let dir = test_temp_dir().expect("test temp directory should be available");
        assert!(dir.path().is_dir());

        #[cfg(target_family = "wasm")]
        assert!(
            dir.path().starts_with(
                std::env::var_os(super::WASM_TEMP_DIR_ENV)
                    .expect("WASI test host should provide TMPDIR")
            )
        );
    }
}
