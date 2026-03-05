//! Rust port of the `next-metadata-route-loader`
//!
//! See `next/src/build/webpack/loaders/next-metadata-route-loader`

use anyhow::{Ok, Result, bail};
use base64::{display::Base64Display, engine::general_purpose::STANDARD};
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{self, File, FileContent, FileSystemPath};
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::AssetContent,
    context::AssetContext,
    file_source::FileSource,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    utils::StringifyJs,
};

use super::get_content_type;
use crate::{
    app_structure::MetadataItem,
    mode::NextMode,
    next_app::{
        AppPage, PageSegment, PageType, app_entry::AppEntry, app_route_entry::get_app_route_entry,
    },
    next_config::NextConfig,
    parse_segment_config_from_source,
    segment_config::ParseSegmentMode,
};

/// Computes the route source for a Next.js metadata file.
#[turbo_tasks::function]
pub async fn get_app_metadata_route_source(
    mode: NextMode,
    metadata: MetadataItem,
    is_multi_dynamic: bool,
) -> Result<Vc<Box<dyn Source>>> {
    Ok(match metadata {
        MetadataItem::Static { path } => static_route_source(mode, path),
        MetadataItem::Dynamic { path } => {
            let stem = path.file_stem();
            let stem = stem.unwrap_or_default();

            if stem == "robots" || stem == "manifest" {
                dynamic_text_route_source(path)
            } else if stem == "sitemap" {
                dynamic_site_map_route_source(path, is_multi_dynamic)
            } else {
                dynamic_image_route_source(path, is_multi_dynamic)
            }
        }
    })
}

#[turbo_tasks::function]
pub async fn get_app_metadata_route_entry(
    nodejs_context: Vc<ModuleAssetContext>,
    edge_context: Vc<ModuleAssetContext>,
    project_root: FileSystemPath,
    mut page: AppPage,
    mode: NextMode,
    metadata: MetadataItem,
    next_config: Vc<NextConfig>,
) -> Result<Vc<AppEntry>> {
    // Read original source's segment config before replacing source into
    // dynamic|static metadata route handler.
    let original_path = metadata.clone().into_path();

    let source = Vc::upcast(FileSource::new(original_path.clone()));
    let segment_config = parse_segment_config_from_source(source, ParseSegmentMode::App);
    if original_path.file_stem().unwrap_or_default() == "sitemap" {
        let exports = &*collect_direct_exports(nodejs_context, original_path.clone()).await?;
        let has_generate_sitemaps = exports.contains(&"generateSitemaps".into());
        let has_agent = exports.contains(&"agent".into());
        let has_semantic_sitemap = exports.contains(&"semanticSitemap".into());
        if has_generate_sitemaps && (has_agent || has_semantic_sitemap) {
            bail!(
                "Route \"{}\" cannot combine `generateSitemaps` with `agent` or \
                 `semanticSitemap`. Semantic sitemap outputs currently support single sitemap \
                 mode only.",
                metadata.clone().into_path().value_to_string().await?
            );
        }
    }

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

        if is_multi_dynamic {
            page.push(PageSegment::Dynamic(rcstr!("__metadata_id__")))?;
        } else {
            // if page last segment is sitemap, change to sitemap.xml
            if page.last() == Some(&PageSegment::Static(rcstr!("sitemap"))) {
                page.0.pop();
                page.push(PageSegment::Static(rcstr!("sitemap.xml")))?
            }
        };
        // Push /route back
        page.push(PageSegment::PageType(PageType::Route))?;
    };

    Ok(get_app_route_entry(
        nodejs_context,
        edge_context,
        get_app_metadata_route_source(mode, metadata, is_multi_dynamic),
        page,
        project_root,
        Some(segment_config),
        next_config,
    ))
}

const CACHE_HEADER_NONE: &str = "no-cache, no-store";
const CACHE_HEADER_REVALIDATE: &str = "public, max-age=0, must-revalidate";

async fn get_base64_file_content(path: FileSystemPath) -> Result<String> {
    let original_file_content = path.read().await?;

    Ok(match &*original_file_content {
        FileContent::Content(content) => {
            let content = content.content().to_bytes();
            Base64Display::new(&content, &STANDARD).to_string()
        }
        FileContent::NotFound => {
            bail!(
                "metadata file not found: {}",
                &path.value_to_string().await?
            );
        }
    })
}

