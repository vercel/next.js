use std::collections::BTreeSet;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{
    css::chunk::CssChunkType,
    module_options::{
        CssOptionsContext, EcmascriptOptionsContext, ExternalsTracingOptions, JsxTransformOptions,
        ModuleOptionsContext, ModuleRule, TypescriptTransformOptions,
    },
    resolve_options_context::ResolveOptionsContext,
    transition::Transition,
};
use turbopack_core::{
    chunk::{
        ChunkingConfig, MangleType, MinifyType, SourceMapsType,
        module_id_strategies::ModuleIdStrategy,
    },
    compile_time_defines,
    compile_time_info::{CompileTimeDefines, CompileTimeInfo, FreeVarReferences},
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment, NodeJsVersion},
    free_var_references,
    module_graph::export_usage::OptionExportUsageInfo,
    target::CompileTarget,
};
use turbopack_ecmascript::{
    AnalyzeMode, TypeofWindow, chunk::EcmascriptChunkType, references::esm::UrlRewriteBehavior,
};
use turbopack_ecmascript_plugins::transform::directives::{
    client::ClientDirectiveTransformer, client_disallowed::ClientDisallowedDirectiveTransformer,
};
use turbopack_node::{
    execution_context::ExecutionContext,
    transforms::postcss::{PostCssConfigLocation, PostCssTransformOptions},
};
use turbopack_nodejs::NodeJsChunkingContext;

use super::{
    resolve::ExternalCjsModulesResolvePlugin,
    transforms::{get_next_server_internal_transforms_rules, get_next_server_transforms_rules},
};
use crate::{
    app_structure::CollectedRootParams,
    mode::NextMode,
    next_build::get_postcss_package_mapping,
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::{get_next_edge_and_server_fallback_import_map, get_next_server_import_map},
    next_server::resolve::ExternalPredicate,
    next_shared::{
        resolve::{
            ModuleFeatureReportResolvePlugin, NextExternalResolvePlugin,
            NextNodeSharedRuntimeResolvePlugin, get_invalid_client_only_resolve_plugin,
            get_invalid_styled_jsx_resolve_plugin,
        },
        transforms::{
            EcmascriptTransformStage, emotion::get_emotion_transform_rule, get_ecma_transform_rule,
            next_react_server_components::get_next_react_server_components_transform_rule,
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
        NextRuntime, OptionEnvMap, defines, foreign_code_context_condition,
        get_transpiled_packages, internal_assets_conditions, load_next_js_templateon,
        module_styles_rule_condition,
    },
};

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Hash, TaskInput)]
pub enum ServerContextType {
    Pages {
        pages_dir: FileSystemPath,
    },
    PagesApi {
        pages_dir: FileSystemPath,
    },
    AppSSR {
        app_dir: FileSystemPath,
    },
    AppRSC {
        app_dir: FileSystemPath,
        ecmascript_client_reference_transition_name: Option<RcStr>,
        client_transition: Option<ResolvedVc<Box<dyn Transition>>>,
    },
    AppRoute {
        app_dir: FileSystemPath,
        ecmascript_client_reference_transition_name: Option<RcStr>,
    },
    Middleware {
        app_dir: Option<FileSystemPath>,
        ecmascript_client_reference_transition_name: Option<RcStr>,
    },
    Instrumentation {
        app_dir: Option<FileSystemPath>,
        ecmascript_client_reference_transition_name: Option<RcStr>,
    },
}

impl ServerContextType {
    pub fn should_use_react_server_condition(&self) -> bool {
        matches!(
            self,
            ServerContextType::AppRSC { .. }
                | ServerContextType::AppRoute { .. }
                | ServerContextType::Middleware { .. }
                | ServerContextType::Instrumentation { .. }
        )
    }
}

