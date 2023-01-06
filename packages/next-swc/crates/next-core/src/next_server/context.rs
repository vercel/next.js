use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    condition::ContextCondition,
    module_options::{ModuleOptionsContext, ModuleOptionsContextVc, PostCssTransformOptions},
    resolve_options_context::{ResolveOptionsContext, ResolveOptionsContextVc},
};
use turbopack_core::environment::{
    EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironmentVc, ServerAddrVc,
};
use turbopack_ecmascript::EcmascriptInputTransform;
use turbopack_node::execution_context::ExecutionContextVc;

use crate::{
    next_build::get_postcss_package_mapping,
    next_client::context::add_next_font_transform,
    next_config::NextConfigVc,
    next_import_map::{get_next_build_import_map, get_next_server_import_map},
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Copy, Clone, Hash, PartialOrd, Ord)]
pub enum ServerContextType {
    Pages { pages_dir: FileSystemPathVc },
    AppSSR { app_dir: FileSystemPathVc },
    AppRSC { app_dir: FileSystemPathVc },
}

#[turbo_tasks::function]
pub fn get_server_resolve_options_context(
    project_path: FileSystemPathVc,
    ty: Value<ServerContextType>,
    next_config: NextConfigVc,
) -> ResolveOptionsContextVc {
    let next_server_import_map = get_next_server_import_map(project_path, ty, next_config);
    match ty.into_value() {
        ServerContextType::Pages { .. } | ServerContextType::AppSSR { .. } => {
            let resolve_options_context = ResolveOptionsContext {
                enable_node_modules: true,
                enable_node_externals: true,
                enable_node_native_modules: true,
                custom_conditions: vec!["development".to_string()],
                import_map: Some(next_server_import_map),
                module: true,
                ..Default::default()
            };
            ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                rules: vec![(
                    ContextCondition::InDirectory("node_modules".to_string()),
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
                custom_conditions: vec!["development".to_string(), "react-server".to_string()],
                import_map: Some(next_server_import_map),
                module: true,
                ..Default::default()
            };
            ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                rules: vec![(
                    ContextCondition::InDirectory("node_modules".to_string()),
                    resolve_options_context.clone().cell(),
                )],
                ..resolve_options_context
            }
        }
    }
    .cell()
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
            ServerContextType::Pages { .. } => Value::new(EnvironmentIntention::ServerRendering),
            ServerContextType::AppSSR { .. } => Value::new(EnvironmentIntention::Prerendering),
            ServerContextType::AppRSC { .. } => Value::new(EnvironmentIntention::ServerRendering),
        },
    )
}

#[turbo_tasks::function]
pub fn get_server_module_options_context(
    project_path: FileSystemPathVc,
    execution_context: ExecutionContextVc,
    ty: Value<ServerContextType>,
) -> ModuleOptionsContextVc {
    let module_options_context = match ty.into_value() {
        ServerContextType::Pages { .. } => {
            let module_options_context = ModuleOptionsContext {
                execution_context: Some(execution_context),
                ..Default::default()
            };
            ModuleOptionsContext {
                enable_jsx: true,
                enable_styled_jsx: true,
                enable_postcss_transform: Some(PostCssTransformOptions {
                    postcss_package: Some(get_postcss_package_mapping(project_path)),
                    ..Default::default()
                }),
                enable_typescript_transform: true,
                rules: vec![(
                    ContextCondition::InDirectory("node_modules".to_string()),
                    module_options_context.clone().cell(),
                )],
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
                enable_postcss_transform: Some(PostCssTransformOptions {
                    postcss_package: Some(get_postcss_package_mapping(project_path)),
                    ..Default::default()
                }),
                enable_typescript_transform: true,
                rules: vec![(
                    ContextCondition::InDirectory("node_modules".to_string()),
                    module_options_context.clone().cell(),
                )],
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
                enable_postcss_transform: Some(PostCssTransformOptions {
                    postcss_package: Some(get_postcss_package_mapping(project_path)),
                    ..Default::default()
                }),
                enable_typescript_transform: true,
                rules: vec![(
                    ContextCondition::InDirectory("node_modules".to_string()),
                    module_options_context.clone().cell(),
                )],
                ..module_options_context
            }
        }
    }
    .cell();

    add_next_font_transform(module_options_context)
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
