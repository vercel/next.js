#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(into_future)]

use std::fs;
use std::time::Instant;
use std::{env::current_dir, time::Duration};
use tokio::{spawn, time::sleep};
use turbo_tasks::{NothingVc, TurboTasks};
use turbo_tasks_memory::{
    stats::Stats,
    viz::{visualize_stats_tree, wrap_html},
    MemoryBackend,
};
use turbopack::rebase::RebasedAssetVc;
use turbopack::{emit, register, GraphOptionsVc};
use turbopack_core::context::AssetContext;
use turbopack_core::source_asset::SourceAssetVc;
use turbopack_ecmascript::target::CompileTarget;

use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc, FileSystemVc};

#[tokio::main]
async fn main() {
    register();

    let tt = TurboTasks::new(MemoryBackend::new());
    let start = Instant::now();

    let task = tt.spawn_root_task(|| {
        Box::pin(async {
            let root = current_dir().unwrap().to_str().unwrap().to_string();
            let disk_fs = DiskFileSystemVc::new("project".to_string(), root);
            disk_fs.await?.start_watching()?;

            // Smart Pointer cast
            let fs: FileSystemVc = disk_fs.into();
            let input = FileSystemPathVc::new(fs, "demo");
            let output = FileSystemPathVc::new(fs, "out");
            let entry = FileSystemPathVc::new(fs, "demo/index.js");

            let source = SourceAssetVc::new(entry);
            let context = turbopack::ModuleAssetContextVc::new(
                input,
                GraphOptionsVc::new(false, true, CompileTarget::Current.into()),
            );
            let module = context.process(source.into());
            let rebased = RebasedAssetVc::new(module.into(), input, output);
            emit(rebased.into());

            Ok(NothingVc::new().into())
        })
    });
    spawn({
        let tt = tt.clone();
        async move {
            tt.wait_done().await;
            println!("done in {} ms", start.elapsed().as_millis());

            loop {
                let (elapsed, count) = tt.wait_next_done().await;
                if elapsed.as_millis() >= 10 {
                    println!("updated {} tasks in {} ms", count, elapsed.as_millis());
                } else {
                    println!("updated {} tasks in {} µs", count, elapsed.as_micros());
                }
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

        let tree = stats.treeify();

        // write HTML
        fs::write("graph.html", wrap_html(&visualize_stats_tree(tree))).unwrap();
        println!("graph.html written");

        sleep(Duration::from_secs(10)).await;
    }
}
