use std::{env::current_dir, sync::Arc};

use anyhow::anyhow;
use clap::Parser;
use turbo_tasks::{TransientValue, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc};
use turbo_tasks_memory::{stats::Stats, viz, MemoryBackend};
use turbopack::{ecmascript::target::CompileTarget, GraphOptionsVc, ModuleAssetContextVc};
use turbopack_core::{
    chunk::{
        dev::{DevChunkingContext, DevChunkingContextVc},
        ChunkGroupVc, ChunkableAssetVc,
    },
    context::AssetContextVc,
    lazy::LazyAssetVc,
    source_asset::SourceAssetVc,
};
use turbopack_dev_server::{fs::DevServerFileSystemVc, html::DevHtmlAsset, DevServerVc};

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Args {}

#[tokio::main]
async fn main() {
    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    let Args {} = Args::parse();

    let dir = current_dir()
        .unwrap()
        .to_str()
        .ok_or_else(|| anyhow!("current directory contains invalid characters"))
        .unwrap()
        .to_string();

    let tt = TurboTasks::new(MemoryBackend::new());
    let server = tt
        .clone()
        .run_once(async move {
            let disk_fs = DiskFileSystemVc::new("project".to_string(), dir);
            let fs = disk_fs.into();
            let root = FileSystemPathVc::new(fs, "demo");
            let source_asset =
                SourceAssetVc::new(FileSystemPathVc::new(fs, "demo/index.js")).into();
            let context: AssetContextVc = ModuleAssetContextVc::new(
                root,
                GraphOptionsVc::new(false, false, CompileTarget::Current.into()),
            )
            .into();
            let module = context.process(source_asset);
            let dev_server_fs = DevServerFileSystemVc::new().as_file_system();
            let chunking_context: DevChunkingContextVc = DevChunkingContext {
                context_path: root,
                root_path: FileSystemPathVc::new(dev_server_fs, "/_next/chunks"),
            }
            .into();
            let chunk_group = ChunkGroupVc::from_asset(
                ChunkableAssetVc::cast_from(module),
                chunking_context.into(),
            );
            let html = DevHtmlAsset {
                path: FileSystemPathVc::new(dev_server_fs, "index.html"),
                chunk_group,
            }
            .into();
            let lazy_asset = LazyAssetVc::new(html).into();

            let server = DevServerVc::new(
                FileSystemPathVc::new(dev_server_fs, ""),
                lazy_asset,
                TransientValue::new(Arc::new(move |path| {
                    if path == "/__turbo_tasks_graph__" {
                        let mut stats = Stats::new();
                        let b = tt.backend();
                        b.with_all_cached_tasks(|task| {
                            stats.add_id(b, task);
                        });
                        let tree = stats.treeify();
                        let graph = viz::visualize_stats_tree(tree);
                        return Some(viz::wrap_html(&graph));
                    }
                    None
                })),
            );
            disk_fs.await?.start_watching()?;
            server.listen().await
        })
        .await
        .unwrap();
    server.future.await.unwrap();
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
