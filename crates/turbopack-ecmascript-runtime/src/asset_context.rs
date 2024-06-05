use turbo_tasks::Vc;
use turbopack::{
    module_options::{ModuleOptionsContext, TypescriptTransformOptions},
    ModuleAssetContext,
};
use turbopack_core::{
    compile_time_info::CompileTimeInfo, context::AssetContext, environment::Environment,
};
use turbopack_ecmascript::TreeShakingMode;

/// Returns the runtime asset context to use to process runtime code assets.
pub fn get_runtime_asset_context(environment: Vc<Environment>) -> Vc<Box<dyn AssetContext>> {
    let module_options_context = ModuleOptionsContext {
        enable_typescript_transform: Some(TypescriptTransformOptions::default().cell()),
        tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
        ..Default::default()
    }
    .cell();
    let compile_time_info = CompileTimeInfo::builder(environment).cell();

    let asset_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Vc::cell(Default::default()),
        compile_time_info,
        module_options_context,
        Vc::default(),
        Vc::cell("runtime".into()),
    ));

    asset_context
}
