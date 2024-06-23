use std::iter::once;

use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{RcStr, Value, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::{
    turbo::{tasks_env::EnvMap, tasks_fs::FileSystemPath},
    turbopack::{
        browser::{react_refresh::assert_can_resolve_react_refresh, BrowserChunkingContext},
        core::{
            chunk::ChunkingContext,
            compile_time_info::{
                CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, FreeVarReference,
                FreeVarReferences,
            },
            environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
            free_var_references,
            resolve::{parse::Request, pattern::Pattern},
        },
        ecmascript::TreeShakingMode,
        node::{
            execution_context::ExecutionContext,
            transforms::postcss::{PostCssConfigLocation, PostCssTransformOptions},
        },
        turbopack::{
            condition::ContextCondition,
            module_options::{
                module_options_context::ModuleOptionsContext, JsxTransformOptions, ModuleRule,
                TypeofWindow, TypescriptTransformOptions,
            },
            resolve_options_context::ResolveOptionsContext,
        },
    },
};

use super::transforms::get_next_client_transforms_rules;
use crate::{
    embed_js::next_js_fs,
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
            emotion::get_emotion_transform_rule, relay::get_relay_transform_rule,
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
    util::foreign_code_context_condition,
};

fn defines(define_env: &IndexMap<RcStr, RcStr>) -> CompileTimeDefines {
    let mut defines = IndexMap::new();

    for (k, v) in define_env {
        defines
            .entry(k.split('.').map(|s| s.into()).collect::<Vec<RcStr>>())
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
pub fn get_client_compile_time_info(
    browserslist_query: RcStr,
    define_env: Vc<EnvMap>,
) -> Vc<CompileTimeInfo> {
    CompileTimeInfo::builder(Environment::new(Value::new(ExecutionEnvironment::Browser(
        BrowserEnvironment {
            dom: true,
            web_worker: false,
            service_worker: false,
            browserslist_query: browserslist_query.to_owned(),
        }
        .into(),
    ))))
    .defines(next_client_defines(define_env))
    .free_var_references(next_client_free_vars(define_env))
    .cell()
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum ClientContextType {
    Pages { pages_dir: Vc<FileSystemPath> },
    App { app_dir: Vc<FileSystemPath> },
    Fallback,
    Other,
}

#[turbo_tasks::function]
pub async fn get_client_resolve_options_context(
    project_path: Vc<FileSystemPath>,
    ty: Value<ClientContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_client_import_map =
        get_next_client_import_map(project_path, ty, next_config, execution_context);
    let next_client_fallback_import_map = get_next_client_fallback_import_map(ty);
    let next_client_resolved_map =
        get_next_client_resolved_map(project_path, project_path, *mode.await?);
    let custom_conditions = vec![mode.await?.condition().into()];
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
        custom_conditions,
        import_map: Some(next_client_import_map),
        fallback_import_map: Some(next_client_fallback_import_map),
        resolved_map: Some(next_client_resolved_map),
        browser: true,
        module: true,
        before_resolve_plugins: vec![
            Vc::upcast(get_invalid_server_only_resolve_plugin(project_path)),
            Vc::upcast(ModuleFeatureReportResolvePlugin::new(project_path)),
            Vc::upcast(NextFontLocalResolvePlugin::new(project_path)),
        ],
        after_resolve_plugins: vec![Vc::upcast(NextSharedRuntimeResolvePlugin::new(
            project_path,
        ))],
        ..Default::default()
    };
    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_mjs_extension: true,
        custom_extensions: next_config.resolve_extension().await?.clone_value(),
        rules: vec![(
            foreign_code_context_condition(next_config, project_path).await?,
            module_options_context.clone().cell(),
        )],
        ..module_options_context
    }
    .cell())
}

fn internal_assets_conditions() -> ContextCondition {
    ContextCondition::any(vec![
        ContextCondition::InPath(next_js_fs().root()),
        ContextCondition::InPath(
            turbopack_binding::turbopack::ecmascript_runtime::embed_fs().root(),
        ),
        ContextCondition::InPath(turbopack_binding::turbopack::node::embed_js::embed_fs().root()),
    ])
}

#[turbo_tasks::function]
pub async fn get_client_module_options_context(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    env: Vc<Environment>,
    ty: Value<ClientContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<ModuleOptionsContext>> {
    let resolve_options_context =
        get_client_resolve_options_context(project_path, ty, mode, next_config, execution_context);

    let tsconfig = get_typescript_transform_options(project_path);
    let decorators_options = get_decorators_transform_options(project_path);
    let enable_mdx_rs = *next_config.mdx_rs().await?;
    let jsx_runtime_options = get_jsx_transform_options(
        project_path,
        mode,
        Some(resolve_options_context),
        false,
        next_config,
    );

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

    let use_swc_css = *next_config.use_swc_css().await?;
    let target_browsers = env.runtime_versions();

    let mut next_client_rules =
        get_next_client_transforms_rules(next_config, ty.into_value(), mode, false).await?;
    let foreign_next_client_rules =
        get_next_client_transforms_rules(next_config, ty.into_value(), mode, true).await?;
    let additional_rules: Vec<ModuleRule> = vec![
        get_swc_ecma_transform_plugin_rule(next_config, project_path).await?,
        get_relay_transform_rule(next_config).await?,
        get_emotion_transform_rule(next_config).await?,
        get_styled_components_transform_rule(next_config).await?,
        get_styled_jsx_transform_rule(next_config, target_browsers).await?,
    ]
    .into_iter()
    .flatten()
    .collect();

    next_client_rules.extend(additional_rules);

    let postcss_transform_options = PostCssTransformOptions {
        postcss_package: Some(get_postcss_package_mapping(project_path)),
        config_location: PostCssConfigLocation::ProjectPathOrLocalPath,
        ..Default::default()
    };
    let postcss_foreign_transform_options = PostCssTransformOptions {
        // For node_modules we don't want to resolve postcss config relative to the file being
        // compiled, instead it only uses the project root postcss config.
        config_location: PostCssConfigLocation::ProjectPath,
        ..postcss_transform_options.clone()
    };
    let enable_postcss_transform = Some(postcss_transform_options.cell());
    let enable_foreign_postcss_transform = Some(postcss_foreign_transform_options.cell());

    let module_options_context = ModuleOptionsContext {
        enable_typeof_window_inlining: Some(TypeofWindow::Object),
        preset_env_versions: Some(env),
        execution_context: Some(execution_context),
        tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
        enable_postcss_transform,
        side_effect_free_packages: next_config.optimize_package_imports().await?.clone_value(),
        ..Default::default()
    };

    // node_modules context
    let foreign_codes_options_context = ModuleOptionsContext {
        enable_typeof_window_inlining: None,
        enable_webpack_loaders: foreign_enable_webpack_loaders,
        enable_postcss_transform: enable_foreign_postcss_transform,
        custom_rules: foreign_next_client_rules,
        // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
        ..module_options_context.clone()
    };

    let module_options_context = ModuleOptionsContext {
        // We don't need to resolve React Refresh for each module. Instead,
        // we try resolve it once at the root and pass down a context to all
        // the modules.
        enable_jsx: Some(jsx_runtime_options),
        enable_webpack_loaders,
        enable_typescript_transform: Some(tsconfig),
        enable_mdx_rs,
        decorators: Some(decorators_options),
        rules: vec![
            (
                foreign_code_context_condition(next_config, project_path).await?,
                foreign_codes_options_context.cell(),
            ),
            (
                internal_assets_conditions(),
                ModuleOptionsContext {
                    enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                    enable_jsx: Some(JsxTransformOptions::default().cell()),
                    ..module_options_context.clone()
                }
                .cell(),
            ),
        ],
        custom_rules: next_client_rules,
        use_swc_css,
        ..module_options_context
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::function]
pub async fn get_client_chunking_context(
    project_path: Vc<FileSystemPath>,
    client_root: Vc<FileSystemPath>,
    asset_prefix: Vc<Option<RcStr>>,
    environment: Vc<Environment>,
    mode: Vc<NextMode>,
) -> Result<Vc<Box<dyn ChunkingContext>>> {
    let next_mode = mode.await?;
    let mut builder = BrowserChunkingContext::builder(
        project_path,
        client_root,
        client_root,
        client_root.join("static/chunks".into()),
        get_client_assets_path(client_root),
        environment,
        next_mode.runtime_type(),
    )
    .chunk_base_path(asset_prefix)
    .minify_type(next_mode.minify_type())
    .asset_base_path(asset_prefix);

    if next_mode.is_development() {
        builder = builder.hot_module_replacement();
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
            runtime_entries
                .push(RuntimeEntry::Request(request, project_root.join("_".into())).cell())
        };
    }

    if matches!(*ty, ClientContextType::App { .. },) {
        runtime_entries.push(
            RuntimeEntry::Request(
                Request::parse(Value::new(Pattern::Constant(
                    "next/dist/client/app-next-turbopack.js".into(),
                ))),
                project_root.join("_".into()),
            )
            .cell(),
        );
    }

    Ok(Vc::cell(runtime_entries))
}
