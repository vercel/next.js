use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll},
    time::{Duration, Instant},
};

use pin_project_lite::pin_project;
use tokio::{task::futures::TaskLocalFuture, task_local};

task_local! {
    static EXTRA_DURATION: Arc<Mutex<Duration>>;
}

pin_project! {
    pub struct TimedFuture<T, F: Future<Output = T>> {
        cell: Arc<Mutex<Duration>>,
        #[pin]
        future: TaskLocalFuture<Arc<Mutex<Duration>>, F>,
        duration: Duration,
    }
}

impl<T, F: Future<Output = T>> TimedFuture<T, F> {
    pub fn new(future: F) -> Self {
        let cell = Arc::new(Mutex::new(Duration::ZERO));
        Self {
            future: EXTRA_DURATION.scope(cell.clone(), future),
            cell,
            duration: Duration::ZERO,
        }
    }
}

pub fn add_duration(duration: Duration) {
    EXTRA_DURATION.with(|cell| *cell.lock().unwrap() += duration);
}

impl<T, F: Future<Output = T>> Future for TimedFuture<T, F> {
    type Output = (T, Duration, Instant);

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.project();
        let start = Instant::now();
        let result = this.future.poll(cx);
        let elapsed = start.elapsed();
        *this.duration += elapsed;
        match result {
            Poll::Ready(r) => Poll::Ready((
                r,
                *this.duration + *this.cell.lock().unwrap(),
                start + elapsed,
            )),
            Poll::Pending => Poll::Pending,
        }
    }
}
