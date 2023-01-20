use std::{
    future::Future,
    sync::atomic::{AtomicUsize, Ordering},
};

use turbo_tasks::event::Event;

/// A pair of two priorities which allows to run the higher priority task first.
pub struct PriorityPair {
    current: AtomicUsize,
    event: Event,
}

impl PriorityPair {
    pub fn new() -> Self {
        Self {
            current: AtomicUsize::new(0),
            event: Event::new(|| "PriorityPair::event".to_string()),
        }
    }

    pub fn start_high(&self) {
        self.current.fetch_add(1, Ordering::Release);
    }

    pub fn finish_high(&self) {
        if self.current.fetch_sub(1, Ordering::Release) == 1 {
            self.event.notify(usize::MAX);
        }
    }

    pub async fn run_low<T, F: Future<Output = T>>(&self, f: F) -> T {
        while self.current.load(Ordering::Acquire) != 0 {
            let listener = self.event.listen();
            if self.current.load(Ordering::Acquire) != 0 {
                listener.await;
            }
        }
        f.await
    }
}
