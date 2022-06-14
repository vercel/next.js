use std::env::current_dir;

use anyhow::anyhow;
use turbo_tasks::TurboTasks;
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc};
use turbo_tasks_memory::MemoryBackend;
use turbopack::{ecmascript::target::CompileTarget, GraphOptionsVc, ModuleAssetContextVc};
use turbopack_core::{context::AssetContextVc, source_asset::SourceAssetVc};
use turbopack_dev_server::DevServerVc;

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
            let fs = DiskFileSystemVc::new("project".to_string(), dir).into();
            let root = FileSystemPathVc::new(fs, "demo");
            let source_asset =
                SourceAssetVc::new(FileSystemPathVc::new(fs, "demo/index.js")).into();
            let context: AssetContextVc = ModuleAssetContextVc::new(
                root,
                GraphOptionsVc::new(true, false, CompileTarget::Current.into()),
            )
            .into();
            let module = context.process(source_asset);

            let server = DevServerVc::new(root, module);
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
