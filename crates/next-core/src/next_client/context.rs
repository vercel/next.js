use std::iter::once;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, Value, Vc};
use turbo_tasks_env::EnvMap;
use turbo_tasks_fs::FileSystemPath;
use turbopack::{
    module_options::{
        module_options_context::ModuleOptionsContext, CssOptionsContext, EcmascriptOptionsContext,
        JsxTransformOptions, ModuleRule, TypeofWindow, TypescriptTransformOptions,
    },
    resolve_options_context::ResolveOptionsContext,
};
use turbopack_browser::{react_refresh::assert_can_resolve_react_refresh, BrowserChunkingContext};
use turbopack_core::{
    chunk::{
        module_id_strategies::ModuleIdStrategy, ChunkingConfig, ChunkingContext, MinifyType,
        SourceMapsType,
    },
    compile_time_info::{
        CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, DefineableNameSegment,
        FreeVarReference, FreeVarReferences,
    },
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
    free_var_references,
    resolve::{parse::Request, pattern::Pattern},
};
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
            get_invalid_server_only_resolve_plugin, ModuleFeatureReportResolvePlugin,
            NextSharedRuntimeResolvePlugin,
        },
        transforms::{
            emotion::get_emotion_transform_rule,
            react_remove_properties::get_react_remove_properties_transform_rule,
            relay::get_relay_transform_rule, remove_console::get_remove_console_transform_rule,
            styled_components::get_styled_components_transform_rule,
            styled_jsx::get_styled_jsx_transform_rule,
            swc_ecma_transform_plugins::get_swc_ecma_transform_plugin_rule,
        },
        webpack_rules::webpack_loader_options,
    },
    transform_options::{
        get_decorators_transform_options, get_jsx_transform_options,
        get_typescript_transform_options,
    },
    util::{foreign_code_context_condition, internal_assets_conditions},
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
async fn next_client_defines(define_env: Vc<EnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*define_env.await?).cell())
}

#[turbo_tasks::function]
async fn next_client_free_vars(define_env: Vc<EnvMap>) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..defines(&*define_env.await?).into_iter(),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: "node:buffer".into(),
            lookup_path: None,
            export: Some("Buffer".into()),
        },
        process = FreeVarReference::EcmaScriptModule {
            request: "node:process".into(),
            lookup_path: None,
            export: Some("default".into()),
        }
    )
    .cell())
}

#[turbo_tasks::function]
pub async fn get_client_compile_time_info(
    browserslist_query: RcStr,
    define_env: Vc<EnvMap>,
) -> Result<Vc<CompileTimeInfo>> {
    CompileTimeInfo::builder(
        Environment::new(Value::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browserslist_query: browserslist_query.to_owned(),
            }
            .resolved_cell(),
        )))
        .to_resolved()
        .await?,
    )
    .defines(next_client_defines(define_env).to_resolved().await?)
    .free_var_references(next_client_free_vars(define_env).to_resolved().await?)
    .cell()
    .await
}

#[turbo_tasks::value(shared, serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash)]
pub enum ClientContextType {
    Pages {
        pages_dir: ResolvedVc<FileSystemPath>,
    },
    App {
        app_dir: ResolvedVc<FileSystemPath>,
    },
    Fallback,
    Other,
}

