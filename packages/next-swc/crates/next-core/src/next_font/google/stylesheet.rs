use anyhow::Result;
use turbo_binding::turbo::tasks::primitives::{OptionStringVc, StringVc};

use super::FontCssPropertiesVc;
use crate::next_font::{
    font_fallback::{FontFallbackVc, FontFallbacksVc},
    stylesheet::{build_fallback_definition, build_font_class_rules},
};

#[turbo_tasks::function]
pub(super) async fn build_stylesheet(
    base_stylesheet: OptionStringVc,
    font_css_properties: FontCssPropertiesVc,
    font_fallback: FontFallbackVc,
) -> Result<StringVc> {
    let base_stylesheet = &*base_stylesheet.await?;
    let mut stylesheet = base_stylesheet
        .as_ref()
        .map_or_else(|| "".to_owned(), |s| s.to_owned());

    stylesheet
        .push_str(&build_fallback_definition(FontFallbacksVc::cell(vec![font_fallback])).await?);
    stylesheet.push_str(&build_font_class_rules(font_css_properties).await?);
    Ok(StringVc::cell(stylesheet))
}
