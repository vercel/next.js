//! The napi project surface. Opaque `External` handles only.

use std::sync::Arc;

use napi::bindgen_prelude::External;
use napi_derive::napi;
use turbo_rcstr::RcStr;
use turbo_tasks::{OperationVc, TurboTasks};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbopack_cli_api::{
    build::build_project,
    project::{ProjectContainer, ProjectOptions},
};
use turbopack_cli_core::entry::EntryRequest;

/// Convert an error into a napi error, preserving the whole cause chain. `anyhow::Error`'s
/// `Display` prints only the outermost message, which strips the context that says what actually
/// went wrong; its `Debug` prints the full chain.
fn napi_err(err: impl std::fmt::Debug) -> napi::Error {
    napi::Error::from_reason(format!("{err:?}"))
}

// ---------------------------------------------------------------------------
// napi option DTOs (camelCase on the JS side).
// ---------------------------------------------------------------------------

#[napi(object)]
pub struct NapiProjectOptions {
    pub root_path: String,
    pub entries: Vec<String>,
    pub dist_dir: Option<String>,
}

fn convert_entries(entries: Vec<String>) -> Vec<EntryRequest> {
    entries
        .into_iter()
        .map(|e| EntryRequest::Relative(RcStr::from(e)))
        .collect()
}

impl From<NapiProjectOptions> for ProjectOptions {
    fn from(o: NapiProjectOptions) -> Self {
        ProjectOptions {
            root_path: RcStr::from(o.root_path),
            entries: convert_entries(o.entries),
            dist_dir: o
                .dist_dir
                .map(RcStr::from)
                .unwrap_or_else(|| RcStr::from("dist")),
        }
    }
}

// ---------------------------------------------------------------------------
// Opaque handles.
// ---------------------------------------------------------------------------

/// The long-lived per-project handle passed to JS as `External<ProjectInstance>`.
/// NAPI-only, never enters a turbo-tasks function.
pub struct ProjectInstance {
    project_dir: RcStr,
    turbo_tasks: Arc<TurboTasks<TurboTasksBackend>>,
    container_op: OperationVc<ProjectContainer>,
}

#[napi(object)]
pub struct NapiBuildInfo {
    /// Package version baked into the native binary at build time.
    pub version: String,
    /// Short git SHA the binary was built from.
    pub git_sha: String,
    /// Whether the git tree had uncommitted tracked changes at build time.
    pub git_dirty: bool,
}

/// Build provenance of the native addon (baked by `build.rs`; see `cache_describe`). The
/// `turbopack version` command surfaces this alongside the npm package version.
#[napi]
pub fn build_info() -> NapiBuildInfo {
    NapiBuildInfo {
        version: env!("TURBOPACK_PKG_VERSION").to_string(),
        git_sha: env!("VERGEN_GIT_SHA").to_string(),
        git_dirty: env!("VERGEN_GIT_DIRTY") == "true",
    }
}

fn create_turbo_tasks() -> Arc<TurboTasks<TurboTasksBackend>> {
    // for now, no cache
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

// ---------------------------------------------------------------------------
// napi surface.
// ---------------------------------------------------------------------------

#[napi(ts_return_type = "Promise<{ __napiType: \"Project\" }>")]
pub async fn project_new(options: NapiProjectOptions) -> napi::Result<External<ProjectInstance>> {
    let options: ProjectOptions = options.into();
    let project_dir = options.root_path.clone();

    let turbo_tasks = create_turbo_tasks();
    let container_op = turbo_tasks
        .run(async move {
            let container_op = ProjectContainer::new_operation();
            ProjectContainer::initialize(container_op, options).await?;
            // Force it to settle so later reads are coherent
            container_op.resolve().strongly_consistent().await?;
            Ok(container_op)
        })
        .await
        .map_err(napi_err)?;

    Ok(External::new(ProjectInstance {
        project_dir,
        turbo_tasks,
        container_op,
    }))
}

#[napi]
pub async fn project_build(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<()> {
    let turbo_tasks = project.turbo_tasks.clone();
    let container_op = project.container_op;
    let project_dir = project.project_dir.clone();
    let container = turbo_tasks
        .run(async move { container_op.resolve().strongly_consistent().await })
        .await
        .map_err(napi_err)?;
    build_project(turbo_tasks, container, project_dir)
        .await
        .map_err(napi_err)?;
    Ok(())
}

#[napi]
pub async fn project_shutdown(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<()> {
    project.turbo_tasks.stop_and_wait().await;
    crate::flush_tracing();
    Ok(())
}
