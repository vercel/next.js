use std::collections::HashMap;

use anyhow::{anyhow, Result};
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::{
        tasks::{TryJoinIterExt, Value},
        tasks_fs::FileSystemPath,
    },
    turbopack::{
        core::{
            chunk::{ChunkableModule, ChunkingContext},
            compile_time_defines,
            compile_time_info::{CompileTimeDefines, CompileTimeInfo, FreeVarReferences},
            context::AssetContext,
            environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
            file_source::FileSource,
            free_var_references,
            reference_type::{EntryReferenceSubType, ReferenceType},
            resolve::{
                origin::{PlainResolveOrigin, ResolveOrigin, ResolveOriginExt},
                parse::Request,
            },
        },
        dev::{react_refresh::assert_can_resolve_react_refresh, DevChunkingContext},
        dev_server::{
            html::DevHtmlAsset,
            source::{asset_graph::AssetGraphContentSource, ContentSource},
        },
        node::execution_context::ExecutionContext,
        turbopack::{ecmascript::EcmascriptModuleAsset, ModuleAssetContext},
    },
};

use crate::{
    embed_js::next_js_file_path,
    mode::NextMode,
    next_client::{
        context::{get_client_resolve_options_context, ClientContextType},
        get_client_module_options_context, RuntimeEntries, RuntimeEntry,
    },
    next_config::NextConfig,
};

fn defines() -> CompileTimeDefines {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = "development",
    )
}

#[turbo_tasks::function]
fn web_defines() -> Vc<CompileTimeDefines> {
    defines().cell()
}

#[turbo_tasks::function]
async fn web_free_vars() -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(..defines().into_iter()).cell())
}

#[turbo_tasks::function]
pub fn get_compile_time_info(browserslist_query: String) -> Vc<CompileTimeInfo> {
    CompileTimeInfo::builder(Environment::new(Value::new(ExecutionEnvironment::Browser(
        BrowserEnvironment {
            dom: true,
            web_worker: false,
            service_worker: false,
            browserslist_query: browserslist_query.to_owned(),
        }
        .into(),
    ))))
    .defines(web_defines())
    .free_var_references(web_free_vars())
    .cell()
}

#[turbo_tasks::function]
async fn get_web_runtime_entries(
    project_root: Vc<FileSystemPath>,
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<RuntimeEntries>> {
    let mut runtime_entries = vec![];

    let resolve_options_context =
        get_client_resolve_options_context(project_root, ty, mode, next_config, execution_context);
    let enable_react_refresh =
        assert_can_resolve_react_refresh(project_root, resolve_options_context)
            .await?
            .as_request();

    // It's important that React Refresh come before the regular bootstrap file,
    // because the bootstrap contains JSX which requires Refresh's global
    // functions to be available.
    if let Some(request) = enable_react_refresh {
        runtime_entries
            .push(RuntimeEntry::Request(request, project_root.join("_".to_string())).cell())
    };

    runtime_entries.push(
        RuntimeEntry::Source(Vc::upcast(FileSource::new(next_js_file_path(
            "dev/bootstrap.ts".to_string(),
        ))))
        .cell(),
    );

    Ok(Vc::cell(runtime_entries))
}

// This is different from `get_client_chunking_context` as we need the assets
// to be available under a different root, otherwise we can run into conflicts.
// We don't want to have `get_client_chunking_context` depend on the
// `ClientContextType` as it's only relevant in this case, and would otherwise
// create new dev chunking contexts for no reason.
#[turbo_tasks::function]
fn get_web_client_chunking_context(
    project_path: Vc<FileSystemPath>,
    client_root: Vc<FileSystemPath>,
    environment: Vc<Environment>,
) -> Vc<Box<dyn ChunkingContext>> {
    Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            client_root,
            client_root.join("_chunks".to_string()),
            client_root.join("_media".to_string()),
            environment,
        )
        .hot_module_replacement()
        .build(),
    )
}

#[turbo_tasks::function]
fn get_web_client_asset_context(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    compile_time_info: Vc<CompileTimeInfo>,
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
) -> Vc<Box<dyn AssetContext>> {
    let resolve_options_context =
        get_client_resolve_options_context(project_path, ty, mode, next_config, execution_context);
    let module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        compile_time_info.environment(),
        ty,
        mode,
        next_config,
    );

    let context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Vc::cell(HashMap::new()),
        compile_time_info,
        module_options_context,
        resolve_options_context,
    ));

    context
}

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    project_root: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    entry_requests: Vec<Vc<Request>>,
    client_root: Vc<FileSystemPath>,
    eager_compile: bool,
    browserslist_query: String,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let ty = Value::new(ClientContextType::Other);
    let mode = NextMode::DevServer;
    let compile_time_info = get_compile_time_info(browserslist_query);
    let context = get_web_client_asset_context(
        project_root,
        execution_context,
        compile_time_info,
        ty,
        mode,
        next_config,
    );
    let chunking_context =
        get_web_client_chunking_context(project_root, client_root, compile_time_info.environment());
    let entries = get_web_runtime_entries(project_root, ty, mode, next_config, execution_context);

    let runtime_entries = entries.resolve_entries(context);

    let origin = Vc::upcast::<Box<dyn ResolveOrigin>>(PlainResolveOrigin::new(
        context,
        project_root.join("_".to_string()),
    ));
    let entries = entry_requests
        .into_iter()
        .map(|request| async move {
            let ty = Value::new(ReferenceType::Entry(EntryReferenceSubType::Web));
            Ok(origin
                .resolve_asset(request, origin.resolve_options(ty.clone()), ty)
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
        client_root.join("index.html".to_string()),
        entries,
    ));

    let graph = Vc::upcast(if eager_compile {
        AssetGraphContentSource::new_eager(client_root, entry_asset)
    } else {
        AssetGraphContentSource::new_lazy(client_root, entry_asset)
    });
    Ok(graph)
}
