use std::io::Read;

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
/// the file's content as a default Uint8Array export.
///
/// This is used for `import bytes from './file.bin' with { type: 'bytes' }`.
#[turbo_tasks::value]
pub struct BytesSourceTransform;

#[turbo_tasks::value_impl]
impl BytesSourceTransform {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        BytesSourceTransform.cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for BytesSourceTransform {
    #[turbo_tasks::function]
    async fn transform(self: Vc<Self>, source: Vc<Box<dyn Source>>) -> Result<Vc<Box<dyn Source>>> {
        let ident = source.ident();
        let path = ident.path().await?;
        let content = source.content().file_content().await?;
        let bytes = match &*content {
            FileContent::Content(data) => {
                data.read().bytes().collect::<std::io::Result<Vec<u8>>>()?
            }
            FileContent::NotFound => {
                bail!("File not found: {:?}", path);
            }
        };

        let encoded = data_encoding::BASE64_NOPAD.encode(&bytes);

        // Generate ES module that decodes base64 to Uint8Array with inline source map.
        // Uses Uint8Array.fromBase64 (ES2024+) with atob fallback for older environments.
        let code = format!(
            r#"
"use turbopack no side effects";

const decode = Uint8Array.fromBase64 || function(base64) {{
  const binaryString = atob(base64);
  const buffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {{
    buffer[i] = binaryString.charCodeAt(i)
  }}
  return buffer
}};

export default decode({});
{}"#,
            StringifyJs(&encoded),
            // For binary files, we use an empty string as sourcesContent since the
            // original content isn't meaningful text.
            inline_source_map_comment(&path.path, "")
        );

        // Rename to .mjs so module rules recognize it as ESM.
        // The inline source map ensures debuggers show the original file.
        let new_ident = ident.rename_as(format!("{}.[bytes].mjs", path.path).into());

        Ok(Vc::upcast(VirtualSource::new_with_ident(
            new_ident,
            AssetContent::file(FileContent::Content(File::from(code)).cell()),
        )))
    }
}
