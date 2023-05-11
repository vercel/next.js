use core::{default::Default, result::Result::Ok};
use std::collections::HashMap;

use anyhow::Result;
use turbo_binding::{
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
            environment::{
                BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment,
            },
            free_var_references,
        },
        dev::{react_refresh::assert_can_resolve_react_refresh, DevChunkingContextVc},
        ecmascript::EcmascriptInputTransform,
        env::ProcessEnvAssetVc,
        node::execution_context::ExecutionContextVc,
        turbopack::{
            condition::ContextCondition,
            module_options::{
                module_options_context::{ModuleOptionsContext, ModuleOptionsContextVc},
                CustomEcmascriptTransformPlugins, CustomEcmascriptTransformPluginsVc,
                JsxTransformOptions, PostCssTransformOptions, TypescriptTransformOptions,
                WebpackLoadersOptions,
            },
            resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc},
            transition::TransitionsByNameVc,
            ModuleAssetContextVc,
        },
    },
};
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::FileSystem;

use super::transforms::get_next_client_transforms_rules;
use crate::{
    babel::maybe_add_babel_loader,
    embed_js::next_js_fs,
    env::env_for_js,
    next_build::{get_external_next_compiled_package_mapping, get_postcss_package_mapping},
    next_client::runtime_entry::{RuntimeEntriesVc, RuntimeEntry},
    next_config::NextConfigVc,
    next_import_map::{
        get_next_client_fallback_import_map, get_next_client_import_map,
        get_next_client_resolved_map,
    },
    next_shared::{
        resolve::UnsupportedModulesResolvePluginVc, transforms::get_relay_transform_plugin,
    },
    transform_options::{
        get_decorators_transform_options, get_emotion_compiler_config, get_jsx_transform_options,
        get_styled_components_compiler_config, get_typescript_transform_options,
    },
    util::foreign_code_context_condition,
};

fn defines() -> CompileTimeDefines {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = "development",
        process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = false,
        process.env.__NEXT_HAS_REWRITES = true,
        process.env.__NEXT_I18N_SUPPORT = false,
    )
    // TODO(WEB-937) there are more defines needed, see
    // packages/next/src/build/webpack-config.ts
}

#[turbo_tasks::function]
pub fn next_client_defines() -> CompileTimeDefinesVc {
    defines().cell()
}

