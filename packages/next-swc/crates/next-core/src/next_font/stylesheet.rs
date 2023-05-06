use anyhow::Result;
use indoc::formatdoc;
use turbo_binding::turbo::tasks::primitives::StringVc;

use super::{
    font_fallback::{FontFallback, FontFallbacksVc},
    util::FontCssPropertiesVc,
};

/// Builds `@font-face` stylesheet definition for a given FontFallback
#[turbo_tasks::function]
pub(crate) async fn build_fallback_definition(fallbacks: FontFallbacksVc) -> Result<StringVc> {
    let mut res = "".to_owned();
    for fallback_vc in &*fallbacks.await? {
        if let FontFallback::Automatic(fallback) = &*fallback_vc.await? {
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

            res.push_str(&formatdoc!(
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
            ));
        }
    }

    Ok(StringVc::cell(res))
}

#[turbo_tasks::function]
pub(super) async fn build_font_class_rules(
    css_properties: FontCssPropertiesVc,
) -> Result<StringVc> {
    let css_properties = &*css_properties.await?;
    let font_family_string = &*css_properties.font_family.await?;

    let mut rules = formatdoc!(
        r#"
        .className {{
            font-family: {};
            {}{}
        }}
    "#,
        font_family_string,
        css_properties
            .weight
            .await?
            .as_ref()
            .map(|w| format!("font-weight: {};\n", w))
            .unwrap_or_else(|| "".to_owned()),
        css_properties
            .style
            .await?
            .as_ref()
            .map(|s| format!("font-style: {};\n", s))
            .unwrap_or_else(|| "".to_owned()),
    );

    if let Some(variable) = &*css_properties.variable.await? {
        rules.push_str(&formatdoc!(
            r#"
        .variable {{
            {}: {};
        }}
        "#,
            variable,
            font_family_string
        ))
    }

    Ok(StringVc::cell(rules))
}

fn format_fixed_percentage(value: f64) -> String {
    format!("{:.2}", value * 100.0)
}
