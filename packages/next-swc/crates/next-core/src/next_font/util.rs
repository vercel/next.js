use anyhow::{Context, Result};
use turbo_tasks::primitives::{OptionStringVc, StringVc, U32Vc};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::resolve::pattern::QueryMapVc;

/// CSS properties and values for a given font variation. These are rendered as
/// values in both the returned JavaScript object and in the referenced css
/// module.
#[turbo_tasks::value(shared)]
pub(crate) struct FontCssProperties {
    pub font_family: StringVc,
    pub weight: OptionStringVc,
    pub style: OptionStringVc,
    pub variable: OptionStringVc,
}

/// A hash of the requested querymap derived from how the user invoked
/// next/font. Used to uniquely identify font requests for generated filenames
/// and scoped font family names.
#[turbo_tasks::function]
pub(crate) async fn get_request_hash(query_vc: QueryMapVc) -> Result<U32Vc> {
    let query = &*query_vc.await?;
    let query = query.as_ref().context("Query map must be present")?;
    let mut to_hash = vec![];
    for (k, v) in query {
        to_hash.push(k);
        to_hash.push(v);
    }

    Ok(U32Vc::cell(
        // Truncate the hash to u32. These hashes are ultimately displayed as 6- or 8-character
        // hexadecimal values.
        hash_xxh3_hash64(to_hash) as u32,
    ))
}

#[turbo_tasks::value(shared)]
pub(crate) enum FontFamilyType {
    WebFont,
    Fallback,
}

/// Returns a uniquely scoped version of the font family, e.g.`__Roboto_c123b8`
/// * `ty` - Whether to generate a scoped classname for the main font or its
///   fallback equivalent, e.g. `__Roboto_Fallback_c123b8`
/// * `font_family_name` - The font name to scope, e.g. `Roboto`
/// * `request_hash` - The hash value of the font request
#[turbo_tasks::function]
pub(crate) async fn get_scoped_font_family(
    ty: FontFamilyTypeVc,
    font_family_name: StringVc,
    request_hash: U32Vc,
) -> Result<StringVc> {
    let hash = {
        let mut hash = format!("{:x?}", request_hash.await?);
        hash.truncate(6);
        hash
    };

    let font_family_base = font_family_name.await?.replace(' ', "_");
    let font_family_name = match &*ty.await? {
        FontFamilyType::WebFont => font_family_base,
        FontFamilyType::Fallback => format!("{}_Fallback", font_family_base),
    };

    Ok(StringVc::cell(format!("__{}_{}", font_family_name, hash)))
}

/// Returns a [[StringVc]] uniquely identifying the request for the font.
#[turbo_tasks::function]
pub async fn get_request_id(font_family: StringVc, request_hash: U32Vc) -> Result<StringVc> {
    Ok(StringVc::cell(format!(
        "{}_{:x?}",
        font_family.await?.to_lowercase().replace(' ', "_"),
        request_hash.await?
    )))
}
