use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_tasks::primitives::{StringVc, U32Vc};

use super::options::{FontDescriptors, NextFontLocalOptionsVc};
use crate::next_font::{
    font_fallback::FontFallbacksVc,
    stylesheet::build_fallback_definition,
    util::{get_scoped_font_family, FontCssPropertiesVc, FontFamilyType},
};

#[turbo_tasks::function]
pub(super) async fn build_stylesheet(
    options: NextFontLocalOptionsVc,
    fallbacks: FontFallbacksVc,
    css_properties: FontCssPropertiesVc,
    request_hash: U32Vc,
) -> Result<StringVc> {
    let scoped_font_family = get_scoped_font_family(
        FontFamilyType::WebFont.cell(),
        options.font_family(),
        request_hash,
    );

    Ok(StringVc::cell(formatdoc!(
        r#"
        {}
        {}
        {}
    "#,
        *build_font_face_definitions(scoped_font_family, options).await?,
        (*build_fallback_definition(fallbacks).await?)
            .as_deref()
            .unwrap_or(""),
        *build_font_class_rules(css_properties).await?
    )))
}

#[turbo_tasks::function]
pub(super) async fn build_font_face_definitions(
    scoped_font_family: StringVc,
    options: NextFontLocalOptionsVc,
) -> Result<StringVc> {
    let options = &*options.await?;

    let mut definitions = String::new();
    let fonts = match &options.fonts {
        FontDescriptors::One(d) => vec![d.clone()],
        FontDescriptors::Many(d) => d.clone(),
    };

    for font in fonts.iter() {
        definitions.push_str(&formatdoc!(
            r#"
            @font-face {{
                font-family: '{}';
                src: url('{}') format('{}');
                font-display: {};
                {}{}
            }}
        "#,
            *scoped_font_family.await?,
            &font.path,
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

    Ok(StringVc::cell(definitions))
}

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

#[turbo_tasks::function]
pub(super) async fn build_font_class_rules(
    css_properties: FontCssPropertiesVc,
) -> Result<StringVc> {
    let css_properties = &*css_properties.await?;
    let font_family_string = &*css_properties.font_family.await?;

    let mut rules = formatdoc!(
        r#"
        .className {{
            font-family: {};
            {}{}
        }}
    "#,
        font_family_string,
        css_properties
            .weight
            .await?
            .as_ref()
            .map(|w| format!("font-weight: {};\n", w))
            .unwrap_or_else(|| "".to_owned()),
        css_properties
            .style
            .await?
            .as_ref()
            .map(|s| format!("font-style: {};\n", s))
            .unwrap_or_else(|| "".to_owned()),
    );

    if let Some(variable) = &*css_properties.variable.await? {
        rules.push_str(&formatdoc!(
            r#"
        .variable {{
            {}: {};
        }}
        "#,
            variable,
            font_family_string
        ))
    }

    Ok(StringVc::cell(rules))
}
