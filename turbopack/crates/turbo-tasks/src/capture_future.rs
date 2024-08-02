use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll},
    time::{Duration, Instant},
};

use pin_project_lite::pin_project;
use tokio::{task::futures::TaskLocalFuture, task_local};
use turbo_tasks_malloc::{AllocationInfo, TurboMalloc};

task_local! {
    static EXTRA: Arc<Mutex<(Duration, usize, usize)>>;
}

pin_project! {
    pub struct CaptureFuture<T, F: Future<Output = T>> {
        cell: Arc<Mutex<(Duration, usize, usize)>>,
        #[pin]
        future: TaskLocalFuture<Arc<Mutex<(Duration, usize, usize)>>, F>,
        duration: Duration,
        allocations: usize,
        deallocations: usize,
    }
}

impl<T, F: Future<Output = T>> CaptureFuture<T, F> {
    pub fn new(future: F) -> Self {
        let cell = Arc::new(Mutex::new((Duration::ZERO, 0, 0)));
        Self {
            future: EXTRA.scope(cell.clone(), future),
            cell,
            duration: Duration::ZERO,
            allocations: 0,
            deallocations: 0,
        }
    }
}

pub fn add_duration(duration: Duration) {
    EXTRA.with(|cell| cell.lock().unwrap().0 += duration);
}

pub fn add_allocation_info(alloc_info: AllocationInfo) {
    EXTRA.with(|cell| {
        let mut guard = cell.lock().unwrap();
        guard.1 += alloc_info.allocations;
        guard.2 += alloc_info.deallocations;
    });
}

impl<T, F: Future<Output = T>> Future for CaptureFuture<T, F> {
    type Output = (T, Duration, usize);

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.project();
        let start = Instant::now();
        let start_allocations = TurboMalloc::allocation_counters();
        let result = this.future.poll(cx);
        let elapsed = start.elapsed();
        let allocations = start_allocations.until_now();
        *this.duration += elapsed;
        *this.allocations += allocations.allocations;
        *this.deallocations += allocations.deallocations;
        match result {
            Poll::Ready(r) => {
                let (duration, allocations, deallocations) = *this.cell.lock().unwrap();
                let memory_usage = (*this.allocations + allocations)
                    .saturating_sub(*this.deallocations + deallocations);
                Poll::Ready((r, *this.duration + duration, memory_usage))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}
