use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    module_options::{ModuleOptionsContext, ModuleOptionsContextVc, PostCssTransformOptions},
    resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc},
};
use turbopack_core::environment::{
    EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironmentVc, ServerAddrVc,
};
use turbopack_ecmascript::EcmascriptInputTransform;
use turbopack_node::execution_context::ExecutionContextVc;

use super::{
    resolve::ExternalCjsModulesResolvePluginVc, transforms::get_next_server_transforms_rules,
};
use crate::{
    next_build::get_postcss_package_mapping,
    next_config::NextConfigVc,
    next_import_map::{get_next_build_import_map, get_next_server_import_map},
    util::foreign_code_context_condition,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum ServerContextType {
    Pages { pages_dir: FileSystemPathVc },
    PagesData { pages_dir: FileSystemPathVc },
    AppSSR { app_dir: FileSystemPathVc },
    AppRSC { app_dir: FileSystemPathVc },
}

#[turbo_tasks::function]
pub async fn get_server_resolve_options_context(
    project_path: FileSystemPathVc,
    ty: Value<ServerContextType>,
    next_config: NextConfigVc,
) -> Result<ResolveOptionsContextVc> {
    let next_server_import_map = get_next_server_import_map(project_path, ty, next_config);
    let foreign_code_context_condition = foreign_code_context_condition(next_config).await?;

    Ok(match ty.into_value() {
        ServerContextType::Pages { .. } | ServerContextType::PagesData { .. } => {
            let external_cjs_modules_plugin = ExternalCjsModulesResolvePluginVc::new(
                project_path,
                next_config.transpile_packages(),
            );

            let resolve_options_context = ResolveOptionsContext {
                enable_node_modules: true,
                enable_node_externals: true,
                enable_node_native_modules: true,
                module: true,
                custom_conditions: vec!["development".to_string()],
                import_map: Some(next_server_import_map),
                plugins: vec![external_cjs_modules_plugin.into()],
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
                enable_node_modules: true,
                enable_node_externals: true,
                enable_node_native_modules: true,
                module: true,
                custom_conditions: vec!["development".to_string()],
                import_map: Some(next_server_import_map),
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
                enable_node_modules: true,
                enable_node_externals: true,
                enable_node_native_modules: true,
                module: true,
                custom_conditions: vec!["development".to_string(), "react-server".to_string()],
                import_map: Some(next_server_import_map),
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

#[turbo_tasks::function]
pub fn get_server_environment(
    ty: Value<ServerContextType>,
    process_env: ProcessEnvVc,
    server_addr: ServerAddrVc,
) -> EnvironmentVc {
    EnvironmentVc::new(
        Value::new(ExecutionEnvironment::NodeJsLambda(
            NodeJsEnvironmentVc::current(process_env, server_addr),
        )),
        match ty.into_value() {
            ServerContextType::Pages { .. } | ServerContextType::PagesData { .. } => {
                Value::new(EnvironmentIntention::ServerRendering)
            }
            ServerContextType::AppSSR { .. } => Value::new(EnvironmentIntention::Prerendering),
            ServerContextType::AppRSC { .. } => Value::new(EnvironmentIntention::ServerRendering),
        },
    )
}

#[turbo_tasks::function]
pub async fn get_server_module_options_context(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    ty: Value<ServerContextType>,
    next_config: NextConfigVc,
) -> Result<ModuleOptionsContextVc> {
    let custom_rules = get_next_server_transforms_rules(ty.into_value()).await?;
    let foreign_code_context_condition = foreign_code_context_condition(next_config).await?;
    let enable_postcss_transform = Some(PostCssTransformOptions {
        postcss_package: Some(get_postcss_package_mapping(project_path)),
        ..Default::default()
    });
    let enable_webpack_loaders = next_config.webpack_loaders_options().await?.clone_if();

    let module_options_context = match ty.into_value() {
        ServerContextType::Pages { .. } | ServerContextType::PagesData { .. } => {
            let module_options_context = ModuleOptionsContext {
                execution_context: Some(execution_context),
                ..Default::default()
            };
            ModuleOptionsContext {
                enable_jsx: true,
                enable_styled_jsx: true,
                enable_postcss_transform,
                enable_webpack_loaders,
                enable_typescript_transform: true,
                rules: vec![(
                    foreign_code_context_condition,
                    module_options_context.clone().cell(),
                )],
                custom_rules,
                ..module_options_context
            }
        }
        ServerContextType::AppSSR { .. } => {
            let module_options_context = ModuleOptionsContext {
                execution_context: Some(execution_context),
                ..Default::default()
            };
            ModuleOptionsContext {
                enable_jsx: true,
                enable_styled_jsx: true,
                enable_postcss_transform,
                enable_webpack_loaders,
                enable_typescript_transform: true,
                rules: vec![(
                    foreign_code_context_condition,
                    module_options_context.clone().cell(),
                )],
                custom_rules,
                ..module_options_context
            }
        }
        ServerContextType::AppRSC { .. } => {
            let module_options_context = ModuleOptionsContext {
                custom_ecmascript_transforms: vec![EcmascriptInputTransform::ClientDirective(
                    StringVc::cell("server-to-client".to_string()),
                )],
                execution_context: Some(execution_context),
                ..Default::default()
            };
            ModuleOptionsContext {
                enable_jsx: true,
                enable_postcss_transform,
                enable_webpack_loaders,
                enable_typescript_transform: true,
                rules: vec![(
                    foreign_code_context_condition,
                    module_options_context.clone().cell(),
                )],
                custom_rules,
                ..module_options_context
            }
        }
    }
    .cell();

    Ok(module_options_context)
}

#[turbo_tasks::function]
pub fn get_build_resolve_options_context(
    project_path: FileSystemPathVc,
) -> ResolveOptionsContextVc {
    let next_build_import_map = get_next_build_import_map(project_path);
    ResolveOptionsContext {
        enable_typescript: true,
        enable_node_modules: true,
        enable_node_externals: true,
        enable_node_native_modules: true,
        custom_conditions: vec!["development".to_string()],
        import_map: Some(next_build_import_map),
        ..Default::default()
    }
    .cell()
}

#[turbo_tasks::function]
pub fn get_build_module_options_context() -> ModuleOptionsContextVc {
    ModuleOptionsContext {
        enable_typescript_transform: true,
        ..Default::default()
    }
    .cell()
}
