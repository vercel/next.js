use std::collections::BTreeSet;

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{
    CssOptionsContext, EcmascriptOptionsContext, JsxTransformOptions, TypescriptTransformOptions,
    module_options_context::ModuleOptionsContext, side_effect_free_packages_glob,
};
use turbopack_browser::{
    BrowserChunkingContext, CurrentChunkMethod, react_refresh::assert_can_resolve_react_refresh,
};
use turbopack_core::{
    chunk::{
        AssetSuffix, ChunkLoadRetry, ChunkingConfig, ChunkingContext, ContentHashing, CrossOrigin,
        MangleType, MinifyType, SourceMapSourceType, SourceMapsType, UnusedReferences, UrlBehavior,
        chunk_id_strategy::ModuleIdStrategy,
    },
    compile_time_info::{CompileTimeDefines, CompileTimeInfo, FreeVarReference, FreeVarReferences},
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
    free_var_references,
    issue::IssueSeverity,
    module_graph::{
        binding_usage_info::OptionBindingUsageInfo, style_groups::StyleGroupsAlgorithm,
    },
    resolve::{parse::Request, pattern::Pattern},
};
use turbopack_css::chunk::CssChunkType;
use turbopack_ecmascript::{
    AnalyzeMode, TypeofWindow,
    chunk::EcmascriptChunkType,
    references::esm::UrlRewriteBehavior,
    transform::{PresetEnvConfig, ReactCompilerTarget},
};
use turbopack_node::{
    execution_context::ExecutionContext,
    transforms::postcss::{PostCssConfigLocation, PostCssTransformOptions},
};
use turbopack_resolve::resolve_options_context::{ResolveOptionsContext, TsConfigHandling};

use crate::{
    mode::NextMode,
    next_build::get_postcss_package_mapping,
    next_client::{
        runtime_entry::{RuntimeEntries, RuntimeEntry},
        transforms::get_next_client_transforms_rules,
    },
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::{
        get_next_client_fallback_import_map, get_next_client_import_map,
        get_next_client_resolved_map,
    },
    next_shared::{
        resolve::NextSharedRuntimeResolvePlugin,
        webpack_rules::{
            WebpackLoaderBuiltinCondition, babel::detect_react_compiler_target,
            webpack_loader_options,
        },
    },
    transform_options::{
        get_decorators_transform_options, get_jsx_transform_options,
        get_typescript_transform_options,
    },
    util::{
        OptionEnvMap, defines, foreign_code_context_condition,
        free_var_references_with_vercel_system_env_warnings, internal_assets_conditions,
        module_styles_rule_condition, worker_forwarded_globals,
    },
};

#[turbo_tasks::function]
async fn next_client_defines(define_env: Vc<OptionEnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*define_env.await?).cell())
}

#[turbo_tasks::function]
async fn next_client_free_vars(
    define_env: Vc<OptionEnvMap>,
    report_system_env_inlining: Vc<IssueSeverity>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..free_var_references_with_vercel_system_env_warnings(
            defines(&*define_env.await?),
            *report_system_env_inlining.await?
        ),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: rcstr!("node:buffer"),
            lookup_path: None,
            export: Some(rcstr!("Buffer")),
        },
        process = FreeVarReference::EcmaScriptModule {
            request: rcstr!("node:process"),
            lookup_path: None,
            export: Some(rcstr!("default")),
        }
    )
    .cell())
}

#[turbo_tasks::function]
pub async fn get_client_compile_time_info(
    browserslist_query: RcStr,
    define_env: Vc<OptionEnvMap>,
    report_system_env_inlining: Vc<IssueSeverity>,
    hot_module_replacement_enabled: bool,
) -> Result<Vc<CompileTimeInfo>> {
    CompileTimeInfo::builder(
        Environment::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browserslist_query: browserslist_query.to_owned(),
            }
            .resolved_cell(),
        ))
        .to_resolved()
        .await?,
    )
    .defines(next_client_defines(define_env).to_resolved().await?)
    .free_var_references(
        next_client_free_vars(define_env, report_system_env_inlining)
            .to_resolved()
            .await?,
    )
    .hot_module_replacement_enabled(hot_module_replacement_enabled)
    .cell()
    .await
}

#[turbo_tasks::value(shared, task_input)]
#[derive(Debug, Clone, Hash)]
pub enum ClientContextType {
    Pages { pages_dir: FileSystemPath },
    App { app_dir: FileSystemPath },
    Fallback,
    Other,
}

