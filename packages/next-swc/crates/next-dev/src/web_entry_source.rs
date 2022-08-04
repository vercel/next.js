use anyhow::{anyhow, Result};
use turbo_tasks::Value;
use turbo_tasks_fs::{FileSystemPathVc, FileSystemVc};
use turbopack::ModuleAssetContextVc;
use turbopack_core::{
    chunk::{
        dev::{DevChunkingContext, DevChunkingContextVc},
        ChunkGroupVc, ChunkableAssetVc,
    },
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    source_asset::SourceAssetVc,
};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc},
};

use crate::EcmascriptModuleAssetVc;

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    root: FileSystemPathVc,
    entry_path: FileSystemPathVc,
    dev_server_fs: FileSystemVc,
    eager_compile: bool,
) -> Result<ContentSourceVc> {
    let source_asset = SourceAssetVc::new(entry_path).into();
    let context: AssetContextVc = ModuleAssetContextVc::new(
        root,
        EnvironmentVc::new(
            Value::new(ExecutionEnvironment::Browser(
                BrowserEnvironment {
                    dom: true,
                    web_worker: false,
                    service_worker: false,
                    browser_version: 0,
                }
                .into(),
            )),
            Value::new(EnvironmentIntention::Client),
        ),
    )
    .into();
    let module = context.process(source_asset);
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
                "Entry module is not chunkable, so it can't be used to bootstrap the application"
            ));
        };

    let root_path = FileSystemPathVc::new(dev_server_fs, "");
    let graph = if eager_compile {
        AssetGraphContentSourceVc::new_eager(root_path, entry_asset)
    } else {
        AssetGraphContentSourceVc::new_lazy(root_path, entry_asset)
    }
    .into();
    Ok(graph)
}
