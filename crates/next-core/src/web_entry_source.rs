use std::{collections::HashMap, future::IntoFuture};

use anyhow::{anyhow, Result};
use turbo_tasks::{TryJoinIterExt, Value};
use turbo_tasks_fs::{FileSystemPathVc, FileSystemVc};
use turbopack::{
    ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc},
    module_options::ModuleOptionsContext,
    resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc,
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
};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    html_runtime_asset::HtmlRuntimeAssetVc,
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

    let resolve_options_context = ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_node_modules: true,
        custom_conditions: vec!["development".to_string()],
        ..Default::default()
    }
    .cell();
    let enable_react_refresh =
        *assert_can_resolve_react_refresh(root, resolve_options_context).await?;

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        root,
        environment,
        ModuleOptionsContext {
            // We don't need to resolve React Refresh for each module. Instead,
            // we try resolve it once at the root and pass down a context to all
            // the modules.
            enable_react_refresh,
            enable_styled_jsx: true,
            enable_typescript_transform: true,
            ..Default::default()
        }
        .cell(),
        resolve_options_context,
    )
    .into();

    let chunking_context: DevChunkingContextVc = DevChunkingContext {
        context_path: root,
        chunk_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/static/chunks"),
        asset_root_path: FileSystemPathVc::new(dev_server_fs, "/_next/static/assets"),
        enable_hot_module_replacement: true,
    }
    .into();

    let mut runtime_entries = vec![HtmlRuntimeAssetVc::new().as_ecmascript_chunk_placeable()];
    if enable_react_refresh {
        runtime_entries.push(resolve_react_refresh(context))
    }
    let runtime_entries = EcmascriptChunkPlaceablesVc::cell(runtime_entries);

    let modules = entry_requests
        .into_iter()
        .map(|r| {
            context
                .resolve_asset(context.context_path(), r, context.resolve_options())
                .primary_assets()
                .into_future()
        })
        .try_join()
        .await?;
    let modules = modules
        .into_iter()
        .flat_map(|assets| assets.iter().copied().collect::<Vec<_>>());
    let chunks = modules
        .map(|module| async move {
            if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
                Ok(ecmascript.as_evaluated_chunk(chunking_context.into(), Some(runtime_entries)))
            } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
                // TODO this is missing runtime code, so it's probably broken and we should also
                // add an ecmascript chunk with the runtime code
                Ok(chunkable.as_chunk(chunking_context.into()))
            } else {
                // TODO convert into a serve-able asset
                Err(anyhow!(
                    "Entry module is not chunkable, so it can't be used to bootstrap the \
                     application"
                ))
            }
        })
        .try_join()
        .await?;

    let entry_asset = DevHtmlAsset::new(
        FileSystemPathVc::new(dev_server_fs, "index.html"),
        chunks.into_iter().map(ChunkGroupVc::from_chunk).collect(),
    )
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
