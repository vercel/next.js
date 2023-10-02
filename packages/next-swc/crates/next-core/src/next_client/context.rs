use core::result::Result::Ok;

use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::{
    turbo::{tasks_env::EnvMap, tasks_fs::FileSystemPath},
    turbopack::{
        core::{
            compile_time_defines,
            compile_time_info::{
                CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, FreeVarReference,
                FreeVarReferences,
            },
            environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
            free_var_references,
            resolve::{parse::Request, pattern::Pattern},
        },
        dev::{react_refresh::assert_can_resolve_react_refresh, DevChunkingContext},
        ecmascript::chunk::EcmascriptChunkingContext,
        ecmascript_plugin::transform::directives::server::ServerDirectiveTransformer,
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
    babel::maybe_add_babel_loader,
    embed_js::next_js_fs,
    mode::NextMode,
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

fn defines(mode: NextMode, define_env: &IndexMap<String, String>) -> CompileTimeDefines {
    // Need the empty NEXT_RUNTIME here for compile time evaluation.
    let mut defines = compile_time_defines!(
        process.turbopack = true,
        process.env.NEXT_RUNTIME = "",
        process.env.NODE_ENV = mode.node_env(),
        process.env.TURBOPACK = true,
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
async fn next_client_defines(
    mode: NextMode,
    define_env: Vc<EnvMap>,
) -> Result<Vc<CompileTimeDefines>> {
    Ok(defines(mode, &*define_env.await?).cell())
}

#[turbo_tasks::function]
async fn next_client_free_vars(
    mode: NextMode,
    define_env: Vc<EnvMap>,
) -> Result<Vc<FreeVarReferences>> {
    Ok(free_var_references!(
        ..defines(mode, &*define_env.await?).into_iter(),
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
pub fn get_client_compile_time_info(
    mode: NextMode,
    browserslist_query: String,
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
    .defines(next_client_defines(mode, define_env))
    .free_var_references(next_client_free_vars(mode, define_env))
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
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: Vc<NextConfig>,
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<RuntimeEntries>> {
    let mut runtime_entries = vec![];

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
