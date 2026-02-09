use std::sync::LazyLock;

use anyhow::Result;
use regex::Regex;
use swc_core::common::comments::{Comment, CommentKind};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath, rope::Rope};
use turbopack_core::{
    reference::{ModuleReference, SourceMapReference},
    source::Source,
    source_map::{GenerateSourceMap, utils::resolve_source_map_sources},
};

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct InlineSourceMap {
    /// The file path of the module containing the sourcemap data URL
    pub origin_path: FileSystemPath,
    /// The Base64 encoded JSON sourcemap string
    pub source_map: RcStr,
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for InlineSourceMap {
    #[turbo_tasks::function]
    pub async fn generate_source_map(&self) -> Result<Vc<FileContent>> {
        let source_map = maybe_decode_data_url(&self.source_map);
        if let Some(source_map) =
            resolve_source_map_sources(source_map.as_ref(), &self.origin_path).await?
        {
            Ok(FileContent::Content(File::from(source_map)).cell())
        } else {
            Ok(FileContent::NotFound.cell())
        }
    }
}

const SOURCE_MAPPING_URL_PREFIX: &str = "# sourceMappingURL=";
const SOURCE_MAPPING_URL_PREFIX_LEGACY: &str = "@ sourceMappingURL=";

/// Checks if a line comment is a sourceMappingURL directive and extracts the URL.
pub fn extract_source_mapping_url(comment: &Comment) -> Option<&str> {
    if comment.kind != CommentKind::Line {
        return None;
    }
    let text = comment.text.trim();
    text.strip_prefix(SOURCE_MAPPING_URL_PREFIX)
        .or_else(|| text.strip_prefix(SOURCE_MAPPING_URL_PREFIX_LEGACY))
        .map(|url| url.trim())
}

fn maybe_decode_data_url(url: &str) -> Option<Rope> {
    const DATA_PREAMBLE: &str = "data:application/json;base64,";
    const DATA_PREAMBLE_CHARSET: &str = "data:application/json;charset=utf-8;base64,";

    let data_b64 = if let Some(data) = url.strip_prefix(DATA_PREAMBLE) {
        data
    } else if let Some(data) = url.strip_prefix(DATA_PREAMBLE_CHARSET) {
        data
    } else {
        return None;
    };

    data_encoding::BASE64
        .decode(data_b64.as_bytes())
        .ok()
        .map(Rope::from)
}

/// Extracts the sourceMappingURL from raw file content.
/// This searches for a comment at the end of the file (only followed by whitespace).
pub fn extract_source_mapping_url_from_content(file_content: &str) -> Option<&str> {
    // TODO this should use https://tc39.es/ecma426/#sec-JavaScriptExtractSourceMapURL instead

    // Find a matching comment at the end of the file (only followed by whitespace)
    static SOURCE_MAP_FILE_REFERENCE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\n//[@#]\s*sourceMappingURL=(\S*)[\n\s]*$").unwrap());

    file_content.rfind("\n//").and_then(|start| {
        let line = &file_content[start..];
        SOURCE_MAP_FILE_REFERENCE
            .captures(line)
            .map(|m| m.get(1).unwrap().as_str())
    })
}

pub async fn parse_source_map_comment(
    source: ResolvedVc<Box<dyn Source>>,
    source_mapping_url: Option<&str>,
    origin_path: &FileSystemPath,
) -> Result<
    Option<(
        ResolvedVc<Box<dyn GenerateSourceMap>>,
        Option<ResolvedVc<Box<dyn ModuleReference>>>,
    )>,
> {
    if let Some(path) = source_mapping_url {
        static JSON_DATA_URL_BASE64: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(r"^data:application\/json;(?:charset=utf-8;)?base64").unwrap()
        });
        if path.ends_with(".map") {
            let source_map_origin = origin_path.parent().join(path)?;
            let reference = SourceMapReference::new(origin_path.clone(), source_map_origin)
                .to_resolved()
                .await?;
            return Ok(Some((
                ResolvedVc::upcast(reference),
                Some(ResolvedVc::upcast(reference)),
            )));
        } else if JSON_DATA_URL_BASE64.is_match(path) {
            return Ok(Some((
                ResolvedVc::upcast(
                    InlineSourceMap {
                        origin_path: origin_path.clone(),
                        source_map: path.into(),
                    }
                    .resolved_cell(),
                ),
                None,
            )));
        }
    }

    if let Some(generate_source_map) =
        ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(source)
    {
        return Ok(Some((generate_source_map, None)));
    }

    Ok(None)
}
