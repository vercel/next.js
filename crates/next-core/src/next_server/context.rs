use std::collections::BTreeSet;

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{
    module_options::{
        CssOptionsContext, EcmascriptOptionsContext, ExternalsTracingOptions, JsxTransformOptions,
        ModuleOptionsContext, ModuleRule, TypescriptTransformOptions,
        side_effect_free_packages_glob,
    },
    transition::Transition,
};
use turbopack_core::{
    chunk::{
        AssetSuffix, ChunkingConfig, MangleType, MinifyType, SourceMapSourceType, SourceMapsType,
        UnusedReferences, UrlBehavior, chunk_id_strategy::ModuleIdStrategy,
    },
    compile_time_defines,
    compile_time_info::{CompileTimeDefines, CompileTimeInfo, FreeVarReferences},
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment, NodeJsVersion},
    issue::IssueSeverity,
    module_graph::{
        binding_usage_info::OptionBindingUsageInfo, style_groups::StyleGroupsAlgorithm,
    },
    target::CompileTarget,
};
use turbopack_css::chunk::CssChunkType;
use turbopack_ecmascript::{
    AnalyzeMode, CustomTransformer, TransformPlugin, TypeofWindow, chunk::EcmascriptChunkType,
    references::esm::UrlRewriteBehavior, transform::ReactCompilerTarget,
};
use turbopack_ecmascript_plugins::transform::directives::{
    client::ClientDirectiveTransformer, client_disallowed::ClientDisallowedDirectiveTransformer,
};
use turbopack_node::{
    execution_context::ExecutionContext,
    transforms::postcss::{PostCssConfigLocation, PostCssTransformOptions},
};
use turbopack_nodejs::NodeJsChunkingContext;
use turbopack_resolve::resolve_options_context::{ResolveOptionsContext, TsConfigHandling};

use crate::{
    app_structure::CollectedRootParams,
    mode::NextMode,
    next_build::get_postcss_package_mapping,
    next_config::NextConfig,
    next_font::local::NextFontLocalResolvePlugin,
    next_import_map::{get_next_edge_and_server_fallback_import_map, get_next_server_import_map},
    next_server::{
        resolve::{ExternalCjsModulesResolvePlugin, ExternalPredicate},
        transforms::{get_next_server_internal_transforms_rules, get_next_server_transforms_rules},
    },
    next_shared::{
        resolve::{NextExternalResolvePlugin, NextNodeSharedRuntimeResolvePlugin},
        transforms::{
            EcmascriptTransformStage, emotion::get_emotion_transform_rule, get_ecma_transform_rule,
            next_react_server_components::get_next_react_server_components_transform_rule,
            react_remove_properties::get_react_remove_properties_transform_rule,
            relay::get_relay_transform_rule, remove_console::get_remove_console_transform_rule,
            styled_components::get_styled_components_transform_rule,
            styled_jsx::get_styled_jsx_transform_rule,
            swc_ecma_transform_plugins::get_swc_ecma_transform_plugin_rule,
        },
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
        NextRuntime, OptionEnvMap, defines, foreign_code_context_condition,
        free_var_references_with_vercel_system_env_warnings, get_transpiled_packages,
        internal_assets_conditions, load_next_js_jsonc_file, module_styles_rule_condition,
        worker_forwarded_globals,
    },
};

