use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use regex::Regex;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{IssueExt, IssueSeverity, StyledString};

use super::options::NextFontGoogleOptions;
use crate::{
    next_font::{
        font_fallback::{
            AutomaticFontFallback, FontAdjustment, FontFallback, DEFAULT_SANS_SERIF_FONT,
            DEFAULT_SERIF_FONT,
        },
        issue::NextFontIssue,
        util::{get_scoped_font_family, FontFamilyType},
    },
    util::load_next_js_templateon,
};

/// An entry in the Google fonts metrics map
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(super) struct FontMetricsMapEntry {
    category: RcStr,
    ascent: i32,
    descent: i32,
    line_gap: u32,
    units_per_em: u32,
    x_width_avg: f64,
}

#[derive(Deserialize, Debug)]
pub(super) struct FontMetricsMap(pub FxHashMap<RcStr, FontMetricsMapEntry>);

#[derive(Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
struct Fallback {
    pub font_family: RcStr,
    pub adjustment: Option<FontAdjustment>,
}

#[turbo_tasks::function]
pub(super) async fn get_font_fallback(
    lookup_path: ResolvedVc<FileSystemPath>,
    options_vc: Vc<NextFontGoogleOptions>,
) -> Result<Vc<FontFallback>> {
    let options = options_vc.await?;
    Ok(match &options.fallback {
        Some(fallback) => FontFallback::Manual(fallback.clone()).cell(),
        None => {
            let metrics_json = load_next_js_templateon(
                lookup_path,
                "dist/server/capsize-font-metrics.json".into(),
            )
            .await?;
            let fallback = lookup_fallback(
                &options.font_family,
                metrics_json,
                options.adjust_font_fallback,
            );

            match fallback {
                Ok(fallback) => FontFallback::Automatic(AutomaticFontFallback {
                    scoped_font_family: get_scoped_font_family(
                        FontFamilyType::Fallback.cell(),
                        options_vc.font_family(),
                    )
                    .to_resolved()
                    .await?,
                    local_font_family: ResolvedVc::cell(fallback.font_family),
                    adjustment: fallback.adjustment,
                })
                .cell(),
                Err(_) => {
                    NextFontIssue {
                        path: lookup_path,
                        title: StyledString::Text(
                            format!(
                                "Failed to find font override values for font `{}`",
                                &options.font_family,
                            )
                            .into(),
                        )
                        .resolved_cell(),
                        description: StyledString::Text(
                            "Skipping generating a fallback font.".into(),
                        )
                        .resolved_cell(),
                        severity: IssueSeverity::Warning.resolved_cell(),
                    }
                    .resolved_cell()
                    .emit();
                    FontFallback::Error.cell()
                }
            }
        }
    })
}

static FALLBACK_FONT_NAME: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?:^\w|[A-Z]|\b\w)").unwrap());

// From https://github.com/vercel/next.js/blob/1628260b88ce3052ac307a1607b6e8470188ab83/packages/next/src/server/font-utils.ts#L101
fn format_fallback_font_name(font_family: &str) -> RcStr {
    let mut fallback_name = FALLBACK_FONT_NAME
        .replace(font_family, |caps: &regex::Captures| {
            caps.iter()
                .enumerate()
                .map(|(i, font_matches)| {
                    let font_matches = font_matches.unwrap().as_str();
                    if i == 0 {
                        font_matches.to_lowercase()
                    } else {
                        font_matches.to_uppercase()
                    }
                })
                .collect::<Vec<String>>()
                .join("")
        })
        .to_string();
    fallback_name.retain(|c| !c.is_whitespace());
    fallback_name.into()
}

fn lookup_fallback(
    font_family: &str,
    font_metrics_map: FontMetricsMap,
    adjust: bool,
) -> Result<Fallback> {
    let font_family = format_fallback_font_name(font_family);
    let metrics = font_metrics_map
        .0
        .get(&font_family)
        .context("Font not found in metrics")?;

    let fallback = if metrics.category == "serif" {
        &DEFAULT_SERIF_FONT
    } else {
        &DEFAULT_SANS_SERIF_FONT
    };

    let metrics = if adjust {
        // Derived from
        // https://github.com/vercel/next.js/blob/7bfd5829999b1d203e447d30de7e29108c31934a/packages/next/src/server/font-utils.ts#L131
        let main_font_avg_width = metrics.x_width_avg / metrics.units_per_em as f64;
        let fallback_metrics = font_metrics_map.0.get(&fallback.capsize_key).unwrap();
        let fallback_font_avg_width = fallback_metrics.x_width_avg / fallback.units_per_em as f64;
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

    Ok(Fallback {
        font_family: fallback.name.clone(),
        adjustment: metrics,
    })
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use turbo_tasks_fs::json::parse_json_with_source_context;

    use super::{FontAdjustment, FontMetricsMap};
    use crate::next_font::google::font_fallback::{lookup_fallback, Fallback};

    #[test]
    fn test_fallback_from_metrics_sans_serif() -> Result<()> {
        let font_metrics: FontMetricsMap = parse_json_with_source_context(
            r#"
            {
                "inter": {
                    "familyName": "Inter",
                    "category": "sans-serif",
                    "capHeight": 2048,
                    "ascent": 2728,
                    "descent": -680,
                    "lineGap": 0,
                    "unitsPerEm": 2816,
                    "xHeight": 1536,
                    "xWidthAvg": 1335
                },
                "arial": {
                    "familyName": "Arial",
                    "category": "sans-serif",
                    "capHeight": 1467,
                    "ascent": 1854,
                    "descent": -434,
                    "lineGap": 67,
                    "unitsPerEm": 2048,
                    "xHeight": 1062,
                    "xWidthAvg": 904
                }
            }
        "#,
        )?;

        assert_eq!(
            lookup_fallback("Inter", font_metrics, true)?,
            Fallback {
                font_family: "Arial".into(),
                adjustment: Some(FontAdjustment {
                    ascent: 0.901_989_700_374_532,
                    descent: -0.224_836_142_322_097_4,
                    line_gap: 0.0,
                    size_adjust: 1.074_014_481_094_127
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
                "robotoSlab": {
                    "familyName": "Roboto Slab",
                    "category": "serif",
                    "capHeight": 1456,
                    "ascent": 2146,
                    "descent": -555,
                    "lineGap": 0,
                    "unitsPerEm": 2048,
                    "xHeight": 1082,
                    "xWidthAvg": 969
                },
                "timesNewRoman": {
                    "familyName": "Times New Roman",
                    "category": "serif",
                    "capHeight": 1356,
                    "ascent": 1825,
                    "descent": -443,
                    "lineGap": 87,
                    "unitsPerEm": 2048,
                    "xHeight": 916,
                    "xWidthAvg": 819
                }
            }
        "#,
        )?;

        assert_eq!(
            lookup_fallback("Roboto Slab", font_metrics, true)?,
            Fallback {
                font_family: "Times New Roman".into(),
                adjustment: Some(FontAdjustment {
                    ascent: 0.885_645_438_273_993_8,
                    descent: -0.229_046_234_036_377_7,
                    line_gap: 0.0,
                    size_adjust: 1.183_150_183_150_183_2
                })
            }
        );
        Ok(())
    }
}
