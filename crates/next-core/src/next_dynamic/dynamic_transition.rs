use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack::{transition::Transition, ModuleAssetContext};
use turbopack_core::{
    context::{AssetContext, ProcessResult},
    reference_type::ReferenceType,
    source::Source,
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceable;

use super::NextDynamicEntryModule;

/// This transition is used to create the marker asset for a next/dynamic
/// import. Optionally, it can also apply another transition (i.e. to the client context).
///
/// This will get picked up during module processing and will be used to
/// create the dynamic entry, and the dynamic manifest entry.
#[turbo_tasks::value]
pub struct NextDynamicTransition {
    client_transition: Option<ResolvedVc<Box<dyn Transition>>>,
}

#[turbo_tasks::value_impl]
impl NextDynamicTransition {
    /// Create a transition that only add a marker `NextDynamicEntryModule`.
    #[turbo_tasks::function]
    pub fn new_marker() -> Vc<Self> {
        NextDynamicTransition {
            client_transition: None,
        }
        .cell()
    }

    /// Create a transition that applies `client_transiton` and adds a marker
    /// `NextDynamicEntryModule`.
    #[turbo_tasks::function]
    pub fn new_client(client_transition: ResolvedVc<Box<dyn Transition>>) -> Vc<Self> {
        NextDynamicTransition {
            client_transition: Some(client_transition),
        }
        .cell()
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
        let module = match self.await?.client_transition {
            Some(client_transition) => client_transition.process(
                source,
                module_asset_context,
                Value::new(ReferenceType::Undefined),
            ),
            None => module_asset_context.process(source, Value::new(ReferenceType::Undefined)),
        };

        Ok(match &*module.try_into_module().await? {
            Some(client_module) => {
                let Some(client_module) =
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*client_module)
                else {
                    bail!("not an ecmascript client_module");
                };

                ProcessResult::Module(ResolvedVc::upcast(
                    NextDynamicEntryModule::new(*client_module)
                        .to_resolved()
                        .await?,
                ))
            }
            None => ProcessResult::Ignore,
        }
        .cell())
    }
}