#[turbo_tasks::function]
pub async fn get_client_resolve_options_context(
    project_path: FileSystemPath,
    ty: ClientContextType,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_client_import_map = get_next_client_import_map(
        project_path.clone(),
        ty.clone(),
        next_config,
        mode,
        execution_context,
    )
    .to_resolved()
    .await?;
    let next_client_fallback_import_map = get_next_client_fallback_import_map(ty.clone())
        .to_resolved()
        .await?;
    let next_client_resolved_map =
        get_next_client_resolved_map(project_path.clone(), project_path.clone(), *mode.await?)
            .await?
            .to_resolved()
            .await?;
    let mut custom_conditions: Vec<_> = mode.await?.custom_resolve_conditions().collect();

    if *next_config.enable_cache_components().await? {
        custom_conditions.push(rcstr!("next-js"));
    };

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().owned().await?),
        custom_conditions,
        import_map: Some(next_client_import_map),
        fallback_import_map: Some(next_client_fallback_import_map),
        resolved_map: Some(next_client_resolved_map),
        browser: true,
        module: true,
        before_resolve_plugins: vec![ResolvedVc::upcast(
            NextFontLocalResolvePlugin::new(project_path.clone())
                .to_resolved()
                .await?,
        )],
        after_resolve_plugins: vec![ResolvedVc::upcast(
            NextSharedRuntimeResolvePlugin::new(project_path.clone())
                .to_resolved()
                .await?,
        )],
        ..Default::default()
    };

    let tsconfig_path = next_config.typescript_tsconfig_path().await?;
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
        custom_extensions: next_config.resolve_extension().owned().await?,
        tsconfig_path: TsConfigHandling::Fixed(tsconfig_path),
        rules: vec![(
            foreign_code_context_condition(next_config, project_path).await?,
            resolve_options_context.clone().resolved_cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn get_client_module_options_context(
    project_path: FileSystemPath,
    execution_context: ResolvedVc<ExecutionContext>,
    env: ResolvedVc<Environment>,
    ty: ClientContextType,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    encryption_key: ResolvedVc<RcStr>,
) -> Result<Vc<ModuleOptionsContext>> {
    let next_mode = mode.await?;
    let resolve_options_context = get_client_resolve_options_context(
        project_path.clone(),
        ty.clone(),
        mode,
        next_config,
        *execution_context,
    );

    let tsconfig_path = next_config
        .typescript_tsconfig_path()
        .await?
        .as_ref()
        .map(|p| project_path.join(p))
        .transpose()?;

    let tsconfig = get_typescript_transform_options(project_path.clone(), tsconfig_path.clone())
        .to_resolved()
        .await?;
    let decorators_options =
        get_decorators_transform_options(project_path.clone(), tsconfig_path.clone());
    let enable_mdx_rs = *next_config.mdx_rs().await?;
    let jsx_runtime_options = get_jsx_transform_options(
        project_path.clone(),
        mode,
        Some(resolve_options_context),
        false,
        next_config,
        tsconfig_path,
    )
    .to_resolved()
    .await?;

    let mut loader_conditions = BTreeSet::new();
    loader_conditions.insert(WebpackLoaderBuiltinCondition::Browser);
    loader_conditions.extend(mode.await?.webpack_loader_conditions());

    // A separate webpack rules will be applied to codes matching foreign_code_context_condition.
    // This allows to import codes from node_modules that requires webpack loaders, which next-dev
    // implicitly does by default.
    let mut foreign_conditions = loader_conditions.clone();
    foreign_conditions.insert(WebpackLoaderBuiltinCondition::Foreign);
    let foreign_enable_webpack_loaders =
        *webpack_loader_options(project_path.clone(), next_config, foreign_conditions).await?;

    // Now creates a webpack rules that applies to all code.
    let enable_webpack_loaders =
        *webpack_loader_options(project_path.clone(), next_config, loader_conditions).await?;

    let tree_shaking_mode_for_user_code = *next_config
        .tree_shaking_mode_for_user_code(next_mode.is_development())
        .await?;
    let tree_shaking_mode_for_foreign_code = *next_config
        .tree_shaking_mode_for_foreign_code(next_mode.is_development())
        .await?;
    let target_browsers = env.runtime_versions();

    let next_client_rules = get_next_client_transforms_rules(
        next_config,
        &project_path,
        ty.clone(),
        mode,
        false,
        encryption_key,
        target_browsers,
    )
    .await?;
    let foreign_next_client_rules = get_next_client_transforms_rules(
        next_config,
        &project_path,
        ty.clone(),
        mode,
        true,
        encryption_key,
        target_browsers,
    )
    .await?;

    let local_postcss_config = *next_config
        .experimental_turbopack_local_postcss_config()
        .await?;
    let postcss_config_location = if local_postcss_config == Some(true) {
        PostCssConfigLocation::LocalPathOrProjectPath
    } else {
        PostCssConfigLocation::ProjectPathOrLocalPath
    };
    let postcss_transform_options = PostCssTransformOptions {
        postcss_package: Some(
            get_postcss_package_mapping(project_path.clone())
                .to_resolved()
                .await?,
        ),
        config_location: postcss_config_location,
        ..Default::default()
    };
    let postcss_foreign_transform_options = PostCssTransformOptions {
        // For node_modules we don't want to resolve postcss config relative to the file being
        // compiled, instead it only uses the project root postcss config.
        config_location: PostCssConfigLocation::ProjectPath,
        ..postcss_transform_options.clone()
    };
    let enable_postcss_transform = Some(postcss_transform_options.resolved_cell());
    let enable_foreign_postcss_transform = Some(postcss_foreign_transform_options.resolved_cell());

    let source_maps = *next_config.client_source_maps(mode).await?;

    let preset_env_config = (*next_config.experimental_swc_env_options().await?)
        .as_ref()
        .map(|opts| {
            PresetEnvConfig {
                mode: opts.mode.clone(),
                core_js: opts.core_js.clone(),
                skip: opts.skip.clone(),
                include: opts.include.clone(),
                exclude: opts.exclude.clone(),
                shipped_proposals: opts.shipped_proposals,
                force_all_transforms: opts.force_all_transforms,
                debug: opts.debug,
                loose: opts.loose,
            }
            .resolved_cell()
        });

    let enable_rust_react_compiler = *next_config.rust_react_compiler().await?;
    let rust_react_compiler_target = if enable_rust_react_compiler.is_some() {
        match detect_react_compiler_target(&project_path).await? {
            Some(ReactCompilerTarget::React18) => ReactCompilerTarget::React18,
            _ => ReactCompilerTarget::React19,
        }
    } else {
        ReactCompilerTarget::React19
    };

    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Relative),
            enable_typeof_window_inlining: Some(TypeofWindow::Object),
            enable_import_as_bytes: *next_config.turbopack_import_type_bytes().await?,
            enable_import_as_text: *next_config.turbopack_import_type_text().await?,
            source_maps,
            infer_module_side_effects: *next_config.turbopack_infer_module_side_effects().await?,
            preset_env_config,
            ..Default::default()
        },
        css: CssOptionsContext {
            source_maps,
            module_css_condition: Some(module_styles_rule_condition()),
            lightningcss_features: *next_config.lightningcss_feature_flags().await?,
            ..Default::default()
        },
        static_url_tag: Some(rcstr!("client")),
        environment: Some(env),
        execution_context: Some(execution_context),
        tree_shaking_mode: tree_shaking_mode_for_user_code,
        enable_postcss_transform,
        side_effect_free_packages: Some(
            side_effect_free_packages_glob(next_config.optimize_package_imports())
                .to_resolved()
                .await?,
        ),
        keep_last_successful_parse: next_mode.is_development(),
        analyze_mode: AnalyzeMode::CodeGeneration,
        ..Default::default()
    };

    // node_modules context
    let foreign_codes_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typeof_window_inlining: None,
            // Ignore e.g. import(`${url}`) requests in node_modules.
            ignore_dynamic_requests: true,
            // Don't inject core-js polyfills into node_modules — only user code
            // should be processed by preset_env's usage/entry mode.
            preset_env_config: None,
            ..module_options_context.ecmascript
        },
        enable_webpack_loaders: foreign_enable_webpack_loaders,
        enable_postcss_transform: enable_foreign_postcss_transform,
        module_rules: foreign_next_client_rules,
        tree_shaking_mode: tree_shaking_mode_for_foreign_code,
        // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
        ..module_options_context.clone()
    };

    let internal_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typescript_transform: Some(
                TypescriptTransformOptions::default().resolved_cell(),
            ),
            enable_jsx: Some(JsxTransformOptions::default().resolved_cell()),
            // Don't inject core-js polyfills into framework internals.
            preset_env_config: None,
            ..module_options_context.ecmascript.clone()
        },
        enable_postcss_transform: None,
        ..module_options_context.clone()
    };

    let module_options_context = ModuleOptionsContext {
        // We don't need to resolve React Refresh for each module. Instead,
        // we try resolve it once at the root and pass down a context to all
        // the modules.
        ecmascript: EcmascriptOptionsContext {
            enable_jsx: Some(jsx_runtime_options),
            enable_typescript_transform: Some(tsconfig),
            enable_decorators: Some(decorators_options.to_resolved().await?),
            enable_rust_react_compiler,
            rust_react_compiler_target,
            ..module_options_context.ecmascript.clone()
        },
        enable_webpack_loaders,
        enable_mdx_rs,
        rules: vec![
            (
                foreign_code_context_condition(next_config, project_path).await?,
                foreign_codes_options_context.resolved_cell(),
            ),
            (
                internal_assets_conditions().await?,
                internal_context.resolved_cell(),
            ),
        ],
        module_rules: next_client_rules,
        ..module_options_context
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::task_input(contains_unresolved_vcs)]
#[derive(Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub struct ClientChunkingContextOptions {
    pub mode: Vc<NextMode>,
    pub root_path: FileSystemPath,
    pub client_root: FileSystemPath,
    pub client_root_to_root_path: RcStr,
    pub client_static_folder_name: RcStr,
    pub asset_prefix: Vc<RcStr>,
    pub environment: Vc<Environment>,
    pub module_id_strategy: Vc<ModuleIdStrategy>,
    pub export_usage: Vc<OptionBindingUsageInfo>,
    pub unused_references: Vc<UnusedReferences>,
    pub minify: Vc<bool>,
    pub source_maps: Vc<SourceMapsType>,
    pub no_mangling: Vc<bool>,
    pub scope_hoisting: Vc<bool>,
    pub nested_async_chunking: Vc<bool>,
    pub debug_ids: Vc<bool>,
    pub worker_asset_prefix: Vc<Option<RcStr>>,
    pub should_use_absolute_url_references: Vc<bool>,
    pub css_url_suffix: Vc<Option<RcStr>>,
    pub hash_salt: ResolvedVc<RcStr>,
    pub cross_origin: Vc<CrossOrigin>,
    pub chunk_loading_global: Vc<Option<RcStr>>,
    pub style_groups_algorithm: StyleGroupsAlgorithm,
    pub chunking_first_page_load_priority: Option<u32>,
    pub chunking_priority_boost_percent: Option<u32>,
    pub chunking_request_cost: Option<u64>,
}

