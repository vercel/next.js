use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    source::Source,
};

use crate::utils::StringifyJs;

/// A source asset that exports the string content of an asset as the default
/// export of a JS module.
#[turbo_tasks::value]
pub struct TextContentFileSource {
    pub source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl TextContentFileSource {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<Self> {
        TextContentFileSource { source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Source for TextContentFileSource {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .source
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("text content"))
            .rename_as("*.mjs")
            .into_vc())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<RcStr>> {
        let inner = self.source.description().await?;
        Ok(Vc::cell(format!("text content of {}", inner).into()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for TextContentFileSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let source = self.source.content().file_content();
        let FileContent::Content(content) = &*source.await? else {
            return Ok(AssetContent::file(FileContent::NotFound.cell()));
        };
        let text = content.content().to_str()?;
        let code: RcStr = format!("export default {};", StringifyJs(&text)).into();
        let content = FileContent::Content(code.into()).cell();
        Ok(AssetContent::file(content))
    }
}
