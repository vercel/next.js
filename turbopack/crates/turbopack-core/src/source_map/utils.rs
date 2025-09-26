use std::{borrow::Cow, collections::HashSet};

use anyhow::{Context, Result};
use const_format::concatcp;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use turbo_tasks::{ResolvedVc, ValueToString};
use turbo_tasks_fs::{
    DiskFileSystem, FileContent, FileSystemPath, rope::Rope, util::uri_from_file,
};
use url::Url;

use crate::SOURCE_URL_PROTOCOL;

pub fn add_default_ignore_list(map: &mut swc_sourcemap::SourceMap) {
    let mut ignored_ids = HashSet::new();

    for (source_id, source) in map.sources().enumerate() {
        if source.starts_with(concatcp!(SOURCE_URL_PROTOCOL, "///[next]"))
            || source.starts_with(concatcp!(SOURCE_URL_PROTOCOL, "///[turbopack]"))
            || source.contains("/node_modules/")
            || source.ends_with("__nextjs-internal-proxy.cjs")
            || source.ends_with("__nextjs-internal-proxy.mjs")
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

// Some of these values use `Box<RawValue>`: If we don't read these fields (or rarely read these
// fields) there's no point in decoding/encoding the data. Ideally they would be a `&RawValue`
// reference, but we deserialize using `from_reader`, which does not support that.
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
    sources_content: Option<Vec<Option<Box<RawValue>>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    names: Option<Box<RawValue>>,
    // We just need to hold onto `mappings` for serialization/deserialization, so there's no point
    // in decoding/encoding the string. Store it as a `RawValue`. Ideally this would be a reference
    // to the RawValue, but we deserialize using `from_reader`, which does not support that.
    mappings: Box<RawValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ignore_list: Option<Box<RawValue>>,

    // A somewhat widespread non-standard extension
    debug_id: Option<Box<RawValue>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    sections: Option<Vec<SourceMapSectionItemJson>>,
}

/// Replace the origin prefix in the `file` and `sources` with `turbopack:///` and read the
/// `sourceContent`s from disk.
pub async fn resolve_source_map_sources(
    map: Option<&Rope>,
    origin: &FileSystemPath,
) -> Result<Option<Rope>> {
    let fs_vc = origin.fs().to_resolved().await?;
    let fs_str = &*format!("[{}]", fs_vc.to_string().await?);

    let disk_fs = if let Some(fs_vc) = ResolvedVc::try_downcast_type::<DiskFileSystem>(fs_vc) {
        Some((fs_vc, fs_vc.await?))
    } else {
        None
    };
    let disk_fs = &disk_fs;

    let resolve_source =
        async |original_source_url: &mut String,
               original_content: Option<&mut Option<Box<RawValue>>>| {
            // original_source should always be a URL (possibly a `file://` url). If it's a relative
            // URL, it should be relative to `origin` (the generated file that's being mapped).

            // try to infer a `file://` URL scheme for paths starting with `/` so that we can parse
            // it as a full URL object
            let maybe_file_url = if original_source_url.starts_with('/') {
                Cow::Owned(format!("file://{original_source_url}"))
            } else {
                Cow::Borrowed(original_source_url)
            };

            let fs_path = if let Ok(original_source_url_obj) = Url::parse(&maybe_file_url) {
                // We have an absolute URL, try to parse it as a `file://` URL
                if let Ok(sys_path) = original_source_url_obj.to_file_path() {
                    if let Some((disk_fs_vc, disk_fs)) = disk_fs {
                        disk_fs.try_from_sys_path(*disk_fs_vc, &sys_path, Some(origin))
                    } else {
                        None
                    }
                } else {
                    // this is an absolute URL with a non-`file://` scheme, just assume it's valid
                    // and don't modify anything
                    return Ok(());
                }
            } else {
                // assume it's a relative URL, and just remove any percent encoding from path
                // segments. Our internal path format is POSIX-like, without percent encoding.
                origin.parent().try_join(
                    &urlencoding::decode(original_source_url)
                        .unwrap_or(Cow::Borrowed(original_source_url)),
                )?
            };

            if let Some(fs_path) = fs_path {
                let fs_path_str = &fs_path.path;
                let source = format!("{SOURCE_URL_PROTOCOL}///{fs_str}/{fs_path_str}");
                *original_source_url = source;

                if let Some(original_content) = original_content
                    && original_content.is_none()
                {
                    if let FileContent::Content(file) = &*fs_path.read().await? {
                        let text = file.content().to_str()?;
                        *original_content = Some(unencoded_str_to_raw_value(&text));
                    } else {
                        *original_content = Some(unencoded_str_to_raw_value(&format!(
                            "unable to read source {fs_str}/{fs_path_str}"
                        )));
                    }
                }
            } else {
                // The URL was broken somehow, create a dummy `turbopack://` URL and content
                let origin_str = &origin.path;
                static INVALID_REGEX: Lazy<Regex> =
                    Lazy::new(|| Regex::new(r#"(?:^|/)(?:\.\.?(?:/|$))+"#).unwrap());
                let source = INVALID_REGEX
                    .replace_all(original_source_url, |s: &regex::Captures<'_>| {
                        s[0].replace('.', "_")
                    });
                *original_source_url =
                    format!("{SOURCE_URL_PROTOCOL}///{fs_str}/{origin_str}/{source}");
                if let Some(original_content) = original_content
                    && original_content.is_none()
                {
                    *original_content = Some(unencoded_str_to_raw_value(&format!(
                        "unable to access {original_source_url} in {fs_str}/{origin_str} (it's \
                         leaving the filesystem root)"
                    )));
                }
            }
            anyhow::Ok(())
        };

    let resolve_map = async |map: &mut SourceMapJson| {
        if let Some(sources) = &mut map.sources {
            let mut contents = if let Some(mut contents) = map.sources_content.take() {
                contents.resize(sources.len(), None);
                contents
            } else {
                Vec::with_capacity(sources.len())
            };

            for (source, content) in sources.iter_mut().zip(contents.iter_mut()) {
                if let Some(source) = source {
                    resolve_source(source, Some(content)).await?;
                }
            }

            map.sources_content = Some(contents);
        }
        anyhow::Ok(())
    };

    let Some(map) = map else {
        return Ok(None);
    };

    let Ok(mut map): serde_json::Result<SourceMapJson> = serde_json::from_reader(map.read()) else {
        // Silently ignore invalid sourcemaps
        return Ok(None);
    };

    if let Some(file) = &mut map.file {
        resolve_source(file, None).await?;
    }

    resolve_map(&mut map).await?;
    for section in map.sections.iter_mut().flatten() {
        resolve_map(&mut section.map).await?;
    }

    let map = Rope::from(serde_json::to_vec(&map)?);
    Ok(Some(map))
}

fn unencoded_str_to_raw_value(unencoded: &str) -> Box<RawValue> {
    RawValue::from_string(
        serde_json::to_string(unencoded)
            .expect("serialization of a utf-8 string should always succeed"),
    )
    .expect("serde_json::to_string should produce valid JSON")
}

/// Turns `turbopack:///[project]` references in sourcemap sources into absolute `file://` uris. This
/// is useful for debugging environments.
pub async fn fileify_source_map(
    map: Option<&Rope>,
    context_path: FileSystemPath,
) -> Result<Option<Rope>> {
    let Some(map) = map else {
        return Ok(None);
    };

    let Ok(mut map): serde_json::Result<SourceMapJson> = serde_json::from_reader(map.read()) else {
        // Silently ignore invalid sourcemaps
        return Ok(None);
    };

    let context_fs = context_path.fs;
    let context_fs = &*ResolvedVc::try_downcast_type::<DiskFileSystem>(context_fs)
        .context("Expected the chunking context to have a DiskFileSystem")?
        .await?;
    let prefix = format!("{}///[{}]/", SOURCE_URL_PROTOCOL, context_fs.name());

    let transform_source = async |src: &mut Option<String>| {
        if let Some(src) = src
            && let Some(src_rest) = src.strip_prefix(&prefix)
        {
            *src = uri_from_file(context_path.clone(), Some(src_rest)).await?;
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