#[turbo_tasks::value(shared, task_input)]
#[derive(Debug, Clone, Hash)]
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
    let next_server_import_map = turbo_tasks::read!(
        get_next_server_import_map(
            project_path.clone(),
            ty.clone(),
            next_config,
            mode,
            execution_context,
            collected_root_params,
        )
        .to_resolved()
    )?;
    let next_server_fallback_import_map = turbo_tasks::read!(
        get_next_edge_and_server_fallback_import_map(project_path.clone(), NextRuntime::NodeJs)
            .to_resolved()
    )?;

    let foreign_code_context_condition = turbo_tasks::read!(foreign_code_context_condition(
        next_config,
        project_path.clone()
    ))?;
    let root_dir = turbo_tasks::read!(project_path.root().owned())?;

    // Always load these predefined packages as external.
    let mut external_packages: Vec<RcStr> = turbo_tasks::read!(load_next_js_jsonc_file(
        project_path.clone(),
        rcstr!("dist/lib/server-external-packages.jsonc"),
    ))?;

    let mut transpiled_packages =
        turbo_tasks::read!(get_transpiled_packages(next_config, project_path.clone()).owned())?;

    transpiled_packages.extend(
        (*turbo_tasks::read!(next_config.optimize_package_imports())?)
            .iter()
            .cloned(),
    );

    let server_external_packages = &*turbo_tasks::read!(next_config.server_external_packages())?;

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

    let server_external_packages_plugin = turbo_tasks::read!(
        ExternalCjsModulesResolvePlugin::new(
            turbo_tasks::read!(project_path.root().owned())?,
            ExternalPredicate::Only(ResolvedVc::cell(external_packages)).cell(),
            *turbo_tasks::read!(next_config.import_externals())?,
        )
        .to_resolved()
    )?;

    let mut custom_conditions: Vec<_> = turbo_tasks::read!(mode)?
        .custom_resolve_conditions()
        .collect();
    custom_conditions.extend(NextRuntime::NodeJs.custom_resolve_conditions());

    if ty.should_use_react_server_condition() {
        custom_conditions.push(rcstr!("react-server"));
    };

    if *turbo_tasks::read!(next_config.enable_cache_components())?
        // Middleware shouldn't use the "next-js" condition because it doesn't have all Next.js APIs available
        && !matches!(ty, ServerContextType::Middleware { .. } |  ServerContextType::Instrumentation { .. })
    {
        custom_conditions.push(rcstr!("next-js"));
    };

    let external_cjs_modules_plugin =
        if *turbo_tasks::read!(next_config.bundle_pages_router_dependencies())? {
            server_external_packages_plugin
        } else {
            turbo_tasks::read!(
                ExternalCjsModulesResolvePlugin::new(
                    turbo_tasks::read!(project_path.root().owned())?,
                    ExternalPredicate::AllExcept(ResolvedVc::cell(transpiled_packages)).cell(),
                    *turbo_tasks::read!(next_config.import_externals())?,
                )
                .to_resolved()
            )?
        };

    let next_external_plugin =
        turbo_tasks::read!(NextExternalResolvePlugin::new(project_path.clone()).to_resolved())?;
    let next_node_shared_runtime_plugin = turbo_tasks::read!(
        NextNodeSharedRuntimeResolvePlugin::new(project_path.clone(), ty.clone()).to_resolved()
    )?;

    let before_resolve_plugins = match &ty {
        ServerContextType::Pages { .. }
        | ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. } => {
            vec![ResolvedVc::upcast(turbo_tasks::read!(
                NextFontLocalResolvePlugin::new(project_path.clone()).to_resolved()
            )?)]
        }
        ServerContextType::PagesApi { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. }
        | ServerContextType::Instrumentation { .. } => {
            vec![]
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
            foreign_code_context_condition,
            resolve_options_context.clone().resolved_cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

#[turbo_tasks::function]
async fn next_server_defines(define_env: Vc<OptionEnvMap>) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(&*turbo_tasks::read!(define_env)?).cell())
}

#[turbo_tasks::function]
async fn next_server_free_vars(
    define_env: Vc<OptionEnvMap>,
    report_system_env_inlining: Vc<IssueSeverity>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references_with_vercel_system_env_warnings(
        defines(&*turbo_tasks::read!(define_env)?),
        *turbo_tasks::read!(report_system_env_inlining)?,
    )
    .cell())
}

