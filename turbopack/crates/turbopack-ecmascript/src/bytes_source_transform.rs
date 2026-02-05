use std::io::Read;

use anyhow::{Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, glob::Glob};
use turbopack_core::{
    asset::{Asset, AssetContent},
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    module::Module,
    source::Source,
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};

use crate::{
    EcmascriptInputTransforms, EcmascriptModuleAsset, EcmascriptModuleAssetType, EcmascriptOptions,
    utils::StringifyJs,
};

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
        let content = source.content().file_content().await?;
        let bytes = match &*content {
            FileContent::Content(data) => {
                data.read().bytes().collect::<std::io::Result<Vec<u8>>>()?
            }
            FileContent::NotFound => {
                bail!("File not found: {:?}", source.ident().path());
            }
        };

        let encoded = data_encoding::BASE64_NOPAD.encode(&bytes);

        // Generate ES module that decodes base64 to Uint8Array
        // Uses Uint8Array.fromBase64 (ES2024+) with atob fallback for older environments
        // The /*#__PURE__*/ annotation marks the decode call as side-effect free for tree shaking
        let code = format!(
            r#"const decode = /*#__PURE__*/ Uint8Array.fromBase64 || function Uint8Array_fromBase64(base64) {{
  const binaryString = atob(base64);
  const buffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {{
    buffer[i] = binaryString.charCodeAt(i)
  }}
  return buffer
}};
export default /*#__PURE__*/ decode({});
"#,
            StringifyJs(&encoded)
        );

        // Add modifier for uniqueness (so same file imported normally vs with type:"bytes" are
        // distinct). The module type will be set by a separate rule matching on
        // ResourceHasModifier("bytes_module").
        let ident = source.ident().with_modifier(rcstr!("bytes_module"));

        Ok(Vc::upcast(VirtualSource::new_with_ident(
            ident,
            AssetContent::file(FileContent::Content(File::from(code)).cell()),
        )))
    }
}

/// Creates an EcmascriptModuleAsset that exports the source file's content as a Uint8Array.
///
/// This is a convenience function that applies the BytesSourceTransform and wraps
/// the result in an EcmascriptModuleAsset.
#[turbo_tasks::function]
pub async fn create_bytes_module(
    source: ResolvedVc<Box<dyn Source>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
    side_effect_free_packages: Option<ResolvedVc<Glob>>,
    ecmascript_options: ResolvedVc<EcmascriptOptions>,
) -> Result<Vc<Box<dyn Module>>> {
    let transformed_source = BytesSourceTransform::new()
        .transform(*source)
        .to_resolved()
        .await?;

    Ok(Vc::upcast(
        EcmascriptModuleAsset::builder(
            transformed_source,
            asset_context,
            EcmascriptInputTransforms::empty().to_resolved().await?,
            ecmascript_options,
            compile_time_info,
            side_effect_free_packages,
        )
        .with_type(EcmascriptModuleAssetType::Ecmascript)
        .build(),
    ))
}
