use anyhow::{Context, Result};
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack::{css::chunk::CssChunkPlaceable, transition::Transition, ModuleAssetContext};
use turbopack_core::{context::ProcessResult, reference_type::ReferenceType, source::Source};

use crate::next_client_reference::css_client_reference::css_client_reference_module::CssClientReferenceModule;

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
        rsc_module_asset_context: Vc<ModuleAssetContext>,
        reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ProcessResult>> {
        let module =
            self.await?
                .client_transition
                .process(source, rsc_module_asset_context, reference_type);

        let ProcessResult::Module(module) = *module.await? else {
            return Ok(ProcessResult::Ignore.cell());
        };

        let client_module = ResolvedVc::try_sidecast::<Box<dyn CssChunkPlaceable>>(module)
            .context("css client asset is not css chunk placeable")?;

        Ok(ProcessResult::Module(ResolvedVc::upcast(
            CssClientReferenceModule::new(*client_module)
                .to_resolved()
                .await?,
        ))
        .cell())
    }
}
