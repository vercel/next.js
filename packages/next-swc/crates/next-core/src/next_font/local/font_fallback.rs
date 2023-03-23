use anyhow::Result;
use turbo_tasks::primitives::{StringVc, StringsVc, U32Vc};
use turbo_tasks_fs::FileSystemPathVc;

use super::{options::NextFontLocalOptionsVc, request::AdjustFontFallback};
use crate::next_font::{
    font_fallback::{AutomaticFontFallback, FontFallback, FontFallbacksVc},
    util::{get_scoped_font_family, FontFamilyType},
};

#[turbo_tasks::function]
pub(super) async fn get_font_fallbacks(
    _context: FileSystemPathVc,
    options_vc: NextFontLocalOptionsVc,
    request_hash: U32Vc,
) -> Result<FontFallbacksVc> {
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
                    local_font_family: StringVc::cell("Arial".to_owned()),
                    adjustment: None,
                }
                .cell(),
            )
            .into(),
        ),
        AdjustFontFallback::TimesNewRoman => font_fallbacks.push(
            FontFallback::Automatic(
                AutomaticFontFallback {
                    scoped_font_family,
                    local_font_family: StringVc::cell("Times New Roman".to_owned()),
                    adjustment: None,
                }
                .cell(),
            )
            .into(),
        ),
        AdjustFontFallback::None => (),
    };

    if let Some(fallback) = &options.fallback {
        font_fallbacks.push(FontFallback::Manual(StringsVc::cell(fallback.clone())).into());
    }

    Ok(FontFallbacksVc::cell(font_fallbacks))
}
