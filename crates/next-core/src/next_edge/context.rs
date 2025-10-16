use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{css::chunk::CssChunkType, resolve_options_context::ResolveOptionsContext};
use turbopack_browser::BrowserChunkingContext;
use turbopack_core::{
    chunk::{
        ChunkingConfig, ChunkingContext, MangleType, MinifyType, SourceMapsType,
        module_id_strategies::ModuleIdStrategy,
    },
    compile_time_info::{CompileTimeDefines, CompileTimeInfo, FreeVarReference, FreeVarReferences},
    environment::{EdgeWorkerEnvironment, Environment, ExecutionEnvironment, NodeJsVersion},
    free_var_references,
    module_graph::export_usage::OptionExportUsageInfo,
};
use turbopack_ecmascript::chunk::EcmascriptChunkType;
use turbopack_node::execution_context::ExecutionContext;

use crate::{
    app_structure::CollectedRootParams,
    mode::NextMode,
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::{get_next_edge_and_server_fallback_import_map, get_next_edge_import_map},
    next_server::context::ServerContextType,
    next_shared::resolve::{
        ModuleFeatureReportResolvePlugin, NextSharedRuntimeResolvePlugin,
        get_invalid_client_only_resolve_plugin, get_invalid_styled_jsx_resolve_plugin,
    },
    util::{NextRuntime, OptionEnvMap, defines, foreign_code_context_condition},
};

#[turbo_tasks::function]
async fn next_edge_defines(define_env: Vc<OptionEnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*define_env.await?).cell())
}

/// Define variables for the edge runtime can be accessibly globally.
/// See [here](https://github.com/vercel/next.js/blob/160bb99b06e9c049f88e25806fd995f07f4cc7e1/packages/next/src/build/webpack-config.ts#L1715-L1718) how webpack configures it.
#[turbo_tasks::function]
async fn next_edge_free_vars(
    project_path: FileSystemPath,
    define_env: Vc<OptionEnvMap>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..defines(&*define_env.await?).into_iter(),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: rcstr!("buffer"),
            lookup_path: Some(project_path),
            export: Some(rcstr!("Buffer")),
        },
    )
    .cell())
}

#[turbo_tasks::function]
pub async fn get_edge_compile_time_info(
    project_path: FileSystemPath,
    define_env: Vc<OptionEnvMap>,
    node_version: ResolvedVc<NodeJsVersion>,
) -> Result<Vc<CompileTimeInfo>> {
    CompileTimeInfo::builder(
        Environment::new(ExecutionEnvironment::EdgeWorker(
            EdgeWorkerEnvironment { node_version }.resolved_cell(),
        ))
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
    project_path: FileSystemPath,
    ty: ServerContextType,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_edge_import_map = get_next_edge_import_map(
        project_path.clone(),
        ty.clone(),
        next_config,
        mode,
        execution_context,
        collected_root_params,
    )
    .to_resolved()
    .await?;
    let next_edge_fallback_import_map =
        get_next_edge_and_server_fallback_import_map(project_path.clone(), NextRuntime::Edge)
            .to_resolved()
            .await?;

    let mut before_resolve_plugins = vec![ResolvedVc::upcast(
        ModuleFeatureReportResolvePlugin::new(project_path.clone())
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
            NextFontLocalResolvePlugin::new(project_path.clone())
                .to_resolved()
                .await?,
        ));
    };

    if matches!(
        ty,
        ServerContextType::AppRSC { .. }
            | ServerContextType::AppRoute { .. }
            | ServerContextType::Middleware { .. }
            | ServerContextType::Instrumentation { .. }
    ) {
        before_resolve_plugins.push(ResolvedVc::upcast(
            get_invalid_client_only_resolve_plugin(project_path.clone())
                .to_resolved()
                .await?,
        ));
        before_resolve_plugins.push(ResolvedVc::upcast(
            get_invalid_styled_jsx_resolve_plugin(project_path.clone())
                .to_resolved()
                .await?,
        ));
    }

    let after_resolve_plugins = vec![ResolvedVc::upcast(
        NextSharedRuntimeResolvePlugin::new(project_path.clone())
            .to_resolved()
            .await?,
    )];

    // https://github.com/vercel/next.js/blob/bf52c254973d99fed9d71507a2e818af80b8ade7/packages/next/src/build/webpack-config.ts#L96-L102
    let mut custom_conditions: Vec<_> = mode.await?.custom_resolve_conditions().collect();
    custom_conditions.extend(NextRuntime::Edge.custom_resolve_conditions());

    if ty.should_use_react_server_condition() {
        custom_conditions.push(rcstr!("react-server"));
    };

    if *next_config.enable_cache_components().await? {
        custom_conditions.push(rcstr!("next-js"));
    };

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().owned().await?),
        enable_edge_node_externals: true,
        custom_conditions,
        import_map: Some(next_edge_import_map),
        fallback_import_map: Some(next_edge_fallback_import_map),
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
        tsconfig_path: next_config
            .typescript_tsconfig_path()
            .await?
            .as_ref()
            // Fall back to tsconfig only for resolving. This is because we don't want Turbopack to
            // resolve tsconfig.json relative to the file being compiled.
            .or(Some(&RcStr::from("tsconfig.json")))
            .map(|p| project_path.join(p))
            .transpose()?,
        rules: vec![(
            foreign_code_context_condition(next_config, project_path).await?,
            resolve_options_context.clone().resolved_cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, TaskInput, TraceRawVcs, Serialize, Deserialize)]