#[turbo_tasks::function]
pub async fn get_server_compile_time_info(
    cwd: Vc<FileSystemPath>,
    define_env: Vc<OptionEnvMap>,
    node_version: ResolvedVc<NodeJsVersion>,
    report_system_env_inlining: Vc<IssueSeverity>,
    hot_module_replacement_enabled: bool,
) -> Result<Vc<CompileTimeInfo>> {
    turbo_tasks::read!(
        CompileTimeInfo::builder(turbo_tasks::read!(
            Environment::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment {
                    compile_target: turbo_tasks::read!(CompileTarget::current().to_resolved())?,
                    node_version,
                    cwd: ResolvedVc::cell(Some(turbo_tasks::read!(cwd.owned())?)),
                }
                .resolved_cell(),
            ))
            .to_resolved()
        )?,)
        .defines(turbo_tasks::read!(
            next_server_defines(define_env).to_resolved()
        )?)
        .free_var_references(turbo_tasks::read!(
            next_server_free_vars(define_env, report_system_env_inlining).to_resolved()
        )?,)
        .hot_module_replacement_enabled(hot_module_replacement_enabled)
        .cell()
    )
}

#[turbo_tasks::function]
pub async fn get_tracing_compile_time_info() -> Result<Vc<CompileTimeInfo>> {
    turbo_tasks::read!(
        CompileTimeInfo::builder(turbo_tasks::read!(
            Environment::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment::default().resolved_cell(),
            ))
            .to_resolved()
        )?,)
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
                process.env.TURBOPACK = "1",
                // process.env.NODE_ENV = "production",
            )
            .resolved_cell(),
        )
        .cell()
    )
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
    enable_tracing: bool,
) -> Result<Vc<ModuleOptionsContext>> {
    let next_mode = turbo_tasks::read!(mode)?;
    let mut next_server_rules = turbo_tasks::read!(get_next_server_transforms_rules(
        next_config,
        ty.clone(),
        mode,
        false,
        next_runtime,
        encryption_key,
    ))?;
    let mut foreign_next_server_rules = turbo_tasks::read!(get_next_server_transforms_rules(
        next_config,
        ty.clone(),
        mode,
        true,
        next_runtime,
        encryption_key,
    ))?;
    let mut internal_custom_rules = turbo_tasks::read!(get_next_server_internal_transforms_rules(
        ty.clone(),
        turbo_tasks::read!(next_config.mdx_rs())?.is_some(),
    ))?;

    let foreign_code_context_condition = turbo_tasks::read!(foreign_code_context_condition(
        next_config,
        project_path.clone()
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
        // For node_modules we don't want to resolve postcss config relative to the file
        // being compiled, instead it only uses the project root postcss
        // config.
        config_location: PostCssConfigLocation::ProjectPath,
        ..postcss_transform_options.clone()
    };
    let enable_postcss_transform = Some(postcss_transform_options.resolved_cell());
    let enable_foreign_postcss_transform = Some(postcss_foreign_transform_options.resolved_cell());

    let mut loader_conditions = BTreeSet::new();
    loader_conditions.extend(turbo_tasks::read!(mode)?.webpack_loader_conditions());
    loader_conditions.extend(next_runtime.webpack_loader_conditions());

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

    let tsconfig_path = turbo_tasks::read!(next_config.typescript_tsconfig_path())?
        .as_ref()
        .map(|p| project_path.join(p))
        .transpose()?;

    // ModuleOptionsContext related options
    let tsconfig = turbo_tasks::read!(
        get_typescript_transform_options(project_path.clone(), tsconfig_path.clone()).to_resolved()
    )?;
    let decorators_options =
        get_decorators_transform_options(project_path.clone(), tsconfig_path.clone());
    let enable_mdx_rs = *turbo_tasks::read!(next_config.mdx_rs())?;

    // Get the jsx transform options for the `client` side.
    // This matches to the behavior of existing webpack config, if issuer layer is
    // ssr or pages-browser (client bundle for the browser)
    // applies client specific swc transforms.
    //
    // This enables correct emotion transform and other hydration between server and
    // client bundles. ref: https://github.com/vercel/next.js/blob/4bbf9b6c70d2aa4237defe2bebfa790cdb7e334e/packages/next/src/build/webpack-config.ts#L1421-L1426
    let jsx_runtime_options = turbo_tasks::read!(
        get_jsx_transform_options(
            project_path.clone(),
            mode,
            None,
            false,
            next_config,
            tsconfig_path.clone(),
        )
        .to_resolved()
    )?;
    let rsc_jsx_runtime_options = turbo_tasks::read!(
        get_jsx_transform_options(
            project_path.clone(),
            mode,
            None,
            true,
            next_config,
            tsconfig_path,
        )
        .to_resolved()
    )?;

    // A set of custom ecma transform rules being applied to server context.
    let source_transform_rules: Vec<ModuleRule> = vec![
        turbo_tasks::read!(get_remove_console_transform_rule(next_config))?,
        turbo_tasks::read!(get_react_remove_properties_transform_rule(next_config))?,
        turbo_tasks::read!(get_emotion_transform_rule(next_config))?,
        turbo_tasks::read!(get_relay_transform_rule(next_config, project_path.clone()))?,
        turbo_tasks::read!(get_swc_ecma_transform_plugin_rule(
            next_config,
            project_path.clone()
        ))?,
    ]
    .into_iter()
    .flatten()
    .collect();

    // Only relevant for pages, not routes/etc.
    let page_transform_rules: Vec<ModuleRule> = vec![
        turbo_tasks::read!(get_styled_components_transform_rule(next_config))?,
        // It's important the client's browserlist config is used for styled-jsx, otherwise we
        // transpile the CSS to be compatible with Node.js 20.
        turbo_tasks::read!(get_styled_jsx_transform_rule(
            next_config,
            client_environment.runtime_versions()
        ))?,
    ]
    .into_iter()
    .flatten()
    .collect();

    let enable_rust_react_compiler = *turbo_tasks::read!(next_config.rust_react_compiler())?;
    let rust_react_compiler_target = if enable_rust_react_compiler.is_some() {
        match turbo_tasks::read!(detect_react_compiler_target(&project_path))? {
            Some(ReactCompilerTarget::React18) => ReactCompilerTarget::React18,
            _ => ReactCompilerTarget::React19,
        }
    } else {
        ReactCompilerTarget::React19
    };

    let source_maps = *turbo_tasks::read!(next_config.server_source_maps())?;
    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typeof_window_inlining: Some(TypeofWindow::Undefined),
            enable_import_as_bytes: *turbo_tasks::read!(next_config.turbopack_import_type_bytes())?,
            enable_import_as_text: *turbo_tasks::read!(next_config.turbopack_import_type_text())?,
            import_externals: *turbo_tasks::read!(next_config.import_externals())?,
            ignore_dynamic_requests: true,
            source_maps,
            infer_module_side_effects: *turbo_tasks::read!(
                next_config.turbopack_infer_module_side_effects()
            )?,
            ..Default::default()
        },
        execution_context: Some(execution_context),
        environment: Some(environment),
        css: CssOptionsContext {
            source_maps,
            module_css_condition: Some(module_styles_rule_condition()),
            lightningcss_features: *turbo_tasks::read!(next_config.lightningcss_feature_flags())?,
            ..Default::default()
        },
        tree_shaking_mode: tree_shaking_mode_for_user_code,
        side_effect_free_packages: Some(turbo_tasks::read!(
            side_effect_free_packages_glob(next_config.optimize_package_imports()).to_resolved()
        )?),
        analyze_mode: if enable_tracing {
            AnalyzeMode::CodeGenerationAndTracing
        } else {
            AnalyzeMode::CodeGeneration
        },
        enable_externals_tracing: if enable_tracing {
            Some(
                ExternalsTracingOptions {
                    tracing_root: project_path,
                    compile_time_info: turbo_tasks::read!(
                        get_tracing_compile_time_info().to_resolved()
                    )?,
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
            next_server_rules.extend(source_transform_rules);
            if let ServerContextType::Pages { .. } = ty {
                next_server_rules.push(turbo_tasks::read!(
                    get_next_react_server_components_transform_rule(next_config, false, None)
                )?);
            }
            next_server_rules.extend(page_transform_rules);

            foreign_next_server_rules.extend(internal_custom_rules);

            let (url_rewrite_behavior, static_url_tag) = {
                //https://github.com/vercel/next.js/blob/bbb730e5ef10115ed76434f250379f6f53efe998/packages/next/src/build/webpack-config.ts#L1384
                if let ServerContextType::PagesApi { .. } = ty {
                    (Some(UrlRewriteBehavior::Full), None)
                } else {
                    (Some(UrlRewriteBehavior::Relative), Some(rcstr!("client")))
                }
            };

            let module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    esm_url_rewrite_behavior: url_rewrite_behavior,
                    ..module_options_context.ecmascript
                },
                static_url_tag,
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
                    enable_decorators: Some(turbo_tasks::read!(decorators_options.to_resolved())?),
                    enable_rust_react_compiler: None,
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
                        turbo_tasks::read!(internal_assets_conditions())?,
                        internal_module_options_context.resolved_cell(),
                    ),
                ],
                module_rules: next_server_rules,
                ..module_options_context
            }
        }
        ServerContextType::AppSSR { app_dir, .. } => {
            foreign_next_server_rules.extend(internal_custom_rules);

            next_server_rules.extend(source_transform_rules);
            next_server_rules.push(turbo_tasks::read!(
                get_next_react_server_components_transform_rule(next_config, false, Some(app_dir))
            )?);
            next_server_rules.extend(page_transform_rules.clone());

            let module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Relative),
                    ..module_options_context.ecmascript
                },
                static_url_tag: Some(rcstr!("client")),
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
                    ..module_options_context.ecmascript.clone()
                },
                module_rules: foreign_next_server_rules,
                ..module_options_context.clone()
            };

            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_jsx: Some(jsx_runtime_options),
                    enable_typescript_transform: Some(tsconfig),
                    enable_decorators: Some(turbo_tasks::read!(decorators_options.to_resolved())?),
                    enable_rust_react_compiler,
                    rust_react_compiler_target,
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
                        turbo_tasks::read!(internal_assets_conditions())?,
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
            let client_directive_transformer =
                if let Some(name) = ecmascript_client_reference_transition_name {
                    Some(get_ecma_transform_rule(
                        turbo_tasks::read!(client_directive_transform_plugin(name).to_resolved())?,
                        enable_mdx_rs.is_some(),
                        EcmascriptTransformStage::Preprocess,
                    ))
                } else {
                    None
                };

            foreign_next_server_rules.extend(internal_custom_rules);
            foreign_next_server_rules.extend(client_directive_transformer.clone());

            next_server_rules.extend(source_transform_rules);
            next_server_rules.push(turbo_tasks::read!(
                get_next_react_server_components_transform_rule(next_config, true, Some(app_dir))
            )?);
            next_server_rules.extend(client_directive_transformer.clone());
            next_server_rules.extend(page_transform_rules);

            let module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Relative),
                    ..module_options_context.ecmascript
                },
                static_url_tag: Some(rcstr!("client")),
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
                    ..module_options_context.ecmascript.clone()
                },
                module_rules: foreign_next_server_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_jsx: Some(rsc_jsx_runtime_options),
                    enable_typescript_transform: Some(tsconfig),
                    enable_decorators: Some(turbo_tasks::read!(decorators_options.to_resolved())?),
                    enable_rust_react_compiler: None,
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
                        turbo_tasks::read!(internal_assets_conditions())?,
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
            let mut common_next_server_rules = vec![turbo_tasks::read!(
                get_next_react_server_components_transform_rule(next_config, true, Some(app_dir))
            )?];

            if let Some(ecmascript_client_reference_transition_name) =
                ecmascript_client_reference_transition_name
            {
                common_next_server_rules.push(get_ecma_transform_rule(
                    turbo_tasks::read!(
                        client_directive_transform_plugin(
                            ecmascript_client_reference_transition_name
                        )
                        .to_resolved()
                    )?,
                    enable_mdx_rs.is_some(),
                    EcmascriptTransformStage::Preprocess,
                ));
            }

            next_server_rules.extend(common_next_server_rules.iter().cloned());
            internal_custom_rules.extend(common_next_server_rules);
            foreign_next_server_rules.extend(internal_custom_rules.clone());

            next_server_rules.extend(source_transform_rules);

            let module_options_context = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    esm_url_rewrite_behavior: Some(UrlRewriteBehavior::Full),
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
                    ..module_options_context.ecmascript.clone()
                },
                module_rules: internal_custom_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    enable_jsx: Some(rsc_jsx_runtime_options),
                    enable_typescript_transform: Some(tsconfig),
                    enable_decorators: Some(turbo_tasks::read!(decorators_options.to_resolved())?),
                    enable_rust_react_compiler: None,
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
                        turbo_tasks::read!(internal_assets_conditions())?,
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
            let directive_transform_rule =
                if let Some(name) = ecmascript_client_reference_transition_name {
                    get_ecma_transform_rule(
                        turbo_tasks::read!(client_directive_transform_plugin(name).to_resolved())?,
                        enable_mdx_rs.is_some(),
                        EcmascriptTransformStage::Preprocess,
                    )
                } else {
                    get_ecma_transform_rule(
                        turbo_tasks::read!(
                            client_disallowed_directive_transform_plugin(rcstr!(
                                "next/dist/client/use-client-disallowed.js"
                            ))
                            .to_resolved()
                        )?,
                        enable_mdx_rs.is_some(),
                        EcmascriptTransformStage::Preprocess,
                    )
                };
            let custom_source_transform_rules: Vec<ModuleRule> = vec![
                directive_transform_rule,
                turbo_tasks::read!(get_next_react_server_components_transform_rule(
                    next_config,
                    true,
                    app_dir
                ))?,
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
                    enable_decorators: Some(turbo_tasks::read!(decorators_options.to_resolved())?),
                    enable_rust_react_compiler: None,
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
                        turbo_tasks::read!(internal_assets_conditions())?,
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

#[turbo_tasks::function]
fn client_directive_transform_plugin(transition_name: RcStr) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(ClientDirectiveTransformer::new(transition_name))
        as Box<dyn CustomTransformer + Send + Sync>)
}

