use anyhow::{anyhow, Result};
use turbo_tasks::{RcStr, TryJoinIterExt, Value, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPath;
use turbopack::ecmascript::EcmascriptModuleAsset;
use turbopack_browser::{react_refresh::assert_can_resolve_react_refresh, BrowserChunkingContext};
use turbopack_cli_utils::runtime_entry::{RuntimeEntries, RuntimeEntry};
use turbopack_core::{
    chunk::{ChunkableModule, ChunkingContext},
    environment::Environment,
    file_source::FileSource,
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        origin::{PlainResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    source::{asset_graph::AssetGraphContentSource, ContentSource},
};
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_node::execution_context::ExecutionContext;

use crate::{
    contexts::{
        get_client_asset_context, get_client_compile_time_info, get_client_resolve_options_context,
        NodeEnv,
    },
    embed_js::embed_file_path,
};

#[turbo_tasks::function]
pub fn get_client_chunking_context(
    project_path: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    environment: Vc<Environment>,
) -> Vc<Box<dyn ChunkingContext>> {
    Vc::upcast(
        BrowserChunkingContext::builder(
            project_path,
            server_root,
            server_root,
            server_root.join("/_chunks".into()),
            server_root.join("/_assets".into()),
            environment,
            RuntimeType::Development,
        )
        .hot_module_replacement()
        .build(),
    )
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_path: Vc<FileSystemPath>,
) -> Result<Vc<RuntimeEntries>> {
    let resolve_options_context = get_client_resolve_options_context(project_path);

    let mut runtime_entries = Vec::new();

    let enable_react_refresh =
        assert_can_resolve_react_refresh(project_path, resolve_options_context)
            .await?
            .as_request();
    // It's important that React Refresh come before the regular bootstrap file,
    // because the bootstrap contains JSX which requires Refresh's global
    // functions to be available.
    if let Some(request) = enable_react_refresh {
        runtime_entries.push(RuntimeEntry::Request(request, project_path.join("_".into())).cell())
    };

    runtime_entries.push(
        RuntimeEntry::Source(Vc::upcast(FileSource::new(embed_file_path(
            "entry/bootstrap.ts".into(),
        ))))
        .cell(),
    );

    Ok(Vc::cell(runtime_entries))
}

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    entry_requests: Vec<Vc<Request>>,
    server_root: Vc<FileSystemPath>,
    _env: Vc<Box<dyn ProcessEnv>>,
    eager_compile: bool,
    node_env: Vc<NodeEnv>,
    browserslist_query: RcStr,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let compile_time_info = get_client_compile_time_info(browserslist_query, node_env);
    let asset_context =
        get_client_asset_context(project_path, execution_context, compile_time_info, node_env);
    let chunking_context =
        get_client_chunking_context(project_path, server_root, compile_time_info.environment());
    let entries = get_client_runtime_entries(project_path);

    let runtime_entries = entries.resolve_entries(asset_context);

    let origin = PlainResolveOrigin::new(asset_context, project_path.join("_".into()));
    let entries = entry_requests
        .into_iter()
        .map(|request| async move {
            let ty = Value::new(ReferenceType::Entry(EntryReferenceSubType::Web));
            Ok(origin
                .resolve_asset(request, origin.resolve_options(ty.clone()), ty)
                .resolve()
                .await?
                .primary_modules()
                .await?
                .first()
                .copied())
        })
        .try_join()
        .await?;

    let entries: Vec<_> = entries
        .into_iter()
        .flatten()
        .map(|module| async move {
            if let Some(ecmascript) =
                Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await?
            {
                Ok((
                    Vc::upcast(ecmascript),
                    chunking_context,
                    Some(runtime_entries.with_entry(Vc::upcast(ecmascript))),
                ))
            } else if let Some(chunkable) =
                Vc::try_resolve_sidecast::<Box<dyn ChunkableModule>>(module).await?
            {
                // TODO this is missing runtime code, so it's probably broken and we should also
                // add an ecmascript chunk with the runtime code
                Ok((chunkable, chunking_context, None))
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

    let entry_asset = Vc::upcast(DevHtmlAsset::new(
        server_root.join("index.html".into()),
        entries,
    ));

    let graph = Vc::upcast(if eager_compile {
        AssetGraphContentSource::new_eager(server_root, entry_asset)
    } else {
        AssetGraphContentSource::new_lazy(server_root, entry_asset)
    });
    Ok(graph)
}
