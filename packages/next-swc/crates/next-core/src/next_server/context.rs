use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::{
    turbo::{tasks_env::ProcessEnvVc, tasks_fs::FileSystemPathVc},
    turbopack::{
        core::{
            compile_time_defines,
            compile_time_info::{
                CompileTimeDefines, CompileTimeDefinesVc, CompileTimeInfo, CompileTimeInfoVc,
                FreeVarReferencesVc,
            },
            environment::{EnvironmentVc, ExecutionEnvironment, NodeJsEnvironmentVc, ServerAddrVc},
            free_var_references,
        },
        ecmascript::TransformPluginVc,
        ecmascript_plugin::transform::directives::{
            client::ClientDirectiveTransformer, server::ServerDirectiveTransformer,
        },
        node::execution_context::ExecutionContextVc,
        turbopack::{
            condition::ContextCondition,
            module_options::{
                CustomEcmascriptTransformPlugins, CustomEcmascriptTransformPluginsVc,
                JsxTransformOptions, MdxTransformModuleOptions, ModuleOptionsContext,
                ModuleOptionsContextVc, PostCssTransformOptions, TypescriptTransformOptions,
                WebpackLoadersOptions,
            },
            resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc},
        },
    },
};

use super::{
    resolve::ExternalCjsModulesResolvePluginVc, transforms::get_next_server_transforms_rules,
};
use crate::{
    babel::maybe_add_babel_loader,
    embed_js::next_js_fs,
    mode::NextMode,
    next_build::{get_external_next_compiled_package_mapping, get_postcss_package_mapping},
    next_config::NextConfigVc,
    next_import_map::{get_next_server_import_map, mdx_import_source_file},
    next_server::resolve::ExternalPredicate,
    next_shared::{
        resolve::UnsupportedModulesResolvePluginVc,
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
    util::foreign_code_context_condition,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum ServerContextType {
    Pages { pages_dir: FileSystemPathVc },
    PagesData { pages_dir: FileSystemPathVc },
    AppSSR { app_dir: FileSystemPathVc },
    AppRSC { app_dir: FileSystemPathVc },
    AppRoute { app_dir: FileSystemPathVc },
    Middleware,
}

#[turbo_tasks::function]
pub async fn get_server_resolve_options_context(
    project_path: FileSystemPathVc,
    ty: Value<ServerContextType>,
    mode: NextMode,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<ResolveOptionsContextVc> {
    let next_server_import_map =
        get_next_server_import_map(project_path, ty, next_config, execution_context);
    let foreign_code_context_condition = foreign_code_context_condition(next_config).await?;
    let root_dir = project_path.root().resolve().await?;
    let unsupported_modules_resolve_plugin = UnsupportedModulesResolvePluginVc::new(project_path);
    let server_component_externals_plugin = ExternalCjsModulesResolvePluginVc::new(
        project_path,
        ExternalPredicate::Only(next_config.server_component_externals()).cell(),
    );

    Ok(match ty.into_value() {
        ServerContextType::Pages { .. } | ServerContextType::PagesData { .. } => {
            let external_cjs_modules_plugin = ExternalCjsModulesResolvePluginVc::new(
                project_path,
                ExternalPredicate::AllExcept(next_config.transpile_packages()).cell(),
            );

            let resolve_options_context = ResolveOptionsContext {
                enable_node_modules: Some(root_dir),
                enable_node_externals: true,
                enable_node_native_modules: true,
                module: true,
                custom_conditions: vec![mode.node_env().to_string(), "node".to_string()],
                import_map: Some(next_server_import_map),
                plugins: vec![
                    external_cjs_modules_plugin.into(),
                    unsupported_modules_resolve_plugin.into(),
                ],
                ..Default::default()
            };
            ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                rules: vec![(
                    foreign_code_context_condition,
                    resolve_options_context.clone().cell(),
                )],
                ..resolve_options_context
            }
        }
        ServerContextType::AppSSR { .. } => {
            let resolve_options_context = ResolveOptionsContext {
                enable_node_modules: Some(root_dir),
                enable_node_externals: true,
                enable_node_native_modules: true,
                module: true,
                custom_conditions: vec![
                    mode.node_env().to_string(),
                    // TODO!
                    "node".to_string(),
                ],
                import_map: Some(next_server_import_map),
                plugins: vec![
                    server_component_externals_plugin.into(),
                    unsupported_modules_resolve_plugin.into(),
                ],
                ..Default::default()
            };
            ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                rules: vec![(
                    foreign_code_context_condition,
                    resolve_options_context.clone().cell(),
                )],
                ..resolve_options_context
            }
        }
        ServerContextType::AppRSC { .. } => {
            let resolve_options_context = ResolveOptionsContext {
                enable_node_modules: Some(root_dir),
                enable_node_externals: true,
                enable_node_native_modules: true,
                module: true,
                custom_conditions: vec![
                    mode.node_env().to_string(),
                    "react-server".to_string(),
                    // TODO
                    "node".to_string(),
                ],
                import_map: Some(next_server_import_map),
                plugins: vec![
                    server_component_externals_plugin.into(),
                    unsupported_modules_resolve_plugin.into(),
                ],
                ..Default::default()
            };
            ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                rules: vec![(
                    foreign_code_context_condition,
                    resolve_options_context.clone().cell(),
                )],
                ..resolve_options_context
            }
        }
        ServerContextType::AppRoute { .. } => {
            let resolve_options_context = ResolveOptionsContext {
                enable_node_modules: Some(root_dir),
                module: true,
                custom_conditions: vec![mode.node_env().to_string(), "node".to_string()],
                import_map: Some(next_server_import_map),
                plugins: vec![
                    server_component_externals_plugin.into(),
                    unsupported_modules_resolve_plugin.into(),
                ],
                ..Default::default()
            };
            ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                rules: vec![(
                    foreign_code_context_condition,
                    resolve_options_context.clone().cell(),
                )],
                ..resolve_options_context
            }
        }
        ServerContextType::Middleware => {
            let resolve_options_context = ResolveOptionsContext {
                enable_node_modules: Some(root_dir),
                enable_node_externals: true,
                module: true,
                custom_conditions: vec![mode.node_env().to_string()],
                plugins: vec![unsupported_modules_resolve_plugin.into()],
                ..Default::default()
            };
            ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                rules: vec![(
                    foreign_code_context_condition,
                    resolve_options_context.clone().cell(),
                )],
                ..resolve_options_context
            }
        }
    }
    .cell())
}

