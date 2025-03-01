//! Rust port of the `next-metadata-route-loader`
//!
//! See `next/src/build/webpack/loaders/next-metadata-route-loader`

use anyhow::{bail, Ok, Result};
use base64::{display::Base64Display, engine::general_purpose::STANDARD};
use indoc::{formatdoc, indoc};
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::{self, File, FileContent, FileSystemPath};
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::AssetContent, file_source::FileSource, source::Source, virtual_source::VirtualSource,
};
use turbopack_ecmascript::utils::StringifyJs;

use super::get_content_type;
use crate::{
    app_structure::MetadataItem,
    mode::NextMode,
    next_app::{
        app_entry::AppEntry, app_route_entry::get_app_route_entry, AppPage, PageSegment, PageType,
    },
    next_config::NextConfig,
    parse_segment_config_from_source,
};

/// Computes the route source for a Next.js metadata file.
#[turbo_tasks::function]
pub async fn get_app_metadata_route_source(
    mode: NextMode,
    metadata: MetadataItem,
    is_multi_dynamic: bool,
) -> Result<Vc<Box<dyn Source>>> {
    Ok(match metadata {
        MetadataItem::Static { path } => static_route_source(mode, *path),
        MetadataItem::Dynamic { path } => {
            let stem = path.file_stem().await?;
            let stem = stem.as_deref().unwrap_or_default();

            if stem == "robots" || stem == "manifest" {
                dynamic_text_route_source(*path)
            } else if stem == "sitemap" {
                dynamic_site_map_route_source(mode, *path, is_multi_dynamic)
            } else {
                dynamic_image_route_source(*path)
            }
        }
    })
}

