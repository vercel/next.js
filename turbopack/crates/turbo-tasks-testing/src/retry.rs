#[cfg(feature = "tokio_runtime")]
use std::future::Future;
use std::time::Duration;

pub fn retry<A, F, R, E>(
    mut args: A,
    f: F,
    max_retries: usize,
    mut timeout: Duration,
) -> Result<R, E>
where
    F: Fn(&mut A) -> Result<R, E>,
{
    let mut retries = 0usize;
    loop {
        match f(&mut args) {
            Ok(value) => return Ok(value),
            Err(e) => {
                if retries >= max_retries {
                    return Err(e);
                }
                retries += 1;
                std::thread::sleep(timeout);
                timeout += timeout;
            }
        }
    }
}

#[cfg(feature = "tokio_runtime")]
pub async fn retry_async<A, F, Fut, R, E>(
    mut args: A,
    f: F,
    max_retries: usize,
    mut timeout: Duration,
) -> Result<R, E>
where
    F: Fn(&mut A) -> Fut,
    Fut: Future<Output = Result<R, E>>,
{
    let mut retries = 0usize;
    loop {
        match f(&mut args).await {
            Ok(value) => return Ok(value),
            Err(e) => {
                if retries >= max_retries {
                    return Err(e);
                }
                retries += 1;
                tokio::time::sleep(timeout).await;
                timeout += timeout;
            }
        }
    }
}