#[turbo_tasks::function]
pub async fn get_server_resolve_options_context(
    project_path: FileSystemPath,
    ty: ServerContextType,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
    collected_root_params: Option<Vc<CollectedRootParams>>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_server_import_map = get_next_server_import_map(
        project_path.clone(),
        ty.clone(),
        next_config,
        mode,
        execution_context,
        collected_root_params,
    )
    .to_resolved()
    .await?;
    let next_server_fallback_import_map =
        get_next_edge_and_server_fallback_import_map(project_path.clone(), NextRuntime::NodeJs)
            .to_resolved()
            .await?;

    let foreign_code_context_condition =
        foreign_code_context_condition(next_config, project_path.clone()).await?;
    let root_dir = project_path.root().owned().await?;
    let module_feature_report_resolve_plugin =
        ModuleFeatureReportResolvePlugin::new(project_path.clone())
            .to_resolved()
            .await?;
    let invalid_client_only_resolve_plugin =
        get_invalid_client_only_resolve_plugin(project_path.clone())
            .to_resolved()
            .await?;
    let invalid_styled_jsx_client_only_resolve_plugin =
        get_invalid_styled_jsx_resolve_plugin(project_path.clone())
            .to_resolved()
            .await?;

    // Always load these predefined packages as external.
    let mut external_packages: Vec<RcStr> = load_next_js_templateon(
        project_path.clone(),
        rcstr!("dist/lib/server-external-packages.json"),
    )
    .await?;

    let mut transpiled_packages = get_transpiled_packages(next_config, project_path.clone())
        .owned()
        .await?;

    transpiled_packages.extend(
        (*next_config.optimize_package_imports().await?)
            .iter()
            .cloned(),
    );

    let server_external_packages = &*next_config.server_external_packages().await?;

    let conflicting_packages = transpiled_packages
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

    external_packages.retain(|item| !transpiled_packages.contains(item));

    let server_external_packages_plugin = ExternalCjsModulesResolvePlugin::new(
        project_path.clone(),
        project_path.root().owned().await?,
        ExternalPredicate::Only(ResolvedVc::cell(external_packages)).cell(),
        *next_config.import_externals().await?,
    )
    .to_resolved()
    .await?;

    let mut custom_conditions: Vec<_> = mode.await?.custom_resolve_conditions().collect();
    custom_conditions.extend(NextRuntime::NodeJs.custom_resolve_conditions());

    if ty.should_use_react_server_condition() {
        custom_conditions.push(rcstr!("react-server"));
    };

    if *next_config.enable_cache_components().await? {
        custom_conditions.push(rcstr!("next-js"));
    };

    let external_cjs_modules_plugin = if *next_config.bundle_pages_router_dependencies().await? {
        server_external_packages_plugin
    } else {
        ExternalCjsModulesResolvePlugin::new(
            project_path.clone(),
            project_path.root().owned().await?,
            ExternalPredicate::AllExcept(ResolvedVc::cell(transpiled_packages)).cell(),
            *next_config.import_externals().await?,
        )
        .to_resolved()
        .await?
    };

    let next_external_plugin = NextExternalResolvePlugin::new(project_path.clone())
        .to_resolved()
        .await?;
    let next_node_shared_runtime_plugin =
        NextNodeSharedRuntimeResolvePlugin::new(project_path.clone(), ty.clone())
            .to_resolved()
            .await?;

    let mut before_resolve_plugins = match &ty {
        ServerContextType::Pages { .. }
        | ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. } => {
            vec![
                ResolvedVc::upcast(
                    NextFontLocalResolvePlugin::new(project_path.clone())
                        .to_resolved()
                        .await?,
                ),
                ResolvedVc::upcast(module_feature_report_resolve_plugin),
            ]
        }
        ServerContextType::PagesApi { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {
            vec![ResolvedVc::upcast(module_feature_report_resolve_plugin)]
        }
    };

    let after_resolve_plugins = match ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesApi { .. } => {
            vec![
                ResolvedVc::upcast(next_node_shared_runtime_plugin),
                ResolvedVc::upcast(external_cjs_modules_plugin),
                ResolvedVc::upcast(next_external_plugin),
            ]
        }
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. } => {
            vec![
                ResolvedVc::upcast(next_node_shared_runtime_plugin),
                ResolvedVc::upcast(server_external_packages_plugin),
                ResolvedVc::upcast(next_external_plugin),
            ]
        }
        ServerContextType::Middleware { .. } | ServerContextType::Instrumentation { .. } => {
            vec![
                ResolvedVc::upcast(next_node_shared_runtime_plugin),
                ResolvedVc::upcast(server_external_packages_plugin),
                ResolvedVc::upcast(next_external_plugin),
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
        ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {
            before_resolve_plugins.push(ResolvedVc::upcast(invalid_client_only_resolve_plugin));
            before_resolve_plugins.push(ResolvedVc::upcast(
                invalid_styled_jsx_client_only_resolve_plugin,
            ));
        }
        ServerContextType::AppSSR { .. } => {
            //[TODO] Build error in this context makes rsc-build-error.ts fail which expects runtime error code
            // looks like webpack and turbopack have different order, webpack runs rsc transform first, turbopack triggers resolve plugin first.
        }
    }

    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(root_dir.clone()),
        enable_node_externals: true,
        enable_node_native_modules: true,
        module: true,
        custom_conditions,
        import_map: Some(next_server_import_map),
        fallback_import_map: Some(next_server_fallback_import_map),
        before_resolve_plugins,
        after_resolve_plugins,
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
            foreign_code_context_condition,
            resolve_options_context.clone().resolved_cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

#[turbo_tasks::function]
async fn next_server_defines(define_env: Vc<OptionEnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*define_env.await?).cell())
}