#[turbo_tasks::function]
pub async fn get_app_metadata_route_entry(
    nodejs_context: Vc<ModuleAssetContext>,
    edge_context: Vc<ModuleAssetContext>,
    project_root: Vc<FileSystemPath>,
    mut page: AppPage,
    mode: NextMode,
    metadata: MetadataItem,
    next_config: Vc<NextConfig>,
) -> Vc<AppEntry> {
    // Read original source's segment config before replacing source into
    // dynamic|static metadata route handler.
    let original_path = metadata.into_path();

    let source = Vc::upcast(FileSource::new(*original_path));
    let segment_config = parse_segment_config_from_source(source);
    let is_dynamic_metadata = matches!(metadata, MetadataItem::Dynamic { .. });
    let is_multi_dynamic: bool = if Some(segment_config).is_some() {
        // is_multi_dynamic is true when config.generateSitemaps or
        // config.generateImageMetadata is defined in dynamic routes
        let config = segment_config.await.unwrap();
        config.generate_sitemaps || config.generate_image_metadata
    } else {
        false
    };

    // Map dynamic sitemap and image routes based on the exports.
    // if there's generator export: add /[__metadata_id__] to the route;
    // otherwise keep the original route.
    // For sitemap, if the last segment is sitemap, appending .xml suffix.
    if is_dynamic_metadata {
        // remove the last /route segment of page
        page.0.pop();

        let _ = if is_multi_dynamic {
            page.push(PageSegment::Dynamic("__metadata_id__".into()))
        } else {
            // if page last segment is sitemap, change to sitemap.xml
            if page.last() == Some(&PageSegment::Static("sitemap".into())) {
                page.0.pop();
                page.push(PageSegment::Static("sitemap.xml".into()))
            } else {
                Ok(())
            }
        };
        // Push /route back
        let _ = page.push(PageSegment::PageType(PageType::Route));
    };

    get_app_route_entry(
        nodejs_context,
        edge_context,
        get_app_metadata_route_source(mode, metadata, is_multi_dynamic),
        page,
        project_root,
        Some(segment_config),
        next_config,
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
    } else if mode.is_production() {
        CACHE_HEADER_LONG_CACHE
    } else {
        CACHE_HEADER_NONE
    };

    let original_file_content_b64 = get_base64_file_content(path).await?;

    let is_twitter = stem == "twitter-image";
    let is_open_graph = stem == "opengraph-image";
    // Twitter image file size limit is 5MB.
    // General Open Graph image file size limit is 8MB.
    // x-ref: https://developer.x.com/en/docs/x-for-websites/cards/overview/summary
    // x-ref(facebook): https://developers.facebook.com/docs/sharing/webmasters/images
    let file_size_limit = if is_twitter { 5 } else { 8 };
    let img_name = if is_twitter { "Twitter" } else { "Open Graph" };

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'

            const contentType = {content_type}
            const cacheControl = {cache_control}
            const buffer = Buffer.from({original_file_content_b64}, 'base64')

            if ({is_twitter} || {is_open_graph}) {{
                const fileSizeInMB = buffer.byteLength / 1024 / 1024
                if (fileSizeInMB > {file_size_limit}) {{
                    throw new Error('File size for {img_name} image {path} exceeds {file_size_limit}MB. ' +
                    `(Current: ${{fileSizeInMB.toFixed(2)}}MB)\n` +
                    'Read more: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image#image-files-jpg-png-gif'
                    )
                }}
            }}

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
        is_twitter = is_twitter,
        is_open_graph = is_open_graph,
        file_size_limit = file_size_limit,
        img_name = img_name,
        path = StringifyJs(&path.to_string().await?),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(format!("{stem}--route-entry.js").into()),
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

    // refer https://github.com/vercel/next.js/blob/7b2b9823432fb1fa28ae0ac3878801d638d93311/packages/next/src/build/webpack/loaders/next-metadata-route-loader.ts#L84
    // for the original template.
    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'
            import handler from {resource_path}
            import {{ resolveRouteData }} from
'next/dist/build/webpack/loaders/metadata/resolve-route-data'

            const contentType = {content_type}
            const cacheControl = {cache_control}
            const fileType = {file_type}

            if (typeof handler !== 'function') {{
                throw new Error('Default export is missing in {resource_path}')
            }}

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
        path.parent().join(format!("{stem}--route-entry.js").into()),
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
async fn dynamic_site_map_route_source(
    mode: NextMode,
    path: Vc<FileSystemPath>,
    is_multi_dynamic: bool,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem().await?;
    let stem = stem.as_deref().unwrap_or_default();
    let ext = &*path.extension().await?;
    let content_type = get_content_type(path).await?;
    let mut static_generation_code = "";

    if mode.is_production() && is_multi_dynamic {
        static_generation_code = indoc! {
            r#"
                export async function generateStaticParams() {
                    const sitemaps = await generateSitemaps()
                    const params = []

                    for (const item of sitemaps) {{
                        params.push({ __metadata_id__: item.id.toString() + '.xml' })
                    }}
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

            if (typeof handler !== 'function') {{
                throw new Error('Default export is missing in {resource_path}')
            }}

            export async function GET(_, ctx) {{
                const {{ __metadata_id__: id, ...params }} = await ctx.params || {{}}
                const hasXmlExtension = id ? id.endsWith('.xml') : false
                if (id && !hasXmlExtension) {{
                    return new NextResponse('Not Found', {{
                        status: 404,
                    }})
                }}

                if (process.env.NODE_ENV !== 'production' && sitemapModule.generateSitemaps) {{
                    const sitemaps = await sitemapModule.generateSitemaps()
                    for (const item of sitemaps) {{
                        if (item?.id == null) {{
                            throw new Error('id property is required for every item returned from generateSitemaps')
                        }}
                    }}
                }}
                
                const targetId = id && hasXmlExtension ? id.slice(0, -4) : undefined
                const data = await handler({{ id: targetId }})
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
        path.parent().join(format!("{stem}--route-entry.js").into()),
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

            if (typeof handler !== 'function') {{
                throw new Error('Default export is missing in {resource_path}')
            }}

            export async function GET(_, ctx) {{
                const params = await ctx.params
                const {{ __metadata_id__, ...rest }} = params || {{}}
                const restParams = params ? rest : undefined
                const targetId = __metadata_id__
                let id = undefined

                if (generateImageMetadata) {{
                    const imageMetadata = await generateImageMetadata({{ params: restParams }})
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

                return handler({{ params: restParams, id }})
            }}
        "#,
        resource_path = StringifyJs(&format!("./{}.{}", stem, ext)),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(format!("{stem}--route-entry.js").into()),
        AssetContent::file(file.into()),
    );

    Ok(Vc::upcast(source))
}
