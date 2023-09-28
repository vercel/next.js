use core::result::Result::Ok;

use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::{
    turbo::{tasks_env::ProcessEnv, tasks_fs::FileSystemPath},
    turbopack::{
        core::{
            compile_time_defines,
            compile_time_info::{
                CompileTimeDefines, CompileTimeInfo, FreeVarReference, FreeVarReferences,
            },
            environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
            free_var_references,
            resolve::{parse::Request, pattern::Pattern},
        },
        dev::{react_refresh::assert_can_resolve_react_refresh, DevChunkingContext},
        ecmascript::chunk::EcmascriptChunkingContext,
        ecmascript_plugin::transform::directives::server::ServerDirectiveTransformer,
        env::ProcessEnvAsset,
        node::execution_context::ExecutionContext,
        turbopack::{
            condition::ContextCondition,
            module_options::{
                module_options_context::ModuleOptionsContext, CustomEcmascriptTransformPlugins,
                JsxTransformOptions, MdxTransformModuleOptions, PostCssTransformOptions,
                TypescriptTransformOptions, WebpackLoadersOptions,
            },
            resolve_options_context::ResolveOptionsContext,
        },
    },
};

use super::transforms::get_next_client_transforms_rules;
use crate::{
    app_structure::{get_entrypoints, EntrypointPaths, OptionAppDir},
    babel::maybe_add_babel_loader,
    embed_js::next_js_fs,
    env::env_for_js,
    mode::NextMode,
    next_app::{bloom_filter::create_client_router_filter, AppPath},
    next_build::{get_external_next_compiled_package_mapping, get_postcss_package_mapping},
    next_client::runtime_entry::{RuntimeEntries, RuntimeEntry},
    next_config::NextConfig,
    next_import_map::{
        get_next_client_fallback_import_map, get_next_client_import_map,
        get_next_client_resolved_map, mdx_import_source_file,
    },
    next_shared::{
        resolve::{
            ModuleFeatureReportResolvePlugin, NextSharedRuntimeResolvePlugin,
            UnsupportedModulesResolvePlugin,
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
    util::foreign_code_context_condition,
};

fn defines(
    mode: NextMode,
    dist_root_path: &str,
    next_config: &NextConfig,
    app_paths: &[AppPath],
) -> Result<CompileTimeDefines> {
    let filter = create_client_router_filter(
        app_paths,
        if next_config
            .experimental
            .client_router_filter_redirects
            .unwrap_or_default()
        {
            next_config
                .original_redirects
                .as_deref()
                .unwrap_or_default()
        } else {
            &[]
        },
        next_config.experimental.client_router_filter_allowed_rate,
    );

    // TODO: macro may need to allow dynamically expand from some iterable values
    // TODO(WEB-937): there are more defines needed, see
    // packages/next/src/build/webpack/plugins/define-env-plugin.ts
    Ok(compile_time_defines!(
        process.browser = true,
        process.turbopack = true,
        process.env.TURBOPACK = true,
        process.env.NODE_ENV = mode.node_env(),
        process.env.NEXT_RUNTIME = "".to_string(),
        process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = next_config
            .experimental
            .client_router_filter
            .unwrap_or_default(),
        process.env.__NEXT_CLIENT_ROUTER_S_FILTER = serde_json::to_value(&filter.static_filter)?,
        process.env.__NEXT_CLIENT_ROUTER_D_FILTER = serde_json::to_value(&filter.dynamic_filter)?,
        process.env.__NEXT_DIST_DIR = dist_root_path.to_string(),
        process.env.__NEXT_HAS_REWRITES = true,
    ))
}

#[turbo_tasks::function]
async fn next_client_defines(
    mode: NextMode,
    dist_root_path: Vc<String>,
    next_config: Vc<NextConfig>,
    app_paths: Vc<EntrypointPaths>,
) -> Result<Vc<CompileTimeDefines>> {
    let dist_root_path = &*dist_root_path.await?;
    Ok(defines(
        mode,
        dist_root_path.as_str(),
        &*next_config.await?,
        &app_paths.await?,
    )?
    .cell())
}

#[turbo_tasks::function]
async fn next_client_free_vars(
    mode: NextMode,
    dist_root_path: Vc<String>,
    next_config: Vc<NextConfig>,
    app_paths: Vc<EntrypointPaths>,
) -> Result<Vc<FreeVarReferences>> {
    let dist_root_path = &*dist_root_path.await?;
    Ok(free_var_references!(
        ..defines(
            mode,
            dist_root_path.as_str(),
            &*next_config.await?,
            &app_paths.await?
        )?
        .into_iter(),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: "node:buffer".to_string(),
            lookup_path: None,
            export: Some("Buffer".to_string()),
        },
        process = FreeVarReference::EcmaScriptModule {
            request: "node:process".to_string(),
            lookup_path: None,
            export: Some("default".to_string()),
        }
    )
    .cell())
}

#[turbo_tasks::function]
async fn get_app_paths(
    app_dir: Vc<OptionAppDir>,
    next_config: Vc<NextConfig>,
) -> Result<Vc<EntrypointPaths>> {
    Ok(if let Some(app_dir) = *app_dir.await? {
        get_entrypoints(app_dir, next_config.page_extensions()).paths()
    } else {
        Default::default()
    })
}

#[turbo_tasks::function]
pub fn get_client_compile_time_info(
    mode: NextMode,
    browserslist_query: String,
    dist_root_path: Vc<String>,
    next_config: Vc<NextConfig>,
    app_dir: Vc<OptionAppDir>,
) -> Vc<CompileTimeInfo> {
    let app_paths = get_app_paths(app_dir, next_config);

    CompileTimeInfo::builder(Environment::new(Value::new(ExecutionEnvironment::Browser(
        BrowserEnvironment {
            dom: true,
            web_worker: false,
            service_worker: false,
            browserslist_query: browserslist_query.to_owned(),
        }
        .into(),
    ))))
    .defines(next_client_defines(
        mode,
        dist_root_path,
        next_config,
        app_paths,
    ))
    .free_var_references(next_client_free_vars(
        mode,
        dist_root_path,
        next_config,
        app_paths,
    ))
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
    mode: NextMode,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_client_import_map =
        get_next_client_import_map(project_path, ty, mode, next_config, execution_context);
    let next_client_fallback_import_map = get_next_client_fallback_import_map(ty);
    let next_client_resolved_map = get_next_client_resolved_map(project_path, project_path, mode);
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
        custom_conditions: vec![mode.node_env().to_string()],
        import_map: Some(next_client_import_map),
        fallback_import_map: Some(next_client_fallback_import_map),
        resolved_map: Some(next_client_resolved_map),
        browser: true,
        module: true,
        plugins: vec![
            Vc::upcast(ModuleFeatureReportResolvePlugin::new(project_path)),
            Vc::upcast(UnsupportedModulesResolvePlugin::new(project_path)),
            Vc::upcast(NextSharedRuntimeResolvePlugin::new(project_path)),
        ],
        ..Default::default()
    };
    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        rules: vec![(
            foreign_code_context_condition(next_config, project_path).await?,
            module_options_context.clone().cell(),
        )],
        ..module_options_context
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn get_client_module_options_context(
    project_path: Vc<FileSystemPath>,
    execution_context: Vc<ExecutionContext>,
    env: Vc<Environment>,
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
) -> Result<Vc<ModuleOptionsContext>> {
    let custom_rules = get_next_client_transforms_rules(next_config, ty.into_value(), mode).await?;
    let resolve_options_context =
        get_client_resolve_options_context(project_path, ty, mode, next_config, execution_context);

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
    let jsx_runtime_options = get_jsx_transform_options(
        project_path,
        mode,
        Some(resolve_options_context),
        false,
        next_config,
    );
    let webpack_rules =
        *maybe_add_babel_loader(project_path, *next_config.webpack_rules().await?).await?;
    let webpack_rules = maybe_add_sass_loader(next_config.sass_config(), webpack_rules).await?;
    let enable_webpack_loaders = webpack_rules.map(|rules| {
        WebpackLoadersOptions {
            rules,
            loader_runner_package: Some(get_external_next_compiled_package_mapping(Vc::cell(
                "loader-runner".to_owned(),
            ))),
        }
        .cell()
    });

    let source_transforms = vec![
        *get_swc_ecma_transform_plugin(project_path, next_config).await?,
        *get_relay_transform_plugin(next_config).await?,
        *get_emotion_transform_plugin(next_config).await?,
        *get_styled_components_transform_plugin(next_config).await?,
        *get_styled_jsx_transform_plugin().await?,
        Some(Vc::cell(Box::new(ServerDirectiveTransformer::new(
            // ServerDirective is not implemented yet and always reports an issue.
            // We don't have to pass a valid transition name yet, but the API is prepared.
            &Vc::cell("TODO".to_string()),
        )) as _)),
    ]
    .into_iter()
    .flatten()
    .collect();

    let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPlugins::cell(
        CustomEcmascriptTransformPlugins {
            source_transforms,
            output_transforms: vec![],
        },
    ));

    let postcss_transform_options = Some(PostCssTransformOptions {
        postcss_package: Some(get_postcss_package_mapping(project_path)),
        ..Default::default()
    });

    let module_options_context = ModuleOptionsContext {
        preset_env_versions: Some(env),
        execution_context: Some(execution_context),
        custom_ecma_transform_plugins,
        // NOTE(WEB-1016) PostCSS transforms should also apply to foreign code.
        enable_postcss_transform: postcss_transform_options.clone(),
        ..Default::default()
    };

    let module_options_context = ModuleOptionsContext {
        // We don't need to resolve React Refresh for each module. Instead,
        // we try resolve it once at the root and pass down a context to all
        // the modules.
        enable_jsx: Some(jsx_runtime_options),
        enable_postcss_transform: postcss_transform_options,
        enable_webpack_loaders,
        enable_typescript_transform: Some(tsconfig),
        enable_mdx_rs,
        decorators: Some(decorators_options),
        rules: vec![
            (
                foreign_code_context_condition(next_config, project_path).await?,
                module_options_context.clone().cell(),
            ),
            // If the module is an internal asset (i.e overlay, fallback) coming from the embedded
            // FS, don't apply user defined transforms.
            (
                ContextCondition::InPath(next_js_fs().root()),
                ModuleOptionsContext {
                    enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
                    enable_jsx: Some(JsxTransformOptions::default().cell()),
                    ..module_options_context.clone()
                }
                .cell(),
            ),
        ],
        custom_rules,
        ..module_options_context
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::function]
pub async fn get_client_chunking_context(
    project_path: Vc<FileSystemPath>,
    client_root: Vc<FileSystemPath>,
    asset_prefix: Vc<Option<String>>,
    environment: Vc<Environment>,
    mode: NextMode,
) -> Result<Vc<Box<dyn EcmascriptChunkingContext>>> {
    let mut builder = DevChunkingContext::builder(
        project_path,
        client_root,
        client_root.join("static/chunks".to_string()),
        get_client_assets_path(client_root),
        environment,
    )
    .chunk_base_path(asset_prefix)
    .asset_base_path(asset_prefix);

    if matches!(mode, NextMode::Development) {
        builder = builder.hot_module_replacement();
    }

    Ok(Vc::upcast(builder.build()))
}

#[turbo_tasks::function]
pub fn get_client_assets_path(client_root: Vc<FileSystemPath>) -> Vc<FileSystemPath> {
    client_root.join("static/media".to_string())
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_root: Vc<FileSystemPath>,
    env: Vc<Box<dyn ProcessEnv>>,
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<RuntimeEntries>> {
    let mut runtime_entries = vec![];

    if matches!(
        *ty,
        ClientContextType::App { .. } | ClientContextType::Pages { .. },
    ) {
        runtime_entries.push(
            RuntimeEntry::Source(Vc::upcast(ProcessEnvAsset::new(
                project_root,
                env_for_js(env, true, next_config),
            )))
            .cell(),
        );
    }

    match mode {
        NextMode::Development => {
            let resolve_options_context = get_client_resolve_options_context(
                project_root,
                ty,
                mode,
                next_config,
                execution_context,
            );
            let enable_react_refresh =
                assert_can_resolve_react_refresh(project_root, resolve_options_context)
                    .await?
                    .as_request();

            // It's important that React Refresh come before the regular bootstrap file,
            // because the bootstrap contains JSX which requires Refresh's global
            // functions to be available.
            if let Some(request) = enable_react_refresh {
                runtime_entries
                    .push(RuntimeEntry::Request(request, project_root.join("_".to_string())).cell())
            };

            if matches!(*ty, ClientContextType::App { .. },) {
                runtime_entries.push(
                    RuntimeEntry::Request(
                        Request::parse(Value::new(Pattern::Constant(
                            "next/dist/client/app-next-dev-turbopack.js".to_string(),
                        ))),
                        project_root.join("_".to_string()),
                    )
                    .cell(),
                );
            }
        }
        NextMode::Build => match *ty {
            ClientContextType::App { .. } => {
                runtime_entries.push(
                    RuntimeEntry::Request(
                        Request::parse(Value::new(Pattern::Constant(
                            "./build/client/app-bootstrap.ts".to_string(),
                        ))),
                        next_js_fs().root().join("_".to_string()),
                    )
                    .cell(),
                );
            }
            ClientContextType::Pages { .. } => {
                runtime_entries.push(
                    RuntimeEntry::Request(
                        Request::parse(Value::new(Pattern::Constant(
                            "./build/client/bootstrap.ts".to_string(),
                        ))),
                        next_js_fs().root().join("_".to_string()),
                    )
                    .cell(),
                );
            }
            _ => {}
        },
    }

    Ok(Vc::cell(runtime_entries))
}