#[turbo_tasks::function]
pub async fn next_client_free_vars() -> Result<FreeVarReferencesVc> {
    Ok(free_var_references!(
        ..defines().into_iter(),
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
pub fn get_client_compile_time_info(browserslist_query: &str) -> CompileTimeInfoVc {
    CompileTimeInfo::builder(EnvironmentVc::new(
        Value::new(ExecutionEnvironment::Browser(
            BrowserEnvironment {
                dom: true,
                web_worker: false,
                service_worker: false,
                browserslist_query: browserslist_query.to_owned(),
            }
            .into(),
        )),
        Value::new(EnvironmentIntention::Client),
    ))
    .defines(next_client_defines())
    .free_var_references(next_client_free_vars())
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
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<ResolveOptionsContextVc> {
    let next_client_import_map =
        get_next_client_import_map(project_path, ty, next_config, execution_context);
    let next_client_fallback_import_map = get_next_client_fallback_import_map(ty);
    let next_client_resolved_map = get_next_client_resolved_map(project_path, project_path);
    let module_options_context = ResolveOptionsContext {
        enable_node_modules: Some(project_path.root().resolve().await?),
        custom_conditions: vec!["development".to_string()],
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
    next_config: NextConfigVc,
) -> Result<ModuleOptionsContextVc> {
    let custom_rules = get_next_client_transforms_rules(next_config, ty.into_value()).await?;
    let resolve_options_context =
        get_client_resolve_options_context(project_path, ty, next_config, execution_context);
    let enable_react_refresh =
        assert_can_resolve_react_refresh(project_path, resolve_options_context)
            .await?
            .is_found();

    let tsconfig = get_typescript_transform_options(project_path);
    let decorators_options = get_decorators_transform_options(project_path);
    let mdx_rs_options = *next_config.mdx_rs().await?;
    let jsx_runtime_options = get_jsx_transform_options(project_path);
    let enable_webpack_loaders = {
        let options = &*next_config.webpack_loaders_options().await?;
        let loaders_options = WebpackLoadersOptions {
            extension_to_loaders: options.clone(),
            loader_runner_package: Some(get_external_next_compiled_package_mapping(
                StringVc::cell("loader-runner".to_owned()),
            )),
            placeholder_for_future_extensions: (),
        }
        .cell();

        maybe_add_babel_loader(project_path, loaders_options)
            .await?
            .clone_if()
    };

    let enable_emotion = *get_emotion_compiler_config(next_config).await?;

    let mut source_transforms = vec![];
    if let Some(relay_transform_plugin) = *get_relay_transform_plugin(next_config).await? {
        source_transforms.push(relay_transform_plugin);
    }

    let custom_ecma_transform_plugins = Some(CustomEcmascriptTransformPluginsVc::cell(
        CustomEcmascriptTransformPlugins {
            source_transforms,
            output_transforms: vec![],
        },
    ));

    let module_options_context = ModuleOptionsContext {
        custom_ecmascript_transforms: vec![EcmascriptInputTransform::ServerDirective(
            // ServerDirective is not implemented yet and always reports an issue.
            // We don't have to pass a valid transition name yet, but the API is prepared.
            StringVc::cell("TODO".to_string()),
        )],
        preset_env_versions: Some(env),
        execution_context: Some(execution_context),
        custom_ecma_transform_plugins,
        ..Default::default()
    };

    let enable_styled_components = *get_styled_components_compiler_config(next_config).await?;

    let module_options_context = ModuleOptionsContext {
        // We don't need to resolve React Refresh for each module. Instead,
        // we try resolve it once at the root and pass down a context to all
        // the modules.
        enable_jsx: Some(jsx_runtime_options),
        enable_emotion,
        enable_react_refresh,
        enable_styled_components,
        enable_styled_jsx: true,
        enable_postcss_transform: Some(PostCssTransformOptions {
            postcss_package: Some(get_postcss_package_mapping(project_path)),
            ..Default::default()
        }),
        enable_webpack_loaders,
        enable_typescript_transform: Some(tsconfig),
        enable_mdx_rs: mdx_rs_options,
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
    next_config: NextConfigVc,
) -> AssetContextVc {
    let resolve_options_context =
        get_client_resolve_options_context(project_path, ty, next_config, execution_context);
    let module_options_context = get_client_module_options_context(
        project_path,
        execution_context,
        compile_time_info.environment(),
        ty,
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
    server_root: FileSystemPathVc,
    environment: EnvironmentVc,
    ty: Value<ClientContextType>,
) -> ChunkingContextVc {
    DevChunkingContextVc::builder(
        project_path,
        server_root,
        match ty.into_value() {
            ClientContextType::Pages { .. }
            | ClientContextType::App { .. }
            | ClientContextType::Fallback => server_root.join("/_next/static/chunks"),
            ClientContextType::Other => server_root.join("/_chunks"),
        },
        get_client_assets_path(server_root, ty),
        environment,
    )
    .hot_module_replacement()
    .build()
}

#[turbo_tasks::function]
pub fn get_client_assets_path(
    server_root: FileSystemPathVc,
    ty: Value<ClientContextType>,
) -> FileSystemPathVc {
    match ty.into_value() {
        ClientContextType::Pages { .. }
        | ClientContextType::App { .. }
        | ClientContextType::Fallback => server_root.join("/_next/static/assets"),
        ClientContextType::Other => server_root.join("/_assets"),
    }
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_root: FileSystemPathVc,
    env: ProcessEnvVc,
    ty: Value<ClientContextType>,
    next_config: NextConfigVc,
    execution_context: ExecutionContextVc,
) -> Result<RuntimeEntriesVc> {
    let resolve_options_context =
        get_client_resolve_options_context(project_root, ty, next_config, execution_context);
    let enable_react_refresh =
        assert_can_resolve_react_refresh(project_root, resolve_options_context)
            .await?
            .as_request();

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

    // It's important that React Refresh come before the regular bootstrap file,
    // because the bootstrap contains JSX which requires Refresh's global
    // functions to be available.
    if let Some(request) = enable_react_refresh {
        runtime_entries.push(RuntimeEntry::Request(request, project_root.join("_")).cell())
    };

    Ok(RuntimeEntriesVc::cell(runtime_entries))
}
