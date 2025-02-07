use std::collections::HashSet;

use anyhow::{Context, Result};
use const_format::concatcp;
use serde::{Deserialize, Serialize};
use sourcemap::SourceMap;
use turbo_tasks::Vc;
use turbo_tasks_fs::{rope::Rope, util::uri_from_file, DiskFileSystem, FileSystemPath};

use crate::SOURCE_MAP_PREFIX;

pub fn add_default_ignore_list(map: &mut SourceMap) {
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

/// Turns `turbopack://[project]`` references in sourcemap sources into absolute
/// `file://` uris. This is useful for debugging environments.
pub async fn fileify_source_map(
    map: Option<&Rope>,
    context_path: Vc<FileSystemPath>,
) -> Result<Option<Rope>> {
    #[derive(Serialize, Deserialize)]
    struct SourceMapSectionOffsetJson {
        line: u32,
        offset: u32,
    }
    #[derive(Serialize, Deserialize)]
    struct SourceMapSectionJson {
        offset: SourceMapSectionOffsetJson,
        map: SourceMapJson,
    }
    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SourceMapJson {
        version: u32,
        file: Option<String>,
        source_root: Option<String>,
        sources: Vec<Option<String>>,
        sources_content: Option<Vec<Option<String>>>,
        names: Vec<String>,
        mappings: String,
        ignore_list: Option<Vec<u32>>,
        sections: Option<Vec<SourceMapSectionJson>>,
    }

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

    for src in map.sources.iter_mut() {
        transform_source(src).await?;
    }
    for section in map.sections.iter_mut().flatten() {
        for src in section.map.sources.iter_mut() {
            transform_source(src).await?;
        }
    }

    let map = Rope::from(serde_json::to_vec(&map)?);

    Ok(Some(map))
}
