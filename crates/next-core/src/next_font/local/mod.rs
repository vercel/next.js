use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use indoc::formatdoc;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath, json::parse_json_with_source_context};
use turbopack_core::{
    asset::AssetContent,
    issue::{Issue, IssueSeverity, IssueStage, StyledString},
    resolve::{
        ResolveResult, ResolveResultItem,
        options::{ImportMapResult, ImportMappingReplacement, ReplacedImportMapping},
        parse::Request,
        pattern::Pattern,
    },
    virtual_source::VirtualSource,
};

use crate::{
    next_app::metadata::split_extension,
    next_font::{
        font_fallback::FontFallbacks,
        local::{
            font_fallback::{FontFallbackResult, get_font_fallbacks},
            options::{FontDescriptors, FontWeight, NextFontLocalOptions},
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
impl NextFontLocalFontFileOptions {
    pub fn from_query_map(query: &RcStr) -> Result<NextFontLocalFontFileOptions> {
        let query_map = qstring::QString::from(query.as_str());

        if query_map.len() != 1 {
            bail!("next/font/local queries have exactly one entry");
        }

        let Some((json, _)) = query_map.into_iter().next() else {
            bail!("Expected one entry");
        };

        parse_json_with_source_context(&json)
    }
}

// Replacer for `next/font/local/target.css`
#[turbo_tasks::value]
pub(crate) struct NextFontLocalReplacer {
    root: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl NextFontLocalReplacer {
    #[turbo_tasks::function]
    pub fn new(root: FileSystemPath) -> Vc<Self> {
        Self::cell(NextFontLocalReplacer { root })
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontLocalReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Ignore.cell()
    }

    #[turbo_tasks::function]
    async fn result(
        &self,
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query,
            fragment: _,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.cell());
        };

        if !can_use_next_font(self.root.clone(), query).await? {
            return Ok(ImportMapResult::NoEntry.cell());
        }

        let request_hash = get_request_hash(query.as_str());
        let qstr = qstring::QString::from(query.as_str());
        let options_vc = NextFontLocalOptions::from_query_map(query.clone());

        let font_fallbacks = &*get_font_fallbacks(lookup_path.clone(), options_vc).await?;
        let font_fallbacks = match font_fallbacks {
            FontFallbackResult::FontFileNotFound(err) => {
                return Ok(ImportMapResult::Result(
                    ResolveResult::primary(ResolveResultItem::Error(ResolvedVc::upcast(
                        FontResolvingIssue {
                            font_path: ResolvedVc::cell(err.0.clone()),
                        }
                        .resolved_cell(),
                    )))
                    .resolved_cell(),
                )
                .cell());
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
                .and_then(font_weight_js_property)
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
            AssetContent::file(FileContent::Content(file_content.into()).cell()),
        )
        .to_resolved()
        .await?;

        Ok(ImportMapResult::Result(
            ResolveResult::source(ResolvedVc::upcast(js_asset)).resolved_cell(),
        )
        .cell())
    }
}

// Replacer for `@vercel/turbopack-next/internal/font/local/cssmodule.module.css` requests.
#[turbo_tasks::value]
pub(crate) struct NextFontLocalCssModuleReplacer {}

#[turbo_tasks::value_impl]
impl NextFontLocalCssModuleReplacer {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        Self::cell(NextFontLocalCssModuleReplacer {})
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontLocalCssModuleReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Ignore.cell()
    }

    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query,
            fragment: _,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.cell());
        };

        let request_hash = get_request_hash(query);
        let options = NextFontLocalOptions::from_query_map(query.clone());
        let css_virtual_path = lookup_path.join(&format!(
            "/{}.module.css",
            get_request_id(options.font_family().await?, request_hash)
        ))?;
        let fallback = &*get_font_fallbacks(lookup_path.clone(), options).await?;
        let fallback = match fallback {
            FontFallbackResult::FontFileNotFound(err) => {
                return Ok(ImportMapResult::Result(
                    ResolveResult::primary(ResolveResultItem::Error(ResolvedVc::upcast(
                        FontResolvingIssue {
                            font_path: ResolvedVc::cell(err.0.clone()),
                        }
                        .resolved_cell(),
                    )))
                    .resolved_cell(),
                )
                .cell());
            }
            FontFallbackResult::Ok(font_fallbacks) => **font_fallbacks,
        };

        let stylesheet = build_stylesheet(
            NextFontLocalOptions::from_query_map(query.clone()),
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

        Ok(ImportMapResult::Result(
            ResolveResult::source(ResolvedVc::upcast(css_asset)).resolved_cell(),
        )
        .cell())
    }
}

