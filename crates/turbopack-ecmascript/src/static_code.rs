use anyhow::{bail, Result};
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    context::AssetContext,
    file_source::FileSource,
    reference_type::ReferenceType,
};

use crate::EcmascriptModuleAsset;

/// Static ECMAScript file code, to be used as part of some code.
///
/// Useful to transform partial runtime code files, which get concatenated into
/// the final runtime code, while keeping source map information.
#[turbo_tasks::value]
pub struct StaticEcmascriptCode {
    asset_context: Vc<Box<dyn AssetContext>>,
    asset: Vc<EcmascriptModuleAsset>,
}

#[turbo_tasks::value_impl]
impl StaticEcmascriptCode {
    /// Creates a new [`Vc<StaticEcmascriptCode>`].
    #[turbo_tasks::function]
    pub async fn new(
        asset_context: Vc<Box<dyn AssetContext>>,
        asset_path: Vc<FileSystemPath>,
    ) -> Result<Vc<Self>> {
        let module = asset_context
            .process(
                Vc::upcast(FileSource::new(asset_path)),
                Value::new(ReferenceType::Runtime),
            )
            .module();
        let Some(asset) = Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await?
        else {
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
    pub async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let runtime_base_content = this.asset.module_content_without_analysis().await?;
        let mut code = CodeBuilder::default();
        code.push_source(
            &runtime_base_content.inner_code,
            runtime_base_content.source_map,
        );
        Ok(Code::cell(code.build()))
    }
}
