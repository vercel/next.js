use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack_browser::BrowserChunkingContext;
use turbopack_core::{
    chunk::{
        AssetSuffix, ChunkingConfig, ChunkingContext, CrossOrigin, MangleType, MinifyType,
        SourceMapsType, UnusedReferences, UrlBehavior, chunk_id_strategy::ModuleIdStrategy,
    },
    compile_time_info::{CompileTimeDefines, CompileTimeInfo, FreeVarReference, FreeVarReferences},
    environment::{EdgeWorkerEnvironment, Environment, ExecutionEnvironment, NodeJsVersion},
    free_var_references,
    issue::IssueSeverity,
    module_graph::{
        binding_usage_info::OptionBindingUsageInfo, style_groups::StyleGroupsAlgorithm,
    },
};
use turbopack_css::chunk::CssChunkType;
use turbopack_ecmascript::chunk::EcmascriptChunkType;
use turbopack_node::execution_context::ExecutionContext;
use turbopack_resolve::resolve_options_context::{ResolveOptionsContext, TsConfigHandling};

use crate::{
    app_structure::CollectedRootParams,
    mode::NextMode,
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::{get_next_edge_and_server_fallback_import_map, get_next_edge_import_map},
    next_server::context::ServerContextType,
    next_shared::resolve::NextSharedRuntimeResolvePlugin,
    util::{
        NextRuntime, OptionEnvMap, defines, foreign_code_context_condition,
        free_var_references_with_vercel_system_env_warnings, worker_forwarded_globals,
    },
};

#[turbo_tasks::function]
async fn next_edge_defines(define_env: Vc<OptionEnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*turbo_tasks::read!(define_env)?).cell())
}

