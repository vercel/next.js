use allsorts::{
    font_data::{DynamicFontTableProvider, FontData},
    Font,
};
use anyhow::{bail, Context, Result};
use turbo_tasks::Vc;
use turbopack_binding::turbo::tasks_fs::{FileContent, FileSystemPath};

use super::{
    options::{FontDescriptor, FontDescriptors, FontWeight, NextFontLocalOptions},
    request::AdjustFontFallback,
};
use crate::next_font::{
    font_fallback::{
        AutomaticFontFallback, DefaultFallbackFont, FontAdjustment, FontFallback, FontFallbacks,
        DEFAULT_SANS_SERIF_FONT, DEFAULT_SERIF_FONT,
    },
    util::{get_scoped_font_family, FontFamilyType},
};

// From
// https://github.com/vercel/next.js/blob/7457be0c74e64b4d0617943ed27f4d557cc916be/packages/font/src/local/get-fallback-metrics-from-font-file.ts#L34
static AVG_CHARACTERS: &str = "aaabcdeeeefghiijklmnnoopqrrssttuvwxyz      ";
static NORMAL_WEIGHT: f64 = 400.0;
static BOLD_WEIGHT: f64 = 700.0;

#[turbo_tasks::function]
pub(super) async fn get_font_fallbacks(
    context: Vc<FileSystemPath>,
    options_vc: Vc<NextFontLocalOptions>,
    request_hash: Vc<u32>,
) -> Result<Vc<FontFallbacks>> {
    let options = &*options_vc.await?;
    let mut font_fallbacks = vec![];
    let scoped_font_family = get_scoped_font_family(
        FontFamilyType::Fallback.cell(),
        options_vc.font_family(),
        request_hash,
    );

    match options.adjust_font_fallback {
        AdjustFontFallback::Arial => font_fallbacks.push(
            FontFallback::Automatic(
                AutomaticFontFallback {
                    scoped_font_family,
                    local_font_family: Vc::cell("Arial".to_owned()),
                    adjustment: Some(
                        get_font_adjustment(context, options_vc, &DEFAULT_SANS_SERIF_FONT).await?,
                    ),
                }
                .cell(),
            )
            .into(),
        ),
        AdjustFontFallback::TimesNewRoman => font_fallbacks.push(
            FontFallback::Automatic(
                AutomaticFontFallback {
                    scoped_font_family,
                    local_font_family: Vc::cell("Times New Roman".to_owned()),
                    adjustment: Some(
                        get_font_adjustment(context, options_vc, &DEFAULT_SERIF_FONT).await?,
                    ),
                }
                .cell(),
            )
            .into(),
        ),
        AdjustFontFallback::None => (),
    };

    if let Some(fallback) = &options.fallback {
        font_fallbacks.push(FontFallback::Manual(Vc::cell(fallback.clone())).into());
    }

    Ok(Vc::cell(font_fallbacks))
}

async fn get_font_adjustment(
    context: Vc<FileSystemPath>,
    options: Vc<NextFontLocalOptions>,
    fallback_font: &DefaultFallbackFont,
) -> Result<FontAdjustment> {
    let options = &*options.await?;
    let main_descriptor = pick_font_for_fallback_generation(&options.fonts)?;
    let font_file = &*context.join(main_descriptor.path.clone()).read().await?;
    let font_file_rope = match font_file {
        FileContent::NotFound => bail!("Expected font file content"),
        FileContent::Content(file) => file.content(),
    };

    let font_file_binary = font_file_rope.to_bytes()?;
    let scope = allsorts::binary::read::ReadScope::new(&font_file_binary);
    let mut font = Font::new(scope.read::<FontData>()?.table_provider(0)?)?.context(format!(
        "Unable to read font metrics from font file at {}",
        &main_descriptor.path,
    ))?;

    let az_avg_width = calc_average_width(&mut font);
    let units_per_em = font
        .head_table()?
        .context(format!(
            "Unable to read font scale from font file at {}",
            &main_descriptor.path
        ))?
        .units_per_em as f64;

    let fallback_avg_width = fallback_font.az_avg_width / fallback_font.units_per_em as f64;
    // TODO: Use xWidthAvg like next/google.
    //       JS implementation: https://github.com/seek-oss/capsize/blob/42d6dc39d58247bc6b9e013a4b1c4463bf287dca/packages/unpack/src/index.ts#L7-L83
    let size_adjust = match az_avg_width {
        Some(az_avg_width) => az_avg_width as f64 / units_per_em / fallback_avg_width,
        None => 1.0,
    };

    Ok(FontAdjustment {
        ascent: font.hhea_table.ascender as f64 / (units_per_em * size_adjust),
        descent: font.hhea_table.descender as f64 / (units_per_em * size_adjust),
        line_gap: font.hhea_table.line_gap as f64 / (units_per_em * size_adjust),
        size_adjust,
    })
}

