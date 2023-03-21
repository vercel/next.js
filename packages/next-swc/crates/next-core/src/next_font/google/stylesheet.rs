use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::primitives::{OptionStringVc, StringVc};

use super::FontCssPropertiesVc;
use crate::next_font::{
    font_fallback::{FontFallbackVc, FontFallbacksVc},
    stylesheet::build_fallback_definition,
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
    if let Some(definition) =
        &*build_fallback_definition(FontFallbacksVc::cell(vec![font_fallback])).await?
    {
        stylesheet.push_str(definition);
    }
    stylesheet.push_str(&build_font_class_rules(font_css_properties).await?);
    Ok(StringVc::cell(stylesheet))
}

#[turbo_tasks::function]
async fn build_font_class_rules(properties: FontCssPropertiesVc) -> Result<StringVc> {
    let properties = &*properties.await?;
    let font_family = &*properties.font_family.await?;

    let mut result = formatdoc!(
        r#"
        .className {{
            font-family: {};
            {}{}
        }}
        "#,
        font_family,
        properties
            .weight
            .await?
            .as_ref()
            .map(|w| format!("font-weight: {};\n", w))
            .unwrap_or_else(|| "".to_owned()),
        properties
            .style
            .await?
            .as_ref()
            .map(|s| format!("font-style: {};\n", s))
            .unwrap_or_else(|| "".to_owned()),
    );

    if let Some(variable) = &*properties.variable.await? {
        result.push_str(&formatdoc!(
            r#"
            .variable {{
                {}: {};
            }}
            "#,
            variable,
            font_family,
        ))
    }

    Ok(StringVc::cell(result))
}
