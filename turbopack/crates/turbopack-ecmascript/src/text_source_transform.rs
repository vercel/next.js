use anyhow::{Result, bail};
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContent},
    source::Source,
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};

use crate::utils::{StringifyJs, inline_source_map_comment};

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
        let ident = source.ident();
        let path = ident.path().await?;
        let content = source.content().file_content().await?;
        let text = match &*content {
            FileContent::Content(data) => data.content().to_str()?,
            FileContent::NotFound => {
                // This shouldn't happen because the import was already resolved
                bail!("File not found: {:?}", path);
            }
        };

        // Generate ES module with inline source map pointing back to the original file.
        let code = format!(
            "\"use turbopack no side effects\";\nexport default {};\n{}",
            StringifyJs(&text),
            inline_source_map_comment(&path.path, &text)
        );

        // Rename to .mjs so module rules recognize it as ESM.
        // The inline source map ensures debuggers show the original file.
        let new_ident = ident.rename_as(format!("{}.[text].mjs", path.path).into());

        Ok(Vc::upcast(VirtualSource::new_with_ident(
            new_ident,
            AssetContent::file(FileContent::Content(File::from(code)).cell()),
        )))
    }
}