/// Next.js' chunk-load retry policy for the Turbopack browser runtime.
/// Webpack does not currently support chunk-load retrying.
const NEXT_CHUNK_LOAD_RETRY: ChunkLoadRetry = ChunkLoadRetry {
    max_retry_attempts: 1,
    base_delay_ms: 200,
    max_jitter_ms: 400,
};

#[turbo_tasks::function]
pub async fn get_client_chunking_context(
    options: ClientChunkingContextOptions,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let ClientChunkingContextOptions {
        mode,
        root_path,
        client_root,
        client_root_to_root_path,
        client_static_folder_name,
        asset_prefix,
        environment,
        module_id_strategy,
        export_usage,
        unused_references,
        minify,
        source_maps,
        no_mangling,
        scope_hoisting,
        nested_async_chunking,
        debug_ids,
        worker_asset_prefix,
        should_use_absolute_url_references,
        css_url_suffix,
        hash_salt,
        cross_origin,
        chunk_loading_global,
        style_groups_algorithm,
        chunking_first_page_load_priority,
        chunking_priority_boost_percent,
        chunking_request_cost,
    } = options;

    let next_mode = mode.await?;
    let asset_prefix = asset_prefix.owned().await?;
    let cross_origin_loading = *cross_origin.await?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        client_root.clone(),
        client_root_to_root_path,
        client_root.clone(),
        client_root
            .join(&client_static_folder_name)?
            .join("chunks")?,
        client_root
            .join(&client_static_folder_name)?
            .join("media")?,
        environment.to_resolved().await?,
        next_mode.runtime_type(),
    )
    .chunk_base_path(Some(asset_prefix.clone()))
    .asset_suffix(AssetSuffix::Inferred.resolved_cell())
    .minify_type(if *minify.await? {
        MinifyType::Minify {
            mangle: (!*no_mangling.await?).then_some(MangleType::OptimalSize),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(*source_maps.await?)
    .asset_base_path(Some(asset_prefix))
    .current_chunk_method(CurrentChunkMethod::DocumentCurrentScript)
    .cross_origin(cross_origin_loading)
    .chunk_load_retry(NEXT_CHUNK_LOAD_RETRY)
    .export_usage(*export_usage.await?)
    .unused_references(unused_references.to_resolved().await?)
    .module_id_strategy(module_id_strategy.to_resolved().await?)
    .debug_ids(*debug_ids.await?)
    .worker_asset_prefix(worker_asset_prefix.owned().await?)
    .should_use_absolute_url_references(*should_use_absolute_url_references.await?)
    .nested_async_availability(*nested_async_chunking.await?)
    .worker_forwarded_globals(worker_forwarded_globals())
    .hash_salt(hash_salt)
    .default_url_behavior(UrlBehavior {
        suffix: AssetSuffix::Inferred,
        static_suffix: css_url_suffix.to_resolved().await?,
    });

    if let Some(g) = &*chunk_loading_global.await? {
        builder = builder.chunk_loading_global(g.clone());
    }

    if next_mode.is_development() {
        builder = builder
            .hot_module_replacement()
            .source_map_source_type(SourceMapSourceType::AbsoluteFileUri)
            .dynamic_chunk_content_loading(true);
    } else {
        builder = builder
            .chunking_config(
                Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    min_chunk_size: 50_000,
                    max_chunk_count_per_group: 40,
                    max_merge_chunk_size: 200_000,
                    first_page_load_priority: chunking_first_page_load_priority,
                    priority_boost_percent: chunking_priority_boost_percent,
                    request_cost: chunking_request_cost,
                    ..Default::default()
                },
            )
            .chunking_config(
                Vc::<CssChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    max_merge_chunk_size: 100_000,
                    style_groups_algorithm: style_groups_algorithm.clone(),
                    ..Default::default()
                },
            )
            .chunk_content_hashing(ContentHashing::Direct { length: 13 })
            .module_merging(*scope_hoisting.await?);
    }

    Ok(Vc::upcast(builder.build()))
}

