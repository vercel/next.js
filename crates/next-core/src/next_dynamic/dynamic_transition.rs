use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::{ModuleAssetContext, transition::Transition};
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

    /// Create a transition that applies `client_transition` and adds a marker
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
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        _reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let module_asset_context = self.process_context(module_asset_context);
        let module = match turbo_tasks::read!(self)?.client_transition {
            Some(client_transition) => {
                client_transition.process(source, module_asset_context, ReferenceType::Undefined)
            }
            None => module_asset_context.process(source, ReferenceType::Undefined),
        };

        Ok(match &*turbo_tasks::read!(module.try_into_module())? {
            Some(client_module) => {
                let Some(client_module) =
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*client_module)
                else {
                    bail!("not an ecmascript client_module");
                };

                ProcessResult::Module(ResolvedVc::upcast(turbo_tasks::read!(
                    NextDynamicEntryModule::new(*client_module).to_resolved()
                )?))
            }
            None => ProcessResult::Ignore,
        }
        .cell())
    }
}
