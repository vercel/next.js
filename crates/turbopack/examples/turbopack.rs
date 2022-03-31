#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(into_future)]

use async_std::task::{block_on, sleep, spawn};
use std::fs;
use std::time::Instant;
use std::{env::current_dir, time::Duration};
use turbo_tasks::stats::Stats;
use turbo_tasks::viz::{visualize_stats_tree, wrap_html};
use turbo_tasks::{NothingRef, TurboTasks};
use turbopack::ecmascript::ModuleAssetRef;
use turbopack::emit;
use turbopack::rebase::RebasedAssetRef;
use turbopack::source_asset::SourceAssetRef;

use turbo_tasks_fs::{DiskFileSystemRef, FileSystemPathRef, FileSystemRef};

fn main() {
    let tt = TurboTasks::new();
    block_on(async {
        let start = Instant::now();

        let task = tt.spawn_root_task(|| {
            Box::pin(async {
                let root = current_dir().unwrap().to_str().unwrap().to_string();
                let disk_fs = DiskFileSystemRef::new("project".to_string(), root);
                disk_fs.get().await?.start_watching()?;

                // Smart Pointer cast
                let fs: FileSystemRef = disk_fs.into();
                let input = FileSystemPathRef::new(fs.clone(), "demo");
                let output = FileSystemPathRef::new(fs.clone(), "out");
                let entry = FileSystemPathRef::new(fs.clone(), "demo/index.js");

                let source = SourceAssetRef::new(entry);
                let module = ModuleAssetRef::new(source.into());
                let rebased = RebasedAssetRef::new(module.into(), input, output);
                emit(rebased.into());

                Ok(NothingRef::new().into())
            })
        });
        spawn({
            let tt = tt.clone();
            async move {
                tt.wait_done().await;
                println!("done in {} ms", start.elapsed().as_millis());

                for task in tt.cached_tasks_iter() {
                    task.reset_executions();
                }

                loop {
                    let (elapsed, count) = tt.wait_done().await;
                    if elapsed.as_millis() >= 10 {
                        println!("updated {} tasks in {} ms", count, elapsed.as_millis());
                    } else {
                        println!("updated {} tasks in {} µs", count, elapsed.as_micros());
                    }
                }
            }
        })
        .await;

        loop {
            println!("writing graph.html...");
            // create a graph
            let mut stats = Stats::new();

            // graph root node
            stats.add(&task);

            // graph tasks in cache
            for task in tt.cached_tasks_iter() {
                stats.add(&task);
            }

            // prettify graph
            stats.merge_resolve();

            let tree = stats.treeify();

            // write HTML
            fs::write("graph.html", wrap_html(&visualize_stats_tree(tree))).unwrap();
            println!("graph.html written");

            sleep(Duration::from_secs(10)).await;
        }
    });
}
