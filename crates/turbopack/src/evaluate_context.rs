use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    compile_time_defines,
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    resolve::options::{ImportMap, ImportMapping},
};
use turbopack_node::execution_context::ExecutionContext;

use crate::{
    module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByName, ModuleAssetContext,
};

#[turbo_tasks::function]
pub fn node_build_environment() -> Vc<Environment> {
    Environment::new(Value::new(ExecutionEnvironment::NodeJsBuildTime(
        NodeJsEnvironment::default().cell(),
    )))
}

#[turbo_tasks::function]
pub async fn node_evaluate_asset_context(
    execution_context: Vc<ExecutionContext>,
    import_map: Option<Vc<ImportMap>>,
    transitions: Option<Vc<TransitionsByName>>,
) -> Result<Vc<Box<dyn AssetContext>>> {
    let mut import_map = if let Some(import_map) = import_map {
        import_map.await?.clone_value()
    } else {
        ImportMap::empty()
    };
    import_map.insert_wildcard_alias(
        "@vercel/turbopack-node/",
        ImportMapping::PrimaryAlternative(
            "./*".to_string(),
            Some(turbopack_node::embed_js::embed_fs().root()),
        )
        .cell(),
    );
    let import_map = import_map.cell();
    let node_env =
        if let Some(node_env) = &*execution_context.env().read("NODE_ENV".to_string()).await? {
            node_env.clone()
        } else {
            "development".to_string()
        };
    Ok(Vc::upcast(ModuleAssetContext::new(
        transitions.unwrap_or_else(|| Vc::cell(Default::default())),
        CompileTimeInfo::builder(node_build_environment())
            .defines(
                compile_time_defines!(
                    process.turbopack = true,
                    process.env.NODE_ENV = node_env.clone(),
                )
                .cell(),
            )
            .cell(),
        ModuleOptionsContext {
            enable_typescript_transform: Some(Default::default()),
            ..Default::default()
        }
        .cell(),
        ResolveOptionsContext {
            enable_typescript: true,
            enable_node_modules: Some(execution_context.project_path().root().resolve().await?),
            enable_node_externals: true,
            enable_node_native_modules: true,
            custom_conditions: vec![node_env, "node".to_string()],
            import_map: Some(import_map),
            ..Default::default()
        }
        .cell(),
    )))
}
