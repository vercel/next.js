use std::collections::HashMap;

use anyhow::{anyhow, Result};
use turbo_tasks::{TryJoinIterExt, Value};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::{FileSystem, FileSystemPathVc};
use turbopack::{
    condition::ContextCondition,
    ecmascript::EcmascriptModuleAssetVc,
    module_options::{
        JsxTransformOptions, ModuleOptionsContext, ModuleOptionsContextVc,
        StyledComponentsTransformConfigVc,
    },
    resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc},
    transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_cli_utils::runtime_entry::{RuntimeEntriesVc, RuntimeEntry};
use turbopack_core::{
    chunk::{ChunkableAsset, ChunkableAssetVc, ChunkingContext, ChunkingContextVc},
    compile_time_defines,
    compile_time_info::{CompileTimeDefinesVc, CompileTimeInfo, CompileTimeInfoVc},
    context::AssetContextVc,
    environment::{BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment},
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        options::{ImportMap, ImportMapVc, ImportMapping},
        origin::PlainResolveOriginVc,
        parse::RequestVc,
    },
    source_asset::SourceAssetVc,
};
use turbopack_dev::{react_refresh::assert_can_resolve_react_refresh, DevChunkingContextVc};
use turbopack_dev_server::{
    html::DevHtmlAssetVc,
    source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc},
};
use turbopack_ecmascript_plugins::transform::emotion::EmotionTransformConfigVc;
use turbopack_node::execution_context::ExecutionContextVc;

use crate::embed_js::embed_file_path;

async fn foreign_code_context_condition() -> Result<ContextCondition> {
    Ok(ContextCondition::InDirectory("node_modules".to_string()))
}

#[turbo_tasks::function]
pub async fn get_client_import_map(project_path: FileSystemPathVc) -> Result<ImportMapVc> {
    let mut import_map = ImportMap::empty();

    import_map.insert_singleton_alias("@swc/helpers", project_path);
    import_map.insert_singleton_alias("styled-jsx", project_path);
    import_map.insert_singleton_alias("react", project_path);
    import_map.insert_singleton_alias("react-dom", project_path);

    import_map.insert_wildcard_alias(
        "@vercel/turbopack-dev/",
        ImportMapping::PrimaryAlternative(
            "./*".to_string(),
            Some(turbopack_dev::embed_js::embed_fs().root()),
        )
        .cell(),
    );

    Ok(import_map.cell())
}

#[turbo_tasks::function]
async fn get_client_resolve_options_context(
    project_path: FileSystemPathVc,
) -> Result<ResolveOptionsContextVc> {
    let next_client_import_map = get_client_import_map(project_path);
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
        custom_conditions: vec!["development".to_string()],
        import_map: Some(next_client_import_map),
        browser: true,
        module: true,
        ..Default::default()
    };
    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        rules: vec![(
            foreign_code_context_condition().await?,
            module_options_context.clone().cell(),
        )],
        ..module_options_context
    }
    .cell())
}

#[turbo_tasks::function]
async fn get_client_module_options_context(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    env: EnvironmentVc,
) -> Result<ModuleOptionsContextVc> {
    let module_options_context = ModuleOptionsContext {
        preset_env_versions: Some(env),
        execution_context: Some(execution_context),
        ..Default::default()
    };

    let resolve_options_context = get_client_resolve_options_context(project_path);

    let enable_react_refresh =
        assert_can_resolve_react_refresh(project_path, resolve_options_context)
            .await?
            .is_found();

    let module_options_context = ModuleOptionsContext {
        enable_jsx: Some(JsxTransformOptions::default().cell()),
        enable_emotion: Some(EmotionTransformConfigVc::default()),
        enable_react_refresh,
        enable_styled_components: Some(StyledComponentsTransformConfigVc::default()),
        enable_styled_jsx: true,
        enable_postcss_transform: Some(Default::default()),
        enable_typescript_transform: Some(Default::default()),
        rules: vec![(
            foreign_code_context_condition().await?,
            module_options_context.clone().cell(),
        )],
        ..module_options_context
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::function]
fn get_client_asset_context(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    compile_time_info: CompileTimeInfoVc,
) -> AssetContextVc {
    let resolve_options_context = get_client_resolve_options_context(project_path);
    let module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        compile_time_info.environment(),
    );

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        compile_time_info,
        module_options_context,
        resolve_options_context,
    )
    .into();

    context
}

pub fn client_defines() -> CompileTimeDefinesVc {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = "development",
    )
    .cell()
}

#[turbo_tasks::function]
pub fn get_client_compile_time_info(browserslist_query: &str) -> CompileTimeInfoVc {
    CompileTimeInfo::builder(EnvironmentVc::new(
        Value::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browserslist_query: browserslist_query.to_owned(),
            }
            .into(),
        )),
        Value::new(EnvironmentIntention::Client),
    ))
    .defines(client_defines())
    .cell()
}

#[turbo_tasks::function]
pub fn get_client_chunking_context(
    project_path: FileSystemPathVc,
    server_root: FileSystemPathVc,
    environment: EnvironmentVc,
) -> ChunkingContextVc {
    DevChunkingContextVc::builder(
        project_path,
        server_root,
        server_root.join("/_chunks"),
        server_root.join("/_assets"),
        environment,
    )
    .hot_module_replacement()
    .build()
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_path: FileSystemPathVc,
) -> Result<RuntimeEntriesVc> {
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
        runtime_entries.push(RuntimeEntry::Request(request, project_path.join("_")).cell())
    };

    runtime_entries.push(
        RuntimeEntry::Source(SourceAssetVc::new(embed_file_path("entry/bootstrap.ts")).into())
            .cell(),
    );

    Ok(RuntimeEntriesVc::cell(runtime_entries))
}

#[turbo_tasks::function]
pub async fn create_web_entry_source(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    entry_requests: Vec<RequestVc>,
    server_root: FileSystemPathVc,
    _env: ProcessEnvVc,
    eager_compile: bool,
    browserslist_query: &str,
) -> Result<ContentSourceVc> {
    let compile_time_info = get_client_compile_time_info(browserslist_query);
    let context = get_client_asset_context(project_path, execution_context, compile_time_info);
    let chunking_context =
        get_client_chunking_context(project_path, server_root, compile_time_info.environment());
    let entries = get_client_runtime_entries(project_path);

    let runtime_entries = entries.resolve_entries(context);

    let origin = PlainResolveOriginVc::new(context, project_path.join("_")).as_resolve_origin();
    let entries = entry_requests
        .into_iter()
        .map(|request| async move {
            let ty = Value::new(ReferenceType::Entry(EntryReferenceSubType::Web));
            Ok(origin
                .resolve_asset(request, origin.resolve_options(ty.clone()), ty)
                .primary_assets()
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
            if let Some(ecmascript) = EcmascriptModuleAssetVc::resolve_from(module).await? {
                Ok((
                    ecmascript.into(),
                    chunking_context,
                    Some(runtime_entries.with_entry(ecmascript.into())),
                ))
            } else if let Some(chunkable) = ChunkableAssetVc::resolve_from(module).await? {
                // TODO this is missing runtime code, so it's probably broken and we should also
                // add an ecmascript chunk with the runtime code
                Ok((chunkable.into(), chunking_context, None))
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

    let entry_asset = DevHtmlAssetVc::new(server_root.join("index.html"), entries).into();

    let graph = if eager_compile {
        AssetGraphContentSourceVc::new_eager(server_root, entry_asset)
    } else {
        AssetGraphContentSourceVc::new_lazy(server_root, entry_asset)
    }
    .into();
    Ok(graph)
}
