use anyhow::{Result, anyhow};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPath;
use turbopack_browser::{BrowserChunkingContext, react_refresh::assert_can_resolve_react_refresh};
use turbopack_cli_utils::runtime_entry::{RuntimeEntries, RuntimeEntry};
use turbopack_core::{
    chunk::{ChunkableModule, ChunkingContext, EvaluatableAsset, SourceMapsType},
    environment::Environment,
    file_source::FileSource,
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroupEntry},
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        origin::{PlainResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_dev_server::{
    html::{DevHtmlAsset, DevHtmlEntry},
    source::{ContentSource, asset_graph::AssetGraphContentSource},
};
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_node::execution_context::ExecutionContext;

use crate::{
    contexts::{
        NodeEnv, get_client_asset_context, get_client_compile_time_info,
        get_client_resolve_options_context,
    },
    embed_js::embed_file_path,
};

#[turbo_tasks::function]
pub async fn get_client_chunking_context(
    root_path: FileSystemPath,
    server_root: FileSystemPath,
    server_root_to_root_path: RcStr,
    environment: ResolvedVc<Environment>,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    Ok(Vc::upcast(
        BrowserChunkingContext::builder(
            root_path,
            server_root.clone(),
            server_root_to_root_path,
            server_root.clone(),
            server_root.join("/_chunks")?,
            server_root.join("/_assets")?,
            environment,
            RuntimeType::Development,
        )
        .hot_module_replacement()
        .use_file_source_map_uris()
        .dynamic_chunk_content_loading(true)
        .build(),
    ))
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_path: FileSystemPath,
    node_env: Vc<NodeEnv>,
) -> Result<Vc<RuntimeEntries>> {
    let resolve_options_context =
        get_client_resolve_options_context(project_path.clone(), node_env);

    let mut runtime_entries = Vec::new();

    let enable_react_refresh =
        assert_can_resolve_react_refresh(project_path.clone(), resolve_options_context)
            .await?
            .as_request();
    // It's important that React Refresh come before the regular bootstrap file,
    // because the bootstrap contains JSX which requires Refresh's global
    // functions to be available.
    if let Some(request) = enable_react_refresh {
        runtime_entries.push(
            RuntimeEntry::Request(request.to_resolved().await?, project_path.join("_")?)
                .resolved_cell(),
        )
    };

    runtime_entries.push(
        RuntimeEntry::Source(ResolvedVc::upcast(
            FileSource::new(
                embed_file_path(rcstr!("entry/bootstrap.ts"))
                    .owned()
                    .await?,
            )
            .to_resolved()
            .await?,
        ))
        .resolved_cell(),
    );

    Ok(Vc::cell(runtime_entries))
}

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    root_path: FileSystemPath,
    execution_context: Vc<ExecutionContext>,
    entry_requests: Vec<Vc<Request>>,
    server_root: FileSystemPath,
    server_root_to_root_path: RcStr,
    _env: Vc<Box<dyn ProcessEnv>>,
    eager_compile: bool,
    node_env: Vc<NodeEnv>,
    source_maps_type: SourceMapsType,
    browserslist_query: RcStr,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let compile_time_info = get_client_compile_time_info(browserslist_query, node_env);
    let asset_context = get_client_asset_context(
        root_path.clone(),
        execution_context,
        compile_time_info,
        node_env,
        source_maps_type,
    );
    let chunking_context = get_client_chunking_context(
        root_path.clone(),
        server_root.clone(),
        server_root_to_root_path,
        compile_time_info.environment(),
    )
    .to_resolved()
    .await?;
    let entries = get_client_runtime_entries(root_path.clone(), node_env);

    let runtime_entries = entries.resolve_entries(asset_context);

    let origin = PlainResolveOrigin::new(asset_context, root_path.join("_")?);
    let entries = entry_requests
        .into_iter()
        .map(|request| async move {
            let ty = ReferenceType::Entry(EntryReferenceSubType::Web);
            Ok(origin
                .resolve_asset(request, origin.resolve_options(ty.clone()).await?, ty)
                .await?
                .resolve()
                .await?
                .primary_modules()
                .await?
                .first()
                .copied())
        })
        .try_flat_join()
        .await?;

    let all_modules = entries
        .iter()
        .copied()
        .chain(
            runtime_entries
                .await?
                .iter()
                .map(|&entry| ResolvedVc::upcast(entry)),
        )
        .collect::<Vec<ResolvedVc<Box<dyn Module>>>>();
    let module_graph =
        ModuleGraph::from_modules(Vc::cell(vec![ChunkGroupEntry::Entry(all_modules)]), false)
            .to_resolved()
            .await?;

    let entries: Vec<_> = entries
        .into_iter()
        .map(|module| async move {
            if let (Some(chunkable_module), Some(entry)) = (
                ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(module),
                ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(module),
            ) {
                Ok(DevHtmlEntry {
                    chunkable_module,
                    module_graph,
                    chunking_context,
                    runtime_entries: Some(runtime_entries.with_entry(*entry).to_resolved().await?),
                })
            } else if let Some(chunkable_module) =
                ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(module)
            {
                // TODO this is missing runtime code, so it's probably broken and we should also
                // add an ecmascript chunk with the runtime code
                Ok(DevHtmlEntry {
                    chunkable_module,
                    module_graph,
                    chunking_context,
                    runtime_entries: None,
                })
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

    let entry_asset = Vc::upcast(DevHtmlAsset::new(server_root.join("index.html")?, entries));

    let graph = Vc::upcast(if eager_compile {
        AssetGraphContentSource::new_eager(server_root, entry_asset)
    } else {
        AssetGraphContentSource::new_lazy(server_root, entry_asset)
    });
    Ok(graph)
}
