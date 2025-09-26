use std::{
    panic::resume_unwind,
    pin::Pin,
    task::{Context, Poll},
    thread,
    time::{Duration, Instant},
};

use anyhow::Result;
use futures::{FutureExt, ready};
use tokio::runtime::Handle;
use tracing::{Instrument, Span, info_span};
use turbo_tasks_malloc::{AllocationInfo, TurboMalloc};

use crate::{
    TurboTasksPanic,
    capture_future::{self, CaptureFuture},
    manager::turbo_tasks_future_scope,
    turbo_tasks, turbo_tasks_scope,
};

pub struct JoinHandle<T> {
    join_handle: tokio::task::JoinHandle<(Result<T, TurboTasksPanic>, Duration, AllocationInfo)>,
}

impl<T: Send + 'static> JoinHandle<T> {
    pub fn join(self) -> T {
        block_for_future(self)
    }
}

impl<T> Future for JoinHandle<T> {
    type Output = T;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.get_mut();
        match ready!(this.join_handle.poll_unpin(cx)) {
            Ok((res, duration, alloc_info)) => {
                capture_future::add_duration(duration);
                capture_future::add_allocation_info(alloc_info);
                match res {
                    Ok(res) => Poll::Ready(res),
                    Err(e) => resume_unwind(e.into_panic()),
                }
            }
            Err(e) => resume_unwind(e.into_panic()),
        }
    }
}

/// Spawns a future as separate task and returns a JoinHandle which can be used to await the result.
/// The future has access to the current TurboTasks context and runs in the same tracing span.
/// Allocations and cpu time is accounted to the current turbo-tasks function.
pub fn spawn<T: Send + 'static>(future: impl Future<Output = T> + Send + 'static) -> JoinHandle<T> {
    let turbo_tasks = turbo_tasks();
    let span = Span::current();
    let join_handle = tokio::task::spawn(
        turbo_tasks_future_scope(turbo_tasks, CaptureFuture::new(future)).instrument(span),
    );
    JoinHandle { join_handle }
}

/// Spawns a blocking function in a separate task using the blocking pool and returns a JoinHandle
/// which can be used to await the result. The function has access to the current TurboTasks context
/// and runs in the same tracing span.
/// Allocations and cpu time is accounted to the current turbo-tasks function.
pub fn spawn_blocking<T: Send + 'static>(
    func: impl FnOnce() -> T + Send + 'static,
) -> JoinHandle<T> {
    let turbo_tasks = turbo_tasks();
    let span = Span::current();
    let join_handle = tokio::task::spawn_blocking(|| {
        let _guard = span.entered();
        let start = Instant::now();
        let start_allocations = TurboMalloc::allocation_counters();
        let r = turbo_tasks_scope(turbo_tasks, func);
        (Ok(r), start.elapsed(), start_allocations.until_now())
    });
    JoinHandle { join_handle }
}

/// Spawns a thread which runs in background. It has access to the current TurboTasks context, but
/// is not accounted towards the current turbo-tasks function.
pub fn spawn_thread(func: impl FnOnce() + Send + 'static) {
    let handle = Handle::current();
    let span = info_span!("thread").or_current();
    let turbo_tasks = turbo_tasks();
    thread::spawn(move || {
        let _span = span.entered();
        turbo_tasks_scope(turbo_tasks, || {
            let _guard = handle.enter();
            func();
        })
    });
}

/// Tells the scheduler about blocking work happening in the current thread.
/// It will make sure to allocate extra threads for the pool.
pub fn block_in_place<R>(f: impl FnOnce() -> R + Send) -> R
where
    R: Send,
{
    tokio::task::block_in_place(f)
}

/// Blocking waits for a future to complete. This blocks the current thread potentially staling
/// other concurrent futures (but not other concurrent tasks). Try to avoid this method infavor of
/// awaiting the future instead.
pub fn block_for_future<T: Send>(future: impl Future<Output = T> + Send + 'static) -> T {
    let handle = Handle::current();
    block_in_place(|| {
        let _span = info_span!("blocking").entered();
        handle.block_on(future)
    })
}
