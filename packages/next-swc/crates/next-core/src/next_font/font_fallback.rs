use anyhow::Result;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{StringVc, StringsVc},
    trace::TraceRawVcs,
};

pub(crate) struct DefaultFallbackFont {
    pub name: String,
    pub az_avg_width: f64,
    pub units_per_em: u32,
}

// From https://github.com/vercel/next.js/blob/a3893bf69c83fb08e88c87bf8a21d987a0448c8e/packages/font/src/utils.ts#L4
pub(crate) static DEFAULT_SANS_SERIF_FONT: Lazy<DefaultFallbackFont> =
    Lazy::new(|| DefaultFallbackFont {
        name: "Arial".to_owned(),
        az_avg_width: 934.5116279069767,
        units_per_em: 2048,
    });

pub(crate) static DEFAULT_SERIF_FONT: Lazy<DefaultFallbackFont> =
    Lazy::new(|| DefaultFallbackFont {
        name: "Times New Roman".to_owned(),
        az_avg_width: 854.3953488372093,
        units_per_em: 2048,
    });

#[turbo_tasks::value(shared)]
pub(crate) struct AutomaticFontFallback {
    pub scoped_font_family: StringVc,
    pub local_font_family: StringVc,
    pub adjustment: Option<FontAdjustment>,
}

#[derive(Debug)]
#[turbo_tasks::value(shared)]
pub(crate) enum FontFallback {
    Automatic(AutomaticFontFallbackVc),
    /// There was an issue preparing the font fallback. Since resolving the
    /// font css cannot fail, proper Errors cannot be returned. Emit an issue,
    /// return this and omit fallback information instead.
    Error,
    Manual(StringsVc),
}

#[turbo_tasks::value(transparent)]
pub(crate) struct FontFallbacks(Vec<FontFallbackVc>);

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
