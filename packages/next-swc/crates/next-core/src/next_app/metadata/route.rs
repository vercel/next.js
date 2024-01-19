//! Rust port of the `next-metadata-route-loader`
//!
//! See `next/src/build/webpack/loaders/next-metadata-route-loader`

use anyhow::{bail, Result};
use base64::{display::Base64Display, engine::general_purpose::STANDARD};
use indoc::{formatdoc, indoc};
use turbo_tasks::{ValueToString, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{File, FileContent, FileSystemPath},
    turbopack::{
        core::{asset::AssetContent, source::Source, virtual_source::VirtualSource},
        ecmascript::utils::StringifyJs,
        turbopack::ModuleAssetContext,
    },
};

use super::get_content_type;
use crate::{
    app_structure::MetadataItem,
    mode::NextMode,
    next_app::{app_entry::AppEntry, app_route_entry::get_app_route_entry, AppPage, PageSegment},
};

/// Computes the route source for a Next.js metadata file.
#[turbo_tasks::function]
pub async fn get_app_metadata_route_source(
    page: AppPage,
    mode: NextMode,
    metadata: MetadataItem,
) -> Result<Vc<Box<dyn Source>>> {
    Ok(match metadata {
        MetadataItem::Static { path } => static_route_source(mode, path),
        MetadataItem::Dynamic { path } => {
            let stem = path.file_stem().await?;
            let stem = stem.as_deref().unwrap_or_default();

            if stem == "robots" || stem == "manifest" {
                dynamic_text_route_source(path)
            } else if stem == "sitemap" {
                dynamic_site_map_route_source(mode, path, page)
            } else {
                dynamic_image_route_source(path)
            }
        }
    })
}

#[turbo_tasks::function]
pub fn get_app_metadata_route_entry(
    nodejs_context: Vc<ModuleAssetContext>,
    edge_context: Vc<ModuleAssetContext>,
    project_root: Vc<FileSystemPath>,
    page: AppPage,
    mode: NextMode,
    metadata: MetadataItem,
) -> Vc<AppEntry> {
    get_app_route_entry(
        nodejs_context,
        edge_context,
        get_app_metadata_route_source(page.clone(), mode, metadata),
        page,
        project_root,
    )
}

const CACHE_HEADER_NONE: &str = "no-cache, no-store";
const CACHE_HEADER_LONG_CACHE: &str = "public, immutable, no-transform, max-age=31536000";
const CACHE_HEADER_REVALIDATE: &str = "public, max-age=0, must-revalidate";

async fn get_base64_file_content(path: Vc<FileSystemPath>) -> Result<String> {
    let original_file_content = path.read().await?;

    Ok(match &*original_file_content {
        FileContent::Content(content) => {
            let content = content.content().to_bytes()?;
            Base64Display::new(&content, &STANDARD).to_string()
        }
        FileContent::NotFound => {
            bail!("metadata file not found: {}", &path.to_string().await?);
        }
    })
}

