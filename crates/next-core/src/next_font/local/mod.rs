use anyhow::{Context, Result, bail};
use async_trait::async_trait;
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
    issue::{Issue, IssueSeverity, IssueStage, StyledString},
    reference_type::ReferenceType,
    resolve::{
        ResolveResult, ResolveResultItem, ResolveResultOption,
        parse::Request,
        plugin::{BeforeResolvePlugin, BeforeResolvePluginCondition},
    },
    virtual_source::VirtualSource,
};

use crate::{
    next_app::metadata::split_extension,
    next_font::{
        font_fallback::FontFallbacks,
        local::{
            font_fallback::{FontFallbackResult, get_font_fallbacks},
            options::{FontDescriptors, FontWeight, NextFontLocalOptions, options_from_request},
            stylesheet::build_stylesheet,
            util::build_font_family_string,
        },
        util::{FontCssProperties, can_use_next_font, get_request_hash, get_request_id},
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
    condition: ResolvedVc<BeforeResolvePluginCondition>,
}

#[turbo_tasks::value_impl]
impl NextFontLocalResolvePlugin {
    #[turbo_tasks::function]
    pub async fn new(root: FileSystemPath) -> Result<Vc<Self>> {
        let condition = turbo_tasks::read!(
            BeforeResolvePluginCondition::from_request_glob(Glob::new(
                rcstr!("{next,@vercel/turbopack-next/internal}/font/local/*"),
                GlobOptions::default(),
            ))
            .to_resolved()
        )?;
        Ok(NextFontLocalResolvePlugin { root, condition }.cell())
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for NextFontLocalResolvePlugin {
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        *self.condition
    }

    #[turbo_tasks::function]
    async fn before_resolve(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        _reference_type: ReferenceType,
        request_vc: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let this = &*turbo_tasks::read!(self)?;
        let request = &*turbo_tasks::read!(request_vc)?;

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
                if !turbo_tasks::read!(can_use_next_font(this.root.clone(), query))? {
                    return Ok(ResolveResultOption::none());
                }

                let request_hash = get_request_hash(query.as_str());
                let qstr = qstring::QString::from(query.as_str());
                let options_vc = font_options_from_query_map(query.clone());

                let font_fallbacks =
                    &*turbo_tasks::read!(get_font_fallbacks(lookup_path.clone(), options_vc))?;
                let font_fallbacks = match font_fallbacks {
                    FontFallbackResult::FontFileNotFound(err) => {
                        return Ok(ResolveResultOption::some(
                            ResolveResult::primary(ResolveResultItem::Error(ResolvedVc::upcast(
                                FontResolvingIssue {
                                    font_path: ResolvedVc::cell(err.0.clone()),
                                }
                                .resolved_cell(),
                            )))
                            .cell(),
                        ));
                    }
                    FontFallbackResult::Ok(font_fallbacks) => *font_fallbacks,
                };

                let properties =
                    turbo_tasks::read!(get_font_css_properties(options_vc, *font_fallbacks))?;
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
                    turbo_tasks::read!(properties.font_family)?,
                    turbo_tasks::read!(properties.weight)?
                        .as_ref()
                        .map(|w| format!("fontWeight: {w},\n"))
                        .unwrap_or_else(|| "".to_owned()),
                    turbo_tasks::read!(properties.style)?
                        .as_ref()
                        .map(|s| format!("fontStyle: \"{s}\",\n"))
                        .unwrap_or_else(|| "".to_owned()),
                );
                let js_asset = turbo_tasks::read!(
                    VirtualSource::new(
                        lookup_path.join(&format!(
                            "{}.js",
                            get_request_id(
                                turbo_tasks::read!(options_vc.font_family())?,
                                request_hash
                            )
                        ))?,
                        AssetContent::file(FileContent::Content(file_content.into()).cell()),
                    )
                    .to_resolved()
                )?;

                Ok(ResolveResultOption::some(
                    ResolveResult::source(ResolvedVc::upcast(js_asset)).cell(),
                ))
            }
            "@vercel/turbopack-next/internal/font/local/cssmodule.module.css" => {
                let request_hash = get_request_hash(query);
                let options = font_options_from_query_map(query.clone());
                let css_virtual_path = lookup_path.join(&format!(
                    "/{}.module.css",
                    get_request_id(turbo_tasks::read!(options.font_family())?, request_hash)
                ))?;
                let fallback =
                    &*turbo_tasks::read!(get_font_fallbacks(lookup_path.clone(), options))?;
                let fallback = match fallback {
                    FontFallbackResult::FontFileNotFound(err) => {
                        return Ok(ResolveResultOption::some(
                            ResolveResult::primary(ResolveResultItem::Error(ResolvedVc::upcast(
                                FontResolvingIssue {
                                    font_path: ResolvedVc::cell(err.0.clone()),
                                }
                                .resolved_cell(),
                            )))
                            .cell(),
                        ));
                    }
                    FontFallbackResult::Ok(font_fallbacks) => **font_fallbacks,
                };

                let stylesheet = turbo_tasks::read!(build_stylesheet(
                    font_options_from_query_map(query.clone()),
                    fallback,
                    get_font_css_properties(options, fallback),
                ))?;

                let css_asset = turbo_tasks::read!(
                    VirtualSource::new(
                        css_virtual_path,
                        AssetContent::file(FileContent::Content(stylesheet.into()).cell()),
                    )
                    .to_resolved()
                )?;

                Ok(ResolveResultOption::some(
                    ResolveResult::source(ResolvedVc::upcast(css_asset)).cell(),
                ))
            }
            "@vercel/turbopack-next/internal/font/local/font" => {
                let NextFontLocalFontFileOptions {
                    path,
                    preload,
                    has_size_adjust: size_adjust,
                } = font_file_options_from_query_map(query)?;

                let (filename, ext) = split_extension(&path);
                let ext = ext.with_context(|| format!("font {} needs an extension", path))?;

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

                let font_source = turbo_tasks::read!(
                    VirtualSource::new(font_virtual_path, AssetContent::file(font_file))
                        .to_resolved()
                )?;

                Ok(ResolveResultOption::some(
                    ResolveResult::source(ResolvedVc::upcast(font_source)).cell(),
                ))
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
    let options = &*turbo_tasks::read!(options_vc)?;

    Ok(FontCssProperties::cell(FontCssProperties {
        font_family: turbo_tasks::read!(
            build_font_family_string(options_vc, font_fallbacks).to_resolved()
        )?,
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
}

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for FontResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        panic!("FontResolvingIssue::file_path should not be called");
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Font file not found: Can't resolve '")),
            StyledString::Code(turbo_tasks::read!(self.font_path.owned())?),
            StyledString::Text(rcstr!("'")),
        ]))
    }
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for FontResolvingIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        panic!("FontResolvingIssue::file_path should not be called");
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Font file not found: Can't resolve '")),
            StyledString::Code(turbo_tasks::read!(self.font_path.owned())?),
            StyledString::Text(rcstr!("'")),
        ]))
    }
}
