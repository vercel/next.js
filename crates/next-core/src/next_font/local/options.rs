use std::{fmt::Display, str::FromStr};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, Value, Vc};

use super::request::{
    AdjustFontFallback, NextFontLocalRequest, NextFontLocalRequestArguments, SrcDescriptor,
    SrcRequest,
};

/// A normalized, Vc-friendly struct derived from validating and transforming
/// [[NextFontLocalRequest]]
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Debug, PartialOrd, Ord, Hash)]
pub(super) struct NextFontLocalOptions {
    pub fonts: FontDescriptors,
    pub default_weight: Option<FontWeight>,
    pub default_style: Option<RcStr>,
    /// The desired css `font-display` property
    pub display: RcStr,
    pub preload: bool,
    /// A list of manually-provided fallback fonts to be included in the
    /// font-family string as-is.
    pub fallback: Option<Vec<RcStr>>,
    /// The user's desired fallback font
    pub adjust_font_fallback: AdjustFontFallback,
    /// An optional name for a css custom property (css variable) that applies
    /// the font family when used.
    pub variable: Option<RcStr>,
    /// The name of the variable assigned to the results of calling the
    /// `localFont` function. This is used as the font family's base name.
    pub variable_name: RcStr,
}

#[turbo_tasks::value_impl]
impl NextFontLocalOptions {
    #[turbo_tasks::function]
    pub fn new(options: Value<NextFontLocalOptions>) -> Vc<NextFontLocalOptions> {
        Self::cell(options.into_value())
    }

    #[turbo_tasks::function]
    pub fn font_family(&self) -> Vc<RcStr> {
        Vc::cell(self.variable_name.clone())
    }
}

/// Describes an individual font file's path, weight, style, etc. Derived from
/// the `src` field or top-level object provided by the user
#[derive(
    Clone,
    Debug,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    TraceRawVcs,
    NonLocalValue,
)]
pub(super) struct FontDescriptor {
    pub weight: Option<FontWeight>,
    pub style: Option<RcStr>,
    pub path: RcStr,
    pub ext: RcStr,
}

impl FontDescriptor {
    fn from_src_request(src_descriptor: &SrcDescriptor) -> Result<Self> {
        let ext = src_descriptor
            .path
            .rsplit('.')
            .next()
            .context("Extension required")?
            .into();

        Ok(Self {
            path: src_descriptor.path.clone(),
            weight: src_descriptor
                .weight
                .as_ref()
                .and_then(|w| FontWeight::from_str(w).ok()),
            style: src_descriptor.style.clone(),
            ext,
        })
    }
}

#[derive(
    Clone,
    Debug,
    Deserialize,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    TraceRawVcs,
    NonLocalValue,
)]
pub(super) enum FontDescriptors {
    /// `One` is a special case when the user did not provide a `src` field and
    /// instead included font path, weight etc in the top-level object: in
    /// this case, the weight and style should be included in the rules for the
    /// className selector and returned JS object.
    One(FontDescriptor),
    Many(Vec<FontDescriptor>),
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Deserialize,
    Serialize,
    Hash,
    TraceRawVcs,
    NonLocalValue,
)]
pub(super) enum FontWeight {
    Variable(RcStr, RcStr),
    Fixed(RcStr),
}

pub struct ParseFontWeightErr;
impl FromStr for FontWeight {
    type Err = ParseFontWeightErr;

    fn from_str(weight_str: &str) -> std::result::Result<Self, Self::Err> {
        if let Some((start, end)) = weight_str.split_once(' ') {
            Ok(FontWeight::Variable(start.into(), end.into()))
        } else {
            Ok(FontWeight::Fixed(weight_str.into()))
        }
    }
}

impl Display for FontWeight {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Self::Variable(start, end) => format!("{} {}", start, end),
                Self::Fixed(val) => val.to_string(),
            }
        )
    }
}

