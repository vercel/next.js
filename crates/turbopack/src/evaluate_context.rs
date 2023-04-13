use anyhow::Result;
use turbo_tasks::Value;
use turbo_tasks_fs::{FileSystem, FileSystemPathVc};
use turbopack_core::{
    compile_time_defines,
    compile_time_info::CompileTimeInfo,
    context::AssetContextVc,
    environment::{EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    resolve::options::{ImportMap, ImportMapVc, ImportMapping},
};

use crate::{
    module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc, ModuleAssetContextVc,
};

#[turbo_tasks::function]
pub fn node_build_environment() -> EnvironmentVc {
    EnvironmentVc::new(
        Value::new(ExecutionEnvironment::NodeJsBuildTime(
            NodeJsEnvironment::default().cell(),
        )),
        Value::new(EnvironmentIntention::Build),
    )
}

#[turbo_tasks::function]
pub async fn node_evaluate_asset_context(
    project_path: FileSystemPathVc,
    import_map: Option<ImportMapVc>,
    transitions: Option<TransitionsByNameVc>,
) -> Result<AssetContextVc> {
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
    Ok(ModuleAssetContextVc::new(
        transitions.unwrap_or_else(|| TransitionsByNameVc::cell(Default::default())),
        CompileTimeInfo::builder(node_build_environment())
            .defines(
                compile_time_defines!(
                    process.turbopack = true,
                    process.env.NODE_ENV = "development",
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
            enable_node_modules: Some(project_path.root().resolve().await?),
            enable_node_externals: true,
            enable_node_native_modules: true,
            custom_conditions: vec!["development".to_string(), "node".to_string()],
            import_map: Some(import_map),
            ..Default::default()
        }
        .cell(),
    )
    .as_asset_context())
}