fn calc_average_width(font: &mut Font<DynamicFontTableProvider>) -> Option<f32> {
    let has_all_glyphs = AVG_CHARACTERS.chars().all(|c| {
        font.lookup_glyph_index(c, allsorts::font::MatchingPresentation::NotRequired, None)
            .0
            > 0
    });
    if !has_all_glyphs {
        return None;
    }

    Some(
        font.map_glyphs(
            AVG_CHARACTERS,
            allsorts::tag::LATN,
            allsorts::font::MatchingPresentation::NotRequired,
        )
        .iter()
        .map(|g| font.horizontal_advance(g.glyph_index).unwrap())
        .sum::<u16>() as f32
            / AVG_CHARACTERS.len() as f32,
    )
}

/// From https://github.com/vercel/next.js/blob/dbdf47cf617b8d7213ffe1ff28318ea8eb88c623/packages/font/src/local/pick-font-file-for-fallback-generation.ts#L59
///
/// If multiple font files are provided for a font family, we need to pick
/// one to use for the automatic fallback generation. This function returns
/// the font file that is most likely to be used for the bulk of the text on
/// a page.
///
/// There are some assumptions here about the text on a page when picking the
/// font file:
/// - Most of the text will have normal weight, use the one closest to 400
/// - Most of the text will have normal style, prefer normal over italic
/// - If two font files have the same distance from normal weight, the thinner
///   one will most likely be the bulk of the text
fn pick_font_for_fallback_generation(
    font_descriptors: &FontDescriptors,
) -> Result<&FontDescriptor> {
    match font_descriptors {
        FontDescriptors::One(descriptor) => Ok(descriptor),
        FontDescriptors::Many(descriptors) => {
            let mut used_descriptor = descriptors
                .first()
                .context("At least one font is required")?;

            for current_descriptor in descriptors.iter().skip(1) {
                let used_font_distance = get_distance_from_normal_weight(&used_descriptor.weight)?;
                let current_font_distance =
                    get_distance_from_normal_weight(&current_descriptor.weight)?;

                // Prefer normal style if they have the same weight
                if used_font_distance == current_font_distance
                    && current_descriptor.style != Some("italic".to_owned())
                {
                    used_descriptor = current_descriptor;
                    continue;
                }

                let abs_used_distance = used_font_distance.abs();
                let abs_current_distance = current_font_distance.abs();

                // Use closest absolute distance to normal weight
                if abs_current_distance < abs_used_distance {
                    used_descriptor = current_descriptor;
                    continue;
                }

                // Prefer the thinner font if both have the same absolute
                if abs_used_distance == abs_current_distance
                    && current_font_distance < used_font_distance
                {
                    used_descriptor = current_descriptor;
                    continue;
                }
            }

            Ok(used_descriptor)
        }
    }
}

/// From https://github.com/vercel/next.js/blob/dbdf47cf617b8d7213ffe1ff28318ea8eb88c623/packages/font/src/local/pick-font-file-for-fallback-generation.ts#L18
///
/// Get the distance from normal (400) weight for the provided weight.
/// If it's not a variable font we can just return the distance.
/// If it's a variable font we need to compare its weight range to 400.
fn get_distance_from_normal_weight(weight: &Option<FontWeight>) -> Result<f64> {
    let Some(weight) = weight else { return Ok(0.0) };

    Ok(match weight {
        FontWeight::Fixed(val) => parse_weight_string(val)? - NORMAL_WEIGHT,
        FontWeight::Variable(start, end) => {
            let start = parse_weight_string(start)?;
            let end = parse_weight_string(end)?;

            // Normal weight is within variable font range
            if NORMAL_WEIGHT > start && NORMAL_WEIGHT < end {
                0.0
            } else {
                let start_distance = start - NORMAL_WEIGHT;
                let end_distance = end - NORMAL_WEIGHT;

                if start_distance.abs() < end_distance.abs() {
                    start_distance
                } else {
                    end_distance
                }
            }
        }
    })
}

/// From https://github.com/vercel/next.js/blob/dbdf47cf617b8d7213ffe1ff28318ea8eb88c623/packages/font/src/local/pick-font-file-for-fallback-generation.ts#L6
///
/// Convert the weight string to a number so it can be used for comparison.
/// Weights can be defined as a number, 'normal' or 'bold'. https://developer.mozilla.org/docs/Web/CSS/@font-face/font-weight
fn parse_weight_string(weight_str: &str) -> Result<f64> {
    if weight_str == "normal" {
        Ok(NORMAL_WEIGHT)
    } else if weight_str == "bold" {
        Ok(BOLD_WEIGHT)
    } else {
        match weight_str.parse::<f64>() {
            Ok(parsed) => Ok(parsed),
            Err(_) => {
                bail!(
                    "Invalid weight value in src array: `{}`. Expected `normal`, `bold` or a \
                     number",
                    weight_str
                )
            }
        }
    }
}

