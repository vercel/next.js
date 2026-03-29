//! Factory functions and types for constructing [`TurboTasks`] instances used by Next.js.

use std::{env, path::PathBuf, sync::Arc};

use anyhow::Result;
use either::Either;
use serde::Serialize;
use turbo_tasks::{
    TurboTasks, TurboTasksCallApi,
    message_queue::{CompilationEvent, Severity},
};
use turbo_tasks_backend::{
    BackendOptions, GitVersionInfo, NoopBackingStorage, StartupCacheState, TurboBackingStorage,
    TurboTasksBackend, db_invalidation::invalidation_reasons, noop_backing_storage,
    turbo_backing_storage,
};

pub type NextTurboTasks =
    Arc<TurboTasks<TurboTasksBackend<Either<TurboBackingStorage, NoopBackingStorage>>>>;

/// Returns version info derived from compile-time git metadata.
///
/// The `dirty` flag is only set when not running in CI (`CI` env var unset at build time) and the
/// working tree was dirty at build time.
pub fn git_version_info() -> GitVersionInfo<'static> {
    GitVersionInfo {
        describe: env!("VERGEN_GIT_DESCRIBE"),
        dirty: option_env!("CI").is_none_or(|value| value.is_empty())
            && env!("VERGEN_GIT_DIRTY") == "true",
    }
}

/// Creates a new [`TurboTasks`] instance configured for Next.js.
///
/// * `output_path` — the dist directory (e.g. `.next/`), used for the persistent cache.
/// * `persistent_caching` — whether to use on-disk backing storage.
/// * `_memory_limit` — reserved for future use; currently unused.
/// * `dependency_tracking` — when false, any change triggers an error instead of re-computation.
/// * `is_ci` / `is_short_session` — control the storage flush strategy.
/// * `skip_compaction` — skip database compaction during shutdown.
pub fn create_turbo_tasks(
    output_path: PathBuf,
    persistent_caching: bool,
    _memory_limit: usize,
    dependency_tracking: bool,
    is_ci: bool,
    is_short_session: bool,
    skip_compaction: bool,
) -> Result<NextTurboTasks> {
    Ok(if persistent_caching {
        let version_info = git_version_info();
        let (backing_storage, cache_state) = turbo_backing_storage(
            &output_path.join("cache/turbopack"),
            &version_info,
            is_ci,
            is_short_session,
            skip_compaction,
        )?;
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(if std::env::var("TURBO_ENGINE_READ_ONLY").is_ok() {
                    turbo_tasks_backend::StorageMode::ReadOnly
                } else if is_ci || is_short_session {
                    turbo_tasks_backend::StorageMode::ReadWriteOnShutdown
                } else {
                    turbo_tasks_backend::StorageMode::ReadWrite
                }),
                dependency_tracking,
                num_workers: Some(tokio::runtime::Handle::current().metrics().num_workers()),
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
            "Turbopack's filesystem cache has been deleted{reason_msg}. Builds or page loads may \
             be slower as a result."
        )
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
    }
}
