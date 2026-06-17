use std::{
    io::{self, ErrorKind},
    time::Duration,
};

const MAX_RETRY_ATTEMPTS: usize = 10;

/// Retries a blocking io operation up to `MAX_RETRY_ATTEMPTS` in a loop. Retries upon
/// [`ErrorKind::PermissionDenied`] or [`ErrorKind::WouldBlock`]. This default behavior is
/// implemented by [`can_retry`].
///
/// Retry logic is rarely useful on POSIX operating systems, but is often useful on Windows with
/// NTFS. E.g. a file deletion may fail because an AV process has opened the file, and opened files
/// cannot be deleted on Windows. Retries are the only mitigation for such issues.
///
/// This used to use [`tokio::task::spawn_blocking`], but now the IO operation blocks the current
/// thread, as we already wrap callers of this function in
/// [`crate::ConcurrencyLimitedExt::concurrency_limited`] and it
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
pub fn can_retry(err: &io::Error) -> bool {
    matches!(
        err.kind(),
        ErrorKind::PermissionDenied | ErrorKind::WouldBlock
    )
}

fn get_retry_wait_time(attempt: usize) -> Duration {
    Duration::from_millis((attempt as u64) * 100)
}
