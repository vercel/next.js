use core::{default::Default, result::Result::Ok};
use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::FileSystem;
use turbopack_binding::{
    turbo::{tasks_env::ProcessEnvVc, tasks_fs::FileSystemPathVc},
    turbopack::{
        core::{
            chunk::ChunkingContextVc,
            compile_time_defines,
            compile_time_info::{
                CompileTimeDefines, CompileTimeDefinesVc, CompileTimeInfo, CompileTimeInfoVc,
                FreeVarReference, FreeVarReferencesVc,
            },
            context::AssetContextVc,
            environment::{BrowserEnvironment, EnvironmentVc, ExecutionEnvironment},
            free_var_references,
            resolve::{parse::RequestVc, pattern::Pattern},
        },
        dev::{react_refresh::assert_can_resolve_react_refresh, DevChunkingContextVc},
        ecmascript::TransformPluginVc,
        ecmascript_plugin::transform::directives::server::ServerDirectiveTransformer,
        env::ProcessEnvAssetVc,
        node::execution_context::ExecutionContextVc,
        turbopack::{
            condition::ContextCondition,
            module_options::{
                module_options_context::{ModuleOptionsContext, ModuleOptionsContextVc},
                CustomEcmascriptTransformPlugins, CustomEcmascriptTransformPluginsVc,
                JsxTransformOptions, MdxTransformModuleOptions, PostCssTransformOptions,
                TypescriptTransformOptions, WebpackLoadersOptions,
            },
            resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc},
            transition::TransitionsByNameVc,
            ModuleAssetContextVc,
        },
    },
};

use super::transforms::get_next_client_transforms_rules;
use crate::{
    babel::maybe_add_babel_loader,
    embed_js::next_js_fs,
    env::env_for_js,
    mode::NextMode,
    next_build::{get_external_next_compiled_package_mapping, get_postcss_package_mapping},
    next_client::runtime_entry::{RuntimeEntriesVc, RuntimeEntry},
    next_config::NextConfigVc,
    next_import_map::{
        get_next_client_fallback_import_map, get_next_client_import_map,
        get_next_client_resolved_map, mdx_import_source_file,
    },
    next_shared::{
        resolve::UnsupportedModulesResolvePluginVc,
        transforms::{
            emotion::get_emotion_transform_plugin, get_relay_transform_plugin,
            styled_components::get_styled_components_transform_plugin,
            styled_jsx::get_styled_jsx_transform_plugin,
        },
    },
    sass::maybe_add_sass_loader,
    transform_options::{
        get_decorators_transform_options, get_jsx_transform_options,
        get_typescript_transform_options,
    },
    util::foreign_code_context_condition,
};

fn defines(mode: NextMode) -> CompileTimeDefines {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = mode.node_env(),
        process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = false,
        process.env.__NEXT_HAS_REWRITES = true,
        process.env.__NEXT_I18N_SUPPORT = false,
    )
    // TODO(WEB-937) there are more defines needed, see
    // packages/next/src/build/webpack-config.ts
}

#[turbo_tasks::function]
fn next_client_defines(mode: NextMode) -> CompileTimeDefinesVc {
    defines(mode).cell()
}

#[turbo_tasks::function]
async fn next_client_free_vars(mode: NextMode) -> Result<FreeVarReferencesVc> {
    Ok(free_var_references!(
        ..defines(mode).into_iter(),
        Buffer = FreeVarReference::EcmaScriptModule {
            request: "node:buffer".to_string(),
            context: None,
            export: Some("Buffer".to_string()),
        },
        process = FreeVarReference::EcmaScriptModule {
            request: "node:process".to_string(),
            context: None,
            export: Some("default".to_string()),
        }
    )
    .cell())
}

#[turbo_tasks::function]
pub fn get_client_compile_time_info(mode: NextMode, browserslist_query: &str) -> CompileTimeInfoVc {
    CompileTimeInfo::builder(EnvironmentVc::new(Value::new(
        ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browserslist_query: browserslist_query.to_owned(),
            }
            .into(),
        ),
    )))
    .defines(next_client_defines(mode))
    .free_var_references(next_client_free_vars(mode))
    .cell()
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum ClientContextType {
    Pages { pages_dir: FileSystemPathVc },
    App { app_dir: FileSystemPathVc },
    Fallback,
    Other,
}

