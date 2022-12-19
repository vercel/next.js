use turbo_tasks::Value;
use turbopack_core::{
    context::AssetContextVc,
    environment::{EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment},
    resolve::options::ImportMapVc,
};

use crate::{
    module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
    transition::TransitionsByNameVc, ModuleAssetContextVc,
};

#[turbo_tasks::function]
pub fn node_evaluate_asset_context(import_map: Option<ImportMapVc>) -> AssetContextVc {
    ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(Default::default()),
        EnvironmentVc::new(
            Value::new(ExecutionEnvironment::NodeJsBuildTime(
                NodeJsEnvironment::default().cell(),
            )),
            Value::new(EnvironmentIntention::Build),
        ),
        ModuleOptionsContext {
            enable_typescript_transform: true,
            ..Default::default()
        }
        .cell(),
        ResolveOptionsContext {
            enable_typescript: true,
            enable_node_modules: true,
            enable_node_externals: true,
            enable_node_native_modules: true,
            custom_conditions: vec!["development".to_string(), "node".to_string()],
            import_map,
            ..Default::default()
        }
        .cell(),
    )
    .as_asset_context()
}
