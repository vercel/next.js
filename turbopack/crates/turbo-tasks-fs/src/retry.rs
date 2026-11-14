use std::{
    io::{self, ErrorKind},
    time::Duration,
};

const MAX_RETRY_ATTEMPTS: usize = 10;

/// Retries a blocking io operation up to `MAX_RETRY_ATTEMPTS` in a loop. Retries upon
/// [`ErrorKind::PermissionDenied`] or [`ErrorKind::WouldBlock`], and on Unix also upon `EMFILE`
/// or `ENFILE` (too many open files). This default behavior is implemented by [`can_retry`].
///
/// Retry logic is rarely useful on POSIX operating systems, but is often useful on Windows with
/// NTFS. E.g. a file deletion may fail because an AV process has opened the file, and opened files
/// cannot be deleted on Windows. Retries are the only mitigation for such issues.
///
/// This used to use [`tokio::task::spawn_blocking`], but now the IO operation blocks the current
/// thread, as we already wrap callers of this function in
/// `ConcurrencyLimitedExt::concurrency_limited` (in `disk.rs`) and it
/// appears to be faster to block the tokio thread than to spawn. Most of our IO operations are very
/// short anyways. See this PR: <https://github.com/vercel/next.js/pull/87661>.
pub(crate) async fn retry_blocking<T>(func: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    retry_blocking_custom(func, can_retry).await
}

/// A customizable version of [`retry_blocking`] that allows retrying on arbitrary errors.
pub(crate) async fn retry_blocking_custom<T, E>(
    mut func: impl FnMut() -> Result<T, E>,
    mut can_retry: impl FnMut(&E) -> bool,
) -> Result<T, E> {
    let mut attempt = 1;
    loop {
        return match func() {
            Ok(val) => Ok(val),
            Err(err) => {
                if attempt < MAX_RETRY_ATTEMPTS && can_retry(&err) {
                    tokio::time::sleep(get_retry_wait_time(attempt)).await;
                    attempt += 1;
                    continue;
                }

                Err(err)
            }
        };
    }
}

/// The default implementation of error checking used by [`retry_blocking`]. Returns true if it
/// would make sense to retry a failed IO operation.
///
/// On Unix, `EMFILE` (per-process limit) and `ENFILE` (system-wide limit) are retried as well:
/// these "too many open files" errors are usually transient, e.g. when many concurrent operations
/// hold file descriptors at the same time, and file descriptors are freed again when they finish.
/// They don't map to a stable [`ErrorKind`], so the raw OS error is checked.
pub fn can_retry(err: &io::Error) -> bool {
    if matches!(
        err.kind(),
        ErrorKind::PermissionDenied | ErrorKind::WouldBlock
    ) {
        return true;
    }
    #[cfg(unix)]
    if matches!(err.raw_os_error(), Some(libc::EMFILE | libc::ENFILE)) {
        return true;
    }
    false
}

fn get_retry_wait_time(attempt: usize) -> Duration {
    debug_assert!(attempt >= 1);
    // The first retry attempt (1) is instant
    Duration::from_millis((attempt - 1) as u64 * 100)
}

#[cfg(test)]
mod tests {
    use std::io::{self, ErrorKind};

    use super::*;

    #[test]
    fn can_retry_existing_error_kinds() {
        assert!(can_retry(&io::Error::from(ErrorKind::PermissionDenied)));
        assert!(can_retry(&io::Error::from(ErrorKind::WouldBlock)));
        assert!(!can_retry(&io::Error::from(ErrorKind::NotFound)));
        assert!(!can_retry(&io::Error::from(ErrorKind::InvalidData)));
    }

    #[cfg(unix)]
    #[test]
    fn can_retry_too_many_open_files() {
        assert!(can_retry(&io::Error::from_raw_os_error(libc::EMFILE)));
        assert!(can_retry(&io::Error::from_raw_os_error(libc::ENFILE)));
        assert!(!can_retry(&io::Error::from_raw_os_error(libc::ENOENT)));
        assert!(!can_retry(&io::Error::from_raw_os_error(libc::EISDIR)));
    }

