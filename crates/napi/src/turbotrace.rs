use std::{path::PathBuf, sync::Arc};

use napi::bindgen_prelude::*;
use node_file_trace::{start, Args};
use turbo_tasks::TurboTasks;
use turbopack::{
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext},
    resolve_options_context::ResolveOptionsContext,
};

use crate::next_api::utils::{self, NextBackend};

#[napi]
pub fn create_turbo_tasks(
    output_path: String,
    memory_limit: Option<i64>,
) -> External<Arc<TurboTasks<NextBackend>>> {
    let limit = memory_limit.map(|u| u as usize).unwrap_or(usize::MAX);
    let turbo_tasks = utils::create_turbo_tasks(PathBuf::from(&output_path), limit)
        .expect("Failed to create TurboTasks");
    External::new_with_size_hint(turbo_tasks, limit)
}

#[napi]
pub async fn run_turbo_tracing(
    options: Buffer,
    turbo_tasks: External<Arc<TurboTasks<NextBackend>>>,
) -> napi::Result<Vec<String>> {
    let args: Args = serde_json::from_slice(options.as_ref())?;
    let files = start(
        Arc::new(args),
        turbo_tasks.clone(),
        Some(ModuleOptionsContext {
            ecmascript: EcmascriptOptionsContext {
                enable_types: true,
                ..Default::default()
            },
            enable_mdx: true,
            ..Default::default()
        }),
        Some(ResolveOptionsContext {
            ..Default::default()
        }),
    )
    .await?;
    Ok(files.into_iter().map(|f| f.to_string()).collect())
}
