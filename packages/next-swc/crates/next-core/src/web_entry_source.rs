use std::{collections::HashMap, future::IntoFuture};

use anyhow::{anyhow, Result};
use turbo_tasks::{util::try_join_all, Value};
use turbo_tasks_fs::{FileSystemPathVc, FileSystemVc};
use turbopack::{ecmascript::EcmascriptModuleAssetVc, ModuleAssetContextVc};
use turbopack_core::{
    chunk::{
        dev::{DevChunkingContext, DevChunkingContextVc},
        ChunkGroupVc, ChunkableAssetVc,
    },
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    resolve::parse::RequestVc,
    transition::TransitionsByNameVc,
};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc},
};

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    root: FileSystemPathVc,
    entry_requests: Vec<RequestVc>,
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

    let modules = try_join_all(entry_requests.into_iter().map(|r| {
        context
            .resolve_asset(context.context_path(), r, context.resolve_options())
            .primary_assets()
            .into_future()
    }))
    .await?;
    let modules = modules
        .into_iter()
        .flat_map(|assets| assets.iter().copied().collect::<Vec<_>>());
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
