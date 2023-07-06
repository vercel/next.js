use anyhow::Result;
use indexmap::indexmap;
use turbopack_binding::{
    turbo::tasks::Value,
    turbopack::{
        core::{
            asset::AssetVc,
            context::AssetContext,
            reference_type::{InnerAssetsVc, ReferenceType},
            resolve::ModulePartVc,
        },
        r#static::StaticModuleAssetVc,
        turbopack::{
            module_options::{CustomModuleType, CustomModuleTypeVc},
            ModuleAssetContextVc,
        },
    },
};

use super::source_asset::StructuredImageSourceAsset;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Copy, Debug, PartialOrd, Ord, Hash)]
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

impl StructuredImageModuleType {
    pub(crate) fn create_module(
        source: AssetVc,
        blur_placeholder_mode: BlurPlaceholderMode,
        context: ModuleAssetContextVc,
    ) -> AssetVc {
        let static_asset = StaticModuleAssetVc::new(source, context.into());
        context.process(
            StructuredImageSourceAsset {
                image: source,
                blur_placeholder_mode,
            }
            .cell()
            .into(),
            Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap!(
                "IMAGE".to_string() => static_asset.into()
            )))),
        )
    }
}

#[turbo_tasks::value_impl]
impl StructuredImageModuleTypeVc {
    #[turbo_tasks::function]
    pub fn new(blur_placeholder_mode: Value<BlurPlaceholderMode>) -> Self {
        StructuredImageModuleTypeVc::cell(StructuredImageModuleType {
            blur_placeholder_mode: blur_placeholder_mode.into_value(),
        })
    }
}

#[turbo_tasks::value_impl]
impl CustomModuleType for StructuredImageModuleType {
    #[turbo_tasks::function]
    fn create_module(
        &self,
        source: AssetVc,
        context: ModuleAssetContextVc,
        _part: Option<ModulePartVc>,
    ) -> AssetVc {
        StructuredImageModuleType::create_module(source, self.blur_placeholder_mode, context.into())
    }
}
