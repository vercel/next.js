use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, TaskInput, Vc, fxindexset, trace::TraceRawVcs,
};

use super::request::{NextFontRequest, OneOrManyStrings};

const ALLOWED_DISPLAY_VALUES: &[&str] = &["auto", "block", "swap", "fallback", "optional"];

pub(super) type FontData = FxIndexMap<RcStr, FontDataEntry>;

#[turbo_tasks::value]
#[derive(Clone, Debug, PartialOrd, Ord, Hash, TaskInput)]
pub(super) struct NextFontGoogleOptions {
    /// Name of the requested font from Google. Contains literal spaces.
    pub font_family: RcStr,
    pub weights: FontWeights,
    pub styles: Vec<RcStr>,
    pub display: RcStr,
    pub preload: bool,
    pub selected_variable_axes: Option<Vec<RcStr>>,
    pub fallback: Option<Vec<RcStr>>,
    pub adjust_font_fallback: bool,
    /// An optional name for a css custom property (css variable) that applies
    /// the font family when used.
    pub variable: Option<RcStr>,
    pub subsets: Option<Vec<RcStr>>,
}

impl NextFontGoogleOptions {
    pub async fn font_family(self: Vc<Self>) -> Result<RcStr> {
        Ok(self.await?.font_family.clone())
    }
}

#[turbo_tasks::value_impl]
impl NextFontGoogleOptions {
    #[turbo_tasks::function]
    pub fn new(options: NextFontGoogleOptions) -> Vc<NextFontGoogleOptions> {
        Self::cell(options)
    }
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    TaskInput,
)]
pub(super) enum FontWeights {
    Variable,
    Fixed(Vec<u16>),
}

#[derive(Debug, PartialEq, Eq, Deserialize, Serialize, TraceRawVcs, NonLocalValue)]
pub(super) struct FontDataEntry {
    pub weights: Vec<RcStr>,
    pub styles: Vec<RcStr>,
    pub axes: Option<Vec<Axis>>,
}

#[derive(Debug, PartialEq, Deserialize, Serialize, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub(super) struct Axis {
    pub tag: RcStr,
    pub min: f64,
    pub max: f64,
}

impl Eq for Axis {}

