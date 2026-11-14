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
    let options = &*options.await?;

    // Check if `font-family` is explicitly defined in `declarations`
    // If so, use that value instead of the variable name
    let font_family_name: RcStr = options
        .declarations
        .as_ref()
        .and_then(|declarations| {
            declarations
                .iter()
                .find(|decl| decl.prop == "font-family")
                .map(|decl| decl.value.clone())
        })
        .unwrap_or_else(|| options.variable_name.clone());

    let mut font_families = vec![
        format!(
            "'{}'",
            get_scoped_font_family(FontFamilyType::WebFont, font_family_name)
        )
        .into(),
    ];

    for font_fallback in &*font_fallbacks.await? {
        match &*font_fallback.await? {
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
