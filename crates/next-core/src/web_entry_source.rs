use std::{collections::HashMap, future::IntoFuture};

use anyhow::{anyhow, Result};
use turbo_tasks::{util::try_join_all, Value};
use turbo_tasks_fs::{FileSystemPathVc, FileSystemVc};
use turbopack::{
    ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc},
    module_options::ModuleOptionsContext,
    ModuleAssetContextVc,
};
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

use crate::react_refresh::{assert_can_resolve_react_refresh, resolve_react_refresh};

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    root: FileSystemPathVc,
    entry_requests: Vec<RequestVc>,
    dev_server_fs: FileSystemVc,
    eager_compile: bool,
) -> Result<ContentSourceVc> {
    let environment = EnvironmentVc::new(
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
    );

    let can_resolve_react_refresh = *assert_can_resolve_react_refresh(root, environment).await?;

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        root,
        environment,
        ModuleOptionsContext {
            // We don't need to resolve React Refresh for each module. Instead,
            // we try resolve it once at the root and pass down a context to all
            // the modules.
            enable_react_refresh: can_resolve_react_refresh,
        }
        .into(),
    )
    .into();

    let chunking_context: DevChunkingContextVc = DevChunkingContext {
        context_path: root,
        chunk_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/static/chunks"),
        asset_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/static/assets"),
    }
    .into();

    let runtime_entries = if can_resolve_react_refresh {
        Some(EcmascriptChunkPlaceablesVc::cell(vec![
            resolve_react_refresh(context),
        ]))
    } else {
        None
    };

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
            Ok(ecmascript.as_evaluated_chunk(chunking_context.into(), runtime_entries))
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
