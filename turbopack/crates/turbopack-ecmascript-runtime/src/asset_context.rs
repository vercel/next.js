use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Result, Vc};
use turbopack::{
    ModuleAssetContext,
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext, TypescriptTransformOptions},
};
use turbopack_core::{
    compile_time_info::CompileTimeInfo, context::AssetContext, environment::Environment,
    ident::Layer,
};
use turbopack_ecmascript::TreeShakingMode;

/// Returns the runtime asset context to use to process runtime code assets.
#[turbo_tasks::function]
pub async fn get_runtime_asset_context(
    environment: ResolvedVc<Environment>,
) -> Result<Vc<Box<dyn AssetContext>>> {
    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typescript_transform: Some(
                TypescriptTransformOptions::default().resolved_cell(),
            ),
            inline_helpers: true,
            ..Default::default()
        },
        environment: Some(environment),
        tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
        ..Default::default()
    }
    .cell();
    let compile_time_info = CompileTimeInfo::builder(environment).cell().await?;

    let asset_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Default::default(),
        compile_time_info,
        module_options_context,
        Vc::default(),
        Layer::new(rcstr!("runtime")),
    ));

    Ok(asset_context)
}
