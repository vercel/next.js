use anyhow::{bail, Result};
use turbo_tasks::Value;
use turbopack_binding::turbopack::{
    core::{
        module::ModuleVc,
        reference_type::{CssReferenceSubType, ReferenceType},
        resolve::ModulePartVc,
        source::SourceVc,
    },
    turbopack::{
        css::chunk::CssChunkPlaceableVc,
        module_options::{CustomModuleType, CustomModuleTypeVc},
        transition::{Transition, TransitionVc},
        ModuleAssetContextVc,
    },
};

use super::css_client_reference_module::CssClientReferenceModuleVc;

/// Module type for CSS client references. This will be used to hook into CSS
/// asset processing and inject a client reference on the server side.
#[turbo_tasks::value]
pub struct CssClientReferenceModuleType {
    client_transition: TransitionVc,
}

#[turbo_tasks::value_impl]
impl CssClientReferenceModuleTypeVc {
    #[turbo_tasks::function]
    pub fn new(client_transition: TransitionVc) -> Self {
        CssClientReferenceModuleType { client_transition }.cell()
    }
}

#[turbo_tasks::value_impl]
impl CustomModuleType for CssClientReferenceModuleType {
    #[turbo_tasks::function]
    async fn create_module(
        &self,
        source: SourceVc,
        context: ModuleAssetContextVc,
        _part: Option<ModulePartVc>,
    ) -> Result<ModuleVc> {
        let client_module = self.client_transition.process(
            source,
            context,
            Value::new(ReferenceType::Css(CssReferenceSubType::Internal)),
        );

        let Some(client_module) = CssChunkPlaceableVc::resolve_from(&client_module).await? else {
            bail!("client asset is not CSS chunk placeable");
        };

        Ok(CssClientReferenceModuleVc::new(client_module).into())
    }
}
