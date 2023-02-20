use std::sync::Arc;

use napi::bindgen_prelude::*;
use next_binding::turbo::node_file_trace::{start, Args};
use turbo_tasks::TurboTasks;
use turbo_tasks_memory::MemoryBackend;

#[napi]
pub fn create_turbo_tasks(memory_limit: Option<i64>) -> External<Arc<TurboTasks<MemoryBackend>>> {
    let turbo_tasks = TurboTasks::new(MemoryBackend::new(
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
    turbo_tasks: Option<External<Arc<TurboTasks<MemoryBackend>>>>,
) -> napi::Result<Vec<String>> {
    let args: Args = serde_json::from_slice(options.as_ref())?;
    let turbo_tasks = turbo_tasks.map(|t| t.clone());
    let files = start(Arc::new(args), turbo_tasks.as_ref()).await?;
    Ok(files)
}
