use std::collections::HashMap;

use anyhow::{anyhow, Result};
use turbo_tasks::{TryJoinIterExt, Value, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack::{
    condition::ContextCondition,
    ecmascript::EcmascriptModuleAsset,
    module_options::{CustomEcmascriptTransformPlugins, JsxTransformOptions, ModuleOptionsContext},
    resolve_options_context::ResolveOptionsContext,
    ModuleAssetContext,
};
use turbopack_cli_utils::runtime_entry::{RuntimeEntries, RuntimeEntry};
use turbopack_core::{
    chunk::{ChunkableModule, ChunkingContext},
    compile_time_defines,
    compile_time_info::{CompileTimeDefines, CompileTimeInfo},
    context::AssetContext,
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
    file_source::FileSource,
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        options::{ImportMap, ImportMapping},
        origin::{PlainResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_dev::{react_refresh::assert_can_resolve_react_refresh, DevChunkingContext};
use turbopack_dev_server::{
    html::DevHtmlAsset,
    source::{asset_graph::AssetGraphContentSource, ContentSource},
};
use turbopack_ecmascript_plugins::transform::{
    emotion::{EmotionTransformConfig, EmotionTransformer},
    styled_components::{StyledComponentsTransformConfig, StyledComponentsTransformer},
    styled_jsx::StyledJsxTransformer,
};
use turbopack_node::execution_context::ExecutionContext;

use crate::embed_js::embed_file_path;

async fn foreign_code_context_condition() -> Result<ContextCondition> {
    Ok(ContextCondition::InDirectory("node_modules".to_string()))
}

#[turbo_tasks::function]
pub async fn get_client_import_map(project_path: Vc<FileSystemPath>) -> Result<Vc<ImportMap>> {
    let mut import_map = ImportMap::empty();

    import_map.insert_singleton_alias("@swc/helpers", project_path);
    import_map.insert_singleton_alias("styled-jsx", project_path);
    import_map.insert_singleton_alias("react", project_path);
    import_map.insert_singleton_alias("react-dom", project_path);

    import_map.insert_wildcard_alias(
        "@vercel/turbopack-ecmascript-runtime/",
        ImportMapping::PrimaryAlternative(
            "./*".to_string(),
            Some(turbopack_ecmascript_runtime::embed_fs().root()),
        )
        .cell(),
    );

    Ok(import_map.cell())
}

#[turbo_tasks::function]
async fn get_client_resolve_options_context(
    project_path: Vc<FileSystemPath>,
) -> Result<Vc<ResolveOptionsContext>> {
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
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    env: Vc<Environment>,
) -> Result<Vc<ModuleOptionsContext>> {
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

    let enable_jsx = Some(
        JsxTransformOptions {
            react_refresh: enable_react_refresh,
            ..Default::default()
        }
        .cell(),
    );

    let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
        CustomEcmascriptTransformPlugins {
            source_transforms: vec![
                Vc::cell(Box::new(
                    EmotionTransformer::new(&EmotionTransformConfig::default())
                        .expect("Should be able to create emotion transformer"),
                ) as _),
                Vc::cell(Box::new(StyledComponentsTransformer::new(
                    &StyledComponentsTransformConfig::default(),
                )) as _),
                Vc::cell(Box::new(StyledJsxTransformer::new()) as _),
            ],
            output_transforms: vec![],
        },
    ));

    let module_options_context = ModuleOptionsContext {
        enable_jsx,
        enable_postcss_transform: Some(Default::default()),
        enable_typescript_transform: Some(Default::default()),
        rules: vec![(
            foreign_code_context_condition().await?,
            module_options_context.clone().cell(),
        )],
        custom_ecma_transform_plugins,
        ..module_options_context
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::function]
fn get_client_asset_context(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    compile_time_info: Vc<CompileTimeInfo>,
) -> Vc<Box<dyn AssetContext>> {
    let resolve_options_context = get_client_resolve_options_context(project_path);
    let module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        compile_time_info.environment(),
    );

    let context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Vc::cell(HashMap::new()),
        compile_time_info,
        module_options_context,
        resolve_options_context,
    ));

    context
}

pub fn client_defines() -> Vc<CompileTimeDefines> {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = "development",
    )
    .cell()
}

#[turbo_tasks::function]
pub fn get_client_compile_time_info(browserslist_query: String) -> Vc<CompileTimeInfo> {
    CompileTimeInfo::builder(Environment::new(Value::new(ExecutionEnvironment::Browser(
        BrowserEnvironment {
            dom: true,
            web_worker: false,
            service_worker: false,
            browserslist_query,
        }
        .into(),
    ))))
    .defines(client_defines())
    .cell()
}

#[turbo_tasks::function]
pub fn get_client_chunking_context(
    project_path: Vc<FileSystemPath>,
    server_root: Vc<FileSystemPath>,
    environment: Vc<Environment>,
) -> Vc<Box<dyn ChunkingContext>> {
    Vc::upcast(
        DevChunkingContext::builder(
            project_path,
            server_root,
            server_root.join("/_chunks".to_string()),
            server_root.join("/_assets".to_string()),
            environment,
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
        runtime_entries
            .push(RuntimeEntry::Request(request, project_path.join("_".to_string())).cell())
    };

    runtime_entries.push(
        RuntimeEntry::Source(Vc::upcast(FileSource::new(embed_file_path(
            "entry/bootstrap.ts".to_string(),
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
    browserslist_query: String,
) -> Result<Vc<Box<dyn ContentSource>>> {
    let compile_time_info = get_client_compile_time_info(browserslist_query);
    let context = get_client_asset_context(project_path, execution_context, compile_time_info);
    let chunking_context =
        get_client_chunking_context(project_path, server_root, compile_time_info.environment());
    let entries = get_client_runtime_entries(project_path);

    let runtime_entries = entries.resolve_entries(context);

    let origin = PlainResolveOrigin::new(context, project_path.join("_".to_string()));
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
        server_root.join("index.html".to_string()),
        entries,
    ));

    let graph = Vc::upcast(if eager_compile {
        AssetGraphContentSource::new_eager(server_root, entry_asset)
    } else {
        AssetGraphContentSource::new_lazy(server_root, entry_asset)
    });
    Ok(graph)
}