    #[cfg(unix)]
    #[tokio::test(start_paused = true)]
    async fn retry_blocking_succeeds_after_emfile() {
        let mut attempts = 0;
        let result = retry_blocking(|| {
            attempts += 1;
            if attempts <= 2 {
                Err(io::Error::from_raw_os_error(libc::EMFILE))
            } else {
                Ok(attempts)
            }
        })
        .await;
        assert_eq!(result.unwrap(), 3);
    }

    #[cfg(unix)]
    #[tokio::test(start_paused = true)]
    async fn retry_blocking_gives_up_after_max_attempts() {
        let mut attempts = 0;
        let result: io::Result<()> = retry_blocking(|| {
            attempts += 1;
            Err(io::Error::from_raw_os_error(libc::ENFILE))
        })
        .await;
        assert_eq!(result.unwrap_err().raw_os_error(), Some(libc::ENFILE));
        assert_eq!(attempts, MAX_RETRY_ATTEMPTS);
    }

    /// Lowers `RLIMIT_NOFILE` and exhausts the file descriptor table, so creating a file fails
    /// with a real `EMFILE`, then frees the descriptors shortly after and checks that the retried
    /// file creation eventually succeeds.
    ///
    /// The resource limit is process-wide, so the actual check runs in a child process (this test
    /// binary re-executed with only this test selected) to not affect other tests.
    #[cfg(target_os = "linux")]
    #[test]
    fn retry_blocking_recovers_from_rlimit_nofile_exhaustion() {
        const CHILD_ENV: &str = "TURBO_TASKS_FS_RETRY_RLIMIT_CHILD";
        const TEST_NAME: &str =
            "retry::tests::retry_blocking_recovers_from_rlimit_nofile_exhaustion";

        let dir = match std::env::var_os(CHILD_ENV) {
            Some(dir) => std::path::PathBuf::from(dir),
            None => {
                let dir = tempfile::tempdir().unwrap();
                let output = std::process::Command::new(std::env::current_exe().unwrap())
                    .args([TEST_NAME, "--exact", "--nocapture", "--test-threads=1"])
                    .env(CHILD_ENV, dir.path())
                    .output()
                    .unwrap();
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                assert!(
                    output.status.success(),
                    "child process failed:\n{stdout}\n{stderr}"
                );
                // Make sure the child actually ran the test instead of filtering it out.
                assert!(
                    stdout.contains("1 passed"),
                    "child process didn't run the test:\n{stdout}\n{stderr}"
                );
                return;
            }
        };

        // Create the runtime before exhausting the file descriptors, as it needs some itself.
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();

        let mut limit = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        assert_eq!(
            unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit) },
            0
        );
        // Leave some headroom above the descriptors that are already open.
        let open_fds = std::fs::read_dir("/proc/self/fd").unwrap().count() as libc::rlim_t;
        limit.rlim_cur = limit.rlim_max.min(open_fds + 32);
        assert_eq!(unsafe { libc::setrlimit(libc::RLIMIT_NOFILE, &limit) }, 0);

        let mut held = Vec::new();
        loop {
            match std::fs::File::open("/dev/null") {
                Ok(file) => held.push(file),
                Err(err) => {
                    assert_eq!(err.raw_os_error(), Some(libc::EMFILE));
                    break;
                }
            }
        }
        assert!(!held.is_empty());

        let path = dir.join("file.txt");
        let path = &path;
        let mut attempts = 0;
        let result = runtime.block_on(async {
            let releaser = async {
                tokio::time::sleep(Duration::from_millis(150)).await;
                drop(held);
            };
            let write = retry_blocking(|| {
                attempts += 1;
                std::fs::write(path, "content")
            });
            futures::join!(releaser, write).1
        });
        result.unwrap();
        assert!(attempts > 1, "expected the write to fail with EMFILE first");
        assert_eq!(std::fs::read_to_string(path).unwrap(), "content");
    }
}
