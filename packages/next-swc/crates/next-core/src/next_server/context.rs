use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::{
    turbo::{
        tasks_env::{EnvMap, ProcessEnv},
        tasks_fs::FileSystemPath,
    },
    turbopack::{
        build::{BuildChunkingContext, MinifyType},
        core::{
            compile_time_defines,
            compile_time_info::{
                CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, FreeVarReferences,
            },
            environment::{Environment, ExecutionEnvironment, NodeJsEnvironment, ServerAddr},
            free_var_references,
            resolve::{parse::Request, pattern::Pattern},
        },
        ecmascript::TransformPlugin,
        ecmascript_plugin::transform::directives::client::ClientDirectiveTransformer,
        node::execution_context::ExecutionContext,
        turbopack::{
            condition::ContextCondition,
            module_options::{
                CustomEcmascriptTransformPlugins, JsxTransformOptions, MdxTransformModuleOptions,
                ModuleOptionsContext, PostCssTransformOptions, TypescriptTransformOptions,
                WebpackLoadersOptions,
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
    babel::maybe_add_babel_loader,
    embed_js::next_js_fs,
    mode::NextMode,
    next_build::{get_external_next_compiled_package_mapping, get_postcss_package_mapping},
    next_client::{RuntimeEntries, RuntimeEntry},
    next_config::NextConfig,
    next_import_map::{get_next_server_import_map, mdx_import_source_file},
    next_server::resolve::ExternalPredicate,
    next_shared::{
        resolve::{
            ModuleFeatureReportResolvePlugin, NextExternalResolvePlugin,
            NextNodeSharedRuntimeResolvePlugin, UnsupportedModulesResolvePlugin,
        },
        transforms::{
            emotion::get_emotion_transform_plugin, get_relay_transform_plugin,
            styled_components::get_styled_components_transform_plugin,
            styled_jsx::get_styled_jsx_transform_plugin,
            swc_ecma_transform_plugins::get_swc_ecma_transform_plugin,
        },
    },
    sass::maybe_add_sass_loader,
    transform_options::{
        get_decorators_transform_options, get_jsx_transform_options,
        get_typescript_transform_options,
    },
    util::{foreign_code_context_condition, load_next_js_templateon},
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum ServerContextType {
    Pages {
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
        ecmascript_client_reference_transition_name: Option<Vc<String>>,
        client_transition: Option<Vc<Box<dyn Transition>>>,
    },
    AppRoute {
        app_dir: Vc<FileSystemPath>,
    },
    Middleware,
}

#[turbo_tasks::function]
pub async fn get_server_resolve_options_context(
    project_path: Vc<FileSystemPath>,
    ty: Value<ServerContextType>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_server_import_map =
        get_next_server_import_map(project_path, ty, mode, next_config, execution_context);
    let foreign_code_context_condition =
        foreign_code_context_condition(next_config, project_path).await?;
    let root_dir = project_path.root().resolve().await?;
    let module_feature_report_resolve_plugin = ModuleFeatureReportResolvePlugin::new(project_path);
    let unsupported_modules_resolve_plugin = UnsupportedModulesResolvePlugin::new(project_path);

    // Always load these predefined packages as external.
    let mut external_packages: Vec<String> = load_next_js_templateon(
        project_path,
        "dist/lib/server-external-packages.json".to_string(),
    )
    .await?;

    // Add the config's own list of external packages.
    external_packages.extend(
        (*next_config.server_component_externals().await?)
            .iter()
            .cloned(),
    );

    let server_component_externals_plugin = ExternalCjsModulesResolvePlugin::new(
        project_path,
        project_path.root(),
        ExternalPredicate::Only(Vc::cell(external_packages)).cell(),
    );
    let ty = ty.into_value();

    let mut custom_conditions = vec![mode.node_env().to_string(), "node".to_string()];

    match ty {
        ServerContextType::AppRSC { .. } => custom_conditions.push("react-server".to_string()),
        ServerContextType::AppRoute { .. }
        | ServerContextType::Pages { .. }
        | ServerContextType::PagesData { .. }
        | ServerContextType::AppSSR { .. }
        | ServerContextType::Middleware { .. } => {}
    };
    let external_cjs_modules_plugin = ExternalCjsModulesResolvePlugin::new(
        project_path,
        project_path.root(),
        ExternalPredicate::AllExcept(next_config.transpile_packages()).cell(),
    );

    let next_external_plugin = NextExternalResolvePlugin::new(project_path);
    let next_node_shared_runtime_plugin =
        NextNodeSharedRuntimeResolvePlugin::new(project_path, Value::new(ty));

    let plugins = match ty {
        ServerContextType::Pages { .. } | ServerContextType::PagesData { .. } => {
            vec![
                Vc::upcast(module_feature_report_resolve_plugin),
                Vc::upcast(external_cjs_modules_plugin),
                Vc::upcast(unsupported_modules_resolve_plugin),
                Vc::upcast(next_external_plugin),
                Vc::upcast(next_node_shared_runtime_plugin),
            ]
        }
        ServerContextType::AppSSR { .. }
        | ServerContextType::AppRSC { .. }
        | ServerContextType::AppRoute { .. }
        | ServerContextType::Middleware { .. } => {
            vec![
                Vc::upcast(module_feature_report_resolve_plugin),
                Vc::upcast(server_component_externals_plugin),
                Vc::upcast(unsupported_modules_resolve_plugin),
                Vc::upcast(next_external_plugin),
                Vc::upcast(next_node_shared_runtime_plugin),
            ]
        }
    };
    let resolve_options_context = ResolveOptionsContext {
        enable_node_modules: Some(root_dir),
        enable_node_externals: true,
        enable_node_native_modules: true,
        module: true,
        custom_conditions,
        import_map: Some(next_server_import_map),
        plugins,
        ..Default::default()
    };

    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        rules: vec![(
            foreign_code_context_condition,
            resolve_options_context.clone().cell(),
        )],
        ..resolve_options_context
    }
    .cell())
}

fn defines(
    mode: NextMode,
    define_env: &IndexMap<String, String>,
    server_actions: bool,
) -> CompileTimeDefines {
    let mut defines = compile_time_defines!(
        process.turbopack = true,
        process.env.NEXT_RUNTIME = "nodejs",
        process.env.NODE_ENV = mode.node_env(),
        process.env.TURBOPACK = true,
        process.env.__NEXT_EXPERIMENTAL_REACT = server_actions,
    );

    for (k, v) in define_env {
        defines
            .0
            .entry(k.split('.').map(|s| s.to_string()).collect())
            .or_insert_with(|| CompileTimeDefineValue::JSON(v.clone()));
    }

    defines
}

#[turbo_tasks::function]
async fn next_server_defines(
    mode: NextMode,
    define_env: Vc<EnvMap>,
    server_actions: Vc<bool>,
) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(mode, &*define_env.await?, *server_actions.await?).cell())
}

