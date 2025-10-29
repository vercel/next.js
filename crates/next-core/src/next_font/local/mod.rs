use anyhow::{Context, Result, bail};
use font_fallback::FontFallbackResult;
use indoc::formatdoc;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    FileContent, FileSystemPath,
    glob::{Glob, GlobOptions},
    json::parse_json_with_source_context,
};
use turbopack_core::{
    asset::AssetContent,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    reference_type::ReferenceType,
    resolve::{
        ResolveResult, ResolveResultItem, ResolveResultOption,
        parse::Request,
        plugin::{BeforeResolvePlugin, BeforeResolvePluginCondition},
    },
    virtual_source::VirtualSource,
};

use self::{
    font_fallback::get_font_fallbacks,
    options::{FontDescriptors, NextFontLocalOptions, options_from_request},
    stylesheet::build_stylesheet,
    util::build_font_family_string,
};
use super::{
    font_fallback::FontFallbacks,
    util::{FontCssProperties, can_use_next_font},
};
use crate::{
    next_app::metadata::split_extension,
    next_font::{
        local::options::FontWeight,
        util::{get_request_hash, get_request_id},
    },
};

pub mod errors;
pub mod font_fallback;
pub mod options;
pub mod request;
pub mod stylesheet;
pub mod util;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct NextFontLocalFontFileOptions {
    pub path: RcStr,
    pub preload: bool,
    pub has_size_adjust: bool,
}

#[turbo_tasks::value]
pub(crate) struct NextFontLocalResolvePlugin {
    root: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl NextFontLocalResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: FileSystemPath) -> Vc<Self> {
        NextFontLocalResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for NextFontLocalResolvePlugin {
    #[turbo_tasks::function]
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        BeforeResolvePluginCondition::from_request_glob(Glob::new(
            rcstr!("{next,@vercel/turbopack-next/internal}/font/local/*"),
            GlobOptions::default(),
        ))
    }

    #[turbo_tasks::function]
    async fn before_resolve(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        _reference_type: ReferenceType,
        request_vc: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let this = &*self.await?;
        let request = &*request_vc.await?;

        let Some(request_key) = request.request() else {
            return Ok(ResolveResultOption::none());
        };

        let Request::Module {
            module: _,
            path: _,
            query,
            fragment: _,
        } = request
        else {
            return Ok(ResolveResultOption::none());
        };

        match request_key.as_str() {
            "next/font/local/target.css" => {
                if !can_use_next_font(this.root.clone(), query).await? {
                    return Ok(ResolveResultOption::none());
                }

                let request_hash = get_request_hash(query.as_str());
                let qstr = qstring::QString::from(query.as_str());
                let options_vc = font_options_from_query_map(query.clone());

                let font_fallbacks = &*get_font_fallbacks(lookup_path.clone(), options_vc).await?;
                let font_fallbacks = match font_fallbacks {
                    FontFallbackResult::FontFileNotFound(err) => {
                        FontResolvingIssue {
                            origin_path: lookup_path.clone(),
                            font_path: ResolvedVc::cell(err.0.clone()),
                        }
                        .resolved_cell()
                        .emit();

                        return Ok(ResolveResultOption::some(*ResolveResult::primary(
                            ResolveResultItem::Error(ResolvedVc::cell(err.to_string().into())),
                        )));
                    }
                    FontFallbackResult::Ok(font_fallbacks) => *font_fallbacks,
                };

                let properties = get_font_css_properties(options_vc, *font_fallbacks).await?;
                let file_content = formatdoc!(
                    r#"
                    import cssModule from "@vercel/turbopack-next/internal/font/local/cssmodule.module.css?{}";
                    const fontData = {{
                        className: cssModule.className,
                        style: {{
                            fontFamily: "{}",
                            {}{}
                        }},
                    }};

                    if (cssModule.variable != null) {{
                        fontData.variable = cssModule.variable;
                    }}

                    export default fontData;
                "#,
                    // Pass along whichever options we received to the css handler
                    qstr,
                    properties.font_family.await?,
                    properties
                        .weight
                        .await?
                        .as_ref()
                        .map(|w| format!("fontWeight: {w},\n"))
                        .unwrap_or_else(|| "".to_owned()),
                    properties
                        .style
                        .await?
                        .as_ref()
                        .map(|s| format!("fontStyle: \"{s}\",\n"))
                        .unwrap_or_else(|| "".to_owned()),
                );
                let js_asset = VirtualSource::new(
                    lookup_path.join(&format!(
                        "{}.js",
                        get_request_id(options_vc.font_family().await?, request_hash)
                    ))?,
                    AssetContent::file(FileContent::Content(file_content.into()).into()),
                )
                .to_resolved()
                .await?;

                Ok(ResolveResultOption::some(*ResolveResult::source(
                    ResolvedVc::upcast(js_asset),
                )))
            }
            "@vercel/turbopack-next/internal/font/local/cssmodule.module.css" => {
                let request_hash = get_request_hash(query);
                let options = font_options_from_query_map(query.clone());
                let css_virtual_path = lookup_path.join(&format!(
                    "/{}.module.css",
                    get_request_id(options.font_family().await?, request_hash)
                ))?;
                let fallback = &*get_font_fallbacks(lookup_path.clone(), options).await?;
                let fallback = match fallback {
                    FontFallbackResult::FontFileNotFound(err) => {
                        FontResolvingIssue {
                            origin_path: lookup_path.clone(),
                            font_path: ResolvedVc::cell(err.0.clone()),
                        }
                        .resolved_cell()
                        .emit();

                        return Ok(ResolveResultOption::some(*ResolveResult::primary(
                            ResolveResultItem::Error(ResolvedVc::cell(err.to_string().into())),
                        )));
                    }
                    FontFallbackResult::Ok(font_fallbacks) => **font_fallbacks,
                };

                let stylesheet = build_stylesheet(
                    font_options_from_query_map(query.clone()),
                    fallback,
                    get_font_css_properties(options, fallback),
                )
                .await?;

                let css_asset = VirtualSource::new(
                    css_virtual_path,
                    AssetContent::file(FileContent::Content(stylesheet.into()).cell()),
                )
                .to_resolved()
                .await?;

                Ok(ResolveResultOption::some(*ResolveResult::source(
                    ResolvedVc::upcast(css_asset),
                )))
            }
            "@vercel/turbopack-next/internal/font/local/font" => {
                let NextFontLocalFontFileOptions {
                    path,
                    preload,
                    has_size_adjust: size_adjust,
                } = font_file_options_from_query_map(query)?;

                let (filename, ext) = split_extension(&path);
                let ext = ext.with_context(|| format!("font {} needs an extension", &path))?;

                // remove dashes and dots as they might be used for the markers below.
                let mut name = filename.replace(['-', '.'], "_");
                if size_adjust {
                    name.push_str("-s")
                }
                if preload {
                    name.push_str(".p")
                }

                let font_virtual_path = lookup_path.join(&format!("/{name}.{ext}"))?;

                let font_file = lookup_path.join(&path)?.read();

                let font_source =
                    VirtualSource::new(font_virtual_path, AssetContent::file(font_file))
                        .to_resolved()
                        .await?;

                Ok(ResolveResultOption::some(*ResolveResult::source(
                    ResolvedVc::upcast(font_source),
                )))
            }
            _ => Ok(ResolveResultOption::none()),
        }
    }
}

