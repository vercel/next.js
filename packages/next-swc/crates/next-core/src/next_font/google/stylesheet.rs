use anyhow::Result;
use turbo_tasks::Vc;

use super::FontCssProperties;
use crate::next_font::{
    font_fallback::FontFallback,
    stylesheet::{build_fallback_definition, build_font_class_rules},
};

#[turbo_tasks::function]
pub(super) async fn build_stylesheet(
    base_stylesheet: Vc<Option<String>>,
    font_css_properties: Vc<FontCssProperties>,
    font_fallback: Vc<FontFallback>,
) -> Result<Vc<String>> {
    let base_stylesheet = &*base_stylesheet.await?;
    let mut stylesheet = base_stylesheet
        .as_ref()
        .map_or_else(|| "".to_owned(), |s| s.to_owned());

    stylesheet.push_str(&build_fallback_definition(Vc::cell(vec![font_fallback])).await?);
    stylesheet.push_str(&build_font_class_rules(font_css_properties).await?);
    Ok(Vc::cell(stylesheet))
}
