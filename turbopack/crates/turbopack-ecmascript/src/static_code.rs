use anyhow::{bail, Result};
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    code_builder::{Code, CodeBuilder},
    context::AssetContext,
    file_source::FileSource,
    reference_type::ReferenceType,
};

use crate::EcmascriptAnalyzable;

/// Static ECMAScript file code, to be used as part of some code.
///
/// Useful to transform partial runtime code files, which get concatenated into
/// the final runtime code, while keeping source map information.
#[turbo_tasks::value]
pub struct StaticEcmascriptCode {
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    asset: ResolvedVc<Box<dyn EcmascriptAnalyzable>>,
}

#[turbo_tasks::value_impl]
impl StaticEcmascriptCode {
    /// Creates a new [`Vc<StaticEcmascriptCode>`].
    #[turbo_tasks::function]
    pub async fn new(
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        asset_path: ResolvedVc<FileSystemPath>,
    ) -> Result<Vc<Self>> {
        let module = asset_context
            .process(
                Vc::upcast(FileSource::new(*asset_path)),
                Value::new(ReferenceType::Runtime),
            )
            .module()
            .to_resolved()
            .await?;
        let Some(asset) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptAnalyzable>>(module).await?
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
    pub async fn code(&self) -> Result<Vc<Code>> {
        let runtime_base_content = self.asset.module_content_without_analysis().await?;
        let mut code = CodeBuilder::default();
        code.push_source(
            &runtime_base_content.inner_code,
            runtime_base_content.source_map.map(|v| *v),
        );
        Ok(Code::cell(code.build()))
    }
}
