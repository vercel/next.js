use anyhow::{Context, Result};
use serde::Deserialize;
use turbo_tasks::{RcStr, Vc};
use turbo_tasks_fs::{json::parse_json_with_source_context, FileSystemPath};
use turbopack_binding::{
    turbo::tasks_hash::hash_xxh3_hash64,
    turbopack::core::issue::{IssueExt, IssueSeverity, StyledString},
};

use super::issue::NextFontIssue;

/// CSS properties and values for a given font variation. These are rendered as
/// values in both the returned JavaScript object and in the referenced css
/// module.
#[turbo_tasks::value(shared)]
pub(crate) struct FontCssProperties {
    pub font_family: Vc<RcStr>,
    pub weight: Vc<Option<RcStr>>,
    pub style: Vc<Option<RcStr>>,
    pub variable: Vc<Option<RcStr>>,
}

/// A hash of the requested querymap derived from how the user invoked
/// next/font. Used to uniquely identify font requests for generated filenames
/// and scoped font family names.
pub(crate) async fn get_request_hash(query: &str) -> Result<u32> {
    let query = qstring::QString::from(query);
    let mut to_hash = vec![];
    for (k, v) in query {
        to_hash.push(k);
        to_hash.push(v);
    }

    Ok(
        // Truncate the hash to u32. These hashes are ultimately displayed as 6- or 8-character
        // hexadecimal values.
        hash_xxh3_hash64(to_hash) as u32,
    )
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
    font_family_name: Vc<RcStr>,
) -> Result<Vc<RcStr>> {
    let font_family_base = font_family_name.await?.to_string();
    let font_family_name = match &*ty.await? {
        FontFamilyType::WebFont => font_family_base,
        FontFamilyType::Fallback => format!("{} Fallback", font_family_base),
    };

    Ok(Vc::cell(font_family_name.into()))
}

/// Returns a [Vc] for [String] uniquely identifying the request for the font.
#[turbo_tasks::function]
pub async fn get_request_id(font_family: Vc<RcStr>, request_hash: u32) -> Result<Vc<RcStr>> {
    Ok(Vc::cell(
        format!(
            "{}_{:x?}",
            font_family.await?.to_lowercase().replace(' ', "_"),
            request_hash
        )
        .into(),
    ))
}

#[derive(Debug, Deserialize)]
struct HasPath {
    path: RcStr,
}

pub(crate) async fn can_use_next_font(
    project_path: Vc<FileSystemPath>,
    query: Vc<RcStr>,
) -> Result<bool> {
    let query_map = qstring::QString::from(&**query.await?);
    let request: HasPath = parse_json_with_source_context(
        query_map
            .to_pairs()
            .first()
            .context("expected one entry")?
            .0,
    )?;

    let document_re = lazy_regex::regex!("^(src/)?_document\\.[^/]+$");
    let path = project_path.join(request.path.clone());
    let can_use = !document_re.is_match(&request.path);
    if !can_use {
        NextFontIssue {
            path,
            title: StyledString::Line(vec![
                StyledString::Code("next/font:".into()),
                StyledString::Text(" error:".into()),
            ])
            .cell(),
            description: StyledString::Line(vec![
                StyledString::Text("Cannot be used within ".into()),
                StyledString::Code(request.path),
            ])
            .cell(),
            severity: IssueSeverity::Error.into(),
        }
        .cell()
        .emit();
    }
    Ok(can_use)
}