#[turbo_tasks::function]
async fn next_server_free_vars(define_env: Vc<OptionEnvMap>) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(..defines(&*define_env.await?).into_iter()).cell())
}

#[turbo_tasks::function]
pub async fn get_server_compile_time_info(
    cwd: Vc<FileSystemPath>,
    define_env: Vc<OptionEnvMap>,
    node_version: ResolvedVc<NodeJsVersion>,
) -> Result<Vc<CompileTimeInfo>> {
    CompileTimeInfo::builder(
        Environment::new(ExecutionEnvironment::NodeJsLambda(
            NodeJsEnvironment {
                compile_target: CompileTarget::current().to_resolved().await?,
                node_version,
                cwd: ResolvedVc::cell(Some(cwd.owned().await?)),
            }
            .resolved_cell(),
        ))
        .to_resolved()
        .await?,
    )
    .defines(next_server_defines(define_env).to_resolved().await?)
    .free_var_references(next_server_free_vars(define_env).to_resolved().await?)
    .cell()
    .await
}

#[turbo_tasks::function]
pub async fn get_tracing_compile_time_info() -> Result<Vc<CompileTimeInfo>> {
    CompileTimeInfo::builder(
        Environment::new(ExecutionEnvironment::NodeJsLambda(
            NodeJsEnvironment::default().resolved_cell(),
        ))
        .to_resolved()
        .await?,
    )
    /*
    We'd really like to set `process.env.NODE_ENV = "production"` here, but with that,
    `react/cjs/react.development.js` won't be copied anymore (as expected).
    However if you `import` react from native ESM: `import {createContext} from 'react';`, it fails with
    ```
    import {createContext} from 'react';
            ^^^^^^^^^^^^^
    SyntaxError: Named export 'createContext' not found. The requested module 'react' is a CommonJS module, which may not support all module.exports as named exports.
    CommonJS modules can always be imported via the default export, for example using:
    ```
    This is because Node's import-cjs-from-esm feature can correctly find all named exports in
    ```
    // `react/index.js`
    if (process.env.NODE_ENV === 'production') {
      module.exports = require('./cjs/react.production.js');
    } else {
      module.exports = require('./cjs/react.development.js');
    }
    ```
    if both files exist (which is what's happening so far).
    If `react.development.js` doesn't exist, then it bails with that error message.
    Also just removing that second branch works fine, but a `require` to a non-existent file fails.
    */
    .defines(
        compile_time_defines!(
            process.env.TURBOPACK = true,
            // process.env.NODE_ENV = "production",
        )
        .resolved_cell(),
    )
    .cell()
    .await
}

