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
    /// What caused the panic, as far as it is known.
    pub kind: TurboTasksPanicKind,
}

/// What caused a [`TurboTasksPanic`].
#[derive(Debug, Clone, Copy, Default, Encode, Decode, PartialEq, Eq)]
pub enum TurboTasksPanicKind {
    /// Any panic not covered by another kind, e.g. a bug.
    #[default]
    Other,
    /// The panic was raised with a [`PersistentCacheUnreadablePanic`] payload: the persistent
    /// cache couldn't be read while it was in use.
    PersistentCacheUnreadable,
}

/// A panic payload (see [`std::panic::panic_any`]) for panicking because the persistent cache
/// couldn't be read while it was in use, e.g. because a file of it was deleted or modified by
/// another process. The task graph can't be restored without that data. This doesn't necessarily
/// indicate a bug, so it gets a dedicated message instead of being reported like one.
///
/// Catching it (with `CaptureFuture`, as turbo-tasks does for task executions) turns it into a
/// [`TurboTasksPanic`] of kind
/// [`TurboTasksPanicKind::PersistentCacheUnreadable`] (and [`TurboTasksPanic::into_panic`] turns
/// that back into this payload), so that callers can show a dedicated message instead of a
/// generic internal error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistentCacheUnreadablePanic {
    /// A message for the user, explaining what couldn't be read and what to do about it. It
    /// usually contains file paths, so it's not PII-safe.
    pub message: String,
}

impl Display for PersistentCacheUnreadablePanic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl TurboTasksPanic {
    /// Whether the panic was caused by the persistent cache being unreadable, see
    /// [`PersistentCacheUnreadablePanic`].
    pub fn is_persistent_cache_unreadable(&self) -> bool {
        self.kind == TurboTasksPanicKind::PersistentCacheUnreadable
    }

    /// Converts this into a panic payload, e.g. for [`std::panic::resume_unwind`]. Keeps the
    /// [`TurboTasksPanicKind`]: catching the payload with `CaptureFuture` again yields a panic of
    /// the same kind and message.
    pub fn into_panic(self) -> Box<dyn std::any::Any + Send> {
        match self.kind {
            TurboTasksPanicKind::PersistentCacheUnreadable => {
                Box::new(PersistentCacheUnreadablePanic {
                    message: self.message.to_string(),
                })
            }
            TurboTasksPanicKind::Other => Box::new(format!(
                "{} at {}",
                self.message,
                self.location
                    .unwrap_or_else(|| "unknown location".to_string())
            )),
        }
    }
}

impl Display for TurboTasksPanic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl<T, F: Future<Output = T>> Future for CaptureFuture<T, F> {
    type Output = Result<T, TurboTasksPanic>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.project();