// From https://github.com/vercel/next.js/blob/7457be0c74e64b4d0617943ed27f4d557cc916be/packages/font/src/local/pick-font-file-for-fallback-generation.test.ts
#[cfg(test)]
mod tests {
    use anyhow::Result;

    use crate::next_font::local::{
        font_fallback::pick_font_for_fallback_generation,
        options::{FontDescriptor, FontDescriptors, FontWeight},
    };

    fn generate_font_descriptor(weight: &FontWeight, style: &Option<String>) -> FontDescriptor {
        FontDescriptor {
            ext: "ttf".to_owned(),
            path: "foo.ttf".to_owned(),
            style: style.clone(),
            weight: Some(weight.clone()),
        }
    }

    #[test]
    fn test_picks_weight_closest_to_400() -> Result<()> {
        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(&FontWeight::Fixed("300".to_owned()), &None),
                generate_font_descriptor(&FontWeight::Fixed("600".to_owned()), &None)
            ]))?,
            &generate_font_descriptor(&FontWeight::Fixed("300".to_owned()), &None)
        );

        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(&FontWeight::Fixed("200".to_owned()), &None),
                generate_font_descriptor(&FontWeight::Fixed("500".to_owned()), &None)
            ]))?,
            &generate_font_descriptor(&FontWeight::Fixed("500".to_owned()), &None)
        );

        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(&FontWeight::Fixed("normal".to_owned()), &None),
                generate_font_descriptor(&FontWeight::Fixed("700".to_owned()), &None)
            ]))?,
            &generate_font_descriptor(&FontWeight::Fixed("normal".to_owned()), &None)
        );

        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(&FontWeight::Fixed("bold".to_owned()), &None),
                generate_font_descriptor(&FontWeight::Fixed("900".to_owned()), &None)
            ]))?,
            &generate_font_descriptor(&FontWeight::Fixed("bold".to_owned()), &None)
        );

        Ok(())
    }

    #[test]
    fn test_picks_thinner_weight_if_same_distance_to_400() -> Result<()> {
        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(&FontWeight::Fixed("300".to_owned()), &None),
                generate_font_descriptor(&FontWeight::Fixed("500".to_owned()), &None)
            ]))?,
            &generate_font_descriptor(&FontWeight::Fixed("300".to_owned()), &None)
        );

        Ok(())
    }

    #[test]
    fn test_picks_variable_closest_to_400() -> Result<()> {
        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(
                    &FontWeight::Variable("100".to_owned(), "300".to_owned()),
                    &None
                ),
                generate_font_descriptor(
                    &FontWeight::Variable("600".to_owned(), "900".to_owned()),
                    &None
                )
            ]))?,
            &generate_font_descriptor(
                &FontWeight::Variable("100".to_owned(), "300".to_owned()),
                &None
            )
        );

        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(
                    &FontWeight::Variable("100".to_owned(), "200".to_owned()),
                    &None
                ),
                generate_font_descriptor(
                    &FontWeight::Variable("500".to_owned(), "800".to_owned()),
                    &None
                )
            ]))?,
            &generate_font_descriptor(
                &FontWeight::Variable("500".to_owned(), "800".to_owned()),
                &None
            )
        );

        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(
                    &FontWeight::Variable("100".to_owned(), "900".to_owned()),
                    &None
                ),
                generate_font_descriptor(
                    &FontWeight::Variable("300".to_owned(), "399".to_owned()),
                    &None
                )
            ]))?,
            &generate_font_descriptor(
                &FontWeight::Variable("100".to_owned(), "900".to_owned()),
                &None
            )
        );

        Ok(())
    }

    #[test]
    fn test_prefer_normal_over_italic() -> Result<()> {
        assert_eq!(
            pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
                generate_font_descriptor(
                    &FontWeight::Fixed("400".to_owned()),
                    &Some("normal".to_owned())
                ),
                generate_font_descriptor(
                    &FontWeight::Fixed("400".to_owned()),
                    &Some("italic".to_owned())
                )
            ]))?,
            &generate_font_descriptor(
                &FontWeight::Fixed("400".to_owned()),
                &Some("normal".to_owned())
            )
        );

        Ok(())
    }

    #[test]
    fn test_errors_on_invalid_weight() -> Result<()> {
        match pick_font_for_fallback_generation(&FontDescriptors::Many(vec![
            generate_font_descriptor(
                &FontWeight::Variable("normal".to_owned(), "bold".to_owned()),
                &None,
            ),
            generate_font_descriptor(
                &FontWeight::Variable("400".to_owned(), "bold".to_owned()),
                &None,
            ),
            generate_font_descriptor(
                &FontWeight::Variable("normal".to_owned(), "700".to_owned()),
                &None,
            ),
            generate_font_descriptor(
                &FontWeight::Variable("100".to_owned(), "abc".to_owned()),
                &None,
            ),
        ])) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(
                    err.to_string(),
                    "Invalid weight value in src array: `abc`. Expected `normal`, `bold` or a \
                     number"
                )
            }
        }

        Ok(())
    }
}
