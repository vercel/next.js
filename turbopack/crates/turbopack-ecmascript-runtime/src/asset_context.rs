use turbo_tasks::{Result, Vc};
use turbopack::{
    module_options::{EcmascriptOptionsContext, ModuleOptionsContext, TypescriptTransformOptions},
    ModuleAssetContext,
};
use turbopack_core::{
    compile_time_info::CompileTimeInfo, context::AssetContext, environment::Environment,
};
use turbopack_ecmascript::TreeShakingMode;

/// Returns the runtime asset context to use to process runtime code assets.
pub async fn get_runtime_asset_context(
    environment: Vc<Environment>,
) -> Result<Vc<Box<dyn AssetContext>>> {
    let module_options_context = ModuleOptionsContext {
        ecmascript: EcmascriptOptionsContext {
            enable_typescript_transform: Some(
                TypescriptTransformOptions::default().resolved_cell(),
            ),
            ..Default::default()
        },
        // TODO: Somehow this fails to compile when enabled.
        // preset_env_versions: Some(environment),
        tree_shaking_mode: Some(TreeShakingMode::ReexportsOnly),
        ..Default::default()
    }
    .cell();
    let compile_time_info = CompileTimeInfo::builder(environment.to_resolved().await?)
        .cell()
        .await?;

    let asset_context: Vc<Box<dyn AssetContext>> = Vc::upcast(ModuleAssetContext::new(
        Default::default(),
        compile_time_info,
        module_options_context,
        Vc::default(),
        Vc::cell("runtime".into()),
    ));

    Ok(asset_context)
}
