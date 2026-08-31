#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use napi_derive::napi;
use turbo_tasks::TurboTasks;
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

#[napi(object)]
pub struct NapiNftResult {
    pub files: Vec<String>,
    pub issues: Vec<String>,
}

#[napi]
pub async fn node_file_trace(
    project_root: String,
    cwd: String,
    output_base: String,
    input: Vec<String>,
    graph: bool,
    show_issues: bool,
    max_depth: Option<u32>,
) -> napi::Result<NapiNftResult> {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            dependency_tracking: false,
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ));

    let result = tt
        .run_once(async move {
            turbopack_nft::nft::node_file_trace(
                project_root.into(),
                cwd.into(),
                output_base.into(),
                input.into_iter().map(Into::into).collect(),
                graph,
                show_issues,
                max_depth.map(|d| d as usize),
            )
            .await
        })
        .await
        .map_err(|e| napi::Error::from_reason(format!("{e:#}")))?;

    Ok(NapiNftResult {
        files: result.files.into_iter().map(Into::into).collect(),
        issues: result.issues.into_iter().map(Into::into).collect(),
    })
}
