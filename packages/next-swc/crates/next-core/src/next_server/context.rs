use std::iter::once;

use anyhow::{bail, Result};
use indexmap::IndexMap;
use turbo_tasks::{RcStr, Value, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::{
    turbo::{
        tasks_env::{EnvMap, ProcessEnv},
        tasks_fs::FileSystemPath,
    },
    turbopack::{
        core::{
            compile_time_info::{
                CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, FreeVarReferences,
            },
            environment::{Environment, ExecutionEnvironment, NodeJsEnvironment, RuntimeVersions},
            free_var_references,
        },
        ecmascript::{references::esm::UrlRewriteBehavior, TreeShakingMode},
        ecmascript_plugin::transform::directives::{
            client::ClientDirectiveTransformer,
            client_disallowed::ClientDisallowedDirectiveTransformer,
        },
        node::{
            execution_context::ExecutionContext,
            transforms::postcss::{PostCssConfigLocation, PostCssTransformOptions},
        },
        nodejs::NodeJsChunkingContext,
        turbopack::{
            condition::ContextCondition,
            module_options::{
                JsxTransformOptions, ModuleOptionsContext, ModuleRule, TypeofWindow,
                TypescriptTransformOptions,
            },
            resolve_options_context::ResolveOptionsContext,
            transition::Transition,
        },
    },
};

use super::{
    resolve::ExternalCjsModulesResolvePlugin,
    transforms::{get_next_server_internal_transforms_rules, get_next_server_transforms_rules},
};
use crate::{
    embed_js::next_js_fs,
    mode::NextMode,
    next_build::get_postcss_package_mapping,
    next_client::RuntimeEntries,
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::get_next_server_import_map,
    next_server::resolve::ExternalPredicate,
    next_shared::{
        resolve::{
            get_invalid_client_only_resolve_plugin, get_invalid_styled_jsx_resolve_plugin,
            ModuleFeatureReportResolvePlugin, NextExternalResolvePlugin,
            NextNodeSharedRuntimeResolvePlugin,
        },
        transforms::{
            emotion::get_emotion_transform_rule, get_ecma_transform_rule,
            next_react_server_components::get_next_react_server_components_transform_rule,
            relay::get_relay_transform_rule,
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
    util::{foreign_code_context_condition, load_next_js_templateon, NextRuntime},
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum ServerContextType {
    Pages {
        pages_dir: Vc<FileSystemPath>,
    },
    PagesApi {
        pages_dir: Vc<FileSystemPath>,
    },
    PagesData {
        pages_dir: Vc<FileSystemPath>,
    },
    AppSSR {
        app_dir: Vc<FileSystemPath>,
    },
    AppRSC {
        app_dir: Vc<FileSystemPath>,
        ecmascript_client_reference_transition_name: Option<Vc<RcStr>>,
        client_transition: Option<Vc<Box<dyn Transition>>>,
    },
    AppRoute {
        app_dir: Vc<FileSystemPath>,
        ecmascript_client_reference_transition_name: Option<Vc<RcStr>>,
    },
    Middleware {
        app_dir: Option<Vc<FileSystemPath>>,
        ecmascript_client_reference_transition_name: Option<Vc<RcStr>>,
    },
    Instrumentation {
        app_dir: Option<Vc<FileSystemPath>>,
        ecmascript_client_reference_transition_name: Option<Vc<RcStr>>,
    },
}

impl ServerContextType {
    pub fn supports_react_server(&self) -> bool {
        matches!(
            self,
            ServerContextType::AppRSC { .. }
                | ServerContextType::AppRoute { .. }
                | ServerContextType::PagesApi { .. }
                | ServerContextType::Middleware { .. }
                | ServerContextType::Instrumentation { .. }
        )
    }
}

#[turbo_tasks::function]
pub async fn get_server_resolve_options_context(
    project_path: Vc<FileSystemPath>,
    ty: Value<ServerContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_server_import_map =
        get_next_server_import_map(project_path, ty, next_config, execution_context);
    let foreign_code_context_condition =
        foreign_code_context_condition(next_config, project_path).await?;
    let root_dir = project_path.root().resolve().await?;
    let module_feature_report_resolve_plugin = ModuleFeatureReportResolvePlugin::new(project_path);
    let invalid_client_only_resolve_plugin = get_invalid_client_only_resolve_plugin(project_path);
    let invalid_styled_jsx_client_only_resolve_plugin =
        get_invalid_styled_jsx_resolve_plugin(project_path);

    let mut transpile_packages = next_config.transpile_packages().await?.clone_value();
    transpile_packages.extend(
        (*next_config.optimize_package_imports().await?)
            .iter()
            .cloned(),
    );

    // Always load these predefined packages as external.
    let mut external_packages: Vec<RcStr> = load_next_js_templateon(
        project_path,
        "dist/lib/server-external-packages.json".into(),
    )
    .await?;

    let server_external_packages = &*next_config.server_external_packages().await?;

    let conflicting_packages = transpile_packages
        .iter()
        .filter(|package| server_external_packages.contains(package))
        .collect::<Vec<_>>();

    if !conflicting_packages.is_empty() {
        bail!(
            "The packages specified in the 'transpilePackages' conflict with the \
             'serverExternalPackages': {:?}",
            conflicting_packages
        );
    }

    // Add the config's own list of external packages.
    external_packages.extend(server_external_packages.iter().cloned());

    external_packages.retain(|item| !transpile_packages.contains(item));

    let ty = ty.into_value();

    let server_external_packages_plugin = ExternalCjsModulesResolvePlugin::new(
        project_path,
        project_path.root(),
        ExternalPredicate::Only(Vc::cell(external_packages)).cell(),
        // app-ssr can't have esm externals as that would make the module async on the server only
        *next_config.import_externals().await? && !matches!(ty, ServerContextType::AppSSR { .. }),
    );

    let mut custom_conditions = vec![mode.await?.condition().to_string().into()];
    custom_conditions.extend(
        NextRuntime::NodeJs
            .conditions()
            .iter()
            .map(ToString::to_string)
            .map(RcStr::from),
    );

    if ty.supports_react_server() {
        custom_conditions.push("react-server".into());
    };

    let external_cjs_modules_plugin = if *next_config.bundle_pages_router_dependencies().await? {
        server_external_packages_plugin
    } else {
        ExternalCjsModulesResolvePlugin::new(
            project_path,
            project_path.root(),
            ExternalPredicate::AllExcept(Vc::cell(transpile_packages)).cell(),
            *next_config.import_externals().await?,
        )
    };

    let next_external_plugin = NextExternalResolvePlugin::new(project_path);
    let next_node_shared_runtime_plugin =
        NextNodeSharedRuntimeResolvePlugin::new(project_path, Value::new(ty));

    let mut before_resolve_plugins = match ty {
        ServerContextType::Pages { .. }
        | ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. } => {
            vec![
                Vc::upcast(NextFontLocalResolvePlugin::new(project_path)),
                Vc::upcast(module_feature_report_resolve_plugin),
            ]
        }
        ServerContextType::PagesData { .. }
        | ServerContextType::PagesApi { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {
            vec![Vc::upcast(module_feature_report_resolve_plugin)]
        }
    };

    let after_resolve_plugins = match ty {
        ServerContextType::Pages { .. }
        | ServerContextType::PagesApi { .. }
        | ServerContextType::PagesData { .. } => {
            vec![
                Vc::upcast(next_node_shared_runtime_plugin),
                Vc::upcast(external_cjs_modules_plugin),
                Vc::upcast(next_external_plugin),
            ]
        }
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. } => {
            vec![
                Vc::upcast(next_node_shared_runtime_plugin),
                Vc::upcast(server_external_packages_plugin),
                Vc::upcast(next_external_plugin),
            ]
        }
        ServerContextType::Middleware { .. } => {
            vec![Vc::upcast(next_node_shared_runtime_plugin)]
        }
        ServerContextType::Instrumentation { .. } => {
            vec![
                Vc::upcast(next_node_shared_runtime_plugin),
                Vc::upcast(next_external_plugin),
            ]
        }
    };

    // Inject resolve plugin to assert incorrect import to client|server-only for
    // the corresponding context. Refer https://github.com/vercel/next.js/blob/ad15817f0368ba154bed6d85320335d4b67b7348/packages/next/src/build/webpack-config.ts#L1205-L1235
    // how it is applied in the webpack config.
    // Unlike webpack which alias client-only -> runtime code -> build-time error
    // code, we use resolve plugin to detect original import directly. This
    // means each resolve plugin must be injected only for the context where the
    // alias resolves into the error. The alias lives in here: https://github.com/vercel/next.js/blob/0060de1c4905593ea875fa7250d4b5d5ce10897d/packages/next-swc/crates/next-core/src/next_import_map.rs#L534
    match ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesApi { .. } => {
            //noop
        }
        ServerContextType::PagesData { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {
            before_resolve_plugins.push(Vc::upcast(invalid_client_only_resolve_plugin));
            before_resolve_plugins.push(Vc::upcast(invalid_styled_jsx_client_only_resolve_plugin));
        }
        ServerContextType::AppSSR { .. } => {
            //[TODO] Build error in this context makes rsc-build-error.ts fail which expects runtime error code
            // looks like webpack and turbopack have different order, webpack runs rsc transform first, turbopack triggers resolve plugin first.
        }
    }

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(root_dir),
        enable_node_externals: true,
        enable_node_native_modules: true,
        module: true,
        custom_conditions,
        import_map: Some(next_server_import_map),
        before_resolve_plugins,
        after_resolve_plugins,
        ..Default::default()
    };

    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        enable_mjs_extension: true,
        custom_extensions: next_config.resolve_extension().await?.clone_value(),
        rules: vec![(
            foreign_code_context_condition,
            resolve_options_context.clone().cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

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
async fn next_server_defines(define_env: Vc<EnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*define_env.await?).cell())
}

#[turbo_tasks::function]
async fn next_server_free_vars(define_env: Vc<EnvMap>) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(..defines(&*define_env.await?).into_iter()).cell())
}

#[turbo_tasks::function]
pub async fn get_server_compile_time_info(
    process_env: Vc<Box<dyn ProcessEnv>>,
    define_env: Vc<EnvMap>,
) -> Vc<CompileTimeInfo> {
    CompileTimeInfo::builder(Environment::new(Value::new(
        ExecutionEnvironment::NodeJsLambda(NodeJsEnvironment::current(process_env)),
    )))
    .defines(next_server_defines(define_env))
    .free_var_references(next_server_free_vars(define_env))
    .cell()
}

/// Determins if the module is an internal asset (i.e overlay, fallback) coming
/// from the embedded FS, don't apply user defined transforms.
///
/// [TODO] turbopack specific embed fs should be handled by internals of
/// turbopack itself and user config should not try to leak this. However,
/// currently we apply few transform options subject to next.js's configuration
/// even if it's embedded assets.
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
pub async fn get_server_module_options_context(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    ty: Value<ServerContextType>,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    next_runtime: NextRuntime,
) -> Result<Vc<ModuleOptionsContext>> {
    let mut next_server_rules =
        get_next_server_transforms_rules(next_config, ty.into_value(), mode, false, next_runtime)
            .await?;
    let mut foreign_next_server_rules =
        get_next_server_transforms_rules(next_config, ty.into_value(), mode, true, next_runtime)
            .await?;
    let mut internal_custom_rules = get_next_server_internal_transforms_rules(
        ty.into_value(),
        next_config.mdx_rs().await?.is_some(),
    )
    .await?;

    let foreign_code_context_condition =
        foreign_code_context_condition(next_config, project_path).await?;
    let postcss_transform_options = PostCssTransformOptions {
        postcss_package: Some(get_postcss_package_mapping(project_path)),
        config_location: PostCssConfigLocation::ProjectPathOrLocalPath,
        ..Default::default()
    };
    let postcss_foreign_transform_options = PostCssTransformOptions {
        // For node_modules we don't want to resolve postcss config relative to the file
        // being compiled, instead it only uses the project root postcss
        // config.
        config_location: PostCssConfigLocation::ProjectPath,
        ..postcss_transform_options.clone()
    };
    let enable_postcss_transform = Some(postcss_transform_options.cell());
    let enable_foreign_postcss_transform = Some(postcss_foreign_transform_options.cell());

    let mut conditions = vec![mode.await?.condition().into()];
    conditions.extend(
        next_runtime
            .conditions()
            .iter()
            .map(ToString::to_string)
            .map(RcStr::from),
    );

    // A separate webpack rules will be applied to codes matching
    // foreign_code_context_condition. This allows to import codes from
    // node_modules that requires webpack loaders, which next-dev implicitly
    // does by default.
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

    let tree_shaking_mode = *next_config.tree_shaking_mode().await?;
    let use_swc_css = *next_config.use_swc_css().await?;
    let versions = RuntimeVersions(Default::default()).cell();

    // ModuleOptionsContext related options
    let tsconfig = get_typescript_transform_options(project_path);
    let decorators_options = get_decorators_transform_options(project_path);
    let enable_mdx_rs = *next_config.mdx_rs().await?;

    // Get the jsx transform options for the `client` side.
    // This matches to the behavior of existing webpack config, if issuer layer is
    // ssr or pages-browser (client bundle for the browser)
    // applies client specific swc transforms.
    //
    // This enables correct emotion transform and other hydration between server and
    // client bundles. ref: https://github.com/vercel/next.js/blob/4bbf9b6c70d2aa4237defe2bebfa790cdb7e334e/packages/next/src/build/webpack-config.ts#L1421-L1426
    let jsx_runtime_options =
        get_jsx_transform_options(project_path, mode, None, false, next_config);
    let rsc_jsx_runtime_options =
        get_jsx_transform_options(project_path, mode, None, true, next_config);

    // A set of custom ecma transform rules being applied to server context.
    let source_transform_rules: Vec<ModuleRule> = vec![
        get_swc_ecma_transform_plugin_rule(next_config, project_path).await?,
        get_relay_transform_rule(next_config).await?,
        get_emotion_transform_rule(next_config).await?,
    ]
    .into_iter()
    .flatten()
    .collect();

    // Custom ecma transform rules selectively being applied depends on the server
    // context type.
    let styled_components_transform_rule =
        get_styled_components_transform_rule(next_config).await?;
    let styled_jsx_transform_rule = get_styled_jsx_transform_rule(next_config, versions).await?;

    let module_options_context = ModuleOptionsContext {
        enable_typeof_window_inlining: Some(TypeofWindow::Undefined),
        execution_context: Some(execution_context),
        use_swc_css,
        tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
        import_externals: *next_config.import_externals().await?,
        ignore_dynamic_requests: true,
        side_effect_free_packages: next_config.optimize_package_imports().await?.clone_value(),
        ..Default::default()
    };

    let ty = ty.into_value();
    let module_options_context = match ty {
        ServerContextType::Pages { .. }
        | ServerContextType::PagesData { .. }
        | ServerContextType::PagesApi { .. } => {
            let mut custom_source_transform_rules: Vec<ModuleRule> =
                vec![styled_components_transform_rule, styled_jsx_transform_rule]
                    .into_iter()
                    .flatten()
                    .collect();

            if let ServerContextType::Pages { .. } = ty {
                custom_source_transform_rules.push(
                    get_next_react_server_components_transform_rule(next_config, false, None)
                        .await?,
                );
            }

            next_server_rules.extend(custom_source_transform_rules.iter().cloned());
            next_server_rules.extend(source_transform_rules);

            foreign_next_server_rules.extend(custom_source_transform_rules);
            foreign_next_server_rules.extend(internal_custom_rules);

            let url_rewrite_behavior = Some(
                //https://github.com/vercel/next.js/blob/bbb730e5ef10115ed76434f250379f6f53efe998/packages/next/src/build/webpack-config.ts#L1384
                if let ServerContextType::PagesApi { .. } = ty {
                    UrlRewriteBehavior::Full
                } else {
                    UrlRewriteBehavior::Relative
                },
            );

            let module_options_context = ModuleOptionsContext {
                esm_url_rewrite_behavior: url_rewrite_behavior,
                ..module_options_context
            };

            let foreign_code_module_options_context = ModuleOptionsContext {
                enable_typeof_window_inlining: None,
                custom_rules: foreign_next_server_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode,
                ..module_options_context.clone()
            };

            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                enable_jsx: Some(JsxTransformOptions::default().cell()),
                custom_rules: foreign_next_server_rules,
                ..module_options_context.clone()
            };

            ModuleOptionsContext {
                enable_jsx: Some(jsx_runtime_options),
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.cell(),
                    ),
                    (
                        internal_assets_conditions(),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules: next_server_rules,
                ..module_options_context
            }
        }
        ServerContextType::AppSSR { app_dir, .. } => {
            let mut custom_source_transform_rules: Vec<ModuleRule> =
                vec![styled_components_transform_rule, styled_jsx_transform_rule]
                    .into_iter()
                    .flatten()
                    .collect();

            foreign_next_server_rules.extend(custom_source_transform_rules.iter().cloned());
            foreign_next_server_rules.extend(internal_custom_rules);

            custom_source_transform_rules.push(
                get_next_react_server_components_transform_rule(next_config, false, Some(app_dir))
                    .await?,
            );

            next_server_rules.extend(custom_source_transform_rules.clone());
            next_server_rules.extend(source_transform_rules);

            let foreign_code_module_options_context = ModuleOptionsContext {
                enable_typeof_window_inlining: None,
                custom_rules: foreign_next_server_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                custom_rules: foreign_next_server_rules,
                ..module_options_context.clone()
            };

            ModuleOptionsContext {
                enable_jsx: Some(jsx_runtime_options),
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.cell(),
                    ),
                    (
                        internal_assets_conditions(),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules: next_server_rules,
                ..module_options_context
            }
        }
        ServerContextType::AppRSC {
            app_dir,
            ecmascript_client_reference_transition_name,
            ..
        } => {
            let mut custom_source_transform_rules: Vec<ModuleRule> =
                vec![styled_components_transform_rule, styled_jsx_transform_rule]
                    .into_iter()
                    .flatten()
                    .collect();

            if let Some(ecmascript_client_reference_transition_name) =
                ecmascript_client_reference_transition_name
            {
                custom_source_transform_rules.push(get_ecma_transform_rule(
                    Box::new(ClientDirectiveTransformer::new(
                        ecmascript_client_reference_transition_name,
                    )),
                    enable_mdx_rs.is_some(),
                    true,
                ));
            }

            foreign_next_server_rules.extend(custom_source_transform_rules.iter().cloned());
            foreign_next_server_rules.extend(internal_custom_rules);

            custom_source_transform_rules.push(
                get_next_react_server_components_transform_rule(next_config, true, Some(app_dir))
                    .await?,
            );

            next_server_rules.extend(custom_source_transform_rules.clone());
            next_server_rules.extend(source_transform_rules);

            let foreign_code_module_options_context = ModuleOptionsContext {
                custom_rules: foreign_next_server_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                custom_rules: foreign_next_server_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                enable_jsx: Some(rsc_jsx_runtime_options),
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.cell(),
                    ),
                    (
                        internal_assets_conditions(),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules: next_server_rules,
                ..module_options_context
            }
        }
        ServerContextType::AppRoute {
            app_dir,
            ecmascript_client_reference_transition_name,
        } => {
            next_server_rules.extend(source_transform_rules);

            let mut common_next_server_rules = vec![
                get_next_react_server_components_transform_rule(next_config, true, Some(app_dir))
                    .await?,
            ];

            if let Some(ecmascript_client_reference_transition_name) =
                ecmascript_client_reference_transition_name
            {
                common_next_server_rules.push(get_ecma_transform_rule(
                    Box::new(ClientDirectiveTransformer::new(
                        ecmascript_client_reference_transition_name,
                    )),
                    enable_mdx_rs.is_some(),
                    true,
                ));
            }

            next_server_rules.extend(common_next_server_rules.iter().cloned());
            internal_custom_rules.extend(common_next_server_rules);

            let module_options_context = ModuleOptionsContext {
                esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Full),
                ..module_options_context
            };
            let foreign_code_module_options_context = ModuleOptionsContext {
                custom_rules: internal_custom_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                custom_rules: internal_custom_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                enable_jsx: Some(rsc_jsx_runtime_options),
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.cell(),
                    ),
                    (
                        internal_assets_conditions(),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules: next_server_rules,
                ..module_options_context
            }
        }
        ServerContextType::Middleware {
            app_dir,
            ecmascript_client_reference_transition_name,
        }
        | ServerContextType::Instrumentation {
            app_dir,
            ecmascript_client_reference_transition_name,
        } => {
            let mut custom_source_transform_rules: Vec<ModuleRule> =
                vec![styled_components_transform_rule, styled_jsx_transform_rule]
                    .into_iter()
                    .flatten()
                    .collect();

            if let Some(ecmascript_client_reference_transition_name) =
                ecmascript_client_reference_transition_name
            {
                custom_source_transform_rules.push(get_ecma_transform_rule(
                    Box::new(ClientDirectiveTransformer::new(
                        ecmascript_client_reference_transition_name,
                    )),
                    enable_mdx_rs.is_some(),
                    true,
                ));
            } else {
                custom_source_transform_rules.push(get_ecma_transform_rule(
                    Box::new(ClientDisallowedDirectiveTransformer::new(
                        "next/dist/client/use-client-disallowed.js".to_string(),
                    )),
                    enable_mdx_rs.is_some(),
                    true,
                ));
            }

            custom_source_transform_rules.push(
                get_next_react_server_components_transform_rule(next_config, true, app_dir).await?,
            );

            internal_custom_rules.extend(custom_source_transform_rules.iter().cloned());

            next_server_rules.extend(custom_source_transform_rules);
            next_server_rules.extend(source_transform_rules);

            let module_options_context = ModuleOptionsContext {
                esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Full),
                ..module_options_context
            };
            let foreign_code_module_options_context = ModuleOptionsContext {
                custom_rules: internal_custom_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                custom_rules: internal_custom_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                enable_jsx: Some(jsx_runtime_options),
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.cell(),
                    ),
                    (
                        internal_assets_conditions(),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules: next_server_rules,
                ..module_options_context
            }
        }
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::function]
pub fn get_build_module_options_context() -> Vc<ModuleOptionsContext> {
    ModuleOptionsContext {
        enable_typescript_transform: Some(Default::default()),
        tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
        esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Full),
        ..Default::default()
    }
    .cell()
}

