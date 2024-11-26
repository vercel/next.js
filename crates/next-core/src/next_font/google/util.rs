use std::{cmp::Ordering, collections::BTreeSet};

use anyhow::{bail, Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::FxIndexSet;

use super::options::{FontData, FontWeights};

#[derive(Debug, Default, PartialEq)]
pub(super) struct FontAxes {
    pub(super) wght: FontAxesWeights,
    pub(super) ital: FxIndexSet<FontStyle>,
    pub(super) variable_axes: Option<Vec<(RcStr, RcStr)>>,
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub(super) enum FontAxesWeights {
    Variable(Option<RcStr>),
    // A list of fixed weights. Sorted in ascending order as a BTreeSet.
    Fixed(BTreeSet<u16>),
}

impl Default for FontAxesWeights {
    fn default() -> Self {
        FontAxesWeights::Fixed(Default::default())
    }
}

#[derive(Debug, Default, PartialEq, Eq, Hash)]
pub(super) enum FontStyle {
    Italic,
    #[default]
    Normal,
}

// Derived from https://github.com/vercel/next.js/blob/9e098da0915a2a4581bebe2270953a1216be1ba4/packages/font/src/google/utils.ts#L232
pub(super) fn get_font_axes(
    font_data: &FontData,
    font_family: &str,
    weights: &FontWeights,
    styles: &[RcStr],
    selected_variable_axes: &Option<Vec<RcStr>>,
) -> Result<FontAxes> {
    let all_axes = &font_data
        .get(font_family)
        .context("Font family not found")?
        .axes;

    let ital = {
        let has_italic = styles.contains(&"italic".into());
        let has_normal = styles.contains(&"normal".into());
        let mut set = FxIndexSet::default();
        if has_normal {
            set.insert(FontStyle::Normal);
        }
        if has_italic {
            set.insert(FontStyle::Italic);
        }
        set
    };

    match weights {
        FontWeights::Variable => {
            let Some(defineable_axes) = all_axes else {
                bail!("Font {} has no definable `axes`", font_family);
            };

            if let Some(selected_variable_axes) = selected_variable_axes {
                let definable_axes_tags = defineable_axes
                    .iter()
                    .map(|axis| axis.tag.to_owned())
                    .collect::<Vec<RcStr>>();

                for tag in selected_variable_axes {
                    if !definable_axes_tags.contains(tag) {
                        bail!(
                            "Invalid axes value {} for font {}.\nAvailable axes: {}",
                            tag,
                            font_family,
                            definable_axes_tags.join(", ")
                        )
                    }
                }
            }

            let mut weight_axis = None;
            let mut variable_axes = vec![];
            for axis in defineable_axes {
                if axis.tag == "wght" {
                    weight_axis = Some(format!("{}..{}", axis.min, axis.max).into());
                } else if let Some(selected_variable_axes) = selected_variable_axes {
                    if selected_variable_axes.contains(&axis.tag) {
                        variable_axes.push((
                            axis.tag.clone(),
                            format!("{}..{}", axis.min, axis.max).into(),
                        ));
                    }
                }
            }

            Ok(FontAxes {
                wght: FontAxesWeights::Variable(weight_axis),
                ital,
                variable_axes: Some(variable_axes),
            })
        }

        FontWeights::Fixed(weights) => Ok(FontAxes {
            wght: FontAxesWeights::Fixed(weights.iter().copied().collect()),
            ital,
            variable_axes: None,
        }),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum VariantValue {
    String(RcStr),
    U16(u16),
}

impl PartialOrd for VariantValue {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for VariantValue {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            (VariantValue::String(a), VariantValue::String(b)) => a.cmp(b),
            (VariantValue::U16(a), VariantValue::U16(b)) => a.cmp(b),
            (VariantValue::String(_), VariantValue::U16(_)) => Ordering::Less,
            (VariantValue::U16(_), VariantValue::String(_)) => Ordering::Greater,
        }
    }
}

impl From<VariantValue> for RcStr {
    fn from(val: VariantValue) -> Self {
        match val {
            VariantValue::String(s) => s,
            VariantValue::U16(u) => u.to_string().into(),
        }
    }
}

// Derived from https://github.com/vercel/next.js/blob/9e098da0915a2a4581bebe2270953a1216be1ba4/packages/font/src/google/utils.ts#L128
pub(super) fn get_stylesheet_url(
    root_url: &str,
    font_family: &str,
    axes: &FontAxes,
    display: &str,
) -> Result<String> {
    // Variants are all combinations of weight and style, each variant will result
    // in a separate font file
    let mut variants: Vec<Vec<(&str, VariantValue)>> = vec![];

    let weights = match &axes.wght {
        FontAxesWeights::Variable(Some(wght)) => {
            vec![VariantValue::String(wght.clone())]
        }
        FontAxesWeights::Variable(None) => {
            vec![]
        }
        FontAxesWeights::Fixed(wghts) => wghts.iter().map(|w| VariantValue::U16(*w)).collect(),
    };

    if weights.is_empty() {
        let mut variant = vec![];
        if let Some(variable_axes) = &axes.variable_axes {
            if !variable_axes.is_empty() {
                for (key, val) in variable_axes {
                    variant.push((key.as_str(), VariantValue::String(val.clone())));
                }
                variants.push(variant);
            }
        }
    } else {
        for wght in &weights {
            if axes.ital.is_empty() {
                let mut variant = vec![];
                variant.push(("wght", wght.clone()));
                if let Some(variable_axes) = &axes.variable_axes {
                    for (key, val) in variable_axes {
                        variant.push((key, VariantValue::String(val.clone())));
                    }
                }
                variants.push(variant);
            } else {
                for ital in &axes.ital {
                    let mut variant: Vec<(&str, VariantValue)> = vec![];

                    // If Normal is the only requested variant, it's safe to omit the ital axis
                    // entirely. Otherwise, include all variants.
                    if matches!(ital, FontStyle::Italic) || axes.ital.len() > 1 {
                        variant.push((
                            "ital",
                            VariantValue::String(
                                match ital {
                                    FontStyle::Normal => "0",
                                    FontStyle::Italic => "1",
                                }
                                .into(),
                            ),
                        ));
                    }

                    variant.push(("wght", wght.clone()));
                    if let Some(variable_axes) = &axes.variable_axes {
                        for (key, val) in variable_axes {
                            variant.push((key, VariantValue::String(val.clone())));
                        }
                    }
                    variants.push(variant);
                }
            }
        }
    }

    for variant in &mut variants {
        // Sort the pairs within the variant by the tag name
        variant.sort_by(|a, b| {
            let is_a_lowercase = a.0.chars().next().unwrap_or_default() as usize > 96;
            let is_b_lowercase = b.0.chars().next().unwrap_or_default() as usize > 96;

            if is_a_lowercase && !is_b_lowercase {
                Ordering::Less
            } else if is_b_lowercase && !is_a_lowercase {
                Ordering::Greater
            } else {
                a.0.cmp(b.0)
            }
        });
    }

    let first_variant = variants.first();
    match first_variant {
        None => Ok(format!(
            "{}?family={}&display={}",
            root_url,
            font_family.replace(' ', "+"),
            display
        )),
        Some(first_variant) => {
            // Always use the first variant's keys. There's an implicit invariant from the
            // code above that the keys across each variant are identical, and therefore
            // will be sorted identically across variants.
            //
            // Generates a comma-separated list of axis names, e.g. `ital,opsz,wght`.
            let variant_keys_str = first_variant
                .iter()
                .map(|pair| pair.0)
                .collect::<Vec<&str>>()
                .join(",");

            let mut variant_values = variants
                .iter()
                .map(|variant| variant.iter().map(|pair| &pair.1).collect::<Vec<_>>())
                .collect::<Vec<Vec<_>>>();
            variant_values.sort();

            // An encoding of the series of sorted variant values, with variants delimited
            // by `;` and the values within a variant delimited by `,` e.g.
            // `"0,10..100,500;1,10.100;500"`
            let variant_values_str = variant_values
                .iter()
                .map(|v| {
                    v.iter()
                        .map(|vv| RcStr::from((*vv).clone()))
                        .collect::<Vec<_>>()
                        .join(",")
                })
                .collect::<Vec<_>>()
                .join(";");

            Ok(format!(
                "{}?family={}:{}@{}&display={}",
                root_url,
                font_family.replace(' ', "+"),
                variant_keys_str,
                variant_values_str,
                display
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use anyhow::Result;
    use turbo_tasks::fxindexset;
    use turbo_tasks_fs::json::parse_json_with_source_context;

    use super::get_font_axes;
    use crate::next_font::google::{
        options::{FontData, FontWeights},
        util::{get_stylesheet_url, FontAxes, FontAxesWeights, FontStyle},
        GOOGLE_FONTS_STYLESHEET_URL,
    };

    #[test]
    fn test_errors_on_unknown_font() -> Result<()> {
        let data: FontData = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["variable"],
                    "styles": ["normal", "italic"]
                }
            }
  "#,
        )?;

        match get_font_axes(&data, "foobar", &FontWeights::Variable, &[], &None) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(err.to_string(), "Font family not found")
            }
        }
        Ok(())
    }

    #[test]
    fn test_errors_on_missing_axes() -> Result<()> {
        let data: FontData = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["variable"],
                    "styles": ["normal", "italic"]
                }
            }
  "#,
        )?;

        match get_font_axes(&data, "ABeeZee", &FontWeights::Variable, &[], &None) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(err.to_string(), "Font ABeeZee has no definable `axes`")
            }
        }
        Ok(())
    }

    #[test]
    fn test_selecting_axes() -> Result<()> {
        let data: FontData = parse_json_with_source_context(
            r#"
            {
                "Inter": {
                    "weights": [
                        "400",
                        "variable"
                    ],
                    "styles": ["normal", "italic"],
                    "axes": [
                        {
                            "tag": "slnt",
                            "min": -10,
                            "max": 0,
                            "defaultValue": 0
                        },
                        {
                            "tag": "wght",
                            "min": 100,
                            "max": 900,
                            "defaultValue": 400
                        }
                    ]
                }
            }
  "#,
        )?;

        assert_eq!(
            get_font_axes(
                &data,
                "Inter",
                &FontWeights::Variable,
                &[],
                &Some(vec!["slnt".into()]),
            )?,
            FontAxes {
                wght: FontAxesWeights::Variable(Some("100..900".into())),
                ital: fxindexset! {},
                variable_axes: Some(vec![("slnt".into(), "-10..0".into())])
            }
        );
        Ok(())
    }

    #[test]
    fn test_no_wght_axis() -> Result<()> {
        let data: FontData = parse_json_with_source_context(
            r#"
            {
                "Inter": {
                    "weights": [
                        "400",
                        "variable"
                    ],
                    "styles": ["normal", "italic"],
                    "axes": [
                        {
                            "tag": "slnt",
                            "min": -10,
                            "max": 0,
                            "defaultValue": 0
                        }
                    ]
                }
            }
  "#,
        )?;

        assert_eq!(
            get_font_axes(
                &data,
                "Inter",
                &FontWeights::Variable,
                &[],
                &Some(vec!["slnt".into()]),
            )?,
            FontAxes {
                variable_axes: Some(vec![("slnt".into(), "-10..0".into())]),
                wght: FontAxesWeights::Variable(None),
                ..Default::default()
            }
        );
        Ok(())
    }

    #[test]
    fn test_no_variable() -> Result<()> {
        let data: FontData = parse_json_with_source_context(
            r#"
            {
                "Hind": {
                    "weights": [
                        "300",
                        "400",
                        "500",
                        "600",
                        "700"
                    ],
                    "styles": [
                        "normal"
                    ]
                }
            }
  "#,
        )?;

        assert_eq!(
            get_font_axes(&data, "Hind", &FontWeights::Fixed(vec![500]), &[], &None)?,
            FontAxes {
                wght: FontAxesWeights::Fixed(BTreeSet::from([500])),
                ..Default::default()
            }
        );
        Ok(())
    }

    #[test]
    fn test_stylesheet_url_no_axes() -> Result<()> {
        assert_eq!(
            get_stylesheet_url(
                GOOGLE_FONTS_STYLESHEET_URL,
                "Roboto Mono",
                &FontAxes {
                    wght: FontAxesWeights::Fixed(BTreeSet::from([500])),
                    ital: fxindexset! {FontStyle::Normal},
                    variable_axes: None
                },
                "optional"
            )?,
            "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@500&display=optional"
        );

        Ok(())
    }

    #[test]
    fn test_stylesheet_url_sorts_axes() -> Result<()> {
        assert_eq!(
            get_stylesheet_url(
                GOOGLE_FONTS_STYLESHEET_URL,
                "Roboto Serif",
                &FontAxes {
                    wght: FontAxesWeights::Fixed(BTreeSet::from([500])),
                    ital: fxindexset! {FontStyle::Normal},
                    variable_axes: Some(vec![
                        ("GRAD".into(), "-50..100".into()),
                        ("opsz".into(), "8..144".into()),
                        ("wdth".into(), "50..150".into()),
                    ])
                },
                "optional"
            )?,
            "https://fonts.googleapis.com/css2?family=Roboto+Serif:opsz,wdth,wght,GRAD@8..144,50..150,500,-50..100&display=optional"
        );

        Ok(())
    }

    #[test]
    fn test_stylesheet_url_sorts_weights_numerically() -> Result<()> {
        assert_eq!(
            get_stylesheet_url(
                GOOGLE_FONTS_STYLESHEET_URL,
                "Roboto Serif",
                &FontAxes {
                    wght: FontAxesWeights::Fixed(BTreeSet::from([1000, 500, 200])),
                    ital: fxindexset! {FontStyle::Normal},
                    variable_axes: None
                },
                "optional"
            )?,
            "https://fonts.googleapis.com/css2?family=Roboto+Serif:wght@200;500;1000&display=optional"
        );

        Ok(())
    }

    #[test]
    fn test_stylesheet_url_encodes_all_weight_ital_combinations() -> Result<()> {
        assert_eq!(
            get_stylesheet_url(
                GOOGLE_FONTS_STYLESHEET_URL,
                "Roboto Serif",
                &FontAxes {
                    wght: FontAxesWeights::Fixed(BTreeSet::from([500, 300])),
                    ital: fxindexset! {FontStyle::Normal, FontStyle::Italic},
                    variable_axes: Some(vec![
                        ("GRAD".into(), "-50..100".into()),
                        ("opsz".into(), "8..144".into()),
                        ("wdth".into(), "50..150".into()),
                    ])
                },
                "optional"
            )?,
            // Note ;-delimited sections for normal@300, normal@500, italic@300, italic@500
            "https://fonts.googleapis.com/css2?family=Roboto+Serif:ital,opsz,wdth,wght,GRAD@0,8..144,50..150,300,-50..100;0,8..144,50..150,500,-50..100;1,8..144,50..150,300,-50..100;1,8..144,50..150,500,-50..100&display=optional"
        );

        Ok(())
    }

    #[test]
    fn test_stylesheet_url_variable_font_without_wgth_axis() -> Result<()> {
        assert_eq!(
            get_stylesheet_url(
                GOOGLE_FONTS_STYLESHEET_URL,
                "Nabla",
                &FontAxes {
                    variable_axes: Some(vec![
                        ("EDPT".into(), "0..200".into()),
                        ("EHLT".into(), "0..24".into()),
                    ]),
                    ..Default::default()
                },
                "optional"
            )?,
            "https://fonts.googleapis.com/css2?family=Nabla:EDPT,EHLT@0..200,0..24&display=optional"
        );

        Ok(())
    }

    #[test]
    fn test_stylesheet_url_variable_font_without_anything() -> Result<()> {
        assert_eq!(
            get_stylesheet_url(
                GOOGLE_FONTS_STYLESHEET_URL,
                "Nabla",
                &Default::default(),
                "swap"
            )?,
            "https://fonts.googleapis.com/css2?family=Nabla&display=swap"
        );

        Ok(())
    }

    #[test]
    fn test_stylesheet_url_variable_font_with_empty_variable_axes() -> Result<()> {
        assert_eq!(
            get_stylesheet_url(
                GOOGLE_FONTS_STYLESHEET_URL,
                "Nabla",
                &FontAxes {
                    variable_axes: Some(vec![]),
                    ..Default::default()
                },
                "swap"
            )?,
            "https://fonts.googleapis.com/css2?family=Nabla&display=swap"
        );

        Ok(())
    }

    #[test]
    fn test_stylesheet_url_no_variable() -> Result<()> {
        assert_eq!(
            get_stylesheet_url(
                GOOGLE_FONTS_STYLESHEET_URL,
                "Hind",
                &FontAxes {
                    wght: FontAxesWeights::Fixed(BTreeSet::from([500])),
                    ..Default::default()
                },
                "optional"
            )?,
            "https://fonts.googleapis.com/css2?family=Hind:wght@500&display=optional"
        );

        Ok(())
    }
}
