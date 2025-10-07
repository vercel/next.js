#![feature(trivial_bounds)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::{
    env::current_dir,
    time::{Duration, Instant},
};

use anyhow::Result;
use tokio::{spawn, time::sleep};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ReadConsistency, TurboTasks, UpdateInfo, Vc, util::FormatDuration};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
use turbopack::emit_with_completion;
use turbopack_core::{
    PROJECT_FILESYSTEM_NAME,
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    ident::Layer,
    rebase::RebasedAsset,
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

#[tokio::main]
async fn main() -> Result<()> {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ));
    let start = Instant::now();

    let task = tt.spawn_root_task(|| {
        Box::pin(async {
            let root: RcStr = current_dir().unwrap().to_str().unwrap().into();
            let disk_fs = DiskFileSystem::new(PROJECT_FILESYSTEM_NAME.into(), root);
            disk_fs.await?.start_watching(None).await?;

            // Smart Pointer cast
            let fs: Vc<Box<dyn FileSystem>> = Vc::upcast(disk_fs);
            let input = fs.root().await?.join("demo")?;
            let output = fs.root().await?.join("out")?;
            let entry = fs.root().await?.join("demo/index.js")?;

            let source = FileSource::new(entry);
            let module_asset_context = turbopack::ModuleAssetContext::new(
                Default::default(),
                CompileTimeInfo::new(Environment::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment::default().resolved_cell(),
                ))),
                Default::default(),
                ResolveOptionsContext {
                    enable_typescript: true,
                    enable_react: true,
                    enable_node_modules: Some(fs.root().owned().await?),
                    custom_conditions: vec![rcstr!("development")],
                    ..Default::default()
                }
                .cell(),
                Layer::new(rcstr!("default")),
            );
            let module = module_asset_context
                .process(
                    Vc::upcast(source),
                    turbopack_core::reference_type::ReferenceType::Undefined,
                )
                .module();
            let rebased = RebasedAsset::new(module, input, output.clone());
            emit_with_completion(Vc::upcast(rebased), output).await?;

            anyhow::Ok::<Vc<()>>(Default::default())
        })
    });
    spawn({
        let tt = tt.clone();
        async move {
            tt.wait_task_completion(task, ReadConsistency::Strong)
                .await
                .unwrap();
            println!("done in {}", FormatDuration(start.elapsed()));

            loop {
                let UpdateInfo {
                    duration, tasks, ..
                } = tt
                    .get_or_wait_aggregated_update_info(Duration::from_millis(100))
                    .await;
                println!("updated {} tasks in {}", tasks, FormatDuration(duration));
            }
        }
    })
    .await
    .unwrap();

    loop {
        sleep(Duration::from_secs(10)).await;
    }
}