#[turbo_tasks::function]
async fn static_route_source(mode: NextMode, path: FileSystemPath) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem();
    let stem = stem.unwrap_or_default();

    let cache_control = if mode.is_production() {
        CACHE_HEADER_REVALIDATE
    } else {
        CACHE_HEADER_NONE
    };

    let is_twitter = stem == "twitter-image";
    let is_open_graph = stem == "opengraph-image";

    let content_type = get_content_type(path.clone()).await?;
    let original_file_content_b64;

    // Twitter image file size limit is 5MB.
    // General Open Graph image file size limit is 8MB.
    // x-ref: https://developer.x.com/en/docs/x-for-websites/cards/overview/summary
    // x-ref(facebook): https://developers.facebook.com/docs/sharing/webmasters/images
    let file_size_limit_mb = if is_twitter { 5 } else { 8 };
    if (is_twitter || is_open_graph)
        && let Some(content) = path.read().await?.as_content()
        && let file_size = content.content().to_bytes().len()
        && file_size > (file_size_limit_mb * 1024 * 1024)
    {
        StaticMetadataFileSizeIssue {
            img_name: if is_twitter {
                rcstr!("Twitter")
            } else {
                rcstr!("Open Graph")
            },
            path: path.clone(),
            file_size_limit_mb,
            file_size,
        }
        .resolved_cell()
        .emit();

        // Don't inline huge string, just insert placeholder
        original_file_content_b64 = "".to_string();
    } else {
        original_file_content_b64 = get_base64_file_content(path.clone()).await?
    }

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
        path.parent().join(&format!("{stem}--route-entry.js"))?,
        AssetContent::file(FileContent::Content(file).cell()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
async fn dynamic_text_route_source(path: FileSystemPath) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem();
    let stem = stem.unwrap_or_default();
    let ext = path.extension();

    let content_type = get_content_type(path.clone()).await?;

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

            export * from {resource_path}
        "#,
        resource_path = StringifyJs(&format!("./{stem}.{ext}")),
        content_type = StringifyJs(&content_type),
        file_type = StringifyJs(&stem),
        cache_control = StringifyJs(CACHE_HEADER_REVALIDATE),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(&format!("{stem}--route-entry.js"))?,
        AssetContent::file(FileContent::Content(file).cell()),
    );

    Ok(Vc::upcast(source))
}

async fn dynamic_sitemap_route_with_generate_source(
    path: FileSystemPath,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem();
    let stem = stem.unwrap_or_default();
    let ext = path.extension();
    let content_type = get_content_type(path.clone()).await?;

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'
            import {{ default as handler, generateSitemaps }} from {resource_path}
            import {{ resolveRouteData }} from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

            const contentType = {content_type}
            const cache_control = {cache_control}
            const fileType = {file_type}

            if (typeof handler !== 'function') {{
                throw new Error('Default export is missing in {resource_path}')
            }}

            export async function GET(_, ctx) {{
                const paramsPromise = ctx.params
                const idPromise = paramsPromise.then(params => params?.__metadata_id__)

                const id = await idPromise
                const hasXmlExtension = id ? id.endsWith('.xml') : false
                const sitemaps = await generateSitemaps()
                let foundId
                for (const item of sitemaps) {{
                    if (item?.id == null) {{
                        throw new Error('id property is required for every item returned from generateSitemaps')
                    }}
                    const baseId = id && hasXmlExtension ? id.slice(0, -4) : undefined
                    if (item.id.toString() === baseId) {{
                        foundId = item.id
                    }}
                }}
                if (foundId == null) {{
                    return new NextResponse('Not Found', {{
                        status: 404,
                    }})
                }}
                
                const targetIdPromise = idPromise.then(id => {{
                    const hasXmlExtension = id ? id.endsWith('.xml') : false
                    return id && hasXmlExtension ? id.slice(0, -4) : undefined
                }})
                const data = await handler({{ id: targetIdPromise }})
                const content = resolveRouteData(data, fileType)

                return new NextResponse(content, {{
                    headers: {{
                        'Content-Type': contentType,
                        'Cache-Control': cache_control,
                    }},
                }})
            }}

            export * from {resource_path}

            export async function generateStaticParams() {{
                const sitemaps = await generateSitemaps()
                const params = []

                for (const item of sitemaps) {{
                    if (item?.id == null) {{
                        throw new Error('id property is required for every item returned from generateSitemaps')
                    }}
                    params.push({{ __metadata_id__: item.id.toString() + '.xml' }})
                }}
                return params
            }}
        "#,
        resource_path = StringifyJs(&format!("./{stem}.{ext}")),
        content_type = StringifyJs(&content_type),
        file_type = StringifyJs(&stem),
        cache_control = StringifyJs(CACHE_HEADER_REVALIDATE),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(&format!("{stem}--route-entry.js"))?,
        AssetContent::file(FileContent::Content(file).cell()),
    );

    Ok(Vc::upcast(source))
}

