use anyhow::Result;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    context::ProcessResult, module::Module, reference_type::ReferenceType, source::Source,
};

use crate::{ModuleAssetContext, transition::Transition};

/// A transition that only affects the asset context.
#[turbo_tasks::value(shared)]
pub struct FullContextTransition {
    module_context: ResolvedVc<ModuleAssetContext>,
}

#[turbo_tasks::value_impl]
impl FullContextTransition {
    #[turbo_tasks::function]
    pub fn new(module_context: ResolvedVc<ModuleAssetContext>) -> Vc<FullContextTransition> {
        FullContextTransition { module_context }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for FullContextTransition {
    #[turbo_tasks::function]
    fn process_context(
        &self,
        _module_asset_context: Vc<ModuleAssetContext>,
    ) -> Vc<ModuleAssetContext> {
        *self.module_context
    }

    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        asset: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let asset = self.process_source(asset);
        let module_asset_context = self.process_context(module_asset_context);
        let asset = asset.to_resolved().await?;

        Ok(match &*module_asset_context
            .process_default(asset, reference_type)
            .await?
            .await?
        {
            ProcessResult::Module(m) => {
                let x = self
                    .process_module(**m, module_asset_context)
                    .to_resolved()
                    .await?;
                let ident = x.ident().to_string().await?;
                if ident.contains("styles.module") {
                    println!("FullContextTransition: {:?} {:?} {:?}", asset, x, ident);
                }
                ProcessResult::Module(x)
            }
            ProcessResult::Unknown(source) => ProcessResult::Unknown(*source),
            ProcessResult::Ignore => ProcessResult::Ignore,
        }
        .cell())
    }
}
