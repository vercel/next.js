use anyhow::{anyhow, Context, Result};
use indexmap::{indexset, IndexMap, IndexSet};
use serde::{Deserialize, Serialize};
use turbo_tasks::Vc;
use turbopack_binding::turbo::tasks::{trace::TraceRawVcs, Value};

use super::request::{NextFontRequest, OneOrManyStrings};

const ALLOWED_DISPLAY_VALUES: &[&str] = &["auto", "block", "swap", "fallback", "optional"];

pub(super) type FontData = IndexMap<String, FontDataEntry>;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Debug, PartialOrd, Ord, Hash)]
pub(super) struct NextFontGoogleOptions {
    /// Name of the requested font from Google. Contains literal spaces.
    pub font_family: String,
    pub weights: FontWeights,
    pub styles: Vec<String>,
    pub display: String,
    pub preload: bool,
    pub selected_variable_axes: Option<Vec<String>>,
    pub fallback: Option<Vec<String>>,
    pub adjust_font_fallback: bool,
    /// An optional name for a css custom property (css variable) that applies
    /// the font family when used.
    pub variable: Option<String>,
    pub subsets: Option<Vec<String>>,
}

#[turbo_tasks::value_impl]
impl NextFontGoogleOptions {
    #[turbo_tasks::function]
    pub fn new(options: Value<NextFontGoogleOptions>) -> Vc<NextFontGoogleOptions> {
        Self::cell(options.into_value())
    }

    #[turbo_tasks::function]
    pub async fn font_family(self: Vc<Self>) -> Result<Vc<String>> {
        Ok(Vc::cell((*self.await?.font_family).to_owned()))
    }
}

#[derive(
    Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TraceRawVcs,
)]
pub(super) enum FontWeights {
    Variable,
    Fixed(Vec<u16>),
}

#[derive(Debug, PartialEq, Eq, Deserialize, Serialize, TraceRawVcs)]
pub(super) struct FontDataEntry {
    pub weights: Vec<String>,
    pub styles: Vec<String>,
    pub axes: Option<Vec<Axis>>,
}

#[derive(Debug, PartialEq, Deserialize, Serialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub(super) struct Axis {
    pub tag: String,
    pub min: f64,
    pub max: f64,
}

impl Eq for Axis {}

// Transforms the request fields to a struct suitable for making requests to
// Google Fonts. Similar to next/font/google's validateData:
// https://github.com/vercel/next.js/blob/28454c6ddbc310419467e5415aee26e48d079b46/packages/font/src/google/utils.ts#L22
pub(super) fn options_from_request(
    request: &NextFontRequest,
    data: &IndexMap<String, FontDataEntry>,
) -> Result<NextFontGoogleOptions> {
    if request.arguments.len() > 1 {
        return Err(anyhow!(
            "Only zero or one arguments to font functions are currently supported"
        ));
    }
    // Invariant enforced above: either None or Some(the only item in the vec)
    let argument = request.arguments.last();

    // `import` comes from the imported symbol in JS, which separates with _
    let font_family = request.import.replace('_', " ");
    let font_data = data.get(&font_family).context("Unknown font")?;

    let requested_weights: IndexSet<String> = argument
        .and_then(|argument| {
            argument.weight.as_ref().map(|w| match w {
                OneOrManyStrings::One(one) => indexset! {one.to_owned()},
                OneOrManyStrings::Many(many) => IndexSet::from_iter(many.iter().cloned()),
            })
        })
        .unwrap_or_default();

    let mut styles = argument
        .and_then(|argument| {
            argument.style.as_ref().map(|w| match w {
                OneOrManyStrings::One(one) => vec![one.to_owned()],
                OneOrManyStrings::Many(many) => many.clone(),
            })
        })
        .unwrap_or_default();

    let weights = if requested_weights.is_empty() {
        if !font_data.weights.contains(&"variable".to_owned()) {
            return Err(anyhow!(
                "Missing weight for {}. Available weights: {}",
                font_family,
                font_data.weights.join(", ")
            ));
        }

        FontWeights::Variable
    } else if requested_weights.contains("variable") {
        if requested_weights.len() > 1 {
            return Err(anyhow!(
                "Unexpected `variable` in weight array for font {}. You only need `variable`, it \
                 includes all available weights.",
                font_family
            ));
        }

        FontWeights::Variable
    } else {
        for requested_weight in &requested_weights {
            if !font_data.weights.contains(requested_weight) {
                return Err(anyhow!(
                    "Unknown weight {} for font {}.\nAvailable weights: {}",
                    requested_weight,
                    font_family,
                    font_data.weights.join(", ")
                ));
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
            styles.push("normal".to_owned());
        }
    }

    for requested_style in &styles {
        if !font_data.styles.contains(requested_style) {
            return Err(anyhow!(
                "Unknown style {} for font {}.\nAvailable styles: {}",
                requested_style,
                font_family,
                font_data.styles.join(", ")
            ));
        }
    }

    let display = argument
        .and_then(|a| a.display.to_owned())
        .unwrap_or_else(|| "swap".to_owned());

    if !ALLOWED_DISPLAY_VALUES.contains(&display.as_ref()) {
        return Err(anyhow!(
            "Invalid display value {} for font {}.\nAvailable display values: {}",
            display,
            font_family,
            ALLOWED_DISPLAY_VALUES.join(", ")
        ));
    }

    if let Some(axes) = argument.and_then(|a| a.axes.as_ref()) {
        if !axes.is_empty() && !matches!(weights, FontWeights::Variable) {
            return Err(anyhow!("Axes can only be defined for variable fonts"));
        }
    }

    Ok(NextFontGoogleOptions {
        font_family,
        weights,
        styles,
        display,
        preload: argument.map(|a| a.preload).unwrap_or(true),
        selected_variable_axes: argument.and_then(|a| a.axes.clone()),
        fallback: argument.and_then(|a| a.fallback.clone()),
        adjust_font_fallback: argument.map(|a| a.adjust_font_fallback).unwrap_or(true),
        variable: argument.and_then(|a| a.variable.clone()),
        subsets: argument.and_then(|a| a.subsets.clone()),
    })
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use indexmap::IndexMap;
    use turbopack_binding::turbo::tasks_fs::json::parse_json_with_source_context;

    use super::{options_from_request, FontDataEntry, NextFontGoogleOptions};
    use crate::next_font::google::{options::FontWeights, request::NextFontRequest};

    #[test]
    fn test_errors_on_unknown_font() -> Result<()> {
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
                font_family: "ABeeZee".to_owned(),
                weights: FontWeights::Variable,
                styles: vec!["normal".to_owned()],
                display: "swap".to_owned(),
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
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
        assert_eq!(options.styles, vec!["italic".to_owned()]);

        Ok(())
    }

    #[test]
    fn test_defaults_to_normal_style_when_multiple() -> Result<()> {
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
        assert_eq!(options.styles, vec!["normal".to_owned()]);

        Ok(())
    }

    #[test]
    fn test_errors_on_unknown_styles() -> Result<()> {
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
    fn test_errors_on_axes_without_variable() -> Result<()> {
        let data: IndexMap<String, FontDataEntry> = parse_json_with_source_context(
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
                    "Axes can only be defined for variable fonts"
                )
            }
        }

        Ok(())
    }
}
