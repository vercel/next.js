use anyhow::{Context, Result};
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack::{css::chunk::CssChunkPlaceable, transition::Transition, ModuleAssetContext};
use turbopack_core::{
    context::{AssetContext, ProcessResult},
    reference_type::{CssReferenceSubType, ReferenceType},
    source::Source,
};

use crate::next_client_reference::css_client_reference::css_client_reference_module::CssClientReferenceModule;

#[turbo_tasks::value(shared)]
pub struct NextCssClientReferenceTransition {
    client_transition: Option<ResolvedVc<Box<dyn Transition>>>,
}

#[turbo_tasks::value_impl]
impl NextCssClientReferenceTransition {
    /// Create a transition that only add a marker `CssClientReferenceModule`.
    #[turbo_tasks::function]
    pub fn new_marker() -> Vc<Self> {
        NextCssClientReferenceTransition {
            client_transition: None,
        }
        .cell()
    }

    /// Create a transition that applies `client_transiton` and adds a marker
    /// `CssClientReferenceModule`.
    #[turbo_tasks::function]
    pub fn new_client(client_transition: ResolvedVc<Box<dyn Transition>>) -> Vc<Self> {
        NextCssClientReferenceTransition {
            client_transition: Some(client_transition),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextCssClientReferenceTransition {
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        original_source: Vc<Box<dyn Source>>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ProcessResult>> {
        let new_reference_type = match reference_type.into_value() {
            ReferenceType::Css(CssReferenceSubType::ModuleStyles) => {
                // Prevent an infinite loop since thistransition matches on the InternalModuleStyles
                // reference type
                ReferenceType::Css(CssReferenceSubType::Internal)
            }
            ty => ty,
        };
        let module = if let Some(client_transition) = self.await?.client_transition {
            client_transition.process(
                original_source,
                source,
                module_asset_context,
                Value::new(new_reference_type),
            )
        } else {
            module_asset_context.process(source, Value::new(new_reference_type))
        };

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
