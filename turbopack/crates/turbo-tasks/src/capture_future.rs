use std::{
    borrow::Cow,
    fmt::Display,
    future::Future,
    panic,
    pin::Pin,
    task::{Context, Poll},
};

use anyhow::Result;
use bincode::{Decode, Encode};
use pin_project_lite::pin_project;

use crate::{backend::TurboTasksExecutionErrorMessage, panic_hooks::LAST_ERROR_LOCATION};

pin_project! {
    pub struct CaptureFuture<T, F: Future<Output = T>> {
        #[pin]
        future: F,
    }
}

impl<T, F: Future<Output = T>> CaptureFuture<T, F> {
    pub fn new(future: F) -> Self {
        Self { future }
    }
}

#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
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

/// Map a caught panic payload to a [`TurboTasksPanic`], recording the last panic
/// location. Shared by the async [`CaptureFuture`] and the sync [`capture_sync`].
fn panic_to_turbo_tasks_panic(err: Box<dyn std::any::Any + Send>) -> TurboTasksPanic {
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
}

/// Synchronous counterpart of [`CaptureFuture`] for the no-async sync engine: runs
/// the task body closure to completion, catching panics and mapping them to a
/// [`TurboTasksPanic`] exactly as the async path does. No future, no poll.
#[cfg(feature = "sync")]
pub fn capture_sync<T>(f: impl FnOnce() -> T) -> Result<T, TurboTasksPanic> {
    panic::catch_unwind(panic::AssertUnwindSafe(f)).map_err(panic_to_turbo_tasks_panic)
}

impl<T, F: Future<Output = T>> Future for CaptureFuture<T, F> {
    type Output = Result<T, TurboTasksPanic>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.project();

        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| this.future.poll(cx)))
            .map_err(panic_to_turbo_tasks_panic);

        match result {
            Err(err) => Poll::Ready(Err(err)),
            Ok(Poll::Ready(r)) => Poll::Ready(Ok(r)),
            Ok(Poll::Pending) => Poll::Pending,
        }
    }
}
