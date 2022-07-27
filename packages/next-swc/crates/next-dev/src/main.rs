#![feature(future_join)]
#![feature(future_poll_fn)]

use std::{
    env::current_dir,
    future::join,
    net::IpAddr,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::anyhow;
use clap::Parser;
use turbo_tasks::{util::FormatDuration, TransientValue, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc};
use turbo_tasks_memory::{stats::Stats, viz, MemoryBackend};
use turbopack::{
    ecmascript::{target::CompileTargetVc, ModuleAssetVc as EcmascriptModuleAssetVc},
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

    /// Compile all, instead of only compiling referenced assets when their
    /// parent asset is requested
    #[clap(long)]
    eager_compile: bool,
}

#[tokio::main]
async fn main() {
    let start = Instant::now();

    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    register();

    let args = Cli::parse();

    let dir = args
        .dir
        .map(|dir| dir.canonicalize())
        .unwrap_or_else(current_dir)
        .unwrap()
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
                GraphOptionsVc::new(false, false, CompileTargetVc::current()),
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

            let mut served_asset = entry_asset;
            if !args.eager_compile {
                served_asset = LazyAssetVc::new(served_asset).into();
            }

            let server = DevServerVc::new(
                FileSystemPathVc::new(dev_server_fs, ""),
                served_asset,
                TransientValue::new((args.hostname, args.port).into()),
                TransientValue::new(Arc::new(move |path| {
                    if path == "/__turbo_tasks_graph__" {
                        let mut stats = Stats::new();
                        let b = tt.backend();
                        b.with_all_cached_tasks(|task| {
                            stats.add_id(b, task);
                        });
                        let tree = stats.treeify();
                        let graph = viz::graph::visualize_stats_tree(tree);
                        return Some(viz::graph::wrap_html(&graph));
                    }
                    if path == "/__turbo_tasks_table__" {
                        let mut stats = Stats::new();
                        let b = tt.backend();
                        b.with_all_cached_tasks(|task| {
                            stats.add_id(b, task);
                        });
                        let tree = stats.treeify();
                        let table = viz::table::create_table(tree);
                        return Some(viz::table::wrap_html(&table));
                    }
                    None
                })),
            );
            disk_fs.await?.start_watching()?;
            server.listen().await
        })
        .await
        .unwrap();

    {
        let index_uri = if server.addr.ip().is_loopback() {
            format!("http://localhost:{}", server.addr.port())
        } else {
            format!("http://{}", server.addr)
        };
        println!("server listening on: {uri}", uri = index_uri);
        let _ = webbrowser::open(&index_uri);
    }

    join! {
        async move {
            let (elapsed, count) = tt_clone.get_or_wait_update_info(Duration::ZERO).await;
            println!("initial compilation {} ({} task execution, {} tasks)", FormatDuration(start.elapsed()), FormatDuration(elapsed), count);

            loop {
                let (elapsed, count) = tt_clone.get_or_wait_update_info(Duration::from_millis(100)).await;
                println!("updated in {} ({} tasks)", FormatDuration(elapsed), count);
            }
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
