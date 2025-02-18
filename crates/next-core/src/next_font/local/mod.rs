use anyhow::{bail, Context, Result};
use indoc::formatdoc;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbo_tasks_fs::{
    glob::Glob, json::parse_json_with_source_context, FileContent, FileSystemPath,
};
use turbopack_core::{
    asset::AssetContent,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    reference_type::ReferenceType,
    resolve::{
        parse::Request,
        plugin::{BeforeResolvePlugin, BeforeResolvePluginCondition},
        ResolveResult, ResolveResultItem, ResolveResultOption,
    },
    virtual_source::VirtualSource,
};

use self::{
    font_fallback::get_font_fallbacks,
    options::{options_from_request, FontDescriptors, NextFontLocalOptions},
    stylesheet::build_stylesheet,
    util::build_font_family_string,
};
use super::{
    font_fallback::FontFallbacks,
    util::{can_use_next_font, FontCssProperties},
};
use crate::{
    next_app::metadata::split_extension,
    next_font::{
        local::{errors::FontError, options::FontWeight},
        util::{get_request_hash, get_request_id},
    },
};

mod errors;
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
    root: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextFontLocalResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        NextFontLocalResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for NextFontLocalResolvePlugin {
    #[turbo_tasks::function]
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        BeforeResolvePluginCondition::from_request_glob(Glob::new(
            "{next,@vercel/turbopack-next/internal}/font/local/*".into(),
        ))
    }

    #[turbo_tasks::function]
    async fn before_resolve(
        self: Vc<Self>,
        lookup_path: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
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
            query: query_vc,
            fragment: _,
        } = request
        else {
            return Ok(ResolveResultOption::none());
        };

        match request_key.as_str() {
            "next/font/local/target.css" => {
                if !can_use_next_font(*this.root, **query_vc).await? {
                    return Ok(ResolveResultOption::none());
                }

                let query = query_vc.await?.to_string();
                let request_hash = get_request_hash(&query).await?;
                let qstr = qstring::QString::from(query.as_str());
                let options_vc = font_options_from_query_map(**query_vc);
                let font_fallbacks = get_font_fallbacks(lookup_path, options_vc);
                let properties = get_font_css_properties(options_vc, font_fallbacks).await;

                let lookup_path = lookup_path.to_resolved().await?;
                if let Err(e) = &properties {
                    for source_error in e.chain() {
                        if let Some(FontError::FontFileNotFound(font_path)) =
                            source_error.downcast_ref::<FontError>()
                        {
                            FontResolvingIssue {
                                origin_path: lookup_path,
                                font_path: ResolvedVc::cell(font_path.clone()),
                            }
                            .resolved_cell()
                            .emit();

                            return Ok(ResolveResultOption::some(
                                ResolveResult::primary(ResolveResultItem::Error(ResolvedVc::cell(
                                    format!("Font file not found: Can't resolve {}'", font_path)
                                        .into(),
                                )))
                                .into(),
                            ));
                        }
                    }
                }

                let properties = properties?;
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
                        .map(|w| format!("fontWeight: {},\n", w))
                        .unwrap_or_else(|| "".to_owned()),
                    properties
                        .style
                        .await?
                        .as_ref()
                        .map(|s| format!("fontStyle: \"{}\",\n", s))
                        .unwrap_or_else(|| "".to_owned()),
                );
                let js_asset = VirtualSource::new(
                    lookup_path.join(
                        format!(
                            "{}.js",
                            get_request_id(options_vc.font_family(), request_hash).await?
                        )
                        .into(),
                    ),
                    AssetContent::file(FileContent::Content(file_content.into()).into()),
                )
                .to_resolved()
                .await?;

                Ok(ResolveResultOption::some(
                    ResolveResult::source(ResolvedVc::upcast(js_asset)).cell(),
                ))
            }
            "@vercel/turbopack-next/internal/font/local/cssmodule.module.css" => {
                let query = query_vc.await?.to_string();
                let request_hash = get_request_hash(&query).await?;
                let options = font_options_from_query_map(**query_vc);
                let css_virtual_path = lookup_path.join(
                    format!(
                        "/{}.module.css",
                        get_request_id(options.font_family(), request_hash).await?
                    )
                    .into(),
                );
                let fallback = get_font_fallbacks(lookup_path, options);

                let stylesheet = build_stylesheet(
                    font_options_from_query_map(**query_vc),
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

                Ok(ResolveResultOption::some(
                    ResolveResult::source(ResolvedVc::upcast(css_asset)).cell(),
                ))
            }
            "@vercel/turbopack-next/internal/font/local/font" => {
                let NextFontLocalFontFileOptions {
                    path,
                    preload,
                    has_size_adjust: size_adjust,
                } = font_file_options_from_query_map(**query_vc).await?;

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

                let font_virtual_path = lookup_path.join(format!("/{}.{}", name, ext).into());

                let font_file = lookup_path.join(path.clone()).read();

                let font_source =
                    VirtualSource::new(font_virtual_path, AssetContent::file(font_file))
                        .to_resolved()
                        .await?;

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
async fn font_options_from_query_map(query: Vc<RcStr>) -> Result<Vc<NextFontLocalOptions>> {
    let query_map = qstring::QString::from(&**query.await?);

    if query_map.len() != 1 {
        bail!("next/font/local queries have exactly one entry");
    }

    let Some((json, _)) = query_map.into_iter().next() else {
        bail!("Expected one entry");
    };

    options_from_request(&parse_json_with_source_context(&json)?)
        .map(|o| NextFontLocalOptions::new(Value::new(o)))
}

async fn font_file_options_from_query_map(
    query: Vc<RcStr>,
) -> Result<NextFontLocalFontFileOptions> {
    let query_map = qstring::QString::from(&**query.await?);

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
    origin_path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for FontResolvingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.origin_path
    }

    #[turbo_tasks::function]
    fn stage(self: Vc<Self>) -> Vc<IssueStage> {
        IssueStage::Resolve.cell()
    }

    #[turbo_tasks::function]
    async fn title(self: Vc<Self>) -> Result<Vc<StyledString>> {
        let this = self.await?;
        Ok(StyledString::Line(vec![
            StyledString::Text("Font file not found: Can't resolve '".into()),
            StyledString::Code(this.font_path.owned().await?),
            StyledString::Text("'".into()),
        ])
        .cell())
    }
}
