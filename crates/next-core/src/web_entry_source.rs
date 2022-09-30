use std::future::IntoFuture;

use anyhow::{anyhow, Result};
use futures::{prelude::*, stream};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::ecmascript::EcmascriptModuleAssetVc;
use turbopack_core::{
    chunk::{ChunkGroupVc, ChunkableAssetVc},
    resolve::parse::RequestVc,
};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc},
};
use turbopack_env::ProcessEnvVc;

use crate::next_client::context::{
    get_client_asset_context, get_client_chunking_context, get_resolved_client_runtime_entries,
};

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    project_root: FileSystemPathVc,
    entry_requests: Vec<RequestVc>,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    eager_compile: bool,
) -> Result<ContentSourceVc> {
    let context = get_client_asset_context(project_root);
    let chunking_context = get_client_chunking_context(project_root, server_root);
    let runtime_entries = get_resolved_client_runtime_entries(project_root, env);

    let chunks: Vec<_> = stream::iter(entry_requests)
        .then(|r| {
            context
                .resolve_asset(context.context_path(), r, context.resolve_options())
                .primary_assets()
                .into_future()
        })
        .map_ok(|assets| stream::iter(assets.clone()).map(Ok))
        .try_flatten()
        .and_then(|module| async move {
            if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
                Ok(ecmascript.as_evaluated_chunk(chunking_context, Some(runtime_entries)))
            } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
                // TODO this is missing runtime code, so it's probably broken and we should also
                // add an ecmascript chunk with the runtime code
                Ok(chunkable.as_chunk(chunking_context))
            } else {
                // TODO convert into a serve-able asset
                Err(anyhow!(
                    "Entry module is not chunkable, so it can't be used to bootstrap the \
                     application"
                ))
            }
        })
        .try_collect()
        .await?;

    let entry_asset = DevHtmlAsset::new(
        server_root.join("index.html"),
        chunks.into_iter().map(ChunkGroupVc::from_chunk).collect(),
    )
    .cell()
    .into();

    let graph = if eager_compile {
        AssetGraphContentSourceVc::new_eager(server_root, entry_asset)
    } else {
        AssetGraphContentSourceVc::new_lazy(server_root, entry_asset)
    }
    .into();
    Ok(graph)
}
