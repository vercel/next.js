use anyhow::Result;
use indexmap::indexmap;
use turbo_binding::{
    turbo::tasks::Value,
    turbopack::{
        core::{
            asset::AssetVc,
            context::{AssetContext, AssetContextVc},
            plugin::{CustomModuleType, CustomModuleTypeVc},
            resolve::ModulePartVc,
        },
        ecmascript::{
            EcmascriptInputTransformsVc, EcmascriptModuleAssetType, EcmascriptModuleAssetVc,
            EcmascriptOptions, InnerAssetsVc,
        },
        r#static::StaticModuleAssetVc,
    },
};

use super::source_asset::StructuredImageSourceAsset;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Copy, Debug, PartialOrd, Ord, Hash)]
pub enum BlurPlaceholderMode {
    /// Do not generate a blur placeholder at all.
    None,
    /// Generate a blur placeholder as data url and embed it directly into the
    /// javascript code. This need to compute the blur placeholder eagerly and
    /// has a higher computation overhead.
    DataUrl,
    /// Avoid generating a blur placeholder eagerly and uses `/_next/image`
    /// instead to compute one on demand. This changes the UX slightly (blur
    /// placeholder is shown later than it should be) and should
    /// only be used for development.
    NextImage,
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
        context: AssetContextVc,
    ) -> EcmascriptModuleAssetVc {
        let static_asset = StaticModuleAssetVc::new(source, context);
        EcmascriptModuleAssetVc::new_with_inner_assets(
            StructuredImageSourceAsset {
                image: source,
                blur_placeholder_mode,
            }
            .cell()
            .into(),
            context,
            Value::new(EcmascriptModuleAssetType::Ecmascript),
            EcmascriptInputTransformsVc::empty(),
            Value::new(EcmascriptOptions {
                ..Default::default()
            }),
            context.compile_time_info(),
            InnerAssetsVc::cell(indexmap!(
                "IMAGE".to_string() => static_asset.into()
            )),
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
        context: AssetContextVc,
        _part: Option<ModulePartVc>,
    ) -> AssetVc {
        StructuredImageModuleType::create_module(source, self.blur_placeholder_mode, context).into()
    }
}