#[turbo_tasks::function]
pub async fn get_client_resolve_options_context(
    project_path: FileSystemPathVc,
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<ResolveOptionsContextVc> {
    let next_client_import_map =
        get_next_client_import_map(project_path, ty, next_config, execution_context);
    let next_client_fallback_import_map = get_next_client_fallback_import_map(ty);
    let next_client_resolved_map = get_next_client_resolved_map(project_path, project_path);
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
        custom_conditions: vec![mode.node_env().to_string()],
        import_map: Some(next_client_import_map),
        fallback_import_map: Some(next_client_fallback_import_map),
        resolved_map: Some(next_client_resolved_map),
        browser: true,
        module: true,
        plugins: vec![UnsupportedModulesResolvePluginVc::new(project_path).into()],
        ..Default::default()
    };
    Ok(ResolveOptionsContext {
        enable_typescript: true,
        enable_react: true,
        rules: vec![(
            foreign_code_context_condition(next_config).await?,
            module_options_context.clone().cell(),
        )],
        ..module_options_context
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn get_client_module_options_context(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    env: EnvironmentVc,
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: NextConfigVc,
) -> Result<ModuleOptionsContextVc> {
    let custom_rules = get_next_client_transforms_rules(next_config, ty.into_value()).await?;
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
    let jsx_runtime_options =
        get_jsx_transform_options(project_path, mode, Some(resolve_options_context));
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

    let source_transforms = vec![
        *get_relay_transform_plugin(next_config).await?,
        *get_emotion_transform_plugin(next_config).await?,
        *get_styled_components_transform_plugin(next_config).await?,
        *get_styled_jsx_transform_plugin().await?,
        Some(TransformPluginVc::cell(Box::new(
            ServerDirectiveTransformer::new(
                // ServerDirective is not implemented yet and always reports an issue.
                // We don't have to pass a valid transition name yet, but the API is prepared.
                &StringVc::cell("TODO".to_string()),
            ),
        ))),
    ]
    .into_iter()
    .flatten()
    .collect();

    let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
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
                foreign_code_context_condition(next_config).await?,
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
pub fn get_client_asset_context(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    compile_time_info: CompileTimeInfoVc,
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: NextConfigVc,
) -> AssetContextVc {
    let resolve_options_context =
        get_client_resolve_options_context(project_path, ty, mode, next_config, execution_context);
    let module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        compile_time_info.environment(),
        ty,
        mode,
        next_config,
    );

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(HashMap::new()),
        compile_time_info,
        module_options_context,
        resolve_options_context,
    )
    .into();

    context
}

#[turbo_tasks::function]
pub fn get_client_chunking_context(
    project_path: FileSystemPathVc,
    client_root: FileSystemPathVc,
    environment: EnvironmentVc,
) -> ChunkingContextVc {
    DevChunkingContextVc::builder(
        project_path,
        client_root,
        client_root.join("/_next/static/chunks"),
        get_client_assets_path(client_root),
        environment,
    )
    .hot_module_replacement()
    .build()
}

#[turbo_tasks::function]
pub fn get_client_assets_path(client_root: FileSystemPathVc) -> FileSystemPathVc {
    client_root.join("/_next/static/media")
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_root: FileSystemPathVc,
    env: ProcessEnvVc,
    ty: Value<ClientContextType>,
    mode: NextMode,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<RuntimeEntriesVc> {
    let mut runtime_entries = vec![];

    if matches!(
        *ty,
        ClientContextType::App { .. } | ClientContextType::Pages { .. },
    ) {
        runtime_entries.push(
            RuntimeEntry::Source(
                ProcessEnvAssetVc::new(project_root, env_for_js(env, true, next_config)).into(),
            )
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
                runtime_entries.push(RuntimeEntry::Request(request, project_root.join("_")).cell())
            };
        }
        NextMode::Build => {
            runtime_entries.push(
                RuntimeEntry::Request(
                    RequestVc::parse(Value::new(Pattern::Constant(
                        "./build/client/bootstrap.ts".to_string(),
                    ))),
                    next_js_fs().root().join("_"),
                )
                .cell(),
            );
        }
    }

    Ok(RuntimeEntriesVc::cell(runtime_entries))
}
