use std::collections::HashSet;

use anyhow::{Context, Result};
use const_format::concatcp;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::{
    rope::Rope, util::uri_from_file, DiskFileSystem, FileContent, FileSystemPath,
};

use crate::SOURCE_MAP_PREFIX;

pub fn add_default_ignore_list(map: &mut sourcemap::SourceMap) {
    let mut ignored_ids = HashSet::new();

    for (source_id, source) in map.sources().enumerate() {
        if source.starts_with(concatcp!(SOURCE_MAP_PREFIX, "[next]"))
            || source.starts_with(concatcp!(SOURCE_MAP_PREFIX, "[turbopack]"))
            || source.contains("/node_modules/")
        {
            ignored_ids.insert(source_id);
        }
    }

    for ignored_id in ignored_ids {
        map.add_to_ignore_list(ignored_id as _);
    }
}

#[derive(Serialize, Deserialize)]
struct SourceMapSectionOffsetJson {
    line: u32,
    offset: u32,
}

#[derive(Serialize, Deserialize)]
struct SourceMapSectionItemJson {
    offset: SourceMapSectionOffsetJson,
    map: SourceMapJson,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceMapJson {
    version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_root: Option<String>,
    // Technically a required field, but we don't want to error here.
    #[serde(skip_serializing_if = "Option::is_none")]
    sources: Option<Vec<Option<String>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sources_content: Option<Vec<Option<String>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    names: Option<Vec<String>>,
    mappings: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ignore_list: Option<Vec<u32>>,

    // A somewhat widespread non-standard extension
    debug_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    sections: Option<Vec<SourceMapSectionItemJson>>,
}

/// Replace the origin prefix in the `sources` with `turbopack://` and read the the `sourceContent`s
/// from disk.
pub async fn resolve_source_map_sources(
    map: Option<&Rope>,
    origin: Vc<FileSystemPath>,
) -> Result<Option<Rope>> {
    async fn resolve_source(
        original_source: &mut String,
        original_content: &mut Option<String>,
        origin: Vc<FileSystemPath>,
    ) -> Result<()> {
        if let Some(path) = *origin
            .parent()
            .try_join((&**original_source).into())
            .await?
        {
            let path_str = path.to_string().await?;
            let source = format!("{SOURCE_MAP_PREFIX}{}", path_str);
            *original_source = source;

            if original_content.is_none() {
                if let FileContent::Content(file) = &*path.read().await? {
                    let text = file.content().to_str()?;
                    *original_content = Some(text.to_string())
                } else {
                    *original_content = Some(format!("unable to read source {path_str}"));
                }
            }
        } else {
            let origin_str = origin.to_string().await?;
            static INVALID_REGEX: Lazy<Regex> =
                Lazy::new(|| Regex::new(r#"(?:^|/)(?:\.\.?(?:/|$))+"#).unwrap());
            let source = INVALID_REGEX.replace_all(original_source, |s: &regex::Captures<'_>| {
                s[0].replace('.', "_")
            });
            *original_source = format!("{SOURCE_MAP_PREFIX}{}/{}", origin_str, source);
            if original_content.is_none() {
                *original_content = Some(format!(
                    "unable to access {original_source} in {origin_str} (it's leaving the \
                     filesystem root)"
                ));
            }
        }
        anyhow::Ok(())
    }

    async fn resolve_map(map: &mut SourceMapJson, origin: Vc<FileSystemPath>) -> Result<()> {
        if let Some(sources) = &mut map.sources {
            let mut contents = if let Some(mut contents) = map.sources_content.take() {
                contents.resize(sources.len(), None);
                contents
            } else {
                Vec::with_capacity(sources.len())
            };

            for (source, content) in sources.iter_mut().zip(contents.iter_mut()) {
                if let Some(source) = source {
                    resolve_source(source, content, origin).await?;
                }
            }

            map.sources_content = Some(contents);
        }
        Ok(())
    }

    let Some(map) = map else {
        return Ok(None);
    };

    let mut map: SourceMapJson = serde_json::from_reader(map.read())?;

    resolve_map(&mut map, origin).await?;
    for section in map.sections.iter_mut().flatten() {
        resolve_map(&mut section.map, origin).await?;
    }

    let map = Rope::from(serde_json::to_vec(&map)?);
    Ok(Some(map))
}

/// Turns `turbopack://[project]` references in sourcemap sources into absolute `file://` uris. This
/// is useful for debugging environments.
pub async fn fileify_source_map(
    map: Option<&Rope>,
    context_path: Vc<FileSystemPath>,
) -> Result<Option<Rope>> {
    let Some(map) = map else {
        return Ok(None);
    };

    let context_fs = context_path.fs();
    let context_fs = &*Vc::try_resolve_downcast_type::<DiskFileSystem>(context_fs)
        .await?
        .context("Expected the chunking context to have a DiskFileSystem")?
        .await?;
    let prefix = format!("{}[{}]/", SOURCE_MAP_PREFIX, context_fs.name());

    // TODO this could be made (much) more efficient by not even de- and serializing other fields
    // (apart from `sources`) and just keep storing them as strings.
    let mut map: SourceMapJson = serde_json::from_reader(map.read())?;

    let transform_source = async |src: &mut Option<String>| {
        if let Some(src) = src {
            if let Some(src_rest) = src.strip_prefix(&prefix) {
                *src = uri_from_file(context_path, Some(src_rest)).await?;
            }
        }
        anyhow::Ok(())
    };

    for src in map.sources.iter_mut().flatten() {
        transform_source(src).await?;
    }
    for section in map.sections.iter_mut().flatten() {
        for src in section.map.sources.iter_mut().flatten() {
            transform_source(src).await?;
        }
    }

    let map = Rope::from(serde_json::to_vec(&map)?);

    Ok(Some(map))
}