        let result =
            panic::catch_unwind(panic::AssertUnwindSafe(|| this.future.poll(cx))).map_err(|err| {
                let mut kind = TurboTasksPanicKind::Other;
                let message = match err.downcast_ref::<&'static str>() {
                    Some(s) => TurboTasksExecutionErrorMessage::PIISafe(Cow::Borrowed(s)),
                    None => match err.downcast_ref::<String>() {
                        Some(s) => TurboTasksExecutionErrorMessage::NonPIISafe(s.clone()),
                        None => match err.downcast_ref::<PersistentCacheUnreadablePanic>() {
                            Some(p) => {
                                kind = TurboTasksPanicKind::PersistentCacheUnreadable;
                                TurboTasksExecutionErrorMessage::NonPIISafe(p.message.clone())
                            }
                            None => {
                                let error_message = err
                                    .downcast_ref::<Box<dyn Display>>()
                                    .map(|e| e.to_string())
                                    .unwrap_or_else(|| String::from("<unknown panic>"));

                                TurboTasksExecutionErrorMessage::NonPIISafe(error_message)
                            }
                        },
                    },
                };

                LAST_ERROR_LOCATION.with_borrow(|loc| TurboTasksPanic {
                    message,
                    location: loc.clone(),
                    kind,
                })
            });

        match result {
            Err(err) => Poll::Ready(Err(err)),
            Ok(Poll::Ready(r)) => Poll::Ready(Ok(r)),
            Ok(Poll::Pending) => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        panic::{panic_any, resume_unwind},
        sync::Arc,
    };

    use futures::executor::block_on;

    use super::*;
    use crate::backend::TurboTasksExecutionError;

    fn capture(f: impl FnOnce()) -> TurboTasksPanic {
        block_on(CaptureFuture::new(async move { f() })).expect_err("the future must panic")
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    fn captures_persistent_cache_unreadable_panic() {
        let panic = capture(|| {
            panic_any(PersistentCacheUnreadablePanic {
                message: "cache file 00000001.sst is missing".to_string(),
            })
        });
        assert!(panic.is_persistent_cache_unreadable());
        assert_eq!(
            panic.message,
            TurboTasksExecutionErrorMessage::NonPIISafe(
                "cache file 00000001.sst is missing".to_string()
            )
        );
        let error = TurboTasksExecutionError::Panic(Arc::new(panic.clone()));
        assert_eq!(error.persistent_cache_unreadable_panic(), Some(&panic));
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    fn rethrown_persistent_cache_unreadable_panic_keeps_its_kind() {
        let panic = capture(|| {
            panic_any(PersistentCacheUnreadablePanic {
                message: "cache file 00000001.sst is missing".to_string(),
            })
        });
        let expected_message = panic.message.clone();
        let rethrown = capture(move || resume_unwind(panic.into_panic()));
        assert!(rethrown.is_persistent_cache_unreadable());
        assert_eq!(rethrown.message, expected_message);
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    fn string_panics_are_not_persistent_cache_unreadable() {
        let panic = capture(|| panic!("static message"));
        assert!(!panic.is_persistent_cache_unreadable());
        assert_eq!(
            panic.message,
            TurboTasksExecutionErrorMessage::PIISafe(Cow::Borrowed("static message"))
        );

        let value = 42;
        let panic = capture(move || panic!("formatted message {value}"));
        assert!(!panic.is_persistent_cache_unreadable());
        assert_eq!(
            panic.message,
            TurboTasksExecutionErrorMessage::NonPIISafe("formatted message 42".to_string())
        );
        let error = TurboTasksExecutionError::Panic(Arc::new(panic.clone()));
        assert_eq!(error.persistent_cache_unreadable_panic(), None);

        // Rethrowing keeps the kind, and adds the location to the message as before.
        let rethrown = capture(move || resume_unwind(panic.into_panic()));
        assert!(!rethrown.is_persistent_cache_unreadable());
    }

    #[test]
    fn persistent_cache_unreadable_panic_is_found_through_context() {
        let panic = Arc::new(TurboTasksPanic {
            message: TurboTasksExecutionErrorMessage::NonPIISafe("unreadable".to_string()),
            location: None,
            kind: TurboTasksPanicKind::PersistentCacheUnreadable,
        });
        let error = TurboTasksExecutionError::Panic(panic.clone())
            .with_local_task_context("some local task".to_string());
        assert_eq!(error.persistent_cache_unreadable_panic(), Some(&*panic));
    }

    #[test]
    fn panic_kind_roundtrips_through_bincode() {
        let panic = TurboTasksPanic {
            message: TurboTasksExecutionErrorMessage::NonPIISafe("unreadable".to_string()),
            location: Some("file.rs:1:1".to_string()),
            kind: TurboTasksPanicKind::PersistentCacheUnreadable,
        };
        let encoded = turbo_bincode::turbo_bincode_encode(&panic).unwrap();
        let decoded: TurboTasksPanic = turbo_bincode::turbo_bincode_decode(&encoded).unwrap();
        assert_eq!(decoded, panic);
    }
}
