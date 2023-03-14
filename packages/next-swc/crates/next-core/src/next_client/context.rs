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
                CompileTimeDefinesVc, CompileTimeInfo, CompileTimeInfoVc, FreeVarReference,
                FreeVarReferencesVc,
            },
            context::AssetContextVc,
            environment::{
                BrowserEnvironment, EnvironmentIntention, EnvironmentVc, ExecutionEnvironment,
            },
            free_var_references,
            resolve::{parse::RequestVc, pattern::Pattern},
        },
        dev::DevChunkingContextVc,
        ecmascript::EcmascriptInputTransform,
        env::ProcessEnvAssetVc,
        node::execution_context::ExecutionContextVc,
        turbopack::{
            module_options::{
                module_options_context::{ModuleOptionsContext, ModuleOptionsContextVc},
                PostCssTransformOptions, WebpackLoadersOptions,
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
    mode::NextMode,
    next_build::{get_external_next_compiled_package_mapping, get_postcss_package_mapping},
    next_client::runtime_entry::{RuntimeEntriesVc, RuntimeEntry},
    next_config::NextConfigVc,
    next_import_map::{
        get_next_client_fallback_import_map, get_next_client_import_map,
        get_next_client_resolved_map,
    },
    react_refresh::assert_can_resolve_react_refresh,
    transform_options::{
        get_decorators_transform_options, get_react_transform, get_typescript_transform_options,
    },
    util::foreign_code_context_condition,
};

pub fn next_client_defines(mode: Value<NextMode>) -> CompileTimeDefinesVc {
    compile_time_defines!(
        process.turbopack = true,
        process.env.NODE_ENV = mode.node_env(),
        process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED = false
    )
    .cell()
}

pub fn next_client_free_vars() -> FreeVarReferencesVc {
    free_var_references!(
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
    .cell()
}

#[turbo_tasks::function]
pub fn get_client_compile_time_info(
    mode: Value<NextMode>,
    browserslist_query: &str,
) -> CompileTimeInfoVc {
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
    .defines(next_client_defines(mode))
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
    mode: Value<NextMode>,
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
    mode: Value<NextMode>,
    next_config: NextConfigVc,
) -> Result<ModuleOptionsContextVc> {
    let custom_rules = get_next_client_transforms_rules(ty.into_value()).await?;
    let resolve_options_context =
        get_client_resolve_options_context(project_path, ty, mode, next_config, execution_context);

    let tsconfig = get_typescript_transform_options(project_path);
    let decorators_options = get_decorators_transform_options(project_path);
    let enable_react_refresh = match mode.into_value() {
        NextMode::Development => {
            assert_can_resolve_react_refresh(project_path, resolve_options_context)
                .await?
                .is_found()
        }
        NextMode::Build => false,
    };
    let react_transform = get_react_transform(project_path, enable_react_refresh, mode);
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

    let module_options_context = ModuleOptionsContext {
        custom_ecmascript_transforms: vec![EcmascriptInputTransform::ServerDirective(
            StringVc::cell("TODO".to_string()),
        )],
        preset_env_versions: Some(env),
        execution_context: Some(execution_context),
        ..Default::default()
    };

    let module_options_context = ModuleOptionsContext {
        react_transform: Some(react_transform),
        enable_emotion: true,
        enable_styled_components: true,
        enable_styled_jsx: true,
        enable_postcss_transform: Some(PostCssTransformOptions {
            postcss_package: Some(get_postcss_package_mapping(project_path)),
            ..Default::default()
        }),
        enable_webpack_loaders,
        enable_typescript_transform: Some(tsconfig),
        decorators: Some(decorators_options),
        rules: vec![(
            foreign_code_context_condition(next_config).await?,
            module_options_context.clone().cell(),
        )],
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
    mode: Value<NextMode>,
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
pub fn get_dev_client_chunking_context(
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
        get_dev_client_assets_path(server_root, ty),
        environment,
    )
    .hot_module_replacement()
    .build()
}

#[turbo_tasks::function]
pub fn get_dev_client_assets_path(
    client_root: FileSystemPathVc,
    ty: Value<ClientContextType>,
) -> FileSystemPathVc {
    match ty.into_value() {
        ClientContextType::Pages { .. }
        | ClientContextType::App { .. }
        | ClientContextType::Fallback => client_root.join("/static/assets"),
        ClientContextType::Other => client_root.join("/_assets"),
    }
}

#[turbo_tasks::function]
pub async fn get_client_runtime_entries(
    project_root: FileSystemPathVc,
    env: ProcessEnvVc,
    ty: Value<ClientContextType>,
    mode: Value<NextMode>,
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

    match mode.into_value() {
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
