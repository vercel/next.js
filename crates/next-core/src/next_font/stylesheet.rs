use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use super::{
    font_fallback::{FontFallback, FontFallbacks},
    util::FontCssProperties,
};

/// Builds `@font-face` stylesheet definition for a given FontFallback
#[turbo_tasks::function]
pub(crate) async fn build_fallback_definition(fallbacks: Vc<FontFallbacks>) -> Result<Vc<RcStr>> {
    let mut res = "".to_owned();
    for fallback_vc in &*turbo_tasks::read!(fallbacks)? {
        if let FontFallback::Automatic(fallback) = &*turbo_tasks::read!(fallback_vc)? {
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
                fallback.scoped_font_family,
                fallback.local_font_family,
                override_properties
            ));
        }
    }

    Ok(Vc::cell(res.into()))
}

#[turbo_tasks::function]
pub(super) async fn build_font_class_rules(
    css_properties: Vc<FontCssProperties>,
) -> Result<Vc<RcStr>> {
    let css_properties = &*turbo_tasks::read!(css_properties)?;
    let font_family_string = &*turbo_tasks::read!(css_properties.font_family)?;

    let mut rules = formatdoc!(
        r#"
        .className {{
            font-family: {};
            {}{}
        }}
    "#,
        font_family_string,
        turbo_tasks::read!(css_properties.weight)?
            .as_ref()
            .map(|w| format!("font-weight: {w};\n"))
            .unwrap_or_else(|| "".to_owned()),
        turbo_tasks::read!(css_properties.style)?
            .as_ref()
            .map(|s| format!("font-style: {s};\n"))
            .unwrap_or_else(|| "".to_owned()),
    );

    if let Some(variable) = &*turbo_tasks::read!(css_properties.variable)? {
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

    Ok(Vc::cell(rules.into()))
}

fn format_fixed_percentage(value: f64) -> String {
    format!("{:.2}", value * 100.0)
}