#[turbo_tasks::function]
pub async fn get_server_module_options_context(
    project_path: FileSystemPath,
    execution_context: ResolvedVc<ExecutionContext>,
    ty: ServerContextType,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    next_runtime: NextRuntime,
    encryption_key: ResolvedVc<RcStr>,
    environment: ResolvedVc<Environment>,
    client_environment: ResolvedVc<Environment>,
) -> Result<Vc<ModuleOptionsContext>> {
    let next_mode = mode.await?;
    let mut next_server_rules = get_next_server_transforms_rules(
        next_config,
        ty.clone(),
        mode,
        false,
        next_runtime,
        encryption_key,
    )
    .await?;
    let mut foreign_next_server_rules = get_next_server_transforms_rules(
        next_config,
        ty.clone(),
        mode,
        true,
        next_runtime,
        encryption_key,
    )
    .await?;
    let mut internal_custom_rules = get_next_server_internal_transforms_rules(
        ty.clone(),
        next_config.mdx_rs().await?.is_some(),
    )
    .await?;

    let foreign_code_context_condition =
        foreign_code_context_condition(next_config, project_path.clone()).await?;
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
        // For node_modules we don't want to resolve postcss config relative to the file
        // being compiled, instead it only uses the project root postcss
        // config.
        config_location: PostCssConfigLocation::ProjectPath,
        ..postcss_transform_options.clone()
    };
    let enable_postcss_transform = Some(postcss_transform_options.resolved_cell());
    let enable_foreign_postcss_transform = Some(postcss_foreign_transform_options.resolved_cell());

    let mut loader_conditions = BTreeSet::new();
    loader_conditions.extend(mode.await?.webpack_loader_conditions());
    loader_conditions.extend(next_runtime.webpack_loader_conditions());

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

    let tsconfig_path = next_config
        .typescript_tsconfig_path()
        .await?
        .as_ref()
        .map(|p| project_path.join(p))
        .transpose()?;

    // ModuleOptionsContext related options
    let tsconfig = get_typescript_transform_options(project_path.clone(), tsconfig_path.clone())
        .to_resolved()
        .await?;
    let decorators_options =
        get_decorators_transform_options(project_path.clone(), tsconfig_path.clone());
    let enable_mdx_rs = *next_config.mdx_rs().await?;

    // Get the jsx transform options for the `client` side.
    // This matches to the behavior of existing webpack config, if issuer layer is
    // ssr or pages-browser (client bundle for the browser)
    // applies client specific swc transforms.
    //
    // This enables correct emotion transform and other hydration between server and
    // client bundles. ref: https://github.com/vercel/next.js/blob/4bbf9b6c70d2aa4237defe2bebfa790cdb7e334e/packages/next/src/build/webpack-config.ts#L1421-L1426
    let jsx_runtime_options = get_jsx_transform_options(
        project_path.clone(),
        mode,
        None,
        false,
        next_config,
        tsconfig_path.clone(),
    )
    .to_resolved()
    .await?;
    let rsc_jsx_runtime_options = get_jsx_transform_options(
        project_path.clone(),
        mode,
        None,
        true,
        next_config,
        tsconfig_path,
    )
    .to_resolved()
    .await?;

    // A set of custom ecma transform rules being applied to server context.
    let source_transform_rules: Vec<ModuleRule> = vec![
        get_swc_ecma_transform_plugin_rule(next_config, project_path.clone()).await?,
        get_relay_transform_rule(next_config, project_path.clone()).await?,
        get_emotion_transform_rule(next_config).await?,
        get_react_remove_properties_transform_rule(next_config).await?,
        get_remove_console_transform_rule(next_config).await?,
    ]
    .into_iter()
    .flatten()
    .collect();

    // Only relevant for pages, not routes/etc.
    let page_transform_rules: Vec<ModuleRule> = vec![
        get_styled_components_transform_rule(next_config).await?,
        // It's important the client's browserlist config is used for styled-jsx, otherwise we
        // transpile the CSS to be compatible with Node.js 20.
        get_styled_jsx_transform_rule(next_config, client_environment.runtime_versions()).await?,
    ]
    .into_iter()
    .flatten()
    .collect();

    let source_maps = if *next_config.server_source_maps().await? {
        SourceMapsType::Full
    } else {
        SourceMapsType::None
    };
    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typeof_window_inlining: Some(TypeofWindow::Undefined),
            import_externals: *next_config.import_externals().await?,
            ignore_dynamic_requests: true,
            source_maps,
            ..Default::default()
        },
        execution_context: Some(execution_context),
        environment: Some(environment),
        css: CssOptionsContext {
            source_maps,
            module_css_condition: Some(module_styles_rule_condition()),
            ..Default::default()
        },
        tree_shaking_mode: tree_shaking_mode_for_user_code,
        side_effect_free_packages: next_config.optimize_package_imports().owned().await?,
        analyze_mode: if next_mode.is_development() {
            AnalyzeMode::CodeGeneration
        } else {
            AnalyzeMode::CodeGenerationAndTracing
        },
        enable_externals_tracing: if next_mode.is_production() {
            Some(
                ExternalsTracingOptions {
                    tracing_root: project_path,
                    compile_time_info: get_tracing_compile_time_info().to_resolved().await?,
                }
                .resolved_cell(),
            )
        } else {
            None
        },
        keep_last_successful_parse: next_mode.is_development(),

        ..Default::default()
    };

    let module_options_context = match ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesApi { .. } => {
            next_server_rules.extend(page_transform_rules);
            if let ServerContextType::Pages { .. } = ty {
                next_server_rules.push(
                    get_next_react_server_components_transform_rule(next_config, false, None)
                        .await?,
                );
            }

            next_server_rules.extend(source_transform_rules);

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
                ecmascript: EcmascriptOptionsContext {
                    esm_url_rewrite_behavior: url_rewrite_behavior,
                    ..module_options_context.ecmascript
                },
                ..module_options_context
            };

            let foreign_code_module_options_context = ModuleOptionsContext {
                module_rules: foreign_next_server_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode: tree_shaking_mode_for_foreign_code,
                ..module_options_context.clone()
            };

            let internal_module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_typescript_transform: Some(
                        TypescriptTransformOptions::default().resolved_cell(),
                    ),
                    enable_jsx: Some(JsxTransformOptions::default().resolved_cell()),
                    ..module_options_context.ecmascript.clone()
                },
                module_rules: foreign_next_server_rules,
                ..module_options_context.clone()
            };

            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_jsx: Some(jsx_runtime_options),
                    enable_typescript_transform: Some(tsconfig),
                    enable_decorators: Some(decorators_options.to_resolved().await?),
                    ..module_options_context.ecmascript
                },
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_mdx_rs,
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.resolved_cell(),
                    ),
                    (
                        internal_assets_conditions().await?,
                        internal_module_options_context.resolved_cell(),
                    ),
                ],
                module_rules: next_server_rules,
                ..module_options_context
            }
        }
        ServerContextType::AppSSR { app_dir, .. } => {
            foreign_next_server_rules.extend(internal_custom_rules);

            next_server_rules.extend(page_transform_rules.clone());
            next_server_rules.push(
                get_next_react_server_components_transform_rule(next_config, false, Some(app_dir))
                    .await?,
            );
            next_server_rules.extend(source_transform_rules);

            let foreign_code_module_options_context = ModuleOptionsContext {
                module_rules: foreign_next_server_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode: tree_shaking_mode_for_foreign_code,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_typescript_transform: Some(
                        TypescriptTransformOptions::default().resolved_cell(),
                    ),
                    ..module_options_context.ecmascript.clone()
                },
                module_rules: foreign_next_server_rules,
                ..module_options_context.clone()
            };

            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_jsx: Some(jsx_runtime_options),
                    enable_typescript_transform: Some(tsconfig),
                    enable_decorators: Some(decorators_options.to_resolved().await?),
                    ..module_options_context.ecmascript
                },
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_mdx_rs,
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.resolved_cell(),
                    ),
                    (
                        internal_assets_conditions().await?,
                        internal_module_options_context.resolved_cell(),
                    ),
                ],
                module_rules: next_server_rules,
                ..module_options_context
            }
        }
        ServerContextType::AppRSC {
            app_dir,
            ecmascript_client_reference_transition_name,
            ..
        } => {
            next_server_rules.extend(page_transform_rules);

            let client_directive_transformer = ecmascript_client_reference_transition_name.map(
                |ecmascript_client_reference_transition_name| {
                    get_ecma_transform_rule(
                        Box::new(ClientDirectiveTransformer::new(
                            ecmascript_client_reference_transition_name,
                        )),
                        enable_mdx_rs.is_some(),
                        EcmascriptTransformStage::Preprocess,
                    )
                },
            );

            foreign_next_server_rules.extend(client_directive_transformer.clone());
            foreign_next_server_rules.extend(internal_custom_rules);

            next_server_rules.extend(client_directive_transformer.clone());
            next_server_rules.push(
                get_next_react_server_components_transform_rule(next_config, true, Some(app_dir))
                    .await?,
            );

            next_server_rules.extend(source_transform_rules);

            let foreign_code_module_options_context = ModuleOptionsContext {
                module_rules: foreign_next_server_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode: tree_shaking_mode_for_foreign_code,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_typescript_transform: Some(
                        TypescriptTransformOptions::default().resolved_cell(),
                    ),
                    ..module_options_context.ecmascript.clone()
                },
                module_rules: foreign_next_server_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_jsx: Some(rsc_jsx_runtime_options),
                    enable_typescript_transform: Some(tsconfig),
                    enable_decorators: Some(decorators_options.to_resolved().await?),
                    ..module_options_context.ecmascript
                },
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_mdx_rs,
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.resolved_cell(),
                    ),
                    (
                        internal_assets_conditions().await?,
                        internal_module_options_context.resolved_cell(),
                    ),
                ],
                module_rules: next_server_rules,
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
                    EcmascriptTransformStage::Preprocess,
                ));
            }

            next_server_rules.extend(common_next_server_rules.iter().cloned());
            internal_custom_rules.extend(common_next_server_rules);

            let module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Full),
                    ..module_options_context.ecmascript
                },
                ..module_options_context
            };
            let foreign_code_module_options_context = ModuleOptionsContext {
                module_rules: internal_custom_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode: tree_shaking_mode_for_foreign_code,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_typescript_transform: Some(
                        TypescriptTransformOptions::default().resolved_cell(),
                    ),
                    ..module_options_context.ecmascript.clone()
                },
                module_rules: internal_custom_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_jsx: Some(rsc_jsx_runtime_options),
                    enable_typescript_transform: Some(tsconfig),
                    enable_decorators: Some(decorators_options.to_resolved().await?),
                    ..module_options_context.ecmascript
                },
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_mdx_rs,
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.resolved_cell(),
                    ),
                    (
                        internal_assets_conditions().await?,
                        internal_module_options_context.resolved_cell(),
                    ),
                ],
                module_rules: next_server_rules,
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
            let custom_source_transform_rules: Vec<ModuleRule> = vec![
                if let Some(ecmascript_client_reference_transition_name) =
                    ecmascript_client_reference_transition_name
                {
                    get_ecma_transform_rule(
                        Box::new(ClientDirectiveTransformer::new(
                            ecmascript_client_reference_transition_name,
                        )),
                        enable_mdx_rs.is_some(),
                        EcmascriptTransformStage::Preprocess,
                    )
                } else {
                    get_ecma_transform_rule(
                        Box::new(ClientDisallowedDirectiveTransformer::new(
                            "next/dist/client/use-client-disallowed.js".to_string(),
                        )),
                        enable_mdx_rs.is_some(),
                        EcmascriptTransformStage::Preprocess,
                    )
                },
                get_next_react_server_components_transform_rule(next_config, true, app_dir).await?,
            ];

            internal_custom_rules.extend(custom_source_transform_rules.iter().cloned());

            next_server_rules.extend(custom_source_transform_rules);
            next_server_rules.extend(source_transform_rules);

            let module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Full),
                    ..module_options_context.ecmascript
                },
                ..module_options_context
            };
            let foreign_code_module_options_context = ModuleOptionsContext {
                module_rules: internal_custom_rules.clone(),
                enable_webpack_loaders: foreign_enable_webpack_loaders,
                // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
                enable_postcss_transform: enable_foreign_postcss_transform,
                tree_shaking_mode: tree_shaking_mode_for_foreign_code,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_typescript_transform: Some(
                        TypescriptTransformOptions::default().resolved_cell(),
                    ),
                    ..module_options_context.ecmascript.clone()
                },
                module_rules: internal_custom_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_jsx: Some(jsx_runtime_options),
                    enable_typescript_transform: Some(tsconfig),
                    enable_decorators: Some(decorators_options.to_resolved().await?),
                    ..module_options_context.ecmascript
                },
                enable_webpack_loaders,
                enable_postcss_transform,
                enable_mdx_rs,
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.resolved_cell(),
                    ),
                    (
                        internal_assets_conditions().await?,
                        internal_module_options_context.resolved_cell(),
                    ),
                ],
                module_rules: next_server_rules,
                ..module_options_context
            }
        }
    }
    .cell();

    Ok(module_options_context)
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, TaskInput, TraceRawVcs, Serialize, Deserialize)]
pub struct ServerChunkingContextOptions {
    pub mode: Vc<NextMode>,
    pub root_path: FileSystemPath,
    pub node_root: FileSystemPath,
    pub node_root_to_root_path: RcStr,
    pub environment: Vc<Environment>,
    pub module_id_strategy: Vc<Box<dyn ModuleIdStrategy>>,
    pub export_usage: Vc<OptionExportUsageInfo>,
    pub turbo_minify: Vc<bool>,
    pub turbo_source_maps: Vc<bool>,
    pub no_mangling: Vc<bool>,
    pub scope_hoisting: Vc<bool>,
    pub debug_ids: Vc<bool>,
    pub client_root: FileSystemPath,
    pub asset_prefix: RcStr,
}