#[turbo_tasks::task_input(contains_unresolved_vcs)]
#[derive(Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub struct ServiceWorkerChunkingContextOptions {
    pub mode: Vc<NextMode>,
    pub root_path: FileSystemPath,
    pub output_root: FileSystemPath,
    pub output_root_to_root_path: RcStr,
    pub environment: Vc<Environment>,
    pub minify: Vc<bool>,
    pub source_maps: Vc<SourceMapsType>,
    pub no_mangling: Vc<bool>,
    pub hash_salt: ResolvedVc<RcStr>,
}

#[turbo_tasks::function]
pub async fn get_service_worker_chunking_context(
    options: ServiceWorkerChunkingContextOptions,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let ServiceWorkerChunkingContextOptions {
        mode,
        root_path,
        output_root,
        output_root_to_root_path,
        environment,
        minify,
        source_maps,
        no_mangling,
        hash_salt,
    } = options;

    let next_mode = mode.await?;
    let builder = BrowserChunkingContext::builder(
        root_path,
        output_root.clone(),
        output_root_to_root_path,
        output_root.clone(),
        output_root.join("chunks")?,
        output_root.join("media")?,
        environment.to_resolved().await?,
        next_mode.runtime_type(),
    )
    .current_chunk_method(CurrentChunkMethod::StringLiteral)
    .asset_suffix(AssetSuffix::None.resolved_cell())
    .minify_type(if *minify.await? {
        MinifyType::Minify {
            mangle: (!*no_mangling.await?).then_some(MangleType::OptimalSize),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(*source_maps.await?)
    .hash_salt(hash_salt)
    .single_chunk()
    .await?;

    Ok(Vc::upcast(builder.build()))
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_root: FileSystemPath,
    ty: ClientContextType,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<RuntimeEntries>> {
    let mut runtime_entries = vec![];
    let resolve_options_context = get_client_resolve_options_context(
        project_root.clone(),
        ty.clone(),
        mode,
        next_config,
        execution_context,
    );

    if mode.await?.is_development() {
        let enable_react_refresh =
            assert_can_resolve_react_refresh(project_root.clone(), resolve_options_context)
                .await?
                .as_request();

        // It's important that React Refresh come before the regular bootstrap file,
        // because the bootstrap contains JSX which requires Refresh's global
        // functions to be available.
        if let Some(request) = enable_react_refresh {
            runtime_entries.push(
                RuntimeEntry::Request(request.to_resolved().await?, project_root.join("_")?)
                    .resolved_cell(),
            )
        };
    }

    if matches!(ty, ClientContextType::App { .. },) {
        runtime_entries.push(
            RuntimeEntry::Request(
                Request::parse(Pattern::Constant(rcstr!(
                    "next/dist/client/app-next-turbopack.js"
                )))
                .to_resolved()
                .await?,
                project_root.join("_")?,
            )
            .resolved_cell(),
        );
    }

    Ok(Vc::cell(runtime_entries))
}
