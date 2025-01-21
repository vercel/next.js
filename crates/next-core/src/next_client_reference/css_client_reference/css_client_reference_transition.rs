use anyhow::{Context, Result};
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack::{
    css::{chunk::CssChunkPlaceable, ModuleCssAsset},
    transition::Transition,
    ModuleAssetContext,
};
use turbopack_core::{
    context::ProcessResult,
    module::Module,
    reference_type::{CssReferenceSubType, EntryReferenceSubType, ReferenceType},
    source::Source,
};

use crate::next_client_reference::css_client_reference::{
    css_client_reference_module::CssClientReferenceModule,
    css_module_client_reference_module::CssModuleClientReferenceModule,
};

#[turbo_tasks::value(shared)]
pub struct NextCssClientReferenceTransition {
    client_transition: ResolvedVc<Box<dyn Transition>>,
}

#[turbo_tasks::value_impl]
impl NextCssClientReferenceTransition {
    #[turbo_tasks::function]
    pub fn new(client_transition: ResolvedVc<Box<dyn Transition>>) -> Vc<Self> {
        NextCssClientReferenceTransition { client_transition }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextCssClientReferenceTransition {
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        _reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ProcessResult>> {
        let module_asset_context = self.process_context(module_asset_context);

        let module = self.await?.client_transition.process(
            source,
            module_asset_context,
            Value::new(ReferenceType::Entry(
                EntryReferenceSubType::AppClientComponent,
            )),
        );
        let ProcessResult::Module(module) = *module.await? else {
            return Ok(ProcessResult::Ignore.cell());
        };

        let result: Vc<Box<dyn Module>> = if let Some(css_module_module) =
            ResolvedVc::try_downcast_type_sync::<ModuleCssAsset>(module)
        {
            let ProcessResult::Module(client_module) = *css_module_module
                .inner(Value::new(CssReferenceSubType::Undefined))
                .await?
            else {
                return Ok(ProcessResult::Ignore.cell());
            };

            let client_module =
                ResolvedVc::try_sidecast_sync::<Box<dyn CssChunkPlaceable>>(client_module)
                    .context("client asset is not css chunk placeable")?;

            Vc::upcast(CssModuleClientReferenceModule::new(
                *client_module,
                *ResolvedVc::upcast(css_module_module),
            ))
        } else {
            let client_module = ResolvedVc::try_sidecast_sync::<Box<dyn CssChunkPlaceable>>(module)
                .context("client asset is not css chunk placeable")?;

            Vc::upcast(CssClientReferenceModule::new(*client_module))
        };

        Ok(ProcessResult::Module(result.to_resolved().await?).cell())
    }
}
