use std::collections::BTreeSet;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{
    css::chunk::CssChunkType,
    module_options::{
        CssOptionsContext, EcmascriptOptionsContext, JsxTransformOptions, ModuleRule,
        TypescriptTransformOptions, module_options_context::ModuleOptionsContext,
    },
    resolve_options_context::ResolveOptionsContext,
};
use turbopack_browser::{
    BrowserChunkingContext, ContentHashing, CurrentChunkMethod,
    react_refresh::assert_can_resolve_react_refresh,
};
use turbopack_core::{
    chunk::{
        ChunkingConfig, ChunkingContext, MangleType, MinifyType, SourceMapsType,
        module_id_strategies::ModuleIdStrategy,
    },
    compile_time_info::{CompileTimeDefines, CompileTimeInfo, FreeVarReference, FreeVarReferences},
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
    free_var_references,
    module_graph::export_usage::OptionExportUsageInfo,
    resolve::{parse::Request, pattern::Pattern},
};
use turbopack_ecmascript::{AnalyzeMode, TypeofWindow, chunk::EcmascriptChunkType};
use turbopack_node::{
    execution_context::ExecutionContext,
    transforms::postcss::{PostCssConfigLocation, PostCssTransformOptions},
};

use super::transforms::get_next_client_transforms_rules;
use crate::{
    mode::NextMode,
    next_build::get_postcss_package_mapping,
    next_client::runtime_entry::{RuntimeEntries, RuntimeEntry},
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::{
        get_next_client_fallback_import_map, get_next_client_import_map,
        get_next_client_resolved_map,
    },
    next_shared::{
        resolve::{
            ModuleFeatureReportResolvePlugin, NextSharedRuntimeResolvePlugin,
            get_invalid_server_only_resolve_plugin,
        },
        transforms::{
            emotion::get_emotion_transform_rule,
            react_remove_properties::get_react_remove_properties_transform_rule,
            relay::get_relay_transform_rule, remove_console::get_remove_console_transform_rule,
            styled_components::get_styled_components_transform_rule,
            styled_jsx::get_styled_jsx_transform_rule,
            swc_ecma_transform_plugins::get_swc_ecma_transform_plugin_rule,
        },
        webpack_rules::{WebpackLoaderBuiltinCondition, webpack_loader_options},
    },
    transform_options::{
        get_decorators_transform_options, get_jsx_transform_options,
        get_typescript_transform_options,
    },
    util::{
        OptionEnvMap, defines, foreign_code_context_condition, internal_assets_conditions,
        module_styles_rule_condition,
    },
};

#[turbo_tasks::function]
async fn next_client_defines(define_env: Vc<OptionEnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*define_env.await?).cell())
}

#[turbo_tasks::function]
async fn next_client_free_vars(define_env: Vc<OptionEnvMap>) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..defines(&*define_env.await?).into_iter(),
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
    .free_var_references(next_client_free_vars(define_env).to_resolved().await?)
    .cell()
    .await
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Hash, TaskInput)]
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
        before_resolve_plugins: vec![
            ResolvedVc::upcast(
                get_invalid_server_only_resolve_plugin(project_path.clone())
                    .to_resolved()
                    .await?,
            ),
            ResolvedVc::upcast(
                ModuleFeatureReportResolvePlugin::new(project_path.clone())
                    .to_resolved()
                    .await?,
            ),
            ResolvedVc::upcast(
                NextFontLocalResolvePlugin::new(project_path.clone())
                    .to_resolved()
                    .await?,
            ),
        ],
        after_resolve_plugins: vec![ResolvedVc::upcast(
            NextSharedRuntimeResolvePlugin::new(project_path.clone())
                .to_resolved()
                .await?,
        )],
        ..Default::default()
    };

    let tsconfig_path = next_config
        .typescript_tsconfig_path()
        .await?
        .as_ref()
        // Fall back to tsconfig only for resolving. This is because we don't want Turbopack to
        // resolve tsconfig.json relative to the file being compiled.
        .or(Some(&RcStr::from("tsconfig.json")))
        .map(|p| project_path.join(p))
        .transpose()?;

    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_mjs_extension: true,
        custom_extensions: next_config.resolve_extension().owned().await?,
        tsconfig_path,
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

    let mut next_client_rules =
        get_next_client_transforms_rules(next_config, ty.clone(), mode, false, encryption_key)
            .await?;
    let foreign_next_client_rules =
        get_next_client_transforms_rules(next_config, ty.clone(), mode, true, encryption_key)
            .await?;
    let additional_rules: Vec<ModuleRule> = vec![
        get_swc_ecma_transform_plugin_rule(next_config, project_path.clone()).await?,
        get_relay_transform_rule(next_config, project_path.clone()).await?,
        get_emotion_transform_rule(next_config).await?,
        get_styled_components_transform_rule(next_config).await?,
        get_styled_jsx_transform_rule(next_config, target_browsers).await?,
        get_react_remove_properties_transform_rule(next_config).await?,
        get_remove_console_transform_rule(next_config).await?,
    ]
    .into_iter()
    .flatten()
    .collect();

    next_client_rules.extend(additional_rules);

    let postcss_transform_options = PostCssTransformOptions {
        postcss_package: Some(
            get_postcss_package_mapping(project_path.clone())
                .to_resolved()
                .await?,
        ),
        config_location: PostCssConfigLocation::ProjectPathOrLocalPath,
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

    let source_maps = if *next_config.client_source_maps(mode).await? {
        SourceMapsType::Full
    } else {
        SourceMapsType::None
    };
    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typeof_window_inlining: Some(TypeofWindow::Object),
            source_maps,
            ..Default::default()
        },
        css: CssOptionsContext {
            source_maps,
            module_css_condition: Some(module_styles_rule_condition()),
            ..Default::default()
        },
        environment: Some(env),
        execution_context: Some(execution_context),
        tree_shaking_mode: tree_shaking_mode_for_user_code,
        enable_postcss_transform,
        side_effect_free_packages: next_config.optimize_package_imports().owned().await?,
        keep_last_successful_parse: next_mode.is_development(),
        analyze_mode: if next_mode.is_development() {
            AnalyzeMode::CodeGeneration
        } else {
            // Technically, this doesn't need to tracing for the client context. But this will
            // result in more cache hits for the analysis for modules which are loaded for both ssr
            // and client
            AnalyzeMode::CodeGenerationAndTracing
        },
        ..Default::default()
    };

    // node_modules context
    let foreign_codes_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typeof_window_inlining: None,
            // Ignore e.g. import(`${url}`) requests in node_modules.
            ignore_dynamic_requests: true,
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

