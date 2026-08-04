use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use super::options::NextFontLocalOptions;
use crate::next_font::{
    font_fallback::{FontFallback, FontFallbacks},
    util::{FontFamilyType, get_scoped_font_family},
};

/// Returns a string to be used as the `font-family` property in css.
#[turbo_tasks::function]
pub(super) async fn build_font_family_string(
    options: Vc<NextFontLocalOptions>,
    font_fallbacks: Vc<FontFallbacks>,
) -> Result<Vc<RcStr>> {
    let mut font_families = vec![
        format!(
            "'{}'",
            get_scoped_font_family(
                FontFamilyType::WebFont,
                turbo_tasks::read!(options.font_family())?
            )
        )
        .into(),
    ];

    for font_fallback in &*turbo_tasks::read!(font_fallbacks)? {
        match &*turbo_tasks::read!(font_fallback)? {
            FontFallback::Automatic(fallback) => {
                font_families.push(format!("'{}'", fallback.scoped_font_family).into());
            }
            FontFallback::Manual(fallbacks) => {
                font_families.extend_from_slice(fallbacks);
            }
            _ => (),
        }
    }

    Ok(Vc::cell(font_families.join(", ").into()))
}
