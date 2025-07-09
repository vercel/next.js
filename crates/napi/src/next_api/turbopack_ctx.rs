//! Utilities for constructing and using the [`NextTurbopackContext`] type.

use std::{path::PathBuf, sync::Arc};

use anyhow::Result;
use either::Either;
use serde::Serialize;
use turbo_tasks::{
    TurboTasks, TurboTasksApi,
    message_queue::{CompilationEvent, Severity},
};
use turbo_tasks_backend::{
    BackendOptions, DefaultBackingStorage, GitVersionInfo, NoopBackingStorage, StartupCacheState,
    TurboTasksBackend, db_invalidation::invalidation_reasons, default_backing_storage,
    noop_backing_storage,
};

pub type NextTurboTasks =
    Arc<TurboTasks<TurboTasksBackend<Either<DefaultBackingStorage, NoopBackingStorage>>>>;

/// A value often wrapped in [`napi::bindgen_prelude::External`] that retains the Turbopack instance
/// used by Next.js, and various napi helpers that may have been passed to us from JS.
///
/// This is not a [`turbo_tasks::value`], and should only be used within the top-level napi layer.
/// It should not be passed to a [`turbo_tasks::function`]. For serializable information about the
/// project, use the [`next_api::project::Project`] type.
#[derive(Clone)]
pub struct NextTurbopackContext {
    inner: Arc<NextTurboContextInner>,
}

struct NextTurboContextInner {
    turbo_tasks: NextTurboTasks,
}

impl NextTurbopackContext {
    pub fn new(turbo_tasks: NextTurboTasks) -> Self {
        NextTurbopackContext {
            inner: Arc::new(NextTurboContextInner { turbo_tasks }),
        }
    }

    pub fn turbo_tasks(&self) -> &NextTurboTasks {
        &self.inner.turbo_tasks
    }
}

pub fn create_turbo_tasks(
    output_path: PathBuf,
    persistent_caching: bool,
    _memory_limit: usize,
    dependency_tracking: bool,
    is_ci: bool,
) -> Result<NextTurboTasks> {
    Ok(if persistent_caching {
        let version_info = GitVersionInfo {
            describe: env!("VERGEN_GIT_DESCRIBE"),
            dirty: option_env!("CI").is_none_or(|value| value.is_empty())
                && env!("VERGEN_GIT_DIRTY") == "true",
        };
        let (backing_storage, cache_state) =
            default_backing_storage(&output_path.join("cache/turbopack"), &version_info, is_ci)?;
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(if std::env::var("TURBO_ENGINE_READ_ONLY").is_ok() {
                    turbo_tasks_backend::StorageMode::ReadOnly
                } else {
                    turbo_tasks_backend::StorageMode::ReadWrite
                }),
                dependency_tracking,
                ..Default::default()
            },
            Either::Left(backing_storage),
        ));
        if let StartupCacheState::Invalidated { reason_code } = cache_state {
            tt.send_compilation_event(Arc::new(StartupCacheInvalidationEvent { reason_code }));
        }
        tt
    } else {
        TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                dependency_tracking,
                ..Default::default()
            },
            Either::Right(noop_backing_storage()),
        ))
    })
}

#[derive(Serialize)]
struct StartupCacheInvalidationEvent {
    reason_code: Option<String>,
}

impl CompilationEvent for StartupCacheInvalidationEvent {
    fn type_name(&self) -> &'static str {
        "StartupCacheInvalidationEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Warning
    }

    fn message(&self) -> String {
        let reason_msg = match self.reason_code.as_deref() {
            Some(invalidation_reasons::PANIC) => {
                " because we previously detected an internal error in Turbopack"
            }
            Some(invalidation_reasons::USER_REQUEST) => " as the result of a user request",
            _ => "", // ignore unknown reasons
        };
        format!(
            "Turbopack's persistent cache has been deleted{reason_msg}. Builds or page loads may \
             be slower as a result."
        )
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}
