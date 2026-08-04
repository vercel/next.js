use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use super::FontCssProperties;
use crate::next_font::{
    font_fallback::FontFallback,
    stylesheet::{build_fallback_definition, build_font_class_rules},
};

#[turbo_tasks::function]
pub(super) async fn build_stylesheet(
    base_stylesheet: Vc<Option<RcStr>>,
    font_css_properties: Vc<FontCssProperties>,
    font_fallback: ResolvedVc<FontFallback>,
) -> Result<Vc<RcStr>> {
    let base_stylesheet = &*turbo_tasks::read!(base_stylesheet)?;
    let mut stylesheet = base_stylesheet
        .as_ref()
        .map_or_else(|| "".to_owned(), |s| s.to_string());

    stylesheet.push_str(&turbo_tasks::read!(build_fallback_definition(Vc::cell(
        vec![font_fallback]
    )))?);
    stylesheet.push_str(&turbo_tasks::read!(build_font_class_rules(
        font_css_properties
    ))?);
    Ok(Vc::cell(stylesheet.into()))
}
