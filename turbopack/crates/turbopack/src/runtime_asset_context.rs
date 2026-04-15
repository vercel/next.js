use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Result, Vc};
use turbopack_core::{
    compile_time_info::CompileTimeInfo, context::AssetContext, environment::Environment,
    ident::Layer,
};
use turbopack_ecmascript::TreeShakingMode;

use crate::{
    ModuleAssetContext,
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext, TypescriptTransformOptions},
};

/// Returns the runtime asset context used to compile embedded runtime
/// TypeScript files (e.g. the turbopack-ecmascript-runtime JS sources).
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
