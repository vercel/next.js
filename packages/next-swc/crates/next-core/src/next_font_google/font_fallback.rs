use std::collections::HashMap;

use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{StringVc, StringsVc, U32Vc},
    trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::issue::IssueSeverity;

use super::{get_scoped_font_family, options::NextFontGoogleOptionsVc, FontFamilyType};
use crate::{next_font_google::issue::NextFontIssue, util::load_next_json};

struct DefaultFallbackFont {
    name: String,
    az_avg_width: f64,
    units_per_em: u32,
}

// From https://github.com/vercel/next.js/blob/a3893bf69c83fb08e88c87bf8a21d987a0448c8e/packages/font/src/utils.ts#L4
static DEFAULT_SANS_SERIF_FONT: Lazy<DefaultFallbackFont> = Lazy::new(|| DefaultFallbackFont {
    name: "Arial".to_owned(),
    az_avg_width: 934.5116279069767,
    units_per_em: 2048,
});

static DEFAULT_SERIF_FONT: Lazy<DefaultFallbackFont> = Lazy::new(|| DefaultFallbackFont {
    name: "Times New Roman".to_owned(),
    az_avg_width: 854.3953488372093,
    units_per_em: 2048,
});

#[turbo_tasks::value(transparent)]
pub(crate) struct AutomaticFontFallback {
    pub scoped_font_family: StringVc,
    pub local_font_family: StringVc,
    pub adjustment: Option<FontAdjustment>,
}

