#![feature(future_join)]
#![feature(future_poll_fn)]

use std::{env::current_dir, future::join, net::IpAddr, path::PathBuf, sync::Arc, time::Instant};

use anyhow::anyhow;
use clap::Parser;
use turbo_tasks::{util::FormatDuration, TransientValue, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc};
use turbo_tasks_memory::{stats::Stats, viz, MemoryBackend};
use turbopack::{
    ecmascript::{target::CompileTarget, ModuleAssetVc as EcmascriptModuleAssetVc},
    GraphOptionsVc, ModuleAssetContextVc,
};
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
struct Cli {
    /// The directory of the Next.js application.
    /// If no directory is provided, the current directory will be used.
    #[clap(value_parser)]
    dir: Option<PathBuf>,

    /// The port number on which to start the application
    #[clap(short, long, value_parser, default_value_t = 3000)]
    port: u16,

    /// Hostname on which to start the application
    #[clap(short = 'H', long, value_parser, default_value = "127.0.0.1")]
    hostname: IpAddr,
}

#[tokio::main]
async fn main() {
    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    let args = Cli::parse();

    let start = Instant::now();

    let dir = args
        .dir
        .unwrap_or_else(|| current_dir().unwrap())
        .to_str()
        .ok_or_else(|| anyhow!("current directory contains invalid characters"))
        .unwrap()
        .to_string();

    let tt = TurboTasks::new(MemoryBackend::new());
    let tt_clone = tt.clone();
    let server = tt
        .clone()
        .run_once(async move {
            let disk_fs = DiskFileSystemVc::new("project".to_string(), dir);
            let fs = disk_fs.into();
            let root = FileSystemPathVc::new(fs, "");
            let source_asset = SourceAssetVc::new(FileSystemPathVc::new(fs, "src/index.js")).into();
            let context: AssetContextVc = ModuleAssetContextVc::new(
                root,
                GraphOptionsVc::new(false, false, CompileTarget::Current.into()),
            )
            .into();
            let module = context.process(source_asset);
            let dev_server_fs = DevServerFileSystemVc::new().as_file_system();
            let chunking_context: DevChunkingContextVc = DevChunkingContext {
                context_path: root,
                chunk_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/chunks"),
                asset_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/static"),
            }
            .into();
            let entry_asset =
                if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
                    let chunk = ecmascript.as_evaluated_chunk(chunking_context.into());
                    let chunk_group = ChunkGroupVc::from_chunk(chunk);
                    DevHtmlAsset {
                        path: FileSystemPathVc::new(dev_server_fs, "index.html"),
                        chunk_group,
                    }
                    .into()
                } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
                    let chunk = chunkable.as_chunk(chunking_context.into());
                    let chunk_group = ChunkGroupVc::from_chunk(chunk);
                    DevHtmlAsset {
                        path: FileSystemPathVc::new(dev_server_fs, "index.html"),
                        chunk_group,
                    }
                    .into()
                } else {
                    // TODO convert into a serve-able asset
                    return Err(anyhow!(
                        "Entry module is not chunkable, so it can't be used to bootstrap the \
                         application"
                    ));
                };
            let lazy_asset = LazyAssetVc::new(entry_asset).into();

            let server = DevServerVc::new(
                FileSystemPathVc::new(dev_server_fs, ""),
                lazy_asset,
                TransientValue::new((args.hostname, args.port).into()),
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
    join! {
        async move {
            tt_clone.wait_done().await;
            println!("initial request prepared in {}", FormatDuration(start.elapsed()));
        },
        async {
            server.future.await.unwrap()
        }
    }
    .await;
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
