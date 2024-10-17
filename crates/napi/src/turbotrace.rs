use std::{path::PathBuf, sync::Arc};

use napi::bindgen_prelude::*;
use node_file_trace::{start, Args};
use turbopack::{
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext},
    resolve_options_context::ResolveOptionsContext,
};

use crate::next_api::utils::{self, NextTurboTasks};

#[napi]
pub fn create_turbo_tasks(
    output_path: String,
    persistent_caching: bool,
    memory_limit: Option<i64>,
) -> External<NextTurboTasks> {
    let limit = memory_limit.map(|u| u as usize).unwrap_or(usize::MAX);
    let turbo_tasks =
        utils::create_turbo_tasks(PathBuf::from(&output_path), persistent_caching, limit)
            .expect("Failed to create TurboTasks");
    External::new_with_size_hint(turbo_tasks, limit)
}

#[napi]
pub async fn run_turbo_tracing(
    options: Buffer,
    turbo_tasks: External<NextTurboTasks>,
) -> napi::Result<Vec<String>> {
    let args: Args = serde_json::from_slice(options.as_ref())?;
    let args = Arc::new(args);
    let module_options = Some(ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_types: true,
            ..Default::default()
        },
        enable_mdx: true,
        ..Default::default()
    });
    let resolve_options = Some(ResolveOptionsContext {
        ..Default::default()
    });
    let files = match &*turbo_tasks {
        NextTurboTasks::Memory(turbo_tasks) => {
            start(args, turbo_tasks.clone(), module_options, resolve_options).await?
        }
        NextTurboTasks::PersistentCaching(turbo_tasks) => {
            start(args, turbo_tasks.clone(), module_options, resolve_options).await?
        }
    };

    Ok(files.into_iter().map(|f| f.to_string()).collect())
}
