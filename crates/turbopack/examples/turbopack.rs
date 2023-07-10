#![feature(trivial_bounds)]
#![feature(min_specialization)]

use std::{
    collections::HashMap,
    env::current_dir,
    fs,
    time::{Duration, Instant},
};

use anyhow::Result;
use tokio::{spawn, time::sleep};
use turbo_tasks::{
    util::FormatDuration, NothingVc, TurboTasks, TurboTasksBackendApi, UpdateInfo, Value,
};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystem, FileSystemVc};
use turbo_tasks_memory::{
    stats::{ReferenceType, Stats},
    viz::graph::{visualize_stats_tree, wrap_html},
    MemoryBackend,
};
use turbopack::{
    emit_with_completion, rebase::RebasedAssetVc, register,
    resolve_options_context::ResolveOptionsContext, transition::TransitionsByNameVc,
};
use turbopack_core::{
    compile_time_info::CompileTimeInfoVc,
    context::AssetContext,
    environment::{EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    source_asset::SourceAssetVc,
    PROJECT_FILESYSTEM_NAME,
};

#[tokio::main]
async fn main() -> Result<()> {
    register();

    let tt = TurboTasks::new(MemoryBackend::default());
    let start = Instant::now();

    let task = tt.spawn_root_task(|| {
        Box::pin(async {
            let root = current_dir().unwrap().to_str().unwrap().to_string();
            let disk_fs = DiskFileSystemVc::new(PROJECT_FILESYSTEM_NAME.to_string(), root);
            disk_fs.await?.start_watching()?;

            // Smart Pointer cast
            let fs: FileSystemVc = disk_fs.into();
            let input = fs.root().join("demo");
            let output = fs.root().join("out");
            let entry = fs.root().join("demo/index.js");

            let source = SourceAssetVc::new(entry);
            let context = turbopack::ModuleAssetContextVc::new(
                TransitionsByNameVc::cell(HashMap::new()),
                CompileTimeInfoVc::new(EnvironmentVc::new(Value::new(
                    ExecutionEnvironment::NodeJsLambda(NodeJsEnvironment::default().into()),
                ))),
                Default::default(),
                ResolveOptionsContext {
                    enable_typescript: true,
                    enable_react: true,
                    enable_node_modules: Some(fs.root()),
                    custom_conditions: vec!["development".to_string()],
                    ..Default::default()
                }
                .cell(),
            );
            let module = context.process(
                source.into(),
                Value::new(turbopack_core::reference_type::ReferenceType::Undefined),
            );
            let rebased = RebasedAssetVc::new(module.into(), input, output);
            emit_with_completion(rebased.into(), output).await?;

            Ok(NothingVc::new().into())
        })
    });
    spawn({
        let tt = tt.clone();
        async move {
            tt.wait_task_completion(task, true).await.unwrap();
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
        println!("writing graph.html...");
        // create a graph
        let mut stats = Stats::new();

        let b = tt.backend();

        // graph root node
        stats.add_id(b, task);

        // graph tasks in cache
        b.with_all_cached_tasks(|task| {
            stats.add_id(b, task);
        });

        // prettify graph
        stats.merge_resolve();

        let tree = stats.treeify(ReferenceType::Child);

        // write HTML
        fs::write(
            "graph.html",
            wrap_html(&visualize_stats_tree(
                tree,
                ReferenceType::Child,
                tt.stats_type(),
            )),
        )
        .unwrap();
        println!("graph.html written");

        sleep(Duration::from_secs(10)).await;
    }
}
