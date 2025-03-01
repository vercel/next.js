use std::{
    cell::RefCell,
    future::Future,
    pin::Pin,
    task::{Context, Poll},
    time::{Duration, Instant},
};

use pin_project_lite::pin_project;
use turbo_tasks_malloc::{AllocationInfo, TurboMalloc};

struct ThreadLocalData {
    duration: Duration,
    allocations: usize,
    deallocations: usize,
}

thread_local! {
    static EXTRA: RefCell<Option<*mut ThreadLocalData>> = const { RefCell::new(None) };
}

pin_project! {
    pub struct CaptureFuture<T, F: Future<Output = T>> {
        #[pin]
        future: F,
        duration: Duration,
        allocations: usize,
        deallocations: usize,
    }
}

impl<T, F: Future<Output = T>> CaptureFuture<T, F> {
    pub fn new(future: F) -> Self {
        Self {
            future,
            duration: Duration::ZERO,
            allocations: 0,
            deallocations: 0,
        }
    }
}

fn try_with_thread_local_data(f: impl FnOnce(&mut ThreadLocalData)) {
    EXTRA.with_borrow(|cell| {
        if let Some(data) = cell {
            // Safety: This data is thread local and only accessed in this thread
            unsafe {
                f(&mut **data);
            }
        }
    });
}

pub fn add_duration(duration: Duration) {
    try_with_thread_local_data(|data| {
        data.duration += duration;
    });
}

pub fn add_allocation_info(alloc_info: AllocationInfo) {
    try_with_thread_local_data(|data| {
        data.allocations += alloc_info.allocations;
        data.deallocations += alloc_info.deallocations;
    });
}

impl<T, F: Future<Output = T>> Future for CaptureFuture<T, F> {
    type Output = (T, Duration, usize);

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.project();
        let start = Instant::now();
        let start_allocations = TurboMalloc::allocation_counters();
        let guard = ThreadLocalDataDropGuard;
        let mut data = ThreadLocalData {
            duration: Duration::ZERO,
            allocations: 0,
            deallocations: 0,
        };
        EXTRA.with_borrow_mut(|cell| {
            *cell = Some(&mut data as *mut ThreadLocalData);
        });
        let result = this.future.poll(cx);
        drop(guard);
        let elapsed = start.elapsed();
        let allocations = start_allocations.until_now();
        *this.duration += elapsed + data.duration;
        *this.allocations += allocations.allocations + data.allocations;
        *this.deallocations += allocations.deallocations + data.deallocations;
        match result {
            Poll::Ready(r) => {
                let memory_usage = this.allocations.saturating_sub(*this.deallocations);
                Poll::Ready((r, *this.duration, memory_usage))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

struct ThreadLocalDataDropGuard;

impl Drop for ThreadLocalDataDropGuard {
    fn drop(&mut self) {
        EXTRA.with_borrow_mut(|cell| {
            *cell = None;
        });
    }
}
