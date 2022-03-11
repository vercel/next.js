#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(into_future)]

use anyhow::Result;
use async_std::task::{block_on, sleep, spawn};
use log::LoggingOptions;
use math::{add, max_new};
use random::RandomIdRef;
use std::fs;
use std::time::Instant;
use std::{env::current_dir, time::Duration};
use turbo_pack::ecmascript::ModuleAssetRef;
use turbo_pack::emit;
use turbo_pack::rebase::RebasedAssetRef;
use turbo_pack::source_asset::SourceAssetRef;
use turbo_tasks::viz::GraphViz;
use turbo_tasks::{NothingRef, TurboTasks};

use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, DiskFileSystemRef, FileContent, FileContentRef,
    FileSystemPathRef, FileSystemRef,
};

use crate::{log::log, math::I32ValueRef, random::random};

mod log;
mod math;
mod random;
mod trace;
mod utils;

fn main() {
    let tt = TurboTasks::new();
    block_on(async {
        let start = Instant::now();

        let task = tt.spawn_root_task(|| {
            Box::pin(async {
                // make_math().await;

                let root = current_dir().unwrap().to_str().unwrap().to_string();
                let disk_fs = DiskFileSystemRef::new("project".to_string(), root);

                // Smart Pointer cast
                let fs: FileSystemRef = disk_fs.into();

                // ls(fs).await;
                let input = FileSystemPathRef::new(fs.clone(), "demo");
                let output = FileSystemPathRef::new(fs.clone(), "out");
                let entry = FileSystemPathRef::new(fs.clone(), "demo/index.js");

                let source = SourceAssetRef::new(entry);
                let module = ModuleAssetRef::new(source.into());
                let rebased = RebasedAssetRef::new(module.into(), input, output);
                emit(rebased.into());

                // copy_all(
                //     entry,
                //     CopyAllOptions {
                //         input_dir: input,
                //         output_dir: output,
                //     }
                //     .into(),
                // )
                // .await;

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
            let mut graph_viz = GraphViz::new();

            // graph root node
            graph_viz.add_task(&task);

            // graph tasks in cache
            for task in tt.cached_tasks_iter() {
                graph_viz.add_task(&task);
            }

            // prettify graph
            graph_viz.merge_edges();
            graph_viz.drop_unchanged_slots();
            graph_viz.skip_loney_resolve();
            // graph_viz.drop_inactive_tasks();

            // write HTML
            fs::write("graph.html", GraphViz::wrap_html(&graph_viz.get_graph())).unwrap();
            println!("graph.html written");

            sleep(Duration::from_secs(10)).await;
        }
    });
}

#[turbo_tasks::function]
fn make_math() {
    let r1 = random(RandomIdRef::new(Duration::from_secs(5), 4));
    let r2 = random(RandomIdRef::new(Duration::from_secs(7), 3));
    let max = max_new(r1.clone(), r2);
    let a = add(I32ValueRef::new(42), I32ValueRef::new(1));
    let b = add(I32ValueRef::new(2), I32ValueRef::new(3));
    log(
        a.clone(),
        LoggingOptions {
            name: "value of a".to_string(),
        }
        .into(),
    );
    let c = add(max.clone(), a);
    let d = add(max, b);
    let e = add(c, d);
    let r = add(r1, e);
    log(
        r,
        LoggingOptions {
            name: "value of r".to_string(),
        }
        .into(),
    );
}

#[turbo_tasks::function]
async fn ls(fs: FileSystemRef) {
    let directory_ref = FileSystemPathRef::new(fs, "");
    print_sizes(directory_ref.clone());
}

#[turbo_tasks::function]
async fn print_sizes(directory: FileSystemPathRef) -> Result<()> {
    let content = directory.clone().read_dir();
    match &*content.await? {
        DirectoryContent::Entries(entries) => {
            for entry in entries.iter() {
                match &*entry.get().await? {
                    DirectoryEntry::File(path) => {
                        print_size(path.clone(), path.clone().read());
                    }
                    DirectoryEntry::Directory(path) => {
                        print_sizes(path.clone());
                    }
                    _ => {}
                }
            }
        }
        DirectoryContent::NotFound => {
            println!("{}: not found", directory.await?.path);
        }
    };
    Ok(())
}

#[turbo_tasks::function]
async fn print_size(path: FileSystemPathRef, content: FileContentRef) -> Result<()> {
    match &*content.await? {
        FileContent::Content(buffer) => {
            println!("{:?}: Size {}", *path.await?, buffer.len());
        }
        FileContent::NotFound => {
            println!("{:?}: not found", *path.await?);
        }
    }
    Ok(())
}
