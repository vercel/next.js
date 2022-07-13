#![feature(trivial_bounds)]
#![feature(once_cell)]
#![feature(min_specialization)]

use anyhow::Result;
use tokio::task::{block_on, sleep, spawn};
use log::LoggingOptions;
use math::{add, max_new};
use random::RandomIdVc;
use std::fs;
use std::time::Instant;
use std::{env::current_dir, time::Duration};
use turbopack::ecmascript::ModuleAssetVc;
use turbopack::emit;
use turbopack::rebase::RebasedAssetVc;
use turbopack::source_asset::SourceAssetVc;
use turbo_tasks::viz::GraphViz;
use turbo_tasks::{NothingVc, TurboTasks};

use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, DiskFileSystemVc, FileContent, FileContentVc,
    FileSystemPathVc, FileSystemVc,
};

use crate::{log::log, math::I32ValueVc, random::random};

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
                make_math().await;

                Ok(NothingVc::new().into())
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
                    let (elapsed, count) = tt.wait_next_done().await;
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
            graph_viz.drop_unchanged_cells();
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
    let r1 = random(RandomIdVc::new(Duration::from_secs(5), 4));
    let r2 = random(RandomIdVc::new(Duration::from_secs(7), 3));
    let max = max_new(r1, r2);
    let a = add(I32ValueVc::new(42), I32ValueVc::new(1));
    let b = add(I32ValueVc::new(2), I32ValueVc::new(3));
    log(
        a,
        LoggingOptions {
            name: "value of a".to_string(),
        }
        .into(),
    );
    let c = add(max, a);
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