#[turbo_tasks::function]
fn client_disallowed_directive_transform_plugin(error_proxy_module: RcStr) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(ClientDisallowedDirectiveTransformer::new(
        error_proxy_module.to_string(),
    )) as Box<dyn CustomTransformer + Send + Sync>)
}

#[turbo_tasks::task_input(contains_unresolved_vcs)]
#[derive(Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub struct ServerChunkingContextOptions {
    pub mode: Vc<NextMode>,
    pub root_path: FileSystemPath,
    pub node_root: FileSystemPath,
    pub node_root_to_root_path: RcStr,
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
    pub client_root: FileSystemPath,
    pub client_static_folder_name: RcStr,
    pub asset_prefix: RcStr,
    pub css_url_suffix: Vc<Option<RcStr>>,
    pub hash_salt: ResolvedVc<RcStr>,
    pub style_groups_algorithm: StyleGroupsAlgorithm,
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
        unused_references,
        minify,
        source_maps,
        no_mangling,
        scope_hoisting,
        nested_async_chunking,
        debug_ids,
        client_root,
        client_static_folder_name,
        asset_prefix,
        css_url_suffix,
        hash_salt,
        style_groups_algorithm,
    } = options;
    let css_url_suffix = turbo_tasks::read!(css_url_suffix.to_resolved())?;

    let next_mode = turbo_tasks::read!(mode)?;
    // TODO(alexkirsz) This should return a trait that can be implemented by the
    // different server chunking contexts. OR the build chunking context should
    // support both production and development modes.
    let mut builder = NodeJsChunkingContext::builder(
        root_path,
        node_root.clone(),
        node_root_to_root_path,
        client_root.clone(),
        node_root.join("server/chunks/ssr")?,
        client_root
            .join(&client_static_folder_name)?
            .join("media")?,
        turbo_tasks::read!(environment.to_resolved())?,
        next_mode.runtime_type(),
    )
    .asset_prefix(Some(asset_prefix))
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
    .minify_type(if *turbo_tasks::read!(minify)? {
        MinifyType::Minify {
            // React needs deterministic function names to work correctly.
            mangle: (!*turbo_tasks::read!(no_mangling)?).then_some(MangleType::Deterministic),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(*turbo_tasks::read!(source_maps)?)
    .module_id_strategy(turbo_tasks::read!(module_id_strategy.to_resolved())?)
    .export_usage(*turbo_tasks::read!(export_usage)?)
    .unused_references(turbo_tasks::read!(unused_references.to_resolved())?)
    .debug_ids(*turbo_tasks::read!(debug_ids)?)
    .hash_salt(hash_salt)
    .nested_async_availability(*turbo_tasks::read!(nested_async_chunking)?)
    .worker_forwarded_globals(worker_forwarded_globals());

    builder = builder.source_map_source_type(if next_mode.is_development() {
        SourceMapSourceType::AbsoluteFileUri
    } else {
        SourceMapSourceType::RelativeUri
    });
    if next_mode.is_production() {
        builder = builder
            .chunking_config(
                turbo_tasks::read!(Vc::<EcmascriptChunkType>::default().to_resolved())?,
                ChunkingConfig {
                    min_chunk_size: 20_000,
                    max_chunk_count_per_group: 100,
                    max_merge_chunk_size: 100_000,
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
        unused_references,
        minify,
        source_maps,
        no_mangling,
        scope_hoisting,
        nested_async_chunking,
        debug_ids,
        client_root,
        client_static_folder_name,
        asset_prefix,
        css_url_suffix,
        hash_salt,
        style_groups_algorithm,
    } = options;
    let css_url_suffix = turbo_tasks::read!(css_url_suffix.to_resolved())?;
    let next_mode = turbo_tasks::read!(mode)?;
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
    .asset_prefix_override(rcstr!("client"), asset_prefix)
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
    .minify_type(if *turbo_tasks::read!(minify)? {
        MinifyType::Minify {
            mangle: (!*turbo_tasks::read!(no_mangling)?).then_some(MangleType::OptimalSize),
        }
    } else {
        MinifyType::NoMinify
    })
    .source_maps(*turbo_tasks::read!(source_maps)?)
    .module_id_strategy(turbo_tasks::read!(module_id_strategy.to_resolved())?)
    .export_usage(*turbo_tasks::read!(export_usage)?)
    .unused_references(turbo_tasks::read!(unused_references.to_resolved())?)
    .debug_ids(*turbo_tasks::read!(debug_ids)?)
    .hash_salt(hash_salt)
    .nested_async_availability(*turbo_tasks::read!(nested_async_chunking)?)
    .worker_forwarded_globals(worker_forwarded_globals());

    if next_mode.is_development() {
        builder = builder.source_map_source_type(SourceMapSourceType::AbsoluteFileUri);
    } else {
        builder = builder
            .source_map_source_type(SourceMapSourceType::RelativeUri)
            .chunking_config(
                turbo_tasks::read!(Vc::<EcmascriptChunkType>::default().to_resolved())?,
                ChunkingConfig {
                    min_chunk_size: 20_000,
                    max_chunk_count_per_group: 100,
                    max_merge_chunk_size: 100_000,
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

    Ok(builder.build())
}
