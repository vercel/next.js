use anyhow::{bail, Result};
use turbo_tasks::{Value, Vc};
use turbopack_binding::turbopack::{
    core::{
        module::Module,
        reference_type::{CssReferenceSubType, ReferenceType},
        resolve::ModulePart,
        source::Source,
    },
    turbopack::{
        css::chunk::CssChunkPlaceable, module_options::CustomModuleType, transition::Transition,
        ModuleAssetContext,
    },
};

use super::css_client_reference_module::CssClientReferenceModule;

/// Module type for CSS client references. This will be used to hook into CSS
/// asset processing and inject a client reference on the server side.
#[turbo_tasks::value]
pub struct CssClientReferenceModuleType {
    client_transition: Vc<Box<dyn Transition>>,
}

#[turbo_tasks::value_impl]
impl CssClientReferenceModuleType {
    #[turbo_tasks::function]
    pub fn new(client_transition: Vc<Box<dyn Transition>>) -> Vc<Self> {
        CssClientReferenceModuleType { client_transition }.cell()
    }
}

#[turbo_tasks::value_impl]
impl CustomModuleType for CssClientReferenceModuleType {
    #[turbo_tasks::function]
    async fn create_module(
        &self,
        source: Vc<Box<dyn Source>>,
        context: Vc<ModuleAssetContext>,
        _part: Option<Vc<ModulePart>>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let client_module = self
            .client_transition
            .process(
                source,
                context,
                Value::new(ReferenceType::Css(CssReferenceSubType::Internal)),
            )
            .module();

        let Some(client_module) =
            Vc::try_resolve_sidecast::<Box<dyn CssChunkPlaceable>>(client_module).await?
        else {
            bail!("client asset is not CSS chunk placeable");
        };

        Ok(Vc::upcast(CssClientReferenceModule::new(client_module)))
    }
}