// Transforms the request fields to a struct suitable for making requests to
// Google Fonts. Similar to next/font/google's validateData:
// https://github.com/vercel/next.js/blob/28454c6ddbc310419467e5415aee26e48d079b46/packages/font/src/google/utils.ts#L22
pub(super) fn options_from_request(
    request: &NextFontRequest,
    data: &FxIndexMap<RcStr, FontDataEntry>,
) -> Result<NextFontGoogleOptions> {
    if request.arguments.len() > 1 {
        anyhow::bail!("Only zero or one arguments to font functions are currently supported")
    }
    // Invariant enforced above: either None or Some(the only item in the vec)
    let argument = request.arguments.last().cloned().unwrap_or_default();

    // `import` comes from the imported symbol in JS, which separates with _
    let font_family: RcStr = request.import.replace('_', " ").into();
    let font_data = data.get(&font_family).context("Unknown font")?;

    let requested_weights: FxIndexSet<RcStr> = argument
        .weight
        .map(|w| match w {
            OneOrManyStrings::One(one) => fxindexset![one],
            OneOrManyStrings::Many(many) => many.into_iter().collect(),
        })
        .unwrap_or_default();

    let mut styles = argument
        .style
        .map(|w| match w {
            OneOrManyStrings::One(one) => vec![one],
            OneOrManyStrings::Many(many) => many,
        })
        .unwrap_or_default();

    let supports_variable_weight = font_data.weights.iter().any(|el| el == "variable");
    let weights = if requested_weights.is_empty() {
        if !supports_variable_weight {
            anyhow::bail!(
                "Missing weight for {}. Available weights: {}",
                font_family,
                font_data.weights.join(", ")
            )
        }

        FontWeights::Variable
    } else if requested_weights.contains("variable") {
        if requested_weights.len() > 1 {
            anyhow::bail!(
                "Unexpected `variable` in weight array for font {}. You only need `variable`, it \
                 includes all available weights.",
                font_family
            )
        }

        FontWeights::Variable
    } else {
        for requested_weight in &requested_weights {
            if !font_data.weights.contains(requested_weight) {
                anyhow::bail!(
                    "Unknown weight {} for font {}.\nAvailable weights: {}",
                    requested_weight,
                    font_family,
                    font_data.weights.join(", ")
                )
            }
        }

        let mut weights = vec![];
        for weight in requested_weights {
            weights.push(weight.parse()?);
        }

        FontWeights::Fixed(weights)
    };

    if styles.is_empty() {
        if font_data.styles.len() == 1 {
            styles.push(font_data.styles[0].clone());
        } else {
            styles.push(rcstr!("normal"));
        }
    }

    for requested_style in &styles {
        if !font_data.styles.contains(requested_style) {
            anyhow::bail!(
                "Unknown style {} for font {}.\nAvailable styles: {}",
                requested_style,
                font_family,
                font_data.styles.join(", ")
            )
        }
    }

    let display = argument.display.unwrap_or_else(|| rcstr!("swap"));

    if !ALLOWED_DISPLAY_VALUES.contains(&display.as_str()) {
        anyhow::bail!(
            "Invalid display value {} for font {}.\nAvailable display values: {}",
            display,
            font_family,
            ALLOWED_DISPLAY_VALUES.join(", ")
        )
    }

    if let Some(axes) = argument.axes.as_ref()
        && !axes.is_empty()
    {
        if !supports_variable_weight {
            anyhow::bail!("Axes can only be defined for variable fonts.")
        }

        if weights != FontWeights::Variable {
            anyhow::bail!(
                "Axes can only be defined for variable fonts when the weight property is \
                 nonexistent or set to `variable`."
            )
        }
    }

    Ok(NextFontGoogleOptions {
        font_family,
        weights,
        styles,
        display,
        preload: argument.preload.unwrap_or(true),
        selected_variable_axes: argument.axes,
        fallback: argument.fallback,
        adjust_font_fallback: argument.adjust_font_fallback.unwrap_or(true),
        variable: argument.variable,
        subsets: argument.subsets,
    })
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::FxIndexMap;
    use turbo_tasks_fs::json::parse_json_with_source_context;

    use super::{FontDataEntry, NextFontGoogleOptions, options_from_request};
    use crate::next_font::google::{options::FontWeights, request::NextFontRequest};

    #[test]
    fn test_errors_on_unknown_font() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "Inter",
                "path": "index.js",
                "variableName": "inter",
                "arguments": [{}]
            }
            "#,
        )?;

        match options_from_request(&request, &data) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(err.to_string(), "Unknown font")
            }
        }
        Ok(())
    }

    #[test]
    fn test_default_values_when_no_arguments() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["variable"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": []
            }
            "#,
        )?;

        assert_eq!(
            options_from_request(&request, &data)?,
            NextFontGoogleOptions {
                font_family: rcstr!("ABeeZee"),
                weights: FontWeights::Variable,
                styles: vec![rcstr!("normal")],
                display: rcstr!("swap"),
                preload: true,
                selected_variable_axes: None,
                fallback: None,
                adjust_font_fallback: true,
                variable: None,
                subsets: None,
            },
        );

        Ok(())
    }

    #[test]
    fn test_errors_when_no_weights_chosen_no_variable() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{}]
            }
            "#,
        )?;

        match options_from_request(&request, &data) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(
                    err.to_string(),
                    "Missing weight for ABeeZee. Available weights: 400"
                )
            }
        }
        Ok(())
    }

    #[test]
    fn test_errors_on_unnecessary_weights() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400", "variable"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{
                    "weight": ["400", "variable"]
                }]
            }
            "#,
        )?;

        match options_from_request(&request, &data) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(
                    err.to_string(),
                    "Unexpected `variable` in weight array for font ABeeZee. You only need \
                     `variable`, it includes all available weights."
                )
            }
        }
        Ok(())
    }

    #[test]
    fn test_errors_on_unvavailable_weights() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400", "variable"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{
                    "weight": ["200"]
                }]
            }
            "#,
        )?;

        match options_from_request(&request, &data) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(
                    err.to_string(),
                    "Unknown weight 200 for font ABeeZee.\nAvailable weights: 400, variable"
                )
            }
        }
        Ok(())
    }

    #[test]
    fn test_defaults_to_only_style_when_one_available() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400", "variable"],
                    "styles": ["italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{
                    "weight": ["400"]
                }]
            }
            "#,
        )?;

        let options = options_from_request(&request, &data)?;
        assert_eq!(options.styles, vec![rcstr!("italic")]);

        Ok(())
    }

    #[test]
    fn test_defaults_to_normal_style_when_multiple() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400", "variable"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{
                    "weight": ["400"]
                }]
            }
            "#,
        )?;

        let options = options_from_request(&request, &data)?;
        assert_eq!(options.styles, vec![rcstr!("normal")]);

        Ok(())
    }

    #[test]
    fn test_errors_on_unknown_styles() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400", "variable"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{
                    "weight": ["400"],
                    "style": ["foo"]
                }]
            }
            "#,
        )?;

        match options_from_request(&request, &data) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(
                    err.to_string(),
                    "Unknown style foo for font ABeeZee.\nAvailable styles: normal, italic"
                )
            }
        }

        Ok(())
    }

    #[test]
    fn test_errors_on_unknown_display() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400", "variable"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{
                    "weight": ["400"],
                    "display": "foo"
                }]
            }
            "#,
        )?;

        match options_from_request(&request, &data) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(
                    err.to_string(),
                    "Invalid display value foo for font ABeeZee.\nAvailable display values: auto, \
                     block, swap, fallback, optional"
                )
            }
        }

        Ok(())
    }

    #[test]
    fn test_errors_on_axes_without_variable_weight() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400", "variable"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{
                    "weight": ["400"],
                    "axes": ["wght"]
                }]
            }
            "#,
        )?;

        match options_from_request(&request, &data) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(
                    err.to_string(),
                    "Axes can only be defined for variable fonts when the weight property is \
                     nonexistent or set to `variable`."
                )
            }
        }

        Ok(())
    }

    #[test]
    fn test_errors_on_axes_without_variable_font() -> Result<()> {
        let data: FxIndexMap<RcStr, FontDataEntry> = parse_json_with_source_context(
            r#"
            {
                "ABeeZee": {
                    "weights": ["400", "700"],
                    "styles": ["normal", "italic"]
                }
            }
            "#,
        )?;

        let request: NextFontRequest = parse_json_with_source_context(
            r#"
            {
                "import": "ABeeZee",
                "path": "index.js",
                "variableName": "abeezee",
                "arguments": [{
                    "weight": ["400", "700"],
                    "axes": ["wght"]
                }]
            }
            "#,
        )?;

        match options_from_request(&request, &data) {
            Ok(_) => panic!(),
            Err(err) => {
                assert_eq!(
                    err.to_string(),
                    "Axes can only be defined for variable fonts."
                )
            }
        }

        Ok(())
    }
}