// Transforms the request fields to a validated struct.
// Similar to next/font/local's validateData:
// https://github.com/vercel/next.js/blob/28454c6ddbc310419467e5415aee26e48d079b46/packages/font/src/local/utils.ts#L31
pub(super) fn options_from_request(request: &NextFontLocalRequest) -> Result<NextFontLocalOptions> {
    // Invariant enforced above: either None or Some(the only item in the vec)
    let NextFontLocalRequestArguments {
        display,
        weight,
        style,
        preload,
        fallback,
        src,
        adjust_font_fallback,
        variable,
    } = &request.arguments.0;

    let fonts = match src {
        SrcRequest::Many(descriptors) => FontDescriptors::Many(
            descriptors
                .iter()
                .map(FontDescriptor::from_src_request)
                .collect::<Result<Vec<FontDescriptor>>>()?,
        ),
        SrcRequest::One(path) => {
            FontDescriptors::One(FontDescriptor::from_src_request(&SrcDescriptor {
                path: path.as_str().into(),
                weight: weight.as_deref().map(RcStr::from),
                style: style.as_deref().map(RcStr::from),
            })?)
        }
    };

    Ok(NextFontLocalOptions {
        fonts,
        display: display.as_str().into(),
        preload: preload.to_owned(),
        fallback: fallback.to_owned(),
        adjust_font_fallback: adjust_font_fallback.to_owned(),
        variable: variable.to_owned(),
        variable_name: request.variable_name.to_owned(),
        default_weight: weight.as_ref().and_then(|s| s.parse().ok()),
        default_style: style.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use turbo_tasks_fs::json::parse_json_with_source_context;

    use super::{options_from_request, NextFontLocalOptions};
    use crate::next_font::local::{
        options::{FontDescriptor, FontDescriptors, FontWeight},
        request::{AdjustFontFallback, NextFontLocalRequest},
    };

    #[test]
    fn test_uses_defaults() -> Result<()> {
        let request: NextFontLocalRequest = parse_json_with_source_context(
            r#"
            {
                "import": "",
                "path": "index.js",
                "variableName": "myFont",
                "arguments": [{
                    "src": "./Roboto-Regular.ttf"
                }]
            }
        "#,
        )?;

        assert_eq!(
            options_from_request(&request)?,
            NextFontLocalOptions {
                fonts: FontDescriptors::One(FontDescriptor {
                    path: "./Roboto-Regular.ttf".into(),
                    weight: None,
                    style: None,
                    ext: "ttf".into(),
                }),
                default_style: None,
                default_weight: None,
                display: "swap".into(),
                preload: true,
                fallback: None,
                adjust_font_fallback: AdjustFontFallback::Arial,
                variable: None,
                variable_name: "myFont".into()
            },
        );

        Ok(())
    }

    #[test]
    fn test_multiple_src() -> Result<()> {
        let request: NextFontLocalRequest = parse_json_with_source_context(
            r#"
            {
                "import": "",
                "path": "index.js",
                "variableName": "myFont",
                "arguments": [{
                    "src": [{
                        "path": "./Roboto-Regular.ttf",
                        "weight": "400",
                        "style": "normal"
                    }, {
                        "path": "./Roboto-Italic.ttf",
                        "weight": "400"
                    }],
                    "weight": "300",
                    "style": "italic"
                }]
            }
        "#,
        )?;

        assert_eq!(
            options_from_request(&request)?,
            NextFontLocalOptions {
                fonts: FontDescriptors::Many(vec![
                    FontDescriptor {
                        path: "./Roboto-Regular.ttf".into(),
                        weight: Some(FontWeight::Fixed("400".into())),
                        style: Some("normal".into()),
                        ext: "ttf".into(),
                    },
                    FontDescriptor {
                        path: "./Roboto-Italic.ttf".into(),
                        weight: Some(FontWeight::Fixed("400".into())),
                        style: None,
                        ext: "ttf".into(),
                    }
                ]),
                default_weight: Some(FontWeight::Fixed("300".into())),
                default_style: Some("italic".into()),
                display: "swap".into(),
                preload: true,
                fallback: None,
                adjust_font_fallback: AdjustFontFallback::Arial,
                variable: None,
                variable_name: "myFont".into()
            },
        );

        Ok(())
    }

    #[test]
    fn test_true_adjust_fallback_fails() -> Result<()> {
        let request: Result<NextFontLocalRequest> = parse_json_with_source_context(
            r#"
            {
                "import": "",
                "path": "index.js",
                "variableName": "myFont",
                "arguments": [{
                    "src": "./Roboto-Regular.ttf",
                    "adjustFontFallback": true
                }]
            }
        "#,
        );

        match request {
            Ok(r) => panic!("Expected failure, received {:?}", r),
            Err(err) => {
                assert!(err
                    .to_string()
                    .contains("expected Expected string or `false`. Received `true`"),)
            }
        }

        Ok(())
    }

    #[test]
    fn test_specified_options() -> Result<()> {
        let request: NextFontLocalRequest = parse_json_with_source_context(
            r#"
            {
                "import": "",
                "path": "index.js",
                "variableName": "myFont",
                "arguments": [{
                    "src": "./Roboto-Regular.woff",
                    "preload": false,
                    "weight": "500",
                    "style": "italic",
                    "fallback": ["Fallback"],
                    "adjustFontFallback": "Times New Roman",
                    "display": "optional",
                    "variable": "myvar"
                }]
            }
        "#,
        )?;

        assert_eq!(
            options_from_request(&request)?,
            NextFontLocalOptions {
                fonts: FontDescriptors::One(FontDescriptor {
                    path: "./Roboto-Regular.woff".into(),
                    weight: Some(FontWeight::Fixed("500".into())),
                    style: Some("italic".into()),
                    ext: "woff".into(),
                }),
                default_style: Some("italic".into()),
                default_weight: Some(FontWeight::Fixed("500".into())),
                display: "optional".into(),
                preload: false,
                fallback: Some(vec!["Fallback".into()]),
                adjust_font_fallback: AdjustFontFallback::TimesNewRoman,
                variable: Some("myvar".into()),
                variable_name: "myFont".into()
            },
        );

        Ok(())
    }
}
