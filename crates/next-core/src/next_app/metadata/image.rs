//! (partial) Rust port of the `next-metadata-image-loader`
//!
//! See `next/src/build/webpack/loaders/next-metadata-image-loader`

use anyhow::{Result, bail};
use indoc::formatdoc;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    asset::AssetContent,
    context::AssetContext,
    file_source::FileSource,
    module::Module,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    utils::StringifyJs,
};

use crate::next_app::AppPage;

async fn hash_file_content(path: FileSystemPath) -> Result<u64> {
    let original_file_content = path.read().await?;

    Ok(match &*original_file_content {
        FileContent::Content(content) => {
            let content = content.content().to_bytes();
            hash_xxh3_hash64(&*content)
        }
        FileContent::NotFound => {
            bail!(
                "metadata file not found: {}",
                &path.value_to_string().await?
            );
        }
    })
}

async fn dynamic_image_metadata_with_generator_source(
    path: FileSystemPath,
    ty: RcStr,
    page: AppPage,
    exported_fields_excluding_default: String,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem();
    let stem = stem.unwrap_or_default();
    let ext = path.extension();

    let hash_query = format!("?{:x}", hash_file_content(path.clone()).await?);

    let use_numeric_sizes = ty == "twitter" || ty == "openGraph";
    let sizes = if use_numeric_sizes {
        "data.width = size.width; data.height = size.height;".to_string()
    } else {
        let sizes = if ext == "svg" {
            "any"
        } else {
            "${size.width}x${size.height}"
        };
        format!("data.sizes = `{sizes}`;")
    };

    let code = formatdoc! {
        r#"
            import {{ {exported_fields_excluding_default} }} from {resource_path}
            import {{ fillMetadataSegment }} from 'next/dist/lib/metadata/get-metadata-route'

            const imageModule = {{ {exported_fields_excluding_default} }}

            export default async function (props) {{
                const {{ __metadata_id__: _, ...params }} = await props.params
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

                const imageMetadataArray = await generateImageMetadata({{ params }})
                return imageMetadataArray.map((imageMetadata, index) => {{
                    const idParam = imageMetadata.id + ''
                    return getImageMetadata(imageMetadata, idParam)
                }})
            }}
        "#,
        exported_fields_excluding_default = exported_fields_excluding_default,
        resource_path = StringifyJs(&format!("./{stem}.{ext}")),
        pathname_prefix = StringifyJs(&page.to_string()),
        page_segment = StringifyJs(stem),
        sizes = sizes,
        hash_query = StringifyJs(&hash_query),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(&format!("{stem}--metadata.js"))?,
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}

async fn dynamic_image_metadata_without_generator_source(
    path: FileSystemPath,
    ty: RcStr,
    page: AppPage,
    exported_fields_excluding_default: String,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem();
    let stem = stem.unwrap_or_default();
    let ext = path.extension();

    let hash_query = format!("?{:x}", hash_file_content(path.clone()).await?);

    let use_numeric_sizes = ty == "twitter" || ty == "openGraph";
    let sizes = if use_numeric_sizes {
        "data.width = size.width; data.height = size.height;".to_string()
    } else {
        let sizes = if ext == "svg" {
            "any"
        } else {
            "${size.width}x${size.height}"
        };
        format!("data.sizes = `{sizes}`;")
    };

    let code = formatdoc! {
        r#"
            import {{ {exported_fields_excluding_default} }} from {resource_path}
            import {{ fillMetadataSegment }} from 'next/dist/lib/metadata/get-metadata-route'

            const imageModule = {{ {exported_fields_excluding_default} }}

            export default async function (props) {{
                const {{ __metadata_id__: _, ...params }} = await props.params
                const imageUrl = fillMetadataSegment({pathname_prefix}, params, {page_segment})

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

                return [getImageMetadata(imageModule, '')]
            }}
        "#,
        exported_fields_excluding_default = exported_fields_excluding_default,
        resource_path = StringifyJs(&format!("./{stem}.{ext}")),
        pathname_prefix = StringifyJs(&page.to_string()),
        page_segment = StringifyJs(stem),
        sizes = sizes,
        hash_query = StringifyJs(&hash_query),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(&format!("{stem}--metadata.js"))?,
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
pub async fn dynamic_image_metadata_source(
    asset_context: Vc<Box<dyn AssetContext>>,
    path: FileSystemPath,
    ty: RcStr,
    page: AppPage,
) -> Result<Vc<Box<dyn Source>>> {
    let source = Vc::upcast(FileSource::new(path.clone()));
    let module = asset_context
        .process(
            source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module();
    let exports = &*collect_direct_exports(module).await?;
    let exported_fields_excluding_default = exports
        .iter()
        .filter(|e| *e != "default")
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");

    let has_generate_image_metadata = exports.contains(&"generateImageMetadata".into());

    if has_generate_image_metadata {
        dynamic_image_metadata_with_generator_source(
            path,
            ty,
            page,
            exported_fields_excluding_default,
        )
        .await
    } else {
        dynamic_image_metadata_without_generator_source(
            path,
            ty,
            page,
            exported_fields_excluding_default,
        )
        .await
    }
}

#[turbo_tasks::function]
async fn collect_direct_exports(module: Vc<Box<dyn Module>>) -> Result<Vc<Vec<RcStr>>> {
    let Some(ecmascript_asset) =
        Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
    else {
        return Ok(Default::default());
    };

    if let EcmascriptExports::EsmExports(exports) = &*ecmascript_asset.get_exports().await? {
        let exports = &*exports.await?;
        return Ok(Vc::cell(exports.exports.keys().cloned().collect()));
    }

    Ok(Vc::cell(Vec::new()))
}
