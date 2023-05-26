use turbopack::{
    module_options::{ModuleOptionsContext, TypescriptTransformOptions},
    resolve_options_context::ResolveOptionsContextVc,
    transition::TransitionsByNameVc,
    ModuleAssetContextVc,
};
use turbopack_core::{
    compile_time_info::CompileTimeInfo, context::AssetContextVc, environment::EnvironmentVc,
};

/// Returns the runtime asset context to use to process runtime code assets.
pub fn get_runtime_asset_context(environment: EnvironmentVc) -> AssetContextVc {
    let resolve_options_context = ResolveOptionsContextVc::default();
    let module_options_context = ModuleOptionsContext {
        enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
        ..Default::default()
    }
    .cell();
    let compile_time_info = CompileTimeInfo::builder(environment).cell();

    let context: AssetContextVc = ModuleAssetContextVc::new(
        TransitionsByNameVc::cell(Default::default()),
        compile_time_info,
        module_options_context,
        resolve_options_context,
    )
    .into();

    context
}
