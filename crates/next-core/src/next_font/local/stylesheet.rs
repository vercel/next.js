use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use super::options::{FontDescriptors, NextFontLocalOptions};
use crate::next_font::{
    font_fallback::FontFallbacks,
    local::NextFontLocalFontFileOptions,
    stylesheet::{build_fallback_definition, build_font_class_rules},
    util::{get_scoped_font_family, FontCssProperties, FontFamilyType},
};

#[turbo_tasks::function]
pub(super) async fn build_stylesheet(
    options: Vc<NextFontLocalOptions>,
    fallbacks: Vc<FontFallbacks>,
    css_properties: Vc<FontCssProperties>,
) -> Result<Vc<RcStr>> {
    let scoped_font_family =
        get_scoped_font_family(FontFamilyType::WebFont.cell(), options.font_family());

    Ok(Vc::cell(
        formatdoc!(
            r#"
            {}
            {}
            {}
        "#,
            *build_font_face_definitions(scoped_font_family, options, fallbacks.has_size_adjust())
                .await?,
            (*build_fallback_definition(fallbacks).await?),
            *build_font_class_rules(css_properties).await?
        )
        .into(),
    ))
}

/// Builds a string of `@font-face` definitions for each local font file
#[turbo_tasks::function]
pub(super) async fn build_font_face_definitions(
    scoped_font_family: Vc<RcStr>,
    options: Vc<NextFontLocalOptions>,
    has_size_adjust: Vc<bool>,
) -> Result<Vc<RcStr>> {
    let options = &*options.await?;

    let mut definitions = String::new();
    let fonts = match &options.fonts {
        FontDescriptors::One(d) => vec![d.clone()],
        FontDescriptors::Many(d) => d.clone(),
    };

    let has_size_adjust = *has_size_adjust.await?;

    for font in fonts {
        let query = NextFontLocalFontFileOptions {
            path: font.path.clone(),
            preload: options.preload,
            has_size_adjust,
        };
        let query_str = qstring::QString::from(serde_json::to_string(&query)?.as_str());

        definitions.push_str(&formatdoc!(
            r#"
                @font-face {{
                    font-family: '{}';
                    src: url('@vercel/turbopack-next/internal/font/local/font?{}') format('{}');
                    font-display: {};
                    {}{}
                }}
            "#,
            *scoped_font_family.await?,
            query_str,
            ext_to_format(&font.ext)?,
            options.display,
            &font
                .weight
                .as_ref()
                .or(options.default_weight.as_ref())
                .map_or_else(|| "".to_owned(), |w| format!("font-weight: {};", w)),
            &font
                .style
                .as_ref()
                .or(options.default_style.as_ref())
                .map_or_else(|| "".to_owned(), |s| format!("font-style: {};", s)),
        ));
    }

    Ok(Vc::cell(definitions.into()))
}

/// Used as e.g. `format('woff')` in `src` properties in `@font-face`
/// definitions above.
fn ext_to_format(ext: &str) -> Result<String> {
    Ok(match ext {
        "woff" => "woff",
        "woff2" => "woff2",
        "ttf" => "truetype",
        "otf" => "opentype",
        "eot" => "embedded-opentype",
        _ => bail!("Unknown font file extension"),
    }
    .to_owned())
}