#[turbo_tasks::function]
async fn next_server_free_vars(
    mode: NextMode,
    define_env: Vc<EnvMap>,
    server_actions: Vc<bool>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..defines(mode, &*define_env.await?, *server_actions.await?).into_iter()
    )
    .cell())
}

#[turbo_tasks::function]
pub async fn get_server_compile_time_info(
    mode: NextMode,
    process_env: Vc<Box<dyn ProcessEnv>>,
    server_addr: Vc<ServerAddr>,
    define_env: Vc<EnvMap>,
    next_config: Vc<NextConfig>,
) -> Vc<CompileTimeInfo> {
    let server_actions = next_config.enable_server_actions();
    CompileTimeInfo::builder(Environment::new(Value::new(
        ExecutionEnvironment::NodeJsLambda(NodeJsEnvironment::current(process_env, server_addr)),
    )))
    .defines(next_server_defines(mode, define_env, server_actions))
    .free_var_references(next_server_free_vars(mode, define_env, server_actions))
    .cell()
}

#[turbo_tasks::function]
pub async fn get_server_module_options_context(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    ty: Value<ServerContextType>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
) -> Result<Vc<ModuleOptionsContext>> {
    let custom_rules = get_next_server_transforms_rules(next_config, ty.into_value(), mode).await?;
    let internal_custom_rules = get_next_server_internal_transforms_rules(ty.into_value()).await?;

    let foreign_code_context_condition =
        foreign_code_context_condition(next_config, project_path).await?;
    let enable_postcss_transform = Some(PostCssTransformOptions {
        postcss_package: Some(get_postcss_package_mapping(project_path)),
        ..Default::default()
    });

    // A separate webpack rules will be applied to codes matching
    // foreign_code_context_condition. This allows to import codes from
    // node_modules that requires webpack loaders, which next-dev implicitly
    // does by default.
    let foreign_webpack_rules = maybe_add_sass_loader(
        next_config.sass_config(),
        *next_config.webpack_rules().await?,
    )
    .await?;
    let foreign_webpack_loaders = foreign_webpack_rules.map(|rules| {
        WebpackLoadersOptions {
            rules,
            loader_runner_package: Some(get_external_next_compiled_package_mapping(Vc::cell(
                "loader-runner".to_owned(),
            ))),
        }
        .cell()
    });

    // Now creates a webpack rules that applies to all codes.
    let webpack_rules = *foreign_webpack_rules.clone();
    let webpack_rules = *maybe_add_babel_loader(project_path, webpack_rules).await?;
    let enable_webpack_loaders = webpack_rules.map(|rules| {
        WebpackLoadersOptions {
            rules,
            loader_runner_package: Some(get_external_next_compiled_package_mapping(Vc::cell(
                "loader-runner".to_owned(),
            ))),
        }
        .cell()
    });

    // EcmascriptTransformPlugins for custom transforms
    let styled_components_transform_plugin =
        *get_styled_components_transform_plugin(next_config).await?;
    let styled_jsx_transform_plugin = *get_styled_jsx_transform_plugin().await?;

    // ModuleOptionsContext related options
    let tsconfig = get_typescript_transform_options(project_path);
    let decorators_options = get_decorators_transform_options(project_path);
    let enable_mdx_rs = if *next_config.mdx_rs().await? {
        Some(
            MdxTransformModuleOptions {
                provider_import_source: Some(mdx_import_source_file()),
            }
            .cell(),
        )
    } else {
        None
    };
    let jsx_runtime_options =
        get_jsx_transform_options(project_path, mode, None, true, next_config);

    let source_transforms: Vec<Vc<TransformPlugin>> = vec![
        *get_swc_ecma_transform_plugin(project_path, next_config).await?,
        *get_relay_transform_plugin(next_config).await?,
        *get_emotion_transform_plugin(next_config).await?,
    ]
    .into_iter()
    .flatten()
    .collect();

    let output_transforms = vec![];

    let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
        CustomEcmascriptTransformPlugins {
            source_transforms: source_transforms.clone(),
            output_transforms: output_transforms.clone(),
        },
    ));

    let module_options_context = match ty.into_value() {
        ServerContextType::Pages { .. } | ServerContextType::PagesData { .. } => {
            let mut base_source_transforms: Vec<Vc<TransformPlugin>> = vec![
                styled_components_transform_plugin,
                styled_jsx_transform_plugin,
            ]
            .into_iter()
            .flatten()
            .collect();

            base_source_transforms.extend(source_transforms);

            let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
                CustomEcmascriptTransformPlugins {
                    source_transforms: base_source_transforms,
                    output_transforms,
                },
            ));

            let module_options_context = ModuleOptionsContext {
                execution_context: Some(execution_context),
                ..Default::default()
            };

            let foreign_code_module_options_context = ModuleOptionsContext {
                custom_rules: internal_custom_rules.clone(),
                enable_webpack_loaders: foreign_webpack_loaders,
                ..module_options_context.clone()
            };

            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                enable_jsx: Some(JsxTransformOptions::default().cell()),
                custom_rules: internal_custom_rules,
                ..module_options_context.clone()
            };

            ModuleOptionsContext {
                enable_jsx: Some(jsx_runtime_options),
                enable_postcss_transform,
                enable_webpack_loaders,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.cell(),
                    ),
                    (
                        ContextCondition::InPath(next_js_fs().root()),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules,
                custom_ecma_transform_plugins,
                ..module_options_context
            }
        }
        ServerContextType::AppSSR { .. } => {
            let mut base_source_transforms: Vec<Vc<TransformPlugin>> = vec![
                styled_components_transform_plugin,
                styled_jsx_transform_plugin,
            ]
            .into_iter()
            .flatten()
            .collect();

            let base_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
                CustomEcmascriptTransformPlugins {
                    source_transforms: base_source_transforms.clone(),
                    output_transforms: vec![],
                },
            ));

            base_source_transforms.extend(source_transforms);

            let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
                CustomEcmascriptTransformPlugins {
                    source_transforms: base_source_transforms,
                    output_transforms,
                },
            ));

            let module_options_context = ModuleOptionsContext {
                custom_ecma_transform_plugins: base_ecma_transform_plugins,
                execution_context: Some(execution_context),
                ..Default::default()
            };
            let foreign_code_module_options_context = ModuleOptionsContext {
                custom_rules: internal_custom_rules.clone(),
                enable_webpack_loaders: foreign_webpack_loaders,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                custom_rules: internal_custom_rules,
                ..module_options_context.clone()
            };

            ModuleOptionsContext {
                enable_jsx: Some(jsx_runtime_options),
                enable_postcss_transform,
                enable_webpack_loaders,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.cell(),
                    ),
                    (
                        ContextCondition::InPath(next_js_fs().root()),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules,
                custom_ecma_transform_plugins,
                ..module_options_context
            }
        }
        ServerContextType::AppRSC {
            ecmascript_client_reference_transition_name,
            ..
        } => {
            let mut base_source_transforms: Vec<Vc<TransformPlugin>> =
                vec![styled_components_transform_plugin]
                    .into_iter()
                    .flatten()
                    .collect();

            if let Some(ecmascript_client_reference_transition_name) =
                ecmascript_client_reference_transition_name
            {
                base_source_transforms.push(Vc::cell(Box::new(ClientDirectiveTransformer::new(
                    ecmascript_client_reference_transition_name,
                )) as _));
            }

            let base_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
                CustomEcmascriptTransformPlugins {
                    source_transforms: base_source_transforms.clone(),
                    output_transforms: vec![],
                },
            ));

            base_source_transforms.extend(source_transforms);

            let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
                CustomEcmascriptTransformPlugins {
                    source_transforms: base_source_transforms,
                    output_transforms,
                },
            ));

            let module_options_context = ModuleOptionsContext {
                custom_ecma_transform_plugins: base_ecma_transform_plugins,
                execution_context: Some(execution_context),
                ..Default::default()
            };
            let foreign_code_module_options_context = ModuleOptionsContext {
                custom_rules: internal_custom_rules.clone(),
                enable_webpack_loaders: foreign_webpack_loaders,
                ..module_options_context.clone()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                custom_rules: internal_custom_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                enable_jsx: Some(jsx_runtime_options),
                enable_postcss_transform,
                enable_webpack_loaders,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        foreign_code_module_options_context.cell(),
                    ),
                    (
                        ContextCondition::InPath(next_js_fs().root()),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules,
                custom_ecma_transform_plugins,
                ..module_options_context
            }
        }
        ServerContextType::AppRoute { .. } => {
            let module_options_context = ModuleOptionsContext {
                execution_context: Some(execution_context),
                ..Default::default()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                custom_rules: internal_custom_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                enable_postcss_transform,
                enable_webpack_loaders,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        module_options_context.clone().cell(),
                    ),
                    (
                        ContextCondition::InPath(next_js_fs().root()),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules,
                custom_ecma_transform_plugins,
                ..module_options_context
            }
        }
        ServerContextType::Middleware => {
            let mut base_source_transforms: Vec<Vc<TransformPlugin>> = vec![
                styled_components_transform_plugin,
                styled_jsx_transform_plugin,
            ]
            .into_iter()
            .flatten()
            .collect();

            base_source_transforms.extend(source_transforms);

            let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
                CustomEcmascriptTransformPlugins {
                    source_transforms: base_source_transforms,
                    output_transforms,
                },
            ));

            let module_options_context = ModuleOptionsContext {
                execution_context: Some(execution_context),
                ..Default::default()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                custom_rules: internal_custom_rules,
                ..module_options_context.clone()
            };
            ModuleOptionsContext {
                enable_jsx: Some(jsx_runtime_options),
                enable_postcss_transform,
                enable_webpack_loaders,
                enable_typescript_transform: Some(tsconfig),
                enable_mdx_rs,
                decorators: Some(decorators_options),
                rules: vec![
                    (
                        foreign_code_context_condition,
                        module_options_context.clone().cell(),
                    ),
                    (
                        ContextCondition::InPath(next_js_fs().root()),
                        internal_module_options_context.cell(),
                    ),
                ],
                custom_rules,
                custom_ecma_transform_plugins,
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
        ..Default::default()
    }
    .cell()
}

