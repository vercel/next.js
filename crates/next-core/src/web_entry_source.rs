use anyhow::{anyhow, Result};
use turbo_tasks::{TryJoinIterExt, Value};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::ecmascript::EcmascriptModuleAssetVc;
use turbopack_core::{
    chunk::{ChunkGroupVc, ChunkableAssetVc},
    resolve::{origin::PlainResolveOriginVc, parse::RequestVc},
};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc},
};

use crate::{
    embed_js::wrap_with_next_js_fs,
    next_client::context::{
        get_client_asset_context, get_client_chunking_context, get_client_runtime_entries,
        ContextType,
    },
};

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    project_root: FileSystemPathVc,
    entry_requests: Vec<RequestVc>,
    server_root: FileSystemPathVc,
    env: ProcessEnvVc,
    eager_compile: bool,
    browserslist_query: &str,
) -> Result<ContentSourceVc> {
    let project_root = wrap_with_next_js_fs(project_root);

    let ty = Value::new(ContextType::Other);
    let context = get_client_asset_context(project_root, browserslist_query, ty);
    let chunking_context = get_client_chunking_context(project_root, server_root, ty);
    let entries = get_client_runtime_entries(project_root, env, ty);

    let runtime_entries = entries.resolve_entries(context);

    let origin = PlainResolveOriginVc::new(context, project_root.join("_")).as_resolve_origin();
    let entries = entry_requests
        .into_iter()
        .map(|request| async move {
            Ok(origin
                .resolve_asset(request, origin.resolve_options())
                .primary_assets()
                .await?
                .first()
                .copied())
        })
        .try_join()
        .await?;
    let chunks: Vec<_> = entries
        .into_iter()
        .flatten()
        .enumerate()
        .map(|(i, module)| async move {
            if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
                Ok(ecmascript
                    .as_evaluated_chunk(chunking_context, (i == 0).then_some(runtime_entries)))
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
        .try_join()
        .await?;

    let entry_asset = DevHtmlAssetVc::new(
        server_root.join("index.html"),
        chunks.into_iter().map(ChunkGroupVc::from_chunk).collect(),
    )
    .into();

    let graph = if eager_compile {
        AssetGraphContentSourceVc::new_eager(server_root, entry_asset)
    } else {
        AssetGraphContentSourceVc::new_lazy(server_root, entry_asset)
    }
    .into();
    Ok(graph)
}