// Replacer for `@vercel/turbopack-next/internal/font/local/font`
#[turbo_tasks::value]
pub(crate) struct NextFontLocalFontFileReplacer {}

#[turbo_tasks::value_impl]
impl NextFontLocalFontFileReplacer {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        Self::cell(NextFontLocalFontFileReplacer {})
    }
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for NextFontLocalFontFileReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Ignore.cell()
    }

    #[turbo_tasks::function]
    async fn result(
        &self,
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let request = &*request.await?;
        let Request::Module {
            module: _,
            path: _,
            query,
            fragment: _,
        } = request
        else {
            return Ok(ImportMapResult::NoEntry.cell());
        };

        let NextFontLocalFontFileOptions {
            path,
            preload,
            has_size_adjust: size_adjust,
        } = NextFontLocalFontFileOptions::from_query_map(query)?;

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

        let font_source = VirtualSource::new(font_virtual_path, AssetContent::file(font_file))
            .to_resolved()
            .await?;

        Ok(ImportMapResult::Result(
            ResolveResult::source(ResolvedVc::upcast(font_source)).resolved_cell(),
        )
        .cell())
    }
}

/// Formats the `fontWeight` entry for the generated JS module, mirroring the
/// webpack implementation (postcss-next-font.ts): only numeric weights are
/// included. A CSS keyword like `normal` would otherwise be emitted as a bare
/// (unbound) identifier and throw a `ReferenceError` when the module is
/// evaluated. The parsed number is emitted rather than the raw string so the
/// output is always a valid JS numeric literal.
fn font_weight_js_property(weight: &RcStr) -> Option<String> {
    weight
        .parse::<f64>()
        .ok()
        // Rust's float parser also accepts `inf`/`Infinity`/`NaN`, which would
        // be emitted as bare identifiers (`fontWeight: inf`) — guard them out.
        .filter(|n| n.is_finite())
        .map(|n| format!("fontWeight: {n},\n"))
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

#[turbo_tasks::value(shared)]
struct FontResolvingIssue {
    font_path: ResolvedVc<RcStr>,
}

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
            StyledString::Code(self.font_path.owned().await?),
            StyledString::Text(rcstr!("'")),
        ]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn font_weight_js_property_emits_numeric_weights() {
        assert_eq!(
            font_weight_js_property(&"400".into()),
            Some("fontWeight: 400,\n".to_owned())
        );
        // Emitted as a canonical numeric literal, not verbatim.
        assert_eq!(
            font_weight_js_property(&"0400".into()),
            Some("fontWeight: 400,\n".to_owned())
        );
    }

    #[test]
    fn font_weight_js_property_omits_non_numeric_weights() {
        // CSS keywords would be emitted as bare (unbound) identifiers in the
        // generated module, throwing a ReferenceError on evaluation.
        for keyword in ["normal", "bold", "bolder", "lighter", "inherit"] {
            assert_eq!(font_weight_js_property(&keyword.into()), None);
        }
        // Rust's float parser accepts these, but emitting them would produce
        // `fontWeight: inf` / `fontWeight: NaN` — bare identifier output in
        // the `inf` case, and neither is a valid CSS font weight.
        for special in ["inf", "Infinity", "-inf", "NaN", "nan"] {
            assert_eq!(font_weight_js_property(&special.into()), None);
        }
    }
}
