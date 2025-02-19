use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, Value, Vc};
use turbo_tasks_env::EnvMap;
use turbo_tasks_fs::FileSystemPath;
use turbopack::resolve_options_context::ResolveOptionsContext;
use turbopack_browser::BrowserChunkingContext;
use turbopack_core::{
    chunk::{
        module_id_strategies::ModuleIdStrategy, ChunkingConfig, ChunkingContext, MinifyType,
        SourceMapsType,
    },
    compile_time_info::{
        CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, DefineableNameSegment,
        FreeVarReference, FreeVarReferences,
    },
    environment::{EdgeWorkerEnvironment, Environment, ExecutionEnvironment},
    free_var_references,
};
use turbopack_node::execution_context::ExecutionContext;

use crate::{
    mode::NextMode,
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::get_next_edge_import_map,
    next_server::context::ServerContextType,
    next_shared::resolve::{
        get_invalid_client_only_resolve_plugin, get_invalid_styled_jsx_resolve_plugin,
        ModuleFeatureReportResolvePlugin, NextSharedRuntimeResolvePlugin,
    },
    util::{foreign_code_context_condition, NextRuntime},
};

fn defines(define_env: &FxIndexMap<RcStr, RcStr>) -> CompileTimeDefines {
    let mut defines = FxIndexMap::default();

    for (k, v) in define_env {
        defines
            .entry(
                k.split('.')
                    .map(|s| DefineableNameSegment::Name(s.into()))
                    .collect::<Vec<_>>(),
            )
            .or_insert_with(|| {
                let val = serde_json::from_str(v);
                match val {
                    Ok(serde_json::Value::Bool(v)) => CompileTimeDefineValue::Bool(v),
                    Ok(serde_json::Value::String(v)) => CompileTimeDefineValue::String(v.into()),
                    _ => CompileTimeDefineValue::JSON(v.clone()),
                }
            });
    }

    CompileTimeDefines(defines)
}

#[turbo_tasks::function]
async fn next_edge_defines(define_env: Vc<EnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*define_env.await?).cell())
}

/// Define variables for the edge runtime can be accessibly globally.
/// See [here](https://github.com/vercel/next.js/blob/160bb99b06e9c049f88e25806fd995f07f4cc7e1/packages/next/src/build/webpack-config.ts#L1715-L1718) how webpack configures it.
#[turbo_tasks::function]
async fn next_edge_free_vars(
    project_path: ResolvedVc<FileSystemPath>,
    define_env: Vc<EnvMap>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..defines(&*define_env.await?).into_iter(),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: "buffer".into(),
            lookup_path: Some(project_path),
            export: Some("Buffer".into()),
        },
    )
    .cell())
}

#[turbo_tasks::function]
pub async fn get_edge_compile_time_info(
    project_path: Vc<FileSystemPath>,
    define_env: Vc<EnvMap>,
) -> Result<Vc<CompileTimeInfo>> {
    CompileTimeInfo::builder(
        Environment::new(Value::new(ExecutionEnvironment::EdgeWorker(
            EdgeWorkerEnvironment {}.resolved_cell(),
        )))
        .to_resolved()
        .await?,
    )
    .defines(next_edge_defines(define_env).to_resolved().await?)
    .free_var_references(
        next_edge_free_vars(project_path, define_env)
            .to_resolved()
            .await?,
    )
    .cell()
    .await
}