pub struct EdgeChunkingContextOptions {
    pub mode: Vc<NextMode>,
    pub root_path: FileSystemPath,
    pub node_root: FileSystemPath,
    pub output_root_to_root_path: Vc<RcStr>,
    pub environment: Vc<Environment>,
    pub module_id_strategy: Vc<Box<dyn ModuleIdStrategy>>,
    pub export_usage: Vc<OptionExportUsageInfo>,
    pub turbo_minify: Vc<bool>,
    pub turbo_source_maps: Vc<bool>,
    pub no_mangling: Vc<bool>,
    pub scope_hoisting: Vc<bool>,
    pub client_root: FileSystemPath,
    pub asset_prefix: RcStr,
}

/// Like `get_edge_chunking_context` but all assets are emitted as client assets (so `/_next`)
#[turbo_tasks::function]
pub async fn get_edge_chunking_context_with_client_assets(
    options: EdgeChunkingContextOptions,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let EdgeChunkingContextOptions {
        mode,
        root_path,
        node_root,
        output_root_to_root_path,
        environment,
        module_id_strategy,
        export_usage,
        turbo_minify,
        turbo_source_maps,
        no_mangling,
        scope_hoisting,
        client_root,
        asset_prefix,
    } = options;
    let output_root = node_root.join("server/edge")?;
    let next_mode = mode.await?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        output_root.clone(),
        output_root_to_root_path.owned().await?,
        client_root.clone(),
        output_root.join("chunks/ssr")?,
        client_root.join("static/media")?,
        environment.to_resolved().await?,
        next_mode.runtime_type(),
    )
    .asset_base_path(Some(asset_prefix))
    .minify_type(if *turbo_minify.await? {
        MinifyType::Minify {
            // React needs deterministic function names to work correctly.
            mangle: (!*no_mangling.await?).then_some(MangleType::Deterministic),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(if *turbo_source_maps.await? {
        SourceMapsType::Full
    } else {
        SourceMapsType::None
    })
    .module_id_strategy(module_id_strategy.to_resolved().await?)
    .export_usage(*export_usage.await?);

    if !next_mode.is_development() {
        builder = builder
            .chunking_config(
                Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    min_chunk_size: 20_000,
                    ..Default::default()
                },
            )
            .chunking_config(
                Vc::<CssChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    max_merge_chunk_size: 100_000,
                    ..Default::default()
                },
            )
            .module_merging(*scope_hoisting.await?);
    }

    Ok(Vc::upcast(builder.build()))
}

// By default, assets are server assets, but the StructuredImageModuleType ones are on the client
#[turbo_tasks::function]
pub async fn get_edge_chunking_context(
    options: EdgeChunkingContextOptions,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let EdgeChunkingContextOptions {
        mode,
        root_path,
        node_root,
        output_root_to_root_path,
        environment,
        module_id_strategy,
        export_usage,
        turbo_minify,
        turbo_source_maps,
        no_mangling,
        scope_hoisting,
        client_root,
        asset_prefix,
    } = options;
    let output_root = node_root.join("server/edge")?;
    let next_mode = mode.await?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        output_root.clone(),
        output_root_to_root_path.owned().await?,
        output_root.clone(),
        output_root.join("chunks")?,
        output_root.join("assets")?,
        environment.to_resolved().await?,
        next_mode.runtime_type(),
    )
    .client_roots_override(rcstr!("client"), client_root.clone())
    .asset_root_path_override(rcstr!("client"), client_root.join("static/media")?)
    .asset_base_path_override(rcstr!("client"), asset_prefix)
    // Since one can't read files in edge directly, any asset need to be fetched
    // instead. This special blob url is handled by the custom fetch
    // implementation in the edge sandbox. It will respond with the
    // asset from the output directory.
    .asset_base_path(Some(rcstr!("blob:server/edge/")))
    .minify_type(if *turbo_minify.await? {
        MinifyType::Minify {
            mangle: (!*no_mangling.await?).then_some(MangleType::OptimalSize),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(if *turbo_source_maps.await? {
        SourceMapsType::Full
    } else {
        SourceMapsType::None
    })
    .module_id_strategy(module_id_strategy.to_resolved().await?)
    .export_usage(*export_usage.await?);

    if !next_mode.is_development() {
        builder = builder
            .chunking_config(
                Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    min_chunk_size: 20_000,
                    ..Default::default()
                },
            )
            .chunking_config(
                Vc::<CssChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    max_merge_chunk_size: 100_000,
                    ..Default::default()
                },
            )
            .module_merging(*scope_hoisting.await?);
    }

    Ok(Vc::upcast(builder.build()))
}
