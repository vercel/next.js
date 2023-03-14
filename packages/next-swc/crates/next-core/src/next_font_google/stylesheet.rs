use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::primitives::{OptionStringVc, StringVc};

use super::{
    font_fallback::{FontFallback, FontFallbackVc},
    FontCssProperties, FontCssPropertiesVc,
};

#[turbo_tasks::function]
pub(crate) async fn build_stylesheet(
    base_stylesheet: OptionStringVc,
    font_css_properties: FontCssPropertiesVc,
    font_fallback: FontFallbackVc,
) -> Result<StringVc> {
    let base_stylesheet = &*base_stylesheet.await?;
    let mut stylesheet = base_stylesheet
        .as_ref()
        .map_or_else(|| "".to_owned(), |s| s.to_owned());
    if let Some(definition) = build_fallback_definition(&*font_fallback.await?).await? {
        stylesheet.push_str(&definition);
    }
    stylesheet.push_str(&build_font_class_rules(&*font_css_properties.await?).await?);
    Ok(StringVc::cell(stylesheet))
}

async fn build_fallback_definition(fallback: &FontFallback) -> Result<Option<String>> {
    match fallback {
        FontFallback::Error => Ok(None),
        FontFallback::Manual(_) => Ok(None),
        FontFallback::Automatic(fallback) => {
            let fallback = fallback.await?;

            let override_properties = match &fallback.adjustment {
                None => "".to_owned(),
                Some(adjustment) => formatdoc!(
                    r#"
                        ascent-override: {}%;
                        descent-override: {}%;
                        line-gap-override: {}%;
                        size-adjust: {}%;
                    "#,
                    format_fixed_percentage(adjustment.ascent),
                    format_fixed_percentage(adjustment.descent.abs()),
                    format_fixed_percentage(adjustment.line_gap),
                    format_fixed_percentage(adjustment.size_adjust)
                ),
            };

            Ok(Some(formatdoc!(
                r#"
                    @font-face {{
                        font-family: '{}';
                        src: local("{}");
                        {}
                    }}
                "#,
                fallback.scoped_font_family.await?,
                fallback.local_font_family.await?,
                override_properties
            )))
        }
    }
}

async fn build_font_class_rules(properties: &FontCssProperties) -> Result<String> {
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
        //
    }

    Ok(result)
}

fn format_fixed_percentage(value: f64) -> String {
    format!("{:.2}", value * 100.0)
}