#[turbo_tasks::function]
async fn static_route_source(
    mode: NextMode,
    path: Vc<FileSystemPath>,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem().await?;
    let stem = stem.as_deref().unwrap_or_default();

    let content_type = get_content_type(path).await?;

    let cache_control = if stem == "favicon" {
        CACHE_HEADER_REVALIDATE
    } else if mode == NextMode::Build {
        CACHE_HEADER_LONG_CACHE
    } else {
        CACHE_HEADER_NONE
    };

    let original_file_content_b64 = get_base64_file_content(path).await?;

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'

            const contentType = {content_type}
            const cacheControl = {cache_control}
            const buffer = Buffer.from({original_file_content_b64}, 'base64')

            export function GET() {{
                return new NextResponse(buffer, {{
                    headers: {{
                        'Content-Type': contentType,
                        'Cache-Control': cacheControl,
                    }},
                }})
            }}

            export const dynamic = 'force-static'
        "#,
        content_type = StringifyJs(&content_type),
        cache_control = StringifyJs(cache_control),
        original_file_content_b64 = StringifyJs(&original_file_content_b64),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(format!("{stem}--route-entry.js")),
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
async fn dynamic_text_route_source(path: Vc<FileSystemPath>) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem().await?;
    let stem = stem.as_deref().unwrap_or_default();
    let ext = &*path.extension().await?;

    let content_type = get_content_type(path).await?;

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'
            import handler from {resource_path}
            import {{ resolveRouteData }} from
'next/dist/build/webpack/loaders/metadata/resolve-route-data'

            const contentType = {content_type}
            const cacheControl = {cache_control}
            const fileType = {file_type}

            export async function GET() {{
              const data = await handler()
              const content = resolveRouteData(data, fileType)

              return new NextResponse(content, {{
                headers: {{
                  'Content-Type': contentType,
                  'Cache-Control': cacheControl,
                }},
              }})
            }}
        "#,
        resource_path = StringifyJs(&format!("./{}.{}", stem, ext)),
        content_type = StringifyJs(&content_type),
        file_type = StringifyJs(&stem),
        cache_control = StringifyJs(CACHE_HEADER_REVALIDATE),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(format!("{stem}--route-entry.js")),
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
async fn dynamic_site_map_route_source(
    mode: NextMode,
    path: Vc<FileSystemPath>,
    page: AppPage,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem().await?;
    let stem = stem.as_deref().unwrap_or_default();
    let ext = &*path.extension().await?;

    let content_type = get_content_type(path).await?;

    let mut static_generation_code = "";

    if mode == NextMode::Build
        && page.contains(&PageSegment::Dynamic("[__metadata_id__]".to_string()))
    {
        static_generation_code = indoc! {
            r#"
                export async function generateStaticParams() {
                    const sitemaps = await generateSitemaps()
                    const params = []

                    for (const item of sitemaps) {
                        params.push({ __metadata_id__: item.id.toString() + '.xml' })
                    }
                    return params
                }
            "#,
        };
    }

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'
            import * as _sitemapModule from {resource_path}
            import {{ resolveRouteData }} from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

            const sitemapModule = {{ ..._sitemapModule }}
            const handler = sitemapModule.default
            const generateSitemaps = sitemapModule.generateSitemaps
            const contentType = {content_type}
            const cacheControl = {cache_control}
            const fileType = {file_type}

            export async function GET(_, ctx) {{
                const {{ __metadata_id__ = [], ...params }} = ctx.params || {{}}
                const targetId = __metadata_id__[0]
                let id = undefined
                const sitemaps = generateSitemaps ? await generateSitemaps() : null

                if (sitemaps) {{
                    id = sitemaps.find((item) => {{
                        if (process.env.NODE_ENV !== 'production') {{
                            if (item?.id == null) {{
                                throw new Error('id property is required for every item returned from generateSitemaps')
                            }}
                        }}
                        return item.id.toString() === targetId
                    }})?.id

                    if (id == null) {{
                        return new NextResponse('Not Found', {{
                            status: 404,
                        }})
                    }}
                }}

                const data = await handler({{ id }})
                const content = resolveRouteData(data, fileType)

                return new NextResponse(content, {{
                    headers: {{
                        'Content-Type': contentType,
                        'Cache-Control': cacheControl,
                    }},
                }})
            }}

            {static_generation_code}
        "#,
        resource_path = StringifyJs(&format!("./{}.{}", stem, ext)),
        content_type = StringifyJs(&content_type),
        file_type = StringifyJs(&stem),
        cache_control = StringifyJs(CACHE_HEADER_REVALIDATE),
        static_generation_code = static_generation_code,
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(format!("{stem}--route-entry.js")),
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
async fn dynamic_image_route_source(path: Vc<FileSystemPath>) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem().await?;
    let stem = stem.as_deref().unwrap_or_default();
    let ext = &*path.extension().await?;

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'
            import * as _imageModule from {resource_path}

            const imageModule = {{ ..._imageModule }}

            const handler = imageModule.default
            const generateImageMetadata = imageModule.generateImageMetadata

            export async function GET(_, ctx) {{
                const {{ __metadata_id__ = [], ...params }} = ctx.params || {{}}
                const targetId = __metadata_id__[0]
                let id = undefined
                const imageMetadata = generateImageMetadata ? await generateImageMetadata({{ params }}) : null

                if (imageMetadata) {{
                    id = imageMetadata.find((item) => {{
                        if (process.env.NODE_ENV !== 'production') {{
                            if (item?.id == null) {{
                                throw new Error('id property is required for every item returned from generateImageMetadata')
                            }}
                        }}
                        return item.id.toString() === targetId
                    }})?.id

                    if (id == null) {{
                        return new NextResponse('Not Found', {{
                            status: 404,
                        }})
                    }}
                }}

                return handler({{ params: ctx.params ? params : undefined, id }})
            }}
        "#,
        resource_path = StringifyJs(&format!("./{}.{}", stem, ext)),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(format!("{stem}--route-entry.js")),
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}
