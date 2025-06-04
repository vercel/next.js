use std::{future::Future, io, io::ErrorKind, path::Path, thread::sleep, time::Duration};

use futures_retry::{ErrorHandler, FutureRetry, RetryPolicy};

const MAX_RETRY_ATTEMPTS: usize = 10;

pub(crate) async fn retry_future<'a, R, F, Fut>(func: F) -> io::Result<R>
where
    F: FnMut() -> Fut + Unpin,
    Fut: Future<Output = io::Result<R>> + 'a,
{
    match FutureRetry::new(
        func,
        FsRetryHandler {
            max_attempts: MAX_RETRY_ATTEMPTS,
        },
    )
    .await
    {
        Ok((r, _attempts)) => Ok(r),
        Err((err, _attempts)) => Err(err),
    }
}

pub(crate) async fn retry_blocking<R, F>(path: impl AsRef<Path>, func: F) -> io::Result<R>
where
    F: Fn(&Path) -> io::Result<R> + Send + 'static,
    R: Send + 'static,
{
    let path = path.as_ref().to_owned();

    turbo_tasks::spawn_blocking(move || {
        let mut attempt = 1;

        loop {
            return match func(&path) {
                Ok(r) => Ok(r),
                Err(err) => {
                    if attempt < MAX_RETRY_ATTEMPTS && can_retry(&err) {
                        sleep(get_retry_wait_time(attempt));
                        attempt += 1;
                        continue;
                    }

                    Err(err)
                }
            };
        }
    })
    .await
}

fn can_retry(err: &io::Error) -> bool {
    matches!(
        err.kind(),
        ErrorKind::PermissionDenied | ErrorKind::WouldBlock
    )
}

fn get_retry_wait_time(attempt: usize) -> Duration {
    Duration::from_millis((attempt as u64) * 100)
}

struct FsRetryHandler {
    max_attempts: usize,
}

impl ErrorHandler<io::Error> for FsRetryHandler {
    type OutError = io::Error;

    fn handle(&mut self, attempt: usize, e: io::Error) -> RetryPolicy<io::Error> {
        if attempt == self.max_attempts || !can_retry(&e) {
            RetryPolicy::ForwardError(e)
        } else {
            RetryPolicy::WaitRetry(get_retry_wait_time(attempt))
        }
    }
}