#[turbo_tasks::function]
async fn get_font_css_properties(
    options_vc: Vc<NextFontLocalOptions>,
    font_fallbacks: Vc<FontFallbacks>,
) -> Result<Vc<FontCssProperties>> {
    let options = &*options_vc.await?;

    Ok(FontCssProperties::cell(FontCssProperties {
        font_family: build_font_family_string(options_vc, font_fallbacks)
            .to_resolved()
            .await?,
        weight: ResolvedVc::cell(match &options.fonts {
            FontDescriptors::Many(_) => None,
            // When the user only provided a top-level font file, include the font weight in the
            // className selector rules
            FontDescriptors::One(descriptor) => descriptor
                .weight
                .as_ref()
                // Don't include values for variable fonts. These are included in font-face
                // definitions only.
                .filter(|w| !matches!(w, FontWeight::Variable(_, _)))
                .map(|w| w.to_string().into()),
        }),
        style: ResolvedVc::cell(match &options.fonts {
            FontDescriptors::Many(_) => None,
            // When the user only provided a top-level font file, include the font style in the
            // className selector rules
            FontDescriptors::One(descriptor) => descriptor.style.clone(),
        }),
        variable: ResolvedVc::cell(options.variable.clone()),
    }))
}

#[turbo_tasks::function]
fn font_options_from_query_map(query: RcStr) -> Result<Vc<NextFontLocalOptions>> {
    let query_map = qstring::QString::from(query.as_str());

    if query_map.len() != 1 {
        bail!("next/font/local queries have exactly one entry");
    }

    let Some((json, _)) = query_map.into_iter().next() else {
        bail!("Expected one entry");
    };

    options_from_request(&parse_json_with_source_context(&json)?).map(NextFontLocalOptions::new)
}

fn font_file_options_from_query_map(query: &RcStr) -> Result<NextFontLocalFontFileOptions> {
    let query_map = qstring::QString::from(query.as_str());

    if query_map.len() != 1 {
        bail!("next/font/local queries have exactly one entry");
    }

    let Some((json, _)) = query_map.into_iter().next() else {
        bail!("Expected one entry");
    };

    parse_json_with_source_context(&json)
}

#[turbo_tasks::value(shared)]
struct FontResolvingIssue {
    font_path: ResolvedVc<RcStr>,
    // TODO(PACK-4879): The filepath is incorrect and there should be a fine grained source
    // location pointing at the import/require
    origin_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for FontResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.origin_path.clone().cell()
    }

    #[turbo_tasks::function]
    fn stage(self: Vc<Self>) -> Vc<IssueStage> {
        IssueStage::Resolve.cell()
    }

    #[turbo_tasks::function]
    async fn title(self: Vc<Self>) -> Result<Vc<StyledString>> {
        let this = self.await?;
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Font file not found: Can't resolve '")),
            StyledString::Code(this.font_path.owned().await?),
            StyledString::Text(rcstr!("'")),
        ])
        .cell())
    }
}