#[turbo_tasks::function]
pub fn get_server_runtime_entries(
    _ty: Value<ServerContextType>,
    _mode: Vc<NextMode>,
) -> Vc<RuntimeEntries> {
    let runtime_entries = vec![];
    Vc::cell(runtime_entries)
}

#[turbo_tasks::function]
pub async fn get_server_chunking_context_with_client_assets(
    mode: Vc<NextMode>,
    project_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    client_root: Vc<FileSystemPath>,
    asset_prefix: Vc<Option<RcStr>>,
    environment: Vc<Environment>,
) -> Result<Vc<NodeJsChunkingContext>> {
    let next_mode = mode.await?;
    // TODO(alexkirsz) This should return a trait that can be implemented by the
    // different server chunking contexts. OR the build chunking context should
    // support both production and development modes.
    Ok(NodeJsChunkingContext::builder(
        project_path,
        node_root,
        client_root,
        node_root.join("server/chunks/ssr".into()),
        client_root.join("static/media".into()),
        environment,
        next_mode.runtime_type(),
    )
    .asset_prefix(asset_prefix)
    .minify_type(next_mode.minify_type())
    .build())
}

#[turbo_tasks::function]
pub async fn get_server_chunking_context(
    mode: Vc<NextMode>,
    project_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    environment: Vc<Environment>,
) -> Result<Vc<NodeJsChunkingContext>> {
    let next_mode = mode.await?;
    // TODO(alexkirsz) This should return a trait that can be implemented by the
    // different server chunking contexts. OR the build chunking context should
    // support both production and development modes.
    Ok(NodeJsChunkingContext::builder(
        project_path,
        node_root,
        node_root,
        node_root.join("server/chunks".into()),
        node_root.join("server/assets".into()),
        environment,
        next_mode.runtime_type(),
    )
    .minify_type(next_mode.minify_type())
    .build())
}
