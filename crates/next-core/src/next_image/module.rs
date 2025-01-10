use anyhow::Result;
use turbo_tasks::{fxindexmap, ResolvedVc, TaskInput, Value, Vc};
use turbopack::{module_options::CustomModuleType, ModuleAssetContext};
use turbopack_core::{
    context::AssetContext, module::Module, reference_type::ReferenceType, resolve::ModulePart,
    source::Source,
};
use turbopack_static::StaticModuleAsset;

use super::source_asset::StructuredImageFileSource;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Copy, Debug, PartialOrd, Ord, Hash, TaskInput)]
pub enum BlurPlaceholderMode {
    /// Do not generate a blur placeholder at all.
    None,
    /// Generate a blur placeholder as data url and embed it directly into the
    /// JavaScript code. This needs to compute the blur placeholder eagerly and
    /// has a higher computation overhead.
    DataUrl,
    /// Avoid generating a blur placeholder eagerly and uses `/_next/image`
    /// instead to compute one on demand. This changes the UX slightly (blur
    /// placeholder is shown later than it should be) and should
    /// only be used for development.
    NextImageUrl,
}

/// Module type that analyzes images and offers some meta information like
/// width, height and blur placeholder as export from the module.
#[turbo_tasks::value]
pub struct StructuredImageModuleType {
    pub blur_placeholder_mode: BlurPlaceholderMode,
}

#[turbo_tasks::value_impl]
impl StructuredImageModuleType {
    #[turbo_tasks::function]
    pub(crate) async fn create_module(
        source: ResolvedVc<Box<dyn Source>>,
        blur_placeholder_mode: BlurPlaceholderMode,
        module_asset_context: ResolvedVc<ModuleAssetContext>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let static_asset = StaticModuleAsset::new(*source, Vc::upcast(*module_asset_context))
            .to_resolved()
            .await?;
        Ok(module_asset_context
            .process(
                Vc::upcast(
                    StructuredImageFileSource {
                        image: source,
                        blur_placeholder_mode,
                    }
                    .cell(),
                ),
                Value::new(ReferenceType::Internal(ResolvedVc::cell(fxindexmap!(
                    "IMAGE".into() => ResolvedVc::upcast(static_asset)
                )))),
            )
            .module())
    }

    #[turbo_tasks::function]
    pub fn new(blur_placeholder_mode: Value<BlurPlaceholderMode>) -> Vc<Self> {
        StructuredImageModuleType::cell(StructuredImageModuleType {
            blur_placeholder_mode: blur_placeholder_mode.into_value(),
        })
    }
}

#[turbo_tasks::value_impl]
impl CustomModuleType for StructuredImageModuleType {
    #[turbo_tasks::function]
    fn create_module(
        &self,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        _part: Option<Vc<ModulePart>>,
    ) -> Vc<Box<dyn Module>> {
        StructuredImageModuleType::create_module(
            source,
            self.blur_placeholder_mode,
            module_asset_context,
        )
    }
}
