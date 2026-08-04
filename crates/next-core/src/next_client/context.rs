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
    Ok(defines(&*turbo_tasks::read!(define_env)?).cell())
}

#[turbo_tasks::function]
async fn next_client_free_vars(
    define_env: Vc<OptionEnvMap>,
    report_system_env_inlining: Vc<IssueSeverity>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..free_var_references_with_vercel_system_env_warnings(
            defines(&*turbo_tasks::read!(define_env)?),
            *turbo_tasks::read!(report_system_env_inlining)?
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
    turbo_tasks::read!(
        CompileTimeInfo::builder(turbo_tasks::read!(
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
        )?,)
        .defines(turbo_tasks::read!(
            next_client_defines(define_env).to_resolved()
        )?)
        .free_var_references(turbo_tasks::read!(
            next_client_free_vars(define_env, report_system_env_inlining).to_resolved()
        )?,)
        .hot_module_replacement_enabled(hot_module_replacement_enabled)
        .cell()
    )
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
    let next_client_import_map = turbo_tasks::read!(
        get_next_client_import_map(
            project_path.clone(),
            ty.clone(),
            next_config,
            mode,
            execution_context,
        )
        .to_resolved()
    )?;
    let next_client_fallback_import_map =
        turbo_tasks::read!(get_next_client_fallback_import_map(ty.clone()).to_resolved())?;
    let next_client_resolved_map = turbo_tasks::read!(
        get_next_client_resolved_map(
            project_path.clone(),
            project_path.clone(),
            *turbo_tasks::read!(mode)?
        )
        .to_resolved()
    )?;
    let mut custom_conditions: Vec<_> = turbo_tasks::read!(mode)?
        .custom_resolve_conditions()
        .collect();

    if *turbo_tasks::read!(next_config.enable_cache_components())? {
        custom_conditions.push(rcstr!("next-js"));
    };

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(turbo_tasks::read!(project_path.root().owned())?),
        custom_conditions,
        import_map: Some(next_client_import_map),
        fallback_import_map: Some(next_client_fallback_import_map),
        resolved_map: Some(next_client_resolved_map),
        browser: true,
        module: true,
        before_resolve_plugins: vec![ResolvedVc::upcast(turbo_tasks::read!(
            NextFontLocalResolvePlugin::new(project_path.clone()).to_resolved()
        )?)],
        after_resolve_plugins: vec![ResolvedVc::upcast(turbo_tasks::read!(
            NextSharedRuntimeResolvePlugin::new(project_path.clone()).to_resolved()
        )?)],
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
    let next_mode = turbo_tasks::read!(mode)?;
    let resolve_options_context = get_client_resolve_options_context(
        project_path.clone(),
        ty.clone(),
        mode,
        next_config,
        *execution_context,
    );

    let tsconfig_path = turbo_tasks::read!(next_config.typescript_tsconfig_path())?
        .as_ref()
        .map(|p| project_path.join(p))
        .transpose()?;

    let tsconfig = turbo_tasks::read!(
        get_typescript_transform_options(project_path.clone(), tsconfig_path.clone()).to_resolved()
    )?;
    let decorators_options =
        get_decorators_transform_options(project_path.clone(), tsconfig_path.clone());
    let enable_mdx_rs = *turbo_tasks::read!(next_config.mdx_rs())?;
    let jsx_runtime_options = turbo_tasks::read!(
        get_jsx_transform_options(
            project_path.clone(),
            mode,
            Some(resolve_options_context),
            false,
            next_config,
            tsconfig_path,
        )
        .to_resolved()
    )?;

    let mut loader_conditions = BTreeSet::new();
    loader_conditions.insert(WebpackLoaderBuiltinCondition::Browser);
    loader_conditions.extend(turbo_tasks::read!(mode)?.webpack_loader_conditions());

    // A separate webpack rules will be applied to codes matching foreign_code_context_condition.
    // This allows to import codes from node_modules that requires webpack loaders, which next-dev
    // implicitly does by default.
    let mut foreign_conditions = loader_conditions.clone();
    foreign_conditions.insert(WebpackLoaderBuiltinCondition::Foreign);
    let foreign_enable_webpack_loaders = *turbo_tasks::read!(webpack_loader_options(
        project_path.clone(),
        next_config,
        foreign_conditions
    ))?;

    // Now creates a webpack rules that applies to all code.
    let enable_webpack_loaders = *turbo_tasks::read!(webpack_loader_options(
        project_path.clone(),
        next_config,
        loader_conditions
    ))?;

    let tree_shaking_mode_for_user_code = *turbo_tasks::read!(
        next_config.tree_shaking_mode_for_user_code(next_mode.is_development())
    )?;
    let tree_shaking_mode_for_foreign_code = *turbo_tasks::read!(
        next_config.tree_shaking_mode_for_foreign_code(next_mode.is_development())
    )?;
    let target_browsers = env.runtime_versions();

    let next_client_rules = turbo_tasks::read!(get_next_client_transforms_rules(
        next_config,
        &project_path,
        ty.clone(),
        mode,
        false,
        encryption_key,
        target_browsers,
    ))?;
    let foreign_next_client_rules = turbo_tasks::read!(get_next_client_transforms_rules(
        next_config,
        &project_path,
        ty.clone(),
        mode,
        true,
        encryption_key,
        target_browsers,
    ))?;

    let local_postcss_config =
        *turbo_tasks::read!(next_config.experimental_turbopack_local_postcss_config())?;
    let postcss_config_location = if local_postcss_config == Some(true) {
        PostCssConfigLocation::LocalPathOrProjectPath
    } else {
        PostCssConfigLocation::ProjectPathOrLocalPath
    };
    let postcss_transform_options = PostCssTransformOptions {
        postcss_package: Some(turbo_tasks::read!(
            get_postcss_package_mapping(project_path.clone()).to_resolved()
        )?),
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

    let source_maps = *turbo_tasks::read!(next_config.client_source_maps(mode))?;

    let preset_env_config = (*turbo_tasks::read!(next_config.experimental_swc_env_options())?)
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

    let enable_rust_react_compiler = *turbo_tasks::read!(next_config.rust_react_compiler())?;
    let rust_react_compiler_target = if enable_rust_react_compiler.is_some() {
        match turbo_tasks::read!(detect_react_compiler_target(&project_path))? {
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
            enable_import_as_bytes: *turbo_tasks::read!(next_config.turbopack_import_type_bytes())?,
            enable_import_as_text: *turbo_tasks::read!(next_config.turbopack_import_type_text())?,
            source_maps,
            infer_module_side_effects: *turbo_tasks::read!(
                next_config.turbopack_infer_module_side_effects()
            )?,
            preset_env_config,
            ..Default::default()
        },
        css: CssOptionsContext {
            source_maps,
            module_css_condition: Some(module_styles_rule_condition()),
            lightningcss_features: *turbo_tasks::read!(next_config.lightningcss_feature_flags())?,
            ..Default::default()
        },
        static_url_tag: Some(rcstr!("client")),
        environment: Some(env),
        execution_context: Some(execution_context),
        tree_shaking_mode: tree_shaking_mode_for_user_code,
        enable_postcss_transform,
        side_effect_free_packages: Some(turbo_tasks::read!(
            side_effect_free_packages_glob(next_config.optimize_package_imports()).to_resolved()
        )?),
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
            enable_decorators: Some(turbo_tasks::read!(decorators_options.to_resolved())?),
            enable_rust_react_compiler,
            rust_react_compiler_target,
            ..module_options_context.ecmascript.clone()
        },
        enable_webpack_loaders,
        enable_mdx_rs,
        rules: vec![
            (
                turbo_tasks::read!(foreign_code_context_condition(next_config, project_path))?,
                foreign_codes_options_context.resolved_cell(),
            ),
            (
                turbo_tasks::read!(internal_assets_conditions())?,
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
    } = options;

    let next_mode = turbo_tasks::read!(mode)?;
    let asset_prefix = turbo_tasks::read!(asset_prefix.owned())?;
    let cross_origin_loading = *turbo_tasks::read!(cross_origin)?;
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
        turbo_tasks::read!(environment.to_resolved())?,
        next_mode.runtime_type(),
    )
    .chunk_base_path(Some(asset_prefix.clone()))
    .asset_suffix(AssetSuffix::Inferred.resolved_cell())
    .minify_type(if *turbo_tasks::read!(minify)? {
        MinifyType::Minify {
            mangle: (!*turbo_tasks::read!(no_mangling)?).then_some(MangleType::OptimalSize),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(*turbo_tasks::read!(source_maps)?)
    .asset_base_path(Some(asset_prefix))
    .current_chunk_method(CurrentChunkMethod::DocumentCurrentScript)
    .cross_origin(cross_origin_loading)
    .chunk_load_retry(NEXT_CHUNK_LOAD_RETRY)
    .export_usage(*turbo_tasks::read!(export_usage)?)
    .unused_references(turbo_tasks::read!(unused_references.to_resolved())?)
    .module_id_strategy(turbo_tasks::read!(module_id_strategy.to_resolved())?)
    .debug_ids(*turbo_tasks::read!(debug_ids)?)
    .worker_asset_prefix(turbo_tasks::read!(worker_asset_prefix.owned())?)
    .should_use_absolute_url_references(*turbo_tasks::read!(should_use_absolute_url_references)?)
    .nested_async_availability(*turbo_tasks::read!(nested_async_chunking)?)
    .worker_forwarded_globals(worker_forwarded_globals())
    .hash_salt(hash_salt)
    .default_url_behavior(UrlBehavior {
        suffix: AssetSuffix::Inferred,
        static_suffix: turbo_tasks::read!(css_url_suffix.to_resolved())?,
    });

    if let Some(g) = &*turbo_tasks::read!(chunk_loading_global)? {
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
                turbo_tasks::read!(Vc::<EcmascriptChunkType>::default().to_resolved())?,
                ChunkingConfig {
                    min_chunk_size: 50_000,
                    max_chunk_count_per_group: 40,
                    max_merge_chunk_size: 200_000,
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
            .chunk_content_hashing(ContentHashing::Direct { length: 13 })
            .module_merging(*turbo_tasks::read!(scope_hoisting)?);
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

    let next_mode = turbo_tasks::read!(mode)?;
    let builder = turbo_tasks::read!(
        BrowserChunkingContext::builder(
            root_path,
            output_root.clone(),
            output_root_to_root_path,
            output_root.clone(),
            output_root.join("chunks")?,
            output_root.join("media")?,
            turbo_tasks::read!(environment.to_resolved())?,
            next_mode.runtime_type(),
        )
        .current_chunk_method(CurrentChunkMethod::StringLiteral)
        .asset_suffix(AssetSuffix::None.resolved_cell())
        .minify_type(if *turbo_tasks::read!(minify)? {
            MinifyType::Minify {
                mangle: (!*turbo_tasks::read!(no_mangling)?).then_some(MangleType::OptimalSize),
            }
        } else {
            MinifyType::NoMinify
        })
        .source_maps(*turbo_tasks::read!(source_maps)?)
        .hash_salt(hash_salt)
        .single_chunk()
    )?;

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

    if turbo_tasks::read!(mode)?.is_development() {
        let enable_react_refresh = turbo_tasks::read!(assert_can_resolve_react_refresh(
            project_root.clone(),
            resolve_options_context
        ))?
        .as_request();

        // It's important that React Refresh come before the regular bootstrap file,
        // because the bootstrap contains JSX which requires Refresh's global
        // functions to be available.
        if let Some(request) = enable_react_refresh {
            runtime_entries.push(
                RuntimeEntry::Request(
                    turbo_tasks::read!(request.to_resolved())?,
                    project_root.join("_")?,
                )
                .resolved_cell(),
            )
        };
    }

    if matches!(ty, ClientContextType::App { .. },) {
        runtime_entries.push(
            RuntimeEntry::Request(
                turbo_tasks::read!(
                    Request::parse(Pattern::Constant(rcstr!(
                        "next/dist/client/app-next-turbopack.js"
                    )))
                    .to_resolved()
                )?,
                project_root.join("_")?,
            )
            .resolved_cell(),
        );
    }

    Ok(Vc::cell(runtime_entries))
}
