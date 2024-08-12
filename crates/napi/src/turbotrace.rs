use std::sync::Arc;

use napi::bindgen_prelude::*;
use node_file_trace::{start, Args};
use turbo_tasks::TurboTasks;
use turbopack::{
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext},
    resolve_options_context::ResolveOptionsContext,
};

use crate::next_api::utils::NextBackend;

#[napi]
pub fn create_turbo_tasks(memory_limit: Option<i64>) -> External<Arc<TurboTasks<NextBackend>>> {
    let turbo_tasks = TurboTasks::new(NextBackend::new(
        memory_limit.map(|m| m as usize).unwrap_or(usize::MAX),
    ));
    External::new_with_size_hint(
        turbo_tasks,
        memory_limit.map(|u| u as usize).unwrap_or(usize::MAX),
    )
}

#[napi]
pub async fn run_turbo_tracing(
    options: Buffer,
    turbo_tasks: Option<External<Arc<TurboTasks<NextBackend>>>>,
) -> napi::Result<Vec<String>> {
    let args: Args = serde_json::from_slice(options.as_ref())?;
    let turbo_tasks = turbo_tasks.map(|t| t.clone());
    let files = start(
        Arc::new(args),
        turbo_tasks.as_ref(),
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
