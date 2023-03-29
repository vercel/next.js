use next_core::env::load_env;
use std::path::MAIN_SEPARATOR;
use std::sync::Arc;
use turbopack_dev::DevChunkingContextVc;

use napi::bindgen_prelude::*;
use next_binding::turbo::node_file_trace::{start, Args};
use next_core::app_structure::{find_app_dir, get_entrypoints};
use next_core::next_config::load_next_config;
use turbo_tasks::NothingVc;
use turbo_tasks::TurboTasks;
use turbo_tasks_fs::{DiskFileSystemVc, FileSystem, FileSystemVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::evaluate_context::node_build_environment;
use turbopack::{
    module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
};
use turbopack_core::PROJECT_FILESYSTEM_NAME;
use turbopack_node::execution_context::ExecutionContextVc;

#[turbo_tasks::function]
async fn project_fs(project_dir: &str) -> anyhow::Result<FileSystemVc> {
    let disk_fs =
        DiskFileSystemVc::new(PROJECT_FILESYSTEM_NAME.to_string(), project_dir.to_string());
    disk_fs.await?.start_watching_with_invalidation_reason()?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn output_fs(project_dir: &str) -> anyhow::Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("output".to_string(), project_dir.to_string());
    disk_fs.await?.start_watching()?;
    Ok(disk_fs.into())
}

#[napi]
pub async fn stream_entrypoints(
    project_dir: String,
    root_dir: String,
    turbo_tasks: External<Arc<TurboTasks<MemoryBackend>>>,
    func: JsFunction,
) -> napi::Result<()> {
    let func = Arc::new(func);
    let project_dir = Arc::new(project_dir);
    let root_dir = Arc::new(root_dir);
    turbo_tasks.spawn_root_task(move || {
        Box::pin(async move {
            let output_fs = output_fs(&project_dir);
            let fs = project_fs(&root_dir);
            let project_relative = project_dir.strip_prefix(root_dir.as_str()).unwrap();
            let project_relative = project_relative
                .strip_prefix(MAIN_SEPARATOR)
                .unwrap_or(project_relative)
                .replace(MAIN_SEPARATOR, "/");
            let project_path = fs.root().join(&project_relative);

            let env = load_env(project_path);
            let build_output_root = output_fs.root().join(".next/build");

            let build_chunking_context = DevChunkingContextVc::builder(
                project_path,
                build_output_root,
                build_output_root.join("chunks"),
                build_output_root.join("assets"),
                node_build_environment(),
            )
            .build();

            let execution_context =
                ExecutionContextVc::new(project_path, build_chunking_context, env);

            let next_config = load_next_config(execution_context);
            let app_dir = find_app_dir(fs.root(), next_config);

            if let Some(app_dir) = *app_dir.await? {
                let entrypoints = get_entrypoints(app_dir, next_config);
                // entrypoints -> to JS object -> func(...)
            } else {
                func.call(None, &[]);
            }

            Ok(NothingVc::new().into())
        })
    });
    Ok(())
}