#[turbo_tasks::function]
pub async fn get_client_resolve_options_context(
    project_path: ResolvedVc<FileSystemPath>,
    ty: Value<ClientContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_client_import_map =
        get_next_client_import_map(*project_path, ty, next_config, execution_context)
            .to_resolved()
            .await?;
    let next_client_fallback_import_map = get_next_client_fallback_import_map(ty)
        .to_resolved()
        .await?;
    let next_client_resolved_map =
        get_next_client_resolved_map(*project_path, project_path, *mode.await?)
            .to_resolved()
            .await?;
    let custom_conditions = vec![mode.await?.condition().into()];
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().to_resolved().await?),
        custom_conditions,
        import_map: Some(next_client_import_map),
        fallback_import_map: Some(next_client_fallback_import_map),
        resolved_map: Some(next_client_resolved_map),
        browser: true,
        module: true,
        before_resolve_plugins: vec![
            ResolvedVc::upcast(
                get_invalid_server_only_resolve_plugin(project_path)
                    .to_resolved()
                    .await?,
            ),
            ResolvedVc::upcast(
                ModuleFeatureReportResolvePlugin::new(*project_path)
                    .to_resolved()
                    .await?,
            ),
            ResolvedVc::upcast(
                NextFontLocalResolvePlugin::new(*project_path)
                    .to_resolved()
                    .await?,
            ),
        ],
        after_resolve_plugins: vec![ResolvedVc::upcast(
            NextSharedRuntimeResolvePlugin::new(*project_path)
                .to_resolved()
                .await?,
        )],
        ..Default::default()
    };
    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_mjs_extension: true,
        custom_extensions: next_config.resolve_extension().owned().await?,
        rules: vec![(
            foreign_code_context_condition(next_config, project_path).await?,
            module_options_context.clone().resolved_cell(),
        )],
        ..module_options_context
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn get_client_module_options_context(
    project_path: ResolvedVc<FileSystemPath>,
    execution_context: ResolvedVc<ExecutionContext>,
    env: ResolvedVc<Environment>,
    ty: Value<ClientContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    encryption_key: ResolvedVc<RcStr>,
    no_mangling: Vc<bool>,
) -> Result<Vc<ModuleOptionsContext>> {
    let next_mode = mode.await?;
    let resolve_options_context = get_client_resolve_options_context(
        *project_path,
        ty,
        mode,
        next_config,
        *execution_context,
    );

    let tsconfig = get_typescript_transform_options(*project_path)
        .to_resolved()
        .await?;
    let decorators_options = get_decorators_transform_options(*project_path);
    let enable_mdx_rs = *next_config.mdx_rs().await?;
    let jsx_runtime_options = get_jsx_transform_options(
        *project_path,
        mode,
        Some(resolve_options_context),
        false,
        next_config,
    )
    .to_resolved()
    .await?;

    // A separate webpack rules will be applied to codes matching
    // foreign_code_context_condition. This allows to import codes from
    // node_modules that requires webpack loaders, which next-dev implicitly
    // does by default.
    let conditions = vec!["browser".into(), mode.await?.condition().into()];
    let foreign_enable_webpack_loaders = webpack_loader_options(
        project_path,
        next_config,
        true,
        conditions
            .iter()
            .cloned()
            .chain(once("foreign".into()))
            .collect(),
    )
    .await?;

    // Now creates a webpack rules that applies to all codes.
    let enable_webpack_loaders =
        webpack_loader_options(project_path, next_config, false, conditions).await?;

    let tree_shaking_mode_for_user_code = *next_config
        .tree_shaking_mode_for_user_code(next_mode.is_development())
        .await?;
    let tree_shaking_mode_for_foreign_code = *next_config
        .tree_shaking_mode_for_foreign_code(next_mode.is_development())
        .await?;
    let target_browsers = env.runtime_versions();

    let mut next_client_rules =
        get_next_client_transforms_rules(next_config, ty.into_value(), mode, false, encryption_key)
            .await?;
    let foreign_next_client_rules =
        get_next_client_transforms_rules(next_config, ty.into_value(), mode, true, encryption_key)
            .await?;
    let additional_rules: Vec<ModuleRule> = vec![
        get_swc_ecma_transform_plugin_rule(next_config, project_path).await?,
        get_relay_transform_rule(next_config, project_path).await?,
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
            get_postcss_package_mapping(*project_path)
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

    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typeof_window_inlining: Some(TypeofWindow::Object),
            source_maps: if *next_config.turbo_source_maps().await? {
                SourceMapsType::Full
            } else {
                SourceMapsType::None
            },
            ..Default::default()
        },
        css: CssOptionsContext {
            source_maps: if *next_config.turbo_source_maps().await? {
                SourceMapsType::Full
            } else {
                SourceMapsType::None
            },
            ..Default::default()
        },
        preset_env_versions: Some(env),
        execution_context: Some(execution_context),
        tree_shaking_mode: tree_shaking_mode_for_user_code,
        enable_postcss_transform,
        side_effect_free_packages: next_config.optimize_package_imports().owned().await?,
        keep_last_successful_parse: next_mode.is_development(),
        ..Default::default()
    };

    // node_modules context
    let foreign_codes_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typeof_window_inlining: None,
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
        css: CssOptionsContext {
            minify_type: if *next_config.turbo_minify(mode).await? {
                MinifyType::Minify {
                    mangle: !*no_mangling.await?,
                }
            } else {
                MinifyType::NoMinify
            },
            ..module_options_context.css
        },
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

