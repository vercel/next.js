use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    ident::AssetIdentVc,
};

use crate::utils::StringifyJs;

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("text content".to_string())
}

/// A source asset that exports the string content of an asset as the default
/// export of a JS module.
#[turbo_tasks::value]
pub struct TextContentSourceAsset {
    pub source: AssetVc,
}

#[turbo_tasks::value_impl]
impl TextContentSourceAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc) -> Self {
        TextContentSourceAsset { source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for TextContentSourceAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let source = self.source.content().file_content();
        let FileContent::Content(content) = &*source.await? else {
            return Ok(FileContent::NotFound.cell().into());
        };
        let text = content.content().to_str()?;
        let code = format!("export default {};", StringifyJs(&text));
        let content = FileContent::Content(code.into()).cell();
        Ok(content.into())
    }
}
