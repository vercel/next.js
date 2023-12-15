//! (partial) Rust port of the `next-metadata-image-loader`
//!
//! See `next/src/build/webpack/loaders/next-metadata-image-loader`

use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_binding::{
    turbo::tasks_hash::hash_xxh3_hash64,
    turbopack::{
        core::{
            asset::AssetContent,
            context::AssetContext,
            file_source::FileSource,
            module::Module,
            reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::{
            chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
            utils::StringifyJs,
            EcmascriptModuleAsset,
        },
    },
};

use crate::next_app::AppPage;

async fn hash_file_content(path: Vc<FileSystemPath>) -> Result<u64> {
    let original_file_content = path.read().await?;

    Ok(match &*original_file_content {
        FileContent::Content(content) => {
            let content = content.content().to_bytes()?;
            hash_xxh3_hash64(&*content)
        }
        FileContent::NotFound => {
            bail!("metadata file not found: {}", &path.to_string().await?);
        }
    })
}

#[turbo_tasks::function]
pub async fn dynamic_image_metadata_source(
    asset_context: Vc<Box<dyn AssetContext>>,
    path: Vc<FileSystemPath>,
    ty: String,
    page: AppPage,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem().await?;
    let stem = stem.as_deref().unwrap_or_default();
    let ext = &*path.extension().await?;

    let hash_query = format!("?{:x}", hash_file_content(path).await?);

    let use_numeric_sizes = ty == "twitter" || ty == "openGraph";
    let sizes = if use_numeric_sizes {
        "data.width = size.width; data.height = size.height;"
    } else {
        "data.sizes = size.width + \"x\" + size.height;"
    };

    let source = Vc::upcast(FileSource::new(path));
    let module = asset_context
        .process(
            source,
            turbo_tasks::Value::new(ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Undefined,
            )),
        )
        .module();
    let exports = &*collect_direct_exports(module).await?;
    let exported_fields_excluding_default = exports
        .iter()
        .filter(|e| *e != "default")
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");

    let code = formatdoc! {
        r#"
            import {{ {exported_fields_excluding_default} }} from {resource_path}
            import {{ fillMetadataSegment }} from 'next/dist/lib/metadata/get-metadata-route'

            const imageModule = {{ {exported_fields_excluding_default} }}

            export default async function (props) {{
                const {{ __metadata_id__: _, ...params }} = props.params
                const imageUrl = fillMetadataSegment({pathname_prefix}, params, {page_segment})

                const {{ generateImageMetadata }} = imageModule

                function getImageMetadata(imageMetadata, idParam) {{
                    const data = {{
                        alt: imageMetadata.alt,
                        type: imageMetadata.contentType || 'image/png',
                        url: imageUrl + (idParam ? ('/' + idParam) : '') + {hash_query},
                    }}
                    const {{ size }} = imageMetadata
                    if (size) {{
                        {sizes}
                    }}
                    return data
                }}

                if (generateImageMetadata) {{
                    const imageMetadataArray = await generateImageMetadata({{ params }})
                    return imageMetadataArray.map((imageMetadata, index) => {{
                        const idParam = (imageMetadata.id || index) + ''
                        return getImageMetadata(imageMetadata, idParam)
                    }})
                }} else {{
                    return [getImageMetadata(imageModule, '')]
                }}
            }}
        "#,
        exported_fields_excluding_default = exported_fields_excluding_default,
        resource_path = StringifyJs(&format!("./{}.{}", stem, ext)),
        pathname_prefix = StringifyJs(&page.to_string()),
        page_segment = StringifyJs(stem),
        sizes = sizes,
        hash_query = StringifyJs(&hash_query),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(format!("{stem}--metadata.js")),
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
async fn collect_direct_exports(module: Vc<Box<dyn Module>>) -> Result<Vc<Vec<String>>> {
    let Some(ecmascript_asset) =
        Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await?
    else {
        return Ok(Default::default());
    };

    if let EcmascriptExports::EsmExports(exports) = &*ecmascript_asset.get_exports().await? {
        let exports = &*exports.await?;
        return Ok(Vc::cell(exports.exports.keys().cloned().collect()));
    }

    Ok(Vc::cell(Vec::new()))
}
