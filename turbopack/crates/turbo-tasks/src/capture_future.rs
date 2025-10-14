use std::{
    borrow::Cow,
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
use serde::{Deserialize, Serialize};
use turbo_tasks_malloc::{AllocationInfo, TurboMalloc};

use crate::{backend::TurboTasksExecutionErrorMessage, panic_hooks::LAST_ERROR_LOCATION};

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
        allocations: AllocationInfo,
    }
}

impl<T, F: Future<Output = T>> CaptureFuture<T, F> {
    pub fn new(future: F) -> Self {
        Self {
            future,
            duration: Duration::ZERO,
            allocations: AllocationInfo::ZERO,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TurboTasksPanic {
    pub message: TurboTasksExecutionErrorMessage,
    pub location: Option<String>,
}

impl TurboTasksPanic {
    pub fn into_panic(self) -> Box<dyn std::any::Any + Send> {
        Box::new(format!(
            "{} at {}",
            self.message,
            self.location
                .unwrap_or_else(|| "unknown location".to_string())
        ))
    }
}

impl Display for TurboTasksPanic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl<T, F: Future<Output = T>> Future for CaptureFuture<T, F> {
    type Output = (Result<T, TurboTasksPanic>, Duration, AllocationInfo);

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
                    Some(s) => TurboTasksExecutionErrorMessage::PIISafe(Cow::Borrowed(s)),
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
        *this.allocations += allocations;
        match result {
            Err(err) => Poll::Ready((Err(err), *this.duration, this.allocations.clone())),
            Ok(Poll::Ready(r)) => Poll::Ready((Ok(r), *this.duration, this.allocations.clone())),
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
