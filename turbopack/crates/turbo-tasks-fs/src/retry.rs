use std::{
    io::{self, ErrorKind},
    path::{Path, PathBuf},
    thread::sleep,
    time::Duration,
};

const MAX_RETRY_ATTEMPTS: usize = 10;

pub(crate) async fn retry_blocking<R, F>(path: PathBuf, func: F) -> io::Result<R>
where
    F: Fn(&Path) -> io::Result<R> + Send + 'static,
    R: Send + 'static,
{
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
