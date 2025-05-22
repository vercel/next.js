use std::{
    cell::RefCell,
    fmt::Display,
    future::Future,
    panic,
    pin::Pin,
    task::{Context, Poll},
    time::{Duration, Instant},
};

use anyhow::Result;
use pin_project_lite::pin_project;
use turbo_tasks_malloc::{AllocationInfo, TurboMalloc};

use crate::{LAST_ERROR_LOCATION, backend::TurboTasksExecutionErrorMessage};

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

#[derive(Debug, Clone)]
pub struct TurboTasksPanic {
    pub message: TurboTasksExecutionErrorMessage,
    pub location: Option<String>,
}

impl Display for TurboTasksPanic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl<T, F: Future<Output = T>> Future for CaptureFuture<T, F> {
    type Output = (Result<T, TurboTasksPanic>, Duration, usize);

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

        let result =
            panic::catch_unwind(panic::AssertUnwindSafe(|| this.future.poll(cx))).map_err(|err| {
                let message = match err.downcast_ref::<&'static str>() {
                    Some(s) => TurboTasksExecutionErrorMessage::PIISafe(s),
                    None => match err.downcast_ref::<String>() {
                        Some(s) => TurboTasksExecutionErrorMessage::NonPIISafe(s.clone()),
                        None => {
                            let error_message = err
                                .downcast_ref::<Box<dyn Display>>()
                                .map(|e| e.to_string())
                                .unwrap_or_else(|| String::from("<unknown panic>"));

                            TurboTasksExecutionErrorMessage::NonPIISafe(error_message)
                        }
                    },
                };

                LAST_ERROR_LOCATION.with_borrow(|loc| TurboTasksPanic {
                    message,
                    location: loc.clone(),
                })
            });

        drop(guard);
        let elapsed = start.elapsed();
        let allocations = start_allocations.until_now();
        *this.duration += elapsed + data.duration;
        *this.allocations += allocations.allocations + data.allocations;
        *this.deallocations += allocations.deallocations + data.deallocations;
        match result {
            Err(err) => {
                let memory_usage = this.allocations.saturating_sub(*this.deallocations);
                Poll::Ready((Err(err), *this.duration, memory_usage))
            }
            Ok(Poll::Ready(r)) => {
                let memory_usage = this.allocations.saturating_sub(*this.deallocations);
                Poll::Ready((Ok(r), *this.duration, memory_usage))
            }
            Ok(Poll::Pending) => Poll::Pending,
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
