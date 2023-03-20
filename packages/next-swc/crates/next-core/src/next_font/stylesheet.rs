use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::primitives::OptionStringVc;

use super::font_fallback::{FontFallback, FontFallbackVc};

/// Builds `@font-face` stylesheet definition for a given FontFallback
#[turbo_tasks::function]
pub(crate) async fn build_fallback_definition(fallback: FontFallbackVc) -> Result<OptionStringVc> {
    Ok(OptionStringVc::cell(match *fallback.await? {
        FontFallback::Error => None,
        FontFallback::Manual(_) => None,
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

            Some(formatdoc!(
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
            ))
        }
    }))
}

fn format_fixed_percentage(value: f64) -> String {
    format!("{:.2}", value * 100.0)
}