async fn dynamic_sitemap_route_without_generate_source(
    path: FileSystemPath,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem();
    let stem = stem.unwrap_or_default();
    let ext = path.extension();
    let content_type = get_content_type(path.clone()).await?;

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'
            import {{ default as handler }} from {resource_path}
            import {{ resolveRouteData, resolveSemanticSitemapRouteData }} from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

            const getUserland = () => import({resource_path})

            const contentType = {content_type}
            const cacheControl = {cache_control}
            const fileType = {file_type}

            if (typeof handler !== 'function') {{
                throw new Error('Default export is missing in {resource_path}')
            }}

            export async function GET(request) {{
                const userland = await getUserland()
                const agent = userland['agent']
                const semanticSitemap = userland['semanticSitemap']
            
                const requestUrl = request?.url ? new URL(request.url) : null
                const nextUrl = request?.nextUrl
                const pathname = nextUrl?.pathname || requestUrl?.pathname || ''
                const semanticFormatHeader = request?.headers?.get('x-next-sitemap-format')
                const semanticFormatParam =
                    semanticFormatHeader ??
                    nextUrl?.searchParams.get('__nextSitemapFormat') ??
                    requestUrl?.searchParams.get('__nextSitemapFormat')
                const semanticFormat =
                    semanticFormatParam === 'markdown' || semanticFormatParam === 'json'
                        ? semanticFormatParam
                        : pathname === '/sitemap.md' || pathname.endsWith('/sitemap.md')
                            ? 'markdown'
                            : pathname === '/sitemap.json' || pathname.endsWith('/sitemap.json')
                                ? 'json'
                                : null
                const hasSemanticSitemap = typeof semanticSitemap === 'function'
                const agentMode = agent ?? (hasSemanticSitemap ? 'markdown' : undefined)
            
                if (
                    typeof agentMode !== 'undefined' &&
                    agentMode !== 'markdown' &&
                    agentMode !== 'json' &&
                    agentMode !== 'all'
                ) {{
                    throw new Error('Invalid `agent` export in {resource_path}. Expected "markdown", "json", or "all".')
                }}
            
                if (semanticFormat === 'markdown' || semanticFormat === 'json') {{
                    const isEnabled =
                        agentMode === 'all' ||
                        agentMode === semanticFormat
            
                    if (!isEnabled) {{
                        return new NextResponse('Not Found', {{
                            status: 404,
                            headers: {{
                                'Cache-Control': cacheControl,
                                'X-Robots-Tag': 'noindex',
                            }},
                        }})
                    }}
            
                    const isSemanticInput = hasSemanticSitemap
                    const data = isSemanticInput ? await semanticSitemap() : await handler()
                    const content = resolveSemanticSitemapRouteData(
                        data,
                        semanticFormat,
                        isSemanticInput
                    )
            
                    return new NextResponse(content, {{
                        headers: {{
                            'Content-Type':
                                semanticFormat === 'json'
                                    ? 'application/json; charset=utf-8'
                                    : 'text/markdown; charset=utf-8',
                            'Cache-Control': cacheControl,
                            'X-Robots-Tag': 'noindex',
                        }},
                    }})
                }}

                const data = await handler()
                const content = resolveRouteData(data, fileType)

                return new NextResponse(content, {{
                    headers: {{
                        'Content-Type': contentType,
                        'Cache-Control': cacheControl,
                    }},
                }})
            }}

            export * from {resource_path}
        "#,
        resource_path = StringifyJs(&format!("./{stem}.{ext}")),
        content_type = StringifyJs(&content_type),
        file_type = StringifyJs(&stem),
        cache_control = StringifyJs(CACHE_HEADER_REVALIDATE),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(&format!("{stem}--route-entry.js"))?,
        AssetContent::file(FileContent::Content(file).cell()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
async fn collect_direct_exports(
    asset_context: Vc<ModuleAssetContext>,
    path: FileSystemPath,
) -> Result<Vc<Vec<RcStr>>> {
    let source = Vc::upcast(FileSource::new(path));
    let module = asset_context
        .process(
            source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module();

    let Some(ecmascript_asset) =
        ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module.to_resolved().await?)
    else {
        return Ok(Vc::cell(Vec::new()));
    };

    if let EcmascriptExports::EsmExports(exports) = &*ecmascript_asset.get_exports().await? {
        let exports = &*exports.await?;
        return Ok(Vc::cell(exports.exports.keys().cloned().collect()));
    }

    Ok(Vc::cell(Vec::new()))
}

#[turbo_tasks::function]
async fn dynamic_site_map_route_source(
    path: FileSystemPath,
    is_multi_dynamic: bool,
) -> Result<Vc<Box<dyn Source>>> {
    if is_multi_dynamic {
        dynamic_sitemap_route_with_generate_source(path).await
    } else {
        dynamic_sitemap_route_without_generate_source(path).await
    }
}

async fn dynamic_image_route_with_metadata_source(
    path: FileSystemPath,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem();
    let stem = stem.unwrap_or_default();
    let ext = path.extension();

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'
            import {{ default as handler, generateImageMetadata }} from {resource_path}

            if (typeof handler !== 'function') {{
                throw new Error('Default export is missing in {resource_path}')
            }}

            export async function GET(_, ctx) {{
                const paramsPromise = ctx.params
                const idPromise = paramsPromise.then(params => params?.__metadata_id__)
                const restParamsPromise = paramsPromise.then(params => {{
                    if (!params) return undefined
                    const {{ __metadata_id__, ...rest }} = params
                    return rest
                }})

                const restParams = await restParamsPromise
                const __metadata_id__ = await idPromise
                const imageMetadata = await generateImageMetadata({{ params: restParams }})
                const id = imageMetadata.find((item) => {{
                    if (item?.id == null) {{
                        throw new Error('id property is required for every item returned from generateImageMetadata')
                    }}

                    return item.id.toString() === __metadata_id__
                }})?.id

                if (id == null) {{
                    return new NextResponse('Not Found', {{
                        status: 404,
                    }})
                }}

                return handler({{ params: restParamsPromise, id: idPromise }})
            }}

            export * from {resource_path}

            export async function generateStaticParams({{ params }}) {{
                const imageMetadata = await generateImageMetadata({{ params }})
                const staticParams = []

                for (const item of imageMetadata) {{
                    if (item?.id == null) {{
                        throw new Error('id property is required for every item returned from generateImageMetadata')
                    }}
                    staticParams.push({{ __metadata_id__: item.id.toString() }})
                }}
                return staticParams
            }}
        "#,
        resource_path = StringifyJs(&format!("./{stem}.{ext}")),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(&format!("{stem}--route-entry.js"))?,
        AssetContent::file(FileContent::Content(file).cell()),
    );

    Ok(Vc::upcast(source))
}

async fn dynamic_image_route_without_metadata_source(
    path: FileSystemPath,
) -> Result<Vc<Box<dyn Source>>> {
    let stem = path.file_stem();
    let stem = stem.unwrap_or_default();
    let ext = path.extension();

    let code = formatdoc! {
        r#"
            import {{ NextResponse }} from 'next/server'
            import {{ default as handler }} from {resource_path}

            if (typeof handler !== 'function') {{
                throw new Error('Default export is missing in {resource_path}')
            }}

            export async function GET(_, ctx) {{
                return handler({{ params: ctx.params }})
            }}

            export * from {resource_path}
        "#,
        resource_path = StringifyJs(&format!("./{stem}.{ext}")),
    };

    let file = File::from(code);
    let source = VirtualSource::new(
        path.parent().join(&format!("{stem}--route-entry.js"))?,
        AssetContent::file(FileContent::Content(file).cell()),
    );

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
async fn dynamic_image_route_source(
    path: FileSystemPath,
    is_multi_dynamic: bool,
) -> Result<Vc<Box<dyn Source>>> {
    if is_multi_dynamic {
        dynamic_image_route_with_metadata_source(path).await
    } else {
        dynamic_image_route_without_metadata_source(path).await
    }
}

#[turbo_tasks::value(shared)]
struct StaticMetadataFileSizeIssue {
    img_name: RcStr,
    path: FileSystemPath,
    file_size: usize,
    file_size_limit_mb: usize,
}

#[turbo_tasks::value_impl]
impl Issue for StaticMetadataFileSizeIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Static metadata file size exceeded")).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::ProcessModule.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(
                format!(
                    "File size for {} image \"{}\" exceeds {}MB. (Current: {:.1}MB)",
                    self.img_name,
                    self.path.value_to_string().await?,
                    self.file_size_limit_mb,
                    (self.file_size as f32) / 1024.0 / 1024.0
                )
                .into(),
            )
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn documentation_link(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!(
            "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image#image-files-jpg-png-gif"
        ))
    }
}
