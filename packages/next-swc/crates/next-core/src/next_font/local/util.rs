use anyhow::Result;
use turbo_tasks::Vc;

use super::options::NextFontLocalOptions;
use crate::next_font::{
    font_fallback::{FontFallback, FontFallbacks},
    util::{get_scoped_font_family, FontFamilyType},
};

/// Returns a string to be used as the `font-family` property in css.
#[turbo_tasks::function]
pub(super) async fn build_font_family_string(
    options: Vc<NextFontLocalOptions>,
    font_fallbacks: Vc<FontFallbacks>,
    request_hash: Vc<u32>,
) -> Result<Vc<String>> {
    let mut font_families = vec![format!(
        "'{}'",
        *get_scoped_font_family(
            FontFamilyType::WebFont.cell(),
            options.font_family(),
            request_hash,
        )
        .await?
    )];

    for font_fallback in &*font_fallbacks.await? {
        match *font_fallback.await? {
            FontFallback::Automatic(fallback) => {
                font_families.push(format!("'{}'", *fallback.await?.scoped_font_family.await?));
            }
            FontFallback::Manual(fallbacks) => {
                font_families.extend_from_slice(&fallbacks.await?);
            }
            _ => (),
        }
    }

    Ok(Vc::cell(font_families.join(", ")))
}