#[turbo_tasks::function]
pub async fn get_client_chunking_context(
    root_path: ResolvedVc<FileSystemPath>,
    client_root: ResolvedVc<FileSystemPath>,
    client_root_to_root_path: ResolvedVc<RcStr>,
    asset_prefix: ResolvedVc<Option<RcStr>>,
    environment: ResolvedVc<Environment>,
    mode: Vc<NextMode>,
    module_id_strategy: ResolvedVc<Box<dyn ModuleIdStrategy>>,
    minify: Vc<bool>,
    source_maps: Vc<bool>,
    no_mangling: Vc<bool>,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let next_mode = mode.await?;
    let mut builder = BrowserChunkingContext::builder(
        root_path,
        client_root,
        client_root_to_root_path,
        client_root,
        client_root
            .join("static/chunks".into())
            .to_resolved()
            .await?,
        get_client_assets_path(*client_root).to_resolved().await?,
        environment,
        next_mode.runtime_type(),
    )
    .chunk_base_path(asset_prefix)
    .minify_type(if *minify.await? {
        MinifyType::Minify {
            mangle: !*no_mangling.await?,
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(if *source_maps.await? {
        SourceMapsType::Full
    } else {
        SourceMapsType::None
    })
    .asset_base_path(asset_prefix)
    .module_id_strategy(module_id_strategy);

    if next_mode.is_development() {
        builder = builder.hot_module_replacement().use_file_source_map_uris();
    } else {
        builder = builder.ecmascript_chunking_config(ChunkingConfig {
            min_chunk_size: 50_000,
            max_chunk_count_per_group: 40,
            max_merge_chunk_size: 200_000,
            ..Default::default()
        })
    }

    Ok(Vc::upcast(builder.build()))
}

#[turbo_tasks::function]
pub fn get_client_assets_path(client_root: Vc<FileSystemPath>) -> Vc<FileSystemPath> {
    client_root.join("static/media".into())
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_root: Vc<FileSystemPath>,
    ty: Value<ClientContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<RuntimeEntries>> {
    let mut runtime_entries = vec![];
    let resolve_options_context =
        get_client_resolve_options_context(project_root, ty, mode, next_config, execution_context);

    if mode.await?.is_development() {
        let enable_react_refresh =
            assert_can_resolve_react_refresh(project_root, resolve_options_context)
                .await?
                .as_request();

        // It's important that React Refresh come before the regular bootstrap file,
        // because the bootstrap contains JSX which requires Refresh's global
        // functions to be available.
        if let Some(request) = enable_react_refresh {
            runtime_entries.push(
                RuntimeEntry::Request(
                    request.to_resolved().await?,
                    project_root.join("_".into()).to_resolved().await?,
                )
                .resolved_cell(),
            )
        };
    }

    if matches!(*ty, ClientContextType::App { .. },) {
        runtime_entries.push(
            RuntimeEntry::Request(
                Request::parse(Value::new(Pattern::Constant(
                    "next/dist/client/app-next-turbopack.js".into(),
                )))
                .to_resolved()
                .await?,
                project_root.join("_".into()).to_resolved().await?,
            )
            .resolved_cell(),
        );
    }

    Ok(Vc::cell(runtime_entries))
}
