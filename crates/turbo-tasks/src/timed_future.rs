use std::{
    future::Future,
    pin::Pin,
    task::{Context, Poll},
    time::{Duration, Instant},
};

pub struct TimedFuture<T, F: Future<Output = T>> {
    future: F,
    duration: Duration,
}

impl<T, F: Future<Output = T>> TimedFuture<T, F> {
    pub fn new(future: F) -> Self {
        Self {
            future,
            duration: Duration::ZERO,
        }
    }
}

impl<T, F: Future<Output = T>> Future for TimedFuture<T, F> {
    type Output = (T, Duration);

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = unsafe { self.get_unchecked_mut() };
        let future = unsafe { Pin::new_unchecked(&mut this.future) };
        let start = Instant::now();
        let result = future.poll(cx);
        let elapsed = start.elapsed();
        this.duration += elapsed;
        match result {
            Poll::Ready(r) => Poll::Ready((r, this.duration)),
            Poll::Pending => Poll::Pending,
        }
    }
}