/// Define variables for the edge runtime can be accessibly globally.
/// See [here](https://github.com/vercel/next.js/blob/160bb99b06e9c049f88e25806fd995f07f4cc7e1/packages/next/src/build/webpack-config.ts#L1715-L1718) how webpack configures it.
#[turbo_tasks::function]
async fn next_edge_free_vars(
    project_path: FileSystemPath,
    define_env: Vc<OptionEnvMap>,
    report_system_env_inlining: Vc<IssueSeverity>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..free_var_references_with_vercel_system_env_warnings(
            defines(&*turbo_tasks::read!(define_env)?),
            *turbo_tasks::read!(report_system_env_inlining)?
        ),
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
    report_system_env_inlining: Vc<IssueSeverity>,
) -> Result<Vc<CompileTimeInfo>> {
    turbo_tasks::read!(
        CompileTimeInfo::builder(turbo_tasks::read!(
            Environment::new(ExecutionEnvironment::EdgeWorker(
                EdgeWorkerEnvironment { node_version }.resolved_cell(),
            ))
            .to_resolved()
        )?,)
        .defines(turbo_tasks::read!(
            next_edge_defines(define_env).to_resolved()
        )?)
        .free_var_references(turbo_tasks::read!(
            next_edge_free_vars(project_path, define_env, report_system_env_inlining).to_resolved()
        )?,)
        .cell()
    )
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
    let next_edge_import_map = turbo_tasks::read!(
        get_next_edge_import_map(
            project_path.clone(),
            ty.clone(),
            next_config,
            mode,
            execution_context,
            collected_root_params,
        )
        .to_resolved()
    )?;
    let next_edge_fallback_import_map = turbo_tasks::read!(
        get_next_edge_and_server_fallback_import_map(project_path.clone(), NextRuntime::Edge)
            .to_resolved()
    )?;

    let before_resolve_plugins = if matches!(
        ty,
        ServerContextType::Pages { .. }
            | ServerContextType::AppSSR { .. }
            | ServerContextType::AppRSC { .. }
    ) {
        vec![ResolvedVc::upcast(turbo_tasks::read!(
            NextFontLocalResolvePlugin::new(project_path.clone()).to_resolved()
        )?)]
    } else {
        vec![]
    };

    let after_resolve_plugins = vec![ResolvedVc::upcast(turbo_tasks::read!(
        NextSharedRuntimeResolvePlugin::new(project_path.clone()).to_resolved()
    )?)];

    // https://github.com/vercel/next.js/blob/bf52c254973d99fed9d71507a2e818af80b8ade7/packages/next/src/build/webpack-config.ts#L96-L102
    let mut custom_conditions: Vec<_> = turbo_tasks::read!(mode)?
        .custom_resolve_conditions()
        .collect();
    custom_conditions.extend(NextRuntime::Edge.custom_resolve_conditions());

    if ty.should_use_react_server_condition() {
        custom_conditions.push(rcstr!("react-server"));
    };

    // Edge runtime is disabled for projects with Cache Components enabled except for Middleware
    // but Middleware doesn't have all Next.js APIs so we omit the "next-js" condition for all edge
    // entrypoints

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(turbo_tasks::read!(project_path.root().owned())?),
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

    let tsconfig_path = turbo_tasks::read!(next_config.typescript_tsconfig_path())?;
    let tsconfig_path = project_path.join(
        tsconfig_path
            .as_ref()
            // Fall back to tsconfig only for resolving. This is because we don't want Turbopack to
            // resolve tsconfig.json relative to the file being compiled.
            .unwrap_or(&rcstr!("tsconfig.json")),
    )?;

    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_mjs_extension: true,
        enable_edge_node_externals: true,
        custom_extensions: turbo_tasks::read!(next_config.resolve_extension().owned())?,
        tsconfig_path: TsConfigHandling::Fixed(tsconfig_path),
        rules: vec![(
            turbo_tasks::read!(foreign_code_context_condition(next_config, project_path))?,
            resolve_options_context.clone().resolved_cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

#[turbo_tasks::task_input(contains_unresolved_vcs)]
#[derive(Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub struct EdgeChunkingContextOptions {
    pub mode: Vc<NextMode>,
    pub root_path: FileSystemPath,
    pub node_root: FileSystemPath,
    pub output_root_to_root_path: Vc<RcStr>,
    pub environment: Vc<Environment>,
    pub module_id_strategy: Vc<ModuleIdStrategy>,
    pub export_usage: Vc<OptionBindingUsageInfo>,
    pub unused_references: Vc<UnusedReferences>,
    pub turbo_minify: Vc<bool>,
    pub turbo_source_maps: Vc<SourceMapsType>,
    pub no_mangling: Vc<bool>,
    pub scope_hoisting: Vc<bool>,
    pub nested_async_chunking: Vc<bool>,
    pub client_root: FileSystemPath,
    pub client_static_folder_name: RcStr,
    pub asset_prefix: RcStr,
    pub css_url_suffix: Vc<Option<RcStr>>,
    pub hash_salt: ResolvedVc<RcStr>,
    pub cross_origin: Vc<CrossOrigin>,
    pub style_groups_algorithm: StyleGroupsAlgorithm,
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
        unused_references,
        turbo_minify,
        turbo_source_maps,
        no_mangling,
        scope_hoisting,
        nested_async_chunking,
        client_root,
        client_static_folder_name,
        asset_prefix,
        css_url_suffix,
        hash_salt,
        cross_origin,
        style_groups_algorithm,
    } = options;
    let cross_origin_loading = *turbo_tasks::read!(cross_origin)?;
    let output_root = node_root.join("server/edge")?;
    let next_mode = turbo_tasks::read!(mode)?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        output_root.clone(),
        turbo_tasks::read!(output_root_to_root_path.owned())?,
        client_root.clone(),
        output_root.join("chunks/ssr")?,
        client_root
            .join(&client_static_folder_name)?
            .join("media")?,
        turbo_tasks::read!(environment.to_resolved())?,
        next_mode.runtime_type(),
    )
    .asset_base_path(Some(asset_prefix))
    .default_url_behavior(UrlBehavior {
        suffix: AssetSuffix::FromGlobal(rcstr!("NEXT_CLIENT_ASSET_SUFFIX")),
        static_suffix: turbo_tasks::read!(css_url_suffix.to_resolved())?,
    })
    .minify_type(if *turbo_tasks::read!(turbo_minify)? {
        MinifyType::Minify {
            // React needs deterministic function names to work correctly.
            mangle: (!*turbo_tasks::read!(no_mangling)?).then_some(MangleType::Deterministic),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(*turbo_tasks::read!(turbo_source_maps)?)
    .cross_origin(cross_origin_loading)
    .module_id_strategy(turbo_tasks::read!(module_id_strategy.to_resolved())?)
    .export_usage(*turbo_tasks::read!(export_usage)?)
    .unused_references(turbo_tasks::read!(unused_references.to_resolved())?)
    .hash_salt(hash_salt)
    .nested_async_availability(*turbo_tasks::read!(nested_async_chunking)?)
    .worker_forwarded_globals(worker_forwarded_globals());

    if !next_mode.is_development() {
        builder = builder
            .chunking_config(
                turbo_tasks::read!(Vc::<EcmascriptChunkType>::default().to_resolved())?,
                ChunkingConfig {
                    min_chunk_size: 20_000,
                    ..Default::default()
                },
            )
            .chunking_config(
                turbo_tasks::read!(Vc::<CssChunkType>::default().to_resolved())?,
                ChunkingConfig {
                    max_merge_chunk_size: 100_000,
                    style_groups_algorithm: style_groups_algorithm.clone(),
                    ..Default::default()
                },
            )
            .module_merging(*turbo_tasks::read!(scope_hoisting)?);
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
        unused_references,
        turbo_minify,
        turbo_source_maps,
        no_mangling,
        scope_hoisting,
        nested_async_chunking,
        client_root,
        client_static_folder_name,
        asset_prefix,
        css_url_suffix,
        hash_salt,
        cross_origin,
        style_groups_algorithm,
    } = options;
    let cross_origin = *turbo_tasks::read!(cross_origin)?;
    let css_url_suffix = turbo_tasks::read!(css_url_suffix.to_resolved())?;
    let output_root = node_root.join("server/edge")?;
    let next_mode = turbo_tasks::read!(mode)?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        output_root.clone(),
        turbo_tasks::read!(output_root_to_root_path.owned())?,
        output_root.clone(),
        output_root.join("chunks")?,
        output_root.join("assets")?,
        turbo_tasks::read!(environment.to_resolved())?,
        next_mode.runtime_type(),
    )
    .client_roots_override(rcstr!("client"), client_root.clone())
    .asset_root_path_override(
        rcstr!("client"),
        client_root
            .join(&client_static_folder_name)?
            .join("media")?,
    )
    .asset_base_path_override(rcstr!("client"), asset_prefix)
    .url_behavior_override(
        rcstr!("client"),
        UrlBehavior {
            suffix: AssetSuffix::FromGlobal(rcstr!("NEXT_CLIENT_ASSET_SUFFIX")),
            static_suffix: css_url_suffix,
        },
    )
    .default_url_behavior(UrlBehavior {
        suffix: AssetSuffix::Inferred,
        static_suffix: ResolvedVc::cell(None),
    })
    // Since one can't read files in edge directly, any asset need to be fetched
    // instead. This special blob url is handled by the custom fetch
    // implementation in the edge sandbox. It will respond with the
    // asset from the output directory.
    .asset_base_path(Some(rcstr!("blob:server/edge/")))
    .minify_type(if *turbo_tasks::read!(turbo_minify)? {
        MinifyType::Minify {
            mangle: (!*turbo_tasks::read!(no_mangling)?).then_some(MangleType::OptimalSize),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(*turbo_tasks::read!(turbo_source_maps)?)
    .cross_origin(cross_origin)
    .module_id_strategy(turbo_tasks::read!(module_id_strategy.to_resolved())?)
    .export_usage(*turbo_tasks::read!(export_usage)?)
    .unused_references(turbo_tasks::read!(unused_references.to_resolved())?)
    .hash_salt(hash_salt)
    .nested_async_availability(*turbo_tasks::read!(nested_async_chunking)?)
    .worker_forwarded_globals(worker_forwarded_globals());

    if !next_mode.is_development() {
        builder = builder
            .chunking_config(
                turbo_tasks::read!(Vc::<EcmascriptChunkType>::default().to_resolved())?,
                ChunkingConfig {
                    min_chunk_size: 20_000,
                    ..Default::default()
                },
            )
            .chunking_config(
                turbo_tasks::read!(Vc::<CssChunkType>::default().to_resolved())?,
                ChunkingConfig {
                    max_merge_chunk_size: 100_000,
                    style_groups_algorithm: style_groups_algorithm.clone(),
                    ..Default::default()
                },
            )
            .module_merging(*turbo_tasks::read!(scope_hoisting)?);
    }

    Ok(Vc::upcast(builder.build()))
}
