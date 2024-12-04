use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack::{transition::Transition, ModuleAssetContext};
use turbopack_core::{context::ProcessResult, reference_type::ReferenceType, source::Source};

use super::NextDynamicEntryModule;

/// This transition is used to create the marker asset for a next/dynamic
/// import.
///
/// This will get picked up during module processing and will be used to
/// create the dynamic entry, and the dynamic manifest entry.
#[turbo_tasks::value]
pub struct NextDynamicTransition {
    client_transition: ResolvedVc<Box<dyn Transition>>,
}

#[turbo_tasks::value_impl]
impl NextDynamicTransition {
    #[turbo_tasks::function]
    pub fn new(client_transition: ResolvedVc<Box<dyn Transition>>) -> Vc<Self> {
        NextDynamicTransition { client_transition }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextDynamicTransition {
    #[turbo_tasks::function]
    fn process_layer(self: Vc<Self>, layer: Vc<RcStr>) -> Vc<RcStr> {
        layer
    }

    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        _reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ProcessResult>> {
        let module_asset_context = self.process_context(module_asset_context);

        let this = self.await?;

        Ok(match *this
            .client_transition
            .process(
                source,
                module_asset_context,
                Value::new(ReferenceType::Undefined),
            )
            .try_into_module()
            .await?
        {
            Some(client_module) => ProcessResult::Module(ResolvedVc::upcast(
                NextDynamicEntryModule::new(*client_module)
                    .to_resolved()
                    .await?,
            )),
            None => ProcessResult::Ignore,
        }
        .cell())
    }
}
