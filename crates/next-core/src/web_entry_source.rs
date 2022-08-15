use std::collections::HashMap;

use anyhow::{anyhow, Result};
use futures::future::try_join_all;
use turbo_tasks::Value;
use turbo_tasks_fs::{FileSystemPathVc, FileSystemVc};
use turbopack::{ecmascript::EcmascriptModuleAssetVc, ModuleAssetContextVc};
use turbopack_core::{
    chunk::{
        dev::{DevChunkingContext, DevChunkingContextVc},
        ChunkGroupVc, ChunkableAssetVc,
    },
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    source_asset::SourceAssetVc,
    transition::TransitionsByNameVc,
};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc},
};

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    root: FileSystemPathVc,
    entry_paths: Vec<FileSystemPathVc>,
    dev_server_fs: FileSystemVc,
    eager_compile: bool,
) -> Result<ContentSourceVc> {
    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
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

    let chunking_context: DevChunkingContextVc = DevChunkingContext {
        context_path: root,
        chunk_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/static/chunks"),
        asset_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/static/assets"),
    }
    .into();

    let modules = entry_paths
        .into_iter()
        .map(|p| context.process(SourceAssetVc::new(p).into()));
    let chunks = try_join_all(modules.map(|module| async move {
        if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
            Ok(ecmascript.as_evaluated_chunk(chunking_context.into()))
        } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
            Ok(chunkable.as_chunk(chunking_context.into()))
        } else {
            // TODO convert into a serve-able asset
            Err(anyhow!(
                "Entry module is not chunkable, so it can't be used to bootstrap the application"
            ))
        }
        // ChunkGroupVc::from_chunk(m)
    }))
    .await?;

    let entry_asset = DevHtmlAsset {
        path: FileSystemPathVc::new(dev_server_fs, "index.html"),
        chunk_groups: chunks.into_iter().map(ChunkGroupVc::from_chunk).collect(),
    }
    .cell()
    .into();

    let root_path = FileSystemPathVc::new(dev_server_fs, "");
    let graph = if eager_compile {
        AssetGraphContentSourceVc::new_eager(root_path, entry_asset)
    } else {
        AssetGraphContentSourceVc::new_lazy(root_path, entry_asset)
    }
    .into();
    Ok(graph)
}
