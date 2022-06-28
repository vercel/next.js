use std::env::current_dir;

use anyhow::anyhow;
use turbo_tasks::TurboTasks;
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{ecmascript::target::CompileTarget, GraphOptionsVc, ModuleAssetContextVc};
use turbopack_core::{
    chunk::{
        dev::{DevChunkingContext, DevChunkingContextVc},
        ChunkableAssetVc,
    },
    context::AssetContextVc,
    lazy::LazyAssetVc,
    source_asset::SourceAssetVc,
};
use turbopack_dev_server::{fs::DevServerFileSystemVc, html::DevHtmlAsset, DevServerVc};

#[tokio::main]
async fn main() {
    #[cfg(debug_assertions)]
    console_subscriber::init();
    register();

    let dir = current_dir()
        .unwrap()
        .to_str()
        .ok_or_else(|| anyhow!("current directory contains invalid characters"))
        .unwrap()
        .to_string();

    let tt = TurboTasks::new(MemoryBackend::new());
    let server = tt
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
            let chunk_group = chunking_context
                .as_chunking_context()
                .as_chunk_group(ChunkableAssetVc::cast_from(module));
            let html = DevHtmlAsset {
                path: FileSystemPathVc::new(dev_server_fs, "index.html"),
                chunk_group,
            }
            .into();
            let lazy_asset = LazyAssetVc::new(html).into();

            let server = DevServerVc::new(FileSystemPathVc::new(dev_server_fs, ""), lazy_asset);
            disk_fs.await?.start_watching()?;
            server.listen().await
        })
        .await
        .unwrap();
    server.future.await.unwrap()
}

fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_dev_server::register();
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