#[turbo_tasks::function]
pub fn get_server_runtime_entries(
    ty: Value<ServerContextType>,
    mode: NextMode,
) -> Vc<RuntimeEntries> {
    let mut runtime_entries = vec![];

    if matches!(mode, NextMode::Build) {
        if let ServerContextType::AppRSC { .. } = ty.into_value() {
            runtime_entries.push(
                RuntimeEntry::Request(
                    Request::parse(Value::new(Pattern::Constant(
                        "./build/server/app-bootstrap.ts".to_string(),
                    ))),
                    next_js_fs().root().join("_".to_string()),
                )
                .cell(),
            );
        }
    }

    Vc::cell(runtime_entries)
}

#[turbo_tasks::function]
pub fn get_server_chunking_context(
    project_path: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    // TODO(alexkirsz) Is this even necessary? Are assets not always on the client chunking context
    // anyway?
    client_root: Vc<FileSystemPath>,
    asset_prefix: Vc<Option<String>>,
    environment: Vc<Environment>,
) -> Vc<BuildChunkingContext> {
    // TODO(alexkirsz) This should return a trait that can be implemented by the
    // different server chunking contexts. OR the build chunking context should
    // support both production and development modes.
    BuildChunkingContext::builder(
        project_path,
        node_root,
        client_root,
        node_root.join("server/chunks".to_string()),
        client_root.join("static/media".to_string()),
        environment,
    )
    .asset_prefix(asset_prefix)
    .minify_type(MinifyType::NoMinify)
    .build()
}