fn defines(mode: NextMode) -> CompileTimeDefines {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = mode.node_env(),
        process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = false,
        process.env.NEXT_RUNTIME = "nodejs"
    )
    // TODO(WEB-937) there are more defines needed, see
    // packages/next/src/build/webpack-config.ts
}

#[turbo_tasks::function]
fn next_server_defines(mode: NextMode) -> CompileTimeDefinesVc {
    defines(mode).cell()
}

#[turbo_tasks::function]
async fn next_server_free_vars(mode: NextMode) -> Result<FreeVarReferencesVc> {
    Ok(free_var_references!(..defines(mode).into_iter()).cell())
}

#[turbo_tasks::function]
pub fn get_server_compile_time_info(
    mode: NextMode,
    process_env: ProcessEnvVc,
    server_addr: ServerAddrVc,
) -> CompileTimeInfoVc {
    CompileTimeInfo::builder(EnvironmentVc::new(Value::new(
        ExecutionEnvironment::NodeJsLambda(NodeJsEnvironmentVc::current(process_env, server_addr)),
    )))
    .defines(next_server_defines(mode))
    .free_var_references(next_server_free_vars(mode))
    .cell()
}

#[turbo_tasks::function]
pub async fn get_server_module_options_context(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    ty: Value<ServerContextType>,
    mode: NextMode,
    next_config: NextConfigVc,
) -> Result<ModuleOptionsContextVc> {
    let custom_rules = get_next_server_transforms_rules(next_config, ty.into_value()).await?;
    let foreign_code_context_condition = foreign_code_context_condition(next_config).await?;
    let enable_postcss_transform = Some(PostCssTransformOptions {
        postcss_package: Some(get_postcss_package_mapping(project_path)),
        ..Default::default()
    });

    let webpack_rules =
        *maybe_add_babel_loader(project_path, *next_config.webpack_rules().await?).await?;
    let webpack_rules = maybe_add_sass_loader(next_config.sass_config(), webpack_rules).await?;
    let enable_webpack_loaders = webpack_rules.map(|rules| {
        WebpackLoadersOptions {
            rules,
            loader_runner_package: Some(get_external_next_compiled_package_mapping(
                StringVc::cell("loader-runner".to_owned()),
            )),
        }
        .cell()
    });

    // EcmascriptTransformPlugins for custom transforms
    let styled_components_transform_plugin =
        *get_styled_components_transform_plugin(next_config).await?;
    let styled_jsx_transform_plugin = *get_styled_jsx_transform_plugin().await?;
    let client_directive_transform_plugin = Some(TransformPluginVc::cell(Box::new(
        ClientDirectiveTransformer::new(&StringVc::cell("server-to-client".to_string())),
    )));
    let server_directive_transform_plugin = Some(TransformPluginVc::cell(Box::new(
        ServerDirectiveTransformer::new(
            // ServerDirective is not implemented yet and always reports an issue.
            // We don't have to pass a valid transition name yet, but the API is prepared.
            &StringVc::cell("TODO".to_string()),
        ),
    )));

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
    let jsx_runtime_options = get_jsx_transform_options(project_path, mode, None);

    let source_transforms: Vec<TransformPluginVc> = vec![
        *get_swc_ecma_transform_plugin(project_path, next_config).await?,
        *get_relay_transform_plugin(next_config).await?,
        *get_emotion_transform_plugin(next_config).await?,
    ]
    .into_iter()
    .flatten()
    .collect();

    let output_transforms = vec![];

    let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
        CustomEcmascriptTransformPlugins {
            source_transforms: source_transforms.clone(),
            output_transforms: output_transforms.clone(),
        },
    ));

    let module_options_context = match ty.into_value() {
        ServerContextType::Pages { .. } | ServerContextType::PagesData { .. } => {
            let mut base_source_transforms: Vec<TransformPluginVc> = vec![
                styled_components_transform_plugin,
                styled_jsx_transform_plugin,
            ]
            .into_iter()
            .flatten()
            .collect();

            base_source_transforms.extend(source_transforms);

            let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
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
                enable_jsx: Some(JsxTransformOptions::default().cell()),
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
        ServerContextType::AppSSR { .. } => {
            let mut base_source_transforms: Vec<TransformPluginVc> = vec![
                styled_components_transform_plugin,
                styled_jsx_transform_plugin,
                server_directive_transform_plugin,
            ]
            .into_iter()
            .flatten()
            .collect();

            let base_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
                CustomEcmascriptTransformPlugins {
                    source_transforms: base_source_transforms.clone(),
                    output_transforms: vec![],
                },
            ));

            base_source_transforms.extend(source_transforms);

            let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
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
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
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
        ServerContextType::AppRSC { .. } => {
            let mut base_source_transforms: Vec<TransformPluginVc> = vec![
                styled_components_transform_plugin,
                client_directive_transform_plugin,
                server_directive_transform_plugin,
            ]
            .into_iter()
            .flatten()
            .collect();

            let base_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
                CustomEcmascriptTransformPlugins {
                    source_transforms: base_source_transforms.clone(),
                    output_transforms: vec![],
                },
            ));

            base_source_transforms.extend(source_transforms);

            let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
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
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
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
        ServerContextType::AppRoute { .. } => {
            let module_options_context = ModuleOptionsContext {
                execution_context: Some(execution_context),
                ..Default::default()
            };
            let internal_module_options_context = ModuleOptionsContext {
                enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
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
            let mut base_source_transforms: Vec<TransformPluginVc> = vec![
                styled_components_transform_plugin,
                styled_jsx_transform_plugin,
            ]
            .into_iter()
            .flatten()
            .collect();

            base_source_transforms.extend(source_transforms);

            let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
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
pub fn get_build_module_options_context() -> ModuleOptionsContextVc {
    ModuleOptionsContext {
        enable_typescript_transform: Some(Default::default()),
        ..Default::default()
    }
    .cell()
}
