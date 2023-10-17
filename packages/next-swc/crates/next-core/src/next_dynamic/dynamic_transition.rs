use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_binding::turbopack::{
    core::{module::Module, reference_type::ReferenceType, source::Source},
    turbopack::{
        transition::{ContextTransition, Transition},
        ModuleAssetContext,
    },
};

use super::NextDynamicEntryModule;

/// This transition is used to create the marker asset for a next/dynamic
/// import. This will get picked up during module processing and will be used to
/// create the dynamic entry, and the dynamic manifest entry.
#[turbo_tasks::value]
pub struct NextDynamicTransition {
    client_transition: Vc<ContextTransition>,
}

#[turbo_tasks::value_impl]
impl NextDynamicTransition {
    #[turbo_tasks::function]
    pub fn new(client_transition: Vc<ContextTransition>) -> Vc<Self> {
        NextDynamicTransition { client_transition }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextDynamicTransition {
    #[turbo_tasks::function]
    async fn process(
        &self,
        source: Vc<Box<dyn Source>>,
        context: Vc<ModuleAssetContext>,
        _reference_type: Value<ReferenceType>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let client_module =
            self.client_transition
                .process(source, context, Value::new(ReferenceType::Undefined));

        Ok(Vc::upcast(NextDynamicEntryModule::new(client_module)))
    }
}