/// Like `get_server_chunking_context` but all assets are emitted as client assets (so `/_next`)
#[turbo_tasks::function]
pub async fn get_server_chunking_context_with_client_assets(
    options: ServerChunkingContextOptions,
) -> Result<Vc<NodeJsChunkingContext>> {
    let ServerChunkingContextOptions {
        mode,
        root_path,
        node_root,
        node_root_to_root_path,
        environment,
        module_id_strategy,
        export_usage,
        turbo_minify,
        turbo_source_maps,
        no_mangling,
        scope_hoisting,
        debug_ids,
        client_root,
        asset_prefix,
    } = options;

    let next_mode = mode.await?;
    // TODO(alexkirsz) This should return a trait that can be implemented by the
    // different server chunking contexts. OR the build chunking context should
    // support both production and development modes.
    let mut builder = NodeJsChunkingContext::builder(
        root_path,
        node_root.clone(),
        node_root_to_root_path,
        client_root.clone(),
        node_root.join("server/chunks/ssr")?,
        client_root.join("static/media")?,
        environment.to_resolved().await?,
        next_mode.runtime_type(),
    )
    .asset_prefix(Some(asset_prefix))
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
    .export_usage(*export_usage.await?)
    .file_tracing(next_mode.is_production())
    .debug_ids(*debug_ids.await?);

    if next_mode.is_development() {
        builder = builder.use_file_source_map_uris();
    } else {
        builder = builder
            .chunking_config(
                Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    min_chunk_size: 20_000,
                    max_chunk_count_per_group: 100,
                    max_merge_chunk_size: 100_000,
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

    Ok(builder.build())
}

// By default, assets are server assets, but the StructuredImageModuleType ones are on the client
#[turbo_tasks::function]
pub async fn get_server_chunking_context(
    options: ServerChunkingContextOptions,
) -> Result<Vc<NodeJsChunkingContext>> {
    let ServerChunkingContextOptions {
        mode,
        root_path,
        node_root,
        node_root_to_root_path,
        environment,
        module_id_strategy,
        export_usage,
        turbo_minify,
        turbo_source_maps,
        no_mangling,
        scope_hoisting,
        debug_ids,
        client_root,
        asset_prefix,
    } = options;
    let next_mode = mode.await?;
    // TODO(alexkirsz) This should return a trait that can be implemented by the
    // different server chunking contexts. OR the build chunking context should
    // support both production and development modes.
    let mut builder = NodeJsChunkingContext::builder(
        root_path,
        node_root.clone(),
        node_root_to_root_path,
        node_root.clone(),
        node_root.join("server/chunks")?,
        node_root.join("server/assets")?,
        environment.to_resolved().await?,
        next_mode.runtime_type(),
    )
    .client_roots_override(rcstr!("client"), client_root.clone())
    .asset_root_path_override(rcstr!("client"), client_root.join("static/media")?)
    .asset_prefix_override(rcstr!("client"), asset_prefix)
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
    .export_usage(*export_usage.await?)
    .file_tracing(next_mode.is_production())
    .debug_ids(*debug_ids.await?);

    if next_mode.is_development() {
        builder = builder.use_file_source_map_uris()
    } else {
        builder = builder
            .chunking_config(
                Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                ChunkingConfig {
                    min_chunk_size: 20_000,
                    max_chunk_count_per_group: 100,
                    max_merge_chunk_size: 100_000,
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

    Ok(builder.build())
}