#[turbo_tasks::value(transparent)]
pub(crate) enum FontFallback {
    Automatic(AutomaticFontFallbackVc),
    /// There was an issue loading the font metrics data. Since resolving the
    /// font css cannot fail, proper Errors cannot be returned. Emit an issue,
    /// return this and omit fallback information instead.
    Error,
    Manual(StringsVc),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FontMetricsMapEntry {
    category: String,
    ascent: i32,
    descent: i32,
    line_gap: u32,
    units_per_em: u32,
    az_avg_width: f64,
}

#[derive(Deserialize)]
pub(crate) struct FontMetricsMap(pub HashMap<String, FontMetricsMapEntry>);

#[derive(Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
pub(crate) struct FontAdjustment {
    pub ascent: f64,
    pub descent: f64,
    pub line_gap: f64,
    pub size_adjust: f64,
}

// Necessary since floating points in this struct don't implement Eq, but it's
// required for turbo tasks values.
impl Eq for FontAdjustment {}

#[derive(Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
pub(crate) struct Font {
    pub font_family: String,
    pub adjustment: Option<FontAdjustment>,
}

#[turbo_tasks::function]
pub(crate) async fn get_font_fallback(
    context: FileSystemPathVc,
    options_vc: NextFontGoogleOptionsVc,
    request_hash: U32Vc,
) -> Result<FontFallbackVc> {
    let options = options_vc.await?;
    Ok(match &options.fallback {
        Some(fallback) => FontFallback::Manual(StringsVc::cell(fallback.clone())).cell(),
        None => {
            let metrics_json =
                load_next_json(context, "/dist/server/google-font-metrics.json").await;
            match metrics_json {
                Ok(metrics_json) => {
                    let fallback = lookup_fallback(
                        &options.font_family,
                        metrics_json,
                        options.adjust_font_fallback,
                    );

                    match fallback {
                        Ok(fallback) => FontFallback::Automatic(
                            AutomaticFontFallback {
                                scoped_font_family: get_scoped_font_family(
                                    FontFamilyType::Fallback.cell(),
                                    options_vc,
                                    request_hash,
                                ),
                                local_font_family: StringVc::cell(fallback.font_family),
                                adjustment: fallback.adjustment,
                            }
                            .cell(),
                        )
                        .cell(),
                        Err(_) => {
                            NextFontIssue {
                                path: context,
                                title: StringVc::cell(format!(
                                    "Failed to find font override values for font `{}`",
                                    &options.font_family,
                                )),
                                description: StringVc::cell(
                                    "Skipping generating a fallback font.".to_owned(),
                                ),
                                severity: IssueSeverity::Warning.cell(),
                            }
                            .cell()
                            .as_issue()
                            .emit();
                            FontFallback::Error.cell()
                        }
                    }
                }
                Err(_) => FontFallback::Error.cell(),
            }
        }
    })
}

fn lookup_fallback(
    font_family: &str,
    font_metrics_map: FontMetricsMap,
    adjust: bool,
) -> Result<Font> {
    let metrics = font_metrics_map
        .0
        .get(font_family)
        .context("Font not found in metrics")?;

    let fallback = if metrics.category == "serif" {
        &DEFAULT_SERIF_FONT
    } else {
        &DEFAULT_SANS_SERIF_FONT
    };

    let metrics = if adjust {
        // Derived from
        // https://github.com/vercel/next.js/blob/a3893bf69c83fb08e88c87bf8a21d987a0448c8e/packages/next/src/server/font-utils.ts#L121
        let main_font_avg_width = metrics.az_avg_width / metrics.units_per_em as f64;
        let fallback_font_avg_width = fallback.az_avg_width / fallback.units_per_em as f64;
        let size_adjust = main_font_avg_width / fallback_font_avg_width;

        let ascent = metrics.ascent as f64 / (metrics.units_per_em as f64 * size_adjust);
        let descent = metrics.descent as f64 / (metrics.units_per_em as f64 * size_adjust);
        let line_gap = metrics.line_gap as f64 / (metrics.units_per_em as f64 * size_adjust);

        Some(FontAdjustment {
            ascent,
            descent,
            line_gap,
            size_adjust,
        })
    } else {
        None
    };

    Ok(Font {
        font_family: fallback.name.clone(),
        adjustment: metrics,
    })
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use turbo_tasks_fs::json::parse_json_with_source_context;

    use super::{FontAdjustment, FontMetricsMap};
    use crate::next_font_google::font_fallback::{lookup_fallback, Font};

    #[test]
    fn test_fallback_from_metrics_sans_serif() -> Result<()> {
        let font_metrics: FontMetricsMap = parse_json_with_source_context(
            r#"
            {
                "Inter": {
                    "category": "sans-serif",
                    "ascent": 2728,
                    "descent": -680,
                    "lineGap": 0,
                    "xAvgCharWidth": 1838,
                    "unitsPerEm": 2816,
                    "azAvgWidth": 1383.0697674418604
                }
            }
        "#,
        )?;

        assert_eq!(
            lookup_fallback("Inter", font_metrics, true)?,
            Font {
                font_family: "Arial".to_owned(),
                adjustment: Some(FontAdjustment {
                    ascent: 0.9000259575934895,
                    descent: -0.2243466463209578,
                    line_gap: 0.0,
                    size_adjust: 1.0763578448229054
                })
            }
        );
        Ok(())
    }

    #[test]
    fn test_fallback_from_metrics_serif() -> Result<()> {
        let font_metrics: FontMetricsMap = parse_json_with_source_context(
            r#"
            {
                "Roboto Slab": {
                    "category": "serif",
                    "ascent": 2146,
                    "descent": -555,
                    "lineGap": 0,
                    "xAvgCharWidth": 1239,
                    "unitsPerEm": 2048,
                    "azAvgWidth": 1005.6279069767442
                }
            }
        "#,
        )?;

        assert_eq!(
            lookup_fallback("Roboto Slab", font_metrics, true)?,
            Font {
                font_family: "Times New Roman".to_owned(),
                adjustment: Some(FontAdjustment {
                    ascent: 0.8902691493151913,
                    descent: -0.23024202137461844,
                    line_gap: 0.0,
                    size_adjust: 1.1770053621492147
                })
            }
        );
        Ok(())
    }
}
