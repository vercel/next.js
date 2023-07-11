use anyhow::{bail, Result};
use turbo_tasks::Value;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    code_builder::{CodeBuilder, CodeVc},
    context::{AssetContext, AssetContextVc},
    file_source::FileSourceVc,
    reference_type::ReferenceType,
};

use crate::EcmascriptModuleAssetVc;

/// Static ECMAScript file code, to be used as part of some code.
///
/// Useful to transform partial runtime code files, which get concatenated into
/// the final runtime code, while keeping source map information.
#[turbo_tasks::value]
pub struct StaticEcmascriptCode {
    asset_context: AssetContextVc,
    asset: EcmascriptModuleAssetVc,
}

#[turbo_tasks::value_impl]
impl StaticEcmascriptCodeVc {
    /// Creates a new [`StaticEcmascriptCodeVc`].
    #[turbo_tasks::function]
    pub async fn new(asset_context: AssetContextVc, asset_path: FileSystemPathVc) -> Result<Self> {
        let asset = asset_context.process(
            FileSourceVc::new(asset_path).into(),
            Value::new(ReferenceType::Undefined),
        );
        let Some(asset) = EcmascriptModuleAssetVc::resolve_from(&asset).await? else {
            bail!("asset is not an Ecmascript module")
        };
        Ok(Self::cell(StaticEcmascriptCode {
            asset_context,
            asset,
        }))
    }

    /// Computes the contents of the asset and pushes it to
    /// the code builder, including the source map if available.
    #[turbo_tasks::function]
    pub async fn code(self) -> Result<CodeVc> {
        let this = self.await?;
        let runtime_base_content = this.asset.module_content_without_analysis().await?;
        let mut code = CodeBuilder::default();
        code.push_source(
            &runtime_base_content.inner_code,
            runtime_base_content.source_map.map(|map| map.into()),
        );
        Ok(CodeVc::cell(code.build()))
    }
}
