//! One emitted or traced file's analysis, cached per file and shared by every
//! route that includes it.

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, ValueToStringRef, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_analyze::split_chunk::{
    ChunkPart, split_output_asset_into_parts, split_traced_file_into_parts,
};
use turbopack_browser::ecmascript::EcmascriptBrowserChunk;
use turbopack_core::{SOURCE_URL_PROTOCOL, output::OutputAsset};

use crate::analyze::{
    AnalyzeModuleIndex,
    membership::{OutputChunkModules, output_chunk_modules},
};

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub(super) struct AnalyzedChunkPart {
    /// Normalized source path, ready for the route's source tree.
    pub source: RcStr,
    pub size: u32,
    pub compressed_size: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub(super) struct EmittedChunk {
    pub asset: ResolvedVc<Box<dyn OutputAsset>>,
    pub is_browser_chunk: bool,
    pub membership: OutputChunkModules,
}

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub(super) struct AnalyzedOutputFile {
    pub filename: RcStr,
    pub chunk_parts: Vec<AnalyzedChunkPart>,
    /// `None` for traced files.
    pub emitted: Option<EmittedChunk>,
}

/// `None` for source maps and trace manifests, which are not reported.
#[turbo_tasks::value(transparent)]
pub(super) struct OptionAnalyzedOutputFile(Option<AnalyzedOutputFile>);

#[turbo_tasks::function]
pub(super) async fn analyze_output_file(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    module_index: Vc<AnalyzeModuleIndex>,
) -> Result<Vc<OptionAnalyzedOutputFile>> {
    let path = asset.path().await?;
    if !is_reported_file(&path) {
        return Ok(Vc::cell(None));
    }
    let filename = path.to_string_ref().await?;
    let membership = output_chunk_modules(asset, &filename, &*module_index.await?).await?;
    let chunk_parts = analyzed_chunk_parts(&split_output_asset_into_parts(*asset).await?).await?;
    Ok(Vc::cell(Some(AnalyzedOutputFile {
        filename,
        chunk_parts,
        emitted: Some(EmittedChunk {
            asset,
            is_browser_chunk: ResolvedVc::try_downcast_type::<EcmascriptBrowserChunk>(asset)
                .is_some(),
            membership,
        }),
    })))
}

#[turbo_tasks::function]
pub(super) async fn analyze_traced_file(
    path: FileSystemPath,
) -> Result<Vc<OptionAnalyzedOutputFile>> {
    if !is_reported_file(&path) {
        return Ok(Vc::cell(None));
    }
    Ok(Vc::cell(Some(AnalyzedOutputFile {
        filename: path.to_string_ref().await?,
        chunk_parts: analyzed_chunk_parts(&split_traced_file_into_parts(path).await?).await?,
        emitted: None,
    })))
}

fn is_reported_file(path: &FileSystemPath) -> bool {
    !(path.path.ends_with(".map") || path.path.ends_with(".nft.json"))
}

async fn analyzed_chunk_parts(chunk_parts: &[ChunkPart]) -> Result<Vec<AnalyzedChunkPart>> {
    let mut analyzed = Vec::with_capacity(chunk_parts.len());
    for part in chunk_parts {
        let size = part.real_size + part.unaccounted_size;
        analyzed.push(AnalyzedChunkPart {
            source: normalize_source(&part.source)?,
            size,
            compressed_size: part.get_compressed_size().await?.unwrap_or(size),
        });
    }
    Ok(analyzed)
}

fn normalize_source(raw: &str) -> Result<RcStr> {
    let decoded = urlencoding::decode(raw)?;
    Ok(
        if let Some(path) = decoded
            .strip_prefix(SOURCE_URL_PROTOCOL.as_str())
            .and_then(|rest| rest.strip_prefix("///"))
        {
            path.into()
        } else if decoded.starts_with('[') && decoded.contains("]/") {
            decoded.as_ref().into()
        } else {
            format!("[project]/{}", decoded.trim_start_matches("../")).into()
        },
    )
}
