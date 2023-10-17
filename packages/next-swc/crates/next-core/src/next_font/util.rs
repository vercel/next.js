use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbo::tasks_hash::hash_xxh3_hash64;

/// CSS properties and values for a given font variation. These are rendered as
/// values in both the returned JavaScript object and in the referenced css
/// module.
#[turbo_tasks::value(shared)]
pub(crate) struct FontCssProperties {
    pub font_family: Vc<String>,
    pub weight: Vc<Option<String>>,
    pub style: Vc<Option<String>>,
    pub variable: Vc<Option<String>>,
}

/// A hash of the requested querymap derived from how the user invoked
/// next/font. Used to uniquely identify font requests for generated filenames
/// and scoped font family names.
#[turbo_tasks::function]
pub(crate) async fn get_request_hash(query_vc: Vc<String>) -> Result<Vc<u32>> {
    let query = qstring::QString::from(&**query_vc.await?);
    let mut to_hash = vec![];
    for (k, v) in query {
        to_hash.push(k);
        to_hash.push(v);
    }

    Ok(Vc::cell(
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
    ty: Vc<FontFamilyType>,
    font_family_name: Vc<String>,
    request_hash: Vc<u32>,
) -> Result<Vc<String>> {
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

    Ok(Vc::cell(format!("__{}_{}", font_family_name, hash)))
}

/// Returns a [[Vc<String>]] uniquely identifying the request for the font.
#[turbo_tasks::function]
pub async fn get_request_id(font_family: Vc<String>, request_hash: Vc<u32>) -> Result<Vc<String>> {
    Ok(Vc::cell(format!(
        "{}_{:x?}",
        font_family.await?.to_lowercase().replace(' ', "_"),
        request_hash.await?
    )))
}
