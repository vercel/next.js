use std::sync::LazyLock;

use anyhow::{Context, Result};
use regex::Regex;
use serde::Deserialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{FileSystemPath, json::parse_json_with_source_context};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::issue::{IssueExt, IssueSeverity, StyledString};

use super::issue::NextFontIssue;

/// CSS properties and values for a given font variation. These are rendered as
/// values in both the returned JavaScript object and in the referenced css
/// module.
#[turbo_tasks::value(shared)]
pub(crate) struct FontCssProperties {
    pub font_family: ResolvedVc<RcStr>,
    pub weight: ResolvedVc<Option<RcStr>>,
    pub style: ResolvedVc<Option<RcStr>>,
    pub variable: ResolvedVc<Option<RcStr>>,
}

/// A hash of the requested querymap derived from how the user invoked
/// next/font. Used to uniquely identify font requests for generated filenames
/// and scoped font family names.
pub(crate) fn get_request_hash(query: &str) -> u32 {
    let query = qstring::QString::from(query);
    let mut to_hash = Vec::with_capacity(query.len() * 2);
    for (k, v) in query {
        to_hash.push(k);
        to_hash.push(v);
    }

    // Truncate the hash to u32. These hashes are ultimately displayed as 6- or 8-character
    // hexadecimal values.
    hash_xxh3_hash64(to_hash) as u32
}

#[turbo_tasks::value(shared)]
pub(crate) enum FontFamilyType {
    WebFont,
    Fallback,
}

/// Returns a uniquely scoped version of the font family, e.g.`__Roboto_c123b8`
/// * `ty` - Whether to generate a scoped classname for the main font or its fallback equivalent,
///   e.g. `__Roboto_Fallback_c123b8`
/// * `font_family_name` - The font name to scope, e.g. `Roboto`
/// * `request_hash` - The hash value of the font request
pub(crate) fn get_scoped_font_family(ty: FontFamilyType, font_family_name: RcStr) -> RcStr {
    match ty {
        FontFamilyType::WebFont => font_family_name,
        FontFamilyType::Fallback => format!("{font_family_name} Fallback").into(),
    }
}

/// Returns a [RcStr] for [String] uniquely identifying the request for the font.
pub fn get_request_id(font_family: RcStr, request_hash: u32) -> RcStr {
    format!(
        "{}_{:x?}",
        font_family.to_lowercase().replace(' ', "_"),
        request_hash
    )
    .into()
}

#[derive(Debug, Deserialize)]
struct HasPath {
    path: RcStr,
}

pub(crate) async fn can_use_next_font(project_path: FileSystemPath, query: &RcStr) -> Result<bool> {
    let query_map = qstring::QString::from(query.as_str());
    let request: HasPath = parse_json_with_source_context(
        query_map
            .to_pairs()
            .first()
            .context("expected one entry")?
            .0,
    )?;

    static DOCUMENT_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new("^(src/)?_document\\.[^/]+$").unwrap());
    let path = project_path.join(&request.path)?;
    let can_use = !DOCUMENT_RE.is_match(&request.path);
    if !can_use {
        NextFontIssue {
            path: path.clone(),
            title: StyledString::Line(vec![
                StyledString::Code(rcstr!("next/font:")),
                StyledString::Text(rcstr!(" error:")),
            ])
            .resolved_cell(),
            description: StyledString::Line(vec![
                StyledString::Text(rcstr!("Cannot be used within ")),
                StyledString::Code(request.path),
            ])
            .resolved_cell(),
            severity: IssueSeverity::Error,
        }
        .resolved_cell()
        .emit();
    }
    Ok(can_use)
}