#[turbo_tasks::function]
pub async fn get_edge_resolve_options_context(
    project_path: ResolvedVc<FileSystemPath>,
    ty: Value<ServerContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_edge_import_map =
        get_next_edge_import_map(*project_path, ty, next_config, execution_context)
            .to_resolved()
            .await?;

    let ty: ServerContextType = ty.into_value();

    let mut before_resolve_plugins = vec![ResolvedVc::upcast(
        ModuleFeatureReportResolvePlugin::new(*project_path)
            .to_resolved()
            .await?,
    )];
    if matches!(
        ty,
        ServerContextType::Pages { .. }
            | ServerContextType::AppSSR { .. }
            | ServerContextType::AppRSC { .. }
    ) {
        before_resolve_plugins.push(ResolvedVc::upcast(
            NextFontLocalResolvePlugin::new(*project_path)
                .to_resolved()
                .await?,
        ));
    };

    if matches!(
        ty,
        ServerContextType::AppRSC { .. }
            | ServerContextType::AppRoute { .. }
            | ServerContextType::PagesData { .. }
            | ServerContextType::Middleware { .. }
            | ServerContextType::Instrumentation { .. }
    ) {
        before_resolve_plugins.push(ResolvedVc::upcast(
            get_invalid_client_only_resolve_plugin(project_path)
                .to_resolved()
                .await?,
        ));
        before_resolve_plugins.push(ResolvedVc::upcast(
            get_invalid_styled_jsx_resolve_plugin(project_path)
                .to_resolved()
                .await?,
        ));
    }

    let after_resolve_plugins = vec![ResolvedVc::upcast(
        NextSharedRuntimeResolvePlugin::new(*project_path)
            .to_resolved()
            .await?,
    )];

    // https://github.com/vercel/next.js/blob/bf52c254973d99fed9d71507a2e818af80b8ade7/packages/next/src/build/webpack-config.ts#L96-L102
    let mut custom_conditions = vec![mode.await?.condition().into()];
    custom_conditions.extend(
        NextRuntime::Edge
            .conditions()
            .iter()
            .map(ToString::to_string)
            .map(RcStr::from),
    );

    if ty.supports_react_server() {
        custom_conditions.push("react-server".into());
    };

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().to_resolved().await?),
        enable_edge_node_externals: true,
        custom_conditions,
        import_map: Some(next_edge_import_map),
        module: true,
        browser: true,
        after_resolve_plugins,
        before_resolve_plugins,
        ..Default::default()
    };

    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_mjs_extension: true,
        enable_edge_node_externals: true,
        custom_extensions: next_config.resolve_extension().owned().await?,
        rules: vec![(
            foreign_code_context_condition(next_config, project_path).await?,
            resolve_options_context.clone().resolved_cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn get_edge_chunking_context_with_client_assets(
    mode: Vc<NextMode>,
    root_path: ResolvedVc<FileSystemPath>,
    node_root: ResolvedVc<FileSystemPath>,
    output_root_to_root_path: ResolvedVc<RcStr>,
    client_root: ResolvedVc<FileSystemPath>,
    asset_prefix: ResolvedVc<Option<RcStr>>,
    environment: ResolvedVc<Environment>,
    module_id_strategy: ResolvedVc<Box<dyn ModuleIdStrategy>>,
    turbo_minify: Vc<bool>,
    turbo_source_maps: Vc<bool>,
    no_mangling: Vc<bool>,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let output_root = node_root.join("server/edge".into()).to_resolved().await?;
    let next_mode = mode.await?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        output_root,
        output_root_to_root_path,
        client_root,
        output_root.join("chunks/ssr".into()).to_resolved().await?,
        client_root
            .join("static/media".into())
            .to_resolved()
            .await?,
        environment,
        next_mode.runtime_type(),
    )
    .asset_base_path(asset_prefix)
    .minify_type(if *turbo_minify.await? {
        MinifyType::Minify {
            mangle: !*no_mangling.await?,
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(if *turbo_source_maps.await? {
        SourceMapsType::Full
    } else {
        SourceMapsType::None
    })
    .module_id_strategy(module_id_strategy);

    if !next_mode.is_development() {
        builder = builder.ecmascript_chunking_config(ChunkingConfig {
            min_chunk_size: 20_000,
            ..Default::default()
        })
    }

    Ok(Vc::upcast(builder.build()))
}

#[turbo_tasks::function]
pub async fn get_edge_chunking_context(
    mode: Vc<NextMode>,
    root_path: ResolvedVc<FileSystemPath>,
    node_root: ResolvedVc<FileSystemPath>,
    node_root_to_root_path: ResolvedVc<RcStr>,
    environment: ResolvedVc<Environment>,
    module_id_strategy: ResolvedVc<Box<dyn ModuleIdStrategy>>,
    turbo_minify: Vc<bool>,
    turbo_source_maps: Vc<bool>,
    no_mangling: Vc<bool>,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let output_root = node_root.join("server/edge".into()).to_resolved().await?;
    let next_mode = mode.await?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        output_root,
        node_root_to_root_path,
        output_root,
        output_root.join("chunks".into()).to_resolved().await?,
        output_root.join("assets".into()).to_resolved().await?,
        environment,
        next_mode.runtime_type(),
    )
    // Since one can't read files in edge directly, any asset need to be fetched
    // instead. This special blob url is handled by the custom fetch
    // implementation in the edge sandbox. It will respond with the
    // asset from the output directory.
    .asset_base_path(ResolvedVc::cell(Some("blob:server/edge/".into())))
    .minify_type(if *turbo_minify.await? {
        MinifyType::Minify {
            mangle: !*no_mangling.await?,
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(if *turbo_source_maps.await? {
        SourceMapsType::Full
    } else {
        SourceMapsType::None
    })
    .module_id_strategy(module_id_strategy);

    if !next_mode.is_development() {
        builder = builder.ecmascript_chunking_config(ChunkingConfig {
            min_chunk_size: 20_000,
            ..Default::default()
        })
    }

    Ok(Vc::upcast(builder.build()))
}
