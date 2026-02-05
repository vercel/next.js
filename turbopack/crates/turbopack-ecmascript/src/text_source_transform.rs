use anyhow::{Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContent},
    source::Source,
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};

use crate::utils::StringifyJs;

/// A source transform that converts any file into an ES module that exports
/// the file's content as a default string export.
///
/// This is used for `import text from './file.txt' with { type: 'text' }`.
#[turbo_tasks::value]
pub struct TextSourceTransform;

#[turbo_tasks::value_impl]
impl TextSourceTransform {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        TextSourceTransform.cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for TextSourceTransform {
    #[turbo_tasks::function]
    async fn transform(self: Vc<Self>, source: Vc<Box<dyn Source>>) -> Result<Vc<Box<dyn Source>>> {
        let content = source.content().file_content().await?;
        let text = match &*content {
            FileContent::Content(data) => data.content().to_str()?,
            FileContent::NotFound => {
                // This shouldn't happen because the import was already resolved
                bail!("File not found: {:?}", source.ident().path());
            }
        };

        let code = format!("export default {};", StringifyJs(&text));

        // Add modifier for uniqueness (so same file imported normally vs with type:"text" are
        // distinct). The module type will be set by a separate rule matching on
        // ResourceHasModifier("text_module").
        let ident = source.ident().with_modifier(rcstr!("text_module"));

        Ok(Vc::upcast(VirtualSource::new_with_ident(
            ident,
            AssetContent::file(FileContent::Content(File::from(code)).cell()),
        )))
    }
}