#[derive(Clone, Debug, PartialEq, Eq, Hash, TaskInput, TraceRawVcs, Serialize, Deserialize)]
pub struct ClientChunkingContextOptions {
    pub mode: Vc<NextMode>,
    pub root_path: FileSystemPath,
    pub client_root: FileSystemPath,
    pub client_root_to_root_path: RcStr,
    pub asset_prefix: Vc<RcStr>,
    pub chunk_suffix_path: Vc<Option<RcStr>>,
    pub environment: Vc<Environment>,
    pub module_id_strategy: Vc<Box<dyn ModuleIdStrategy>>,
    pub export_usage: Vc<OptionExportUsageInfo>,
    pub minify: Vc<bool>,
    pub source_maps: Vc<bool>,
    pub no_mangling: Vc<bool>,
    pub scope_hoisting: Vc<bool>,
    pub debug_ids: Vc<bool>,
}

#[turbo_tasks::function]
pub async fn get_client_chunking_context(
    options: ClientChunkingContextOptions,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let ClientChunkingContextOptions {
        mode,
        root_path,
        client_root,
        client_root_to_root_path,
        asset_prefix,
        chunk_suffix_path,
        environment,
        module_id_strategy,
        export_usage,
        minify,
        source_maps,
        no_mangling,
        scope_hoisting,
        debug_ids,
    } = options;

    let next_mode = mode.await?;
    let asset_prefix = asset_prefix.owned().await?;
    let chunk_suffix_path = chunk_suffix_path.to_resolved().await?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        client_root.clone(),
        client_root_to_root_path,
        client_root.clone(),
        client_root.join("static/chunks")?,
        get_client_assets_path(client_root.clone()).owned().await?,
        environment.to_resolved().await?,
        next_mode.runtime_type(),
    )
    .chunk_base_path(Some(asset_prefix.clone()))
    .chunk_suffix_path(chunk_suffix_path)
    .minify_type(if *minify.await? {
        MinifyType::Minify {
            mangle: (!*no_mangling.await?).then_some(MangleType::OptimalSize),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(if *source_maps.await? {
        SourceMapsType::Full
    } else {
        SourceMapsType::None
    })
    .asset_base_path(Some(asset_prefix))
    .current_chunk_method(CurrentChunkMethod::DocumentCurrentScript)
    .export_usage(*export_usage.await?)
    .module_id_strategy(module_id_strategy.to_resolved().await?)
    .debug_ids(*debug_ids.await?);

    if next_mode.is_development() {
        builder = builder
            .hot_module_replacement()
            .use_file_source_map_uris()
            .dynamic_chunk_content_loading(true);
    } else {
        builder = builder
            .chunking_config(
                Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    min_chunk_size: 50_000,
                    max_chunk_count_per_group: 40,
                    max_merge_chunk_size: 200_000,
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
            .use_content_hashing(ContentHashing::Direct { length: 16 })
            .module_merging(*scope_hoisting.await?);
    }

    Ok(Vc::upcast(builder.build()))
}

#[turbo_tasks::function]
pub fn get_client_assets_path(client_root: FileSystemPath) -> Result<Vc<FileSystemPath>> {
    Ok(client_root.join("static/media")?.cell())
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
