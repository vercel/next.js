//! Enumerate emitted chunk modules and typed loader candidates against this
//! snapshot's ordered module index. Unknown wrappers remain unsupported.

use anyhow::Result;
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, Vc};
use turbopack_browser::ecmascript::EcmascriptBrowserChunk;
use turbopack_core::{
    chunk::{Chunk, ChunkItem},
    module::Module,
    output::{OutputAsset, OutputAssetsReference},
};
use turbopack_css::chunk::CssChunk;
use turbopack_ecmascript::{
    async_chunk::module::AsyncLoaderModule,
    chunk::{EcmascriptChunk, EcmascriptChunkItemOrBatchWithAsyncInfo},
    manifest::{chunk_asset::ManifestAsyncModule, loader_module::ManifestLoaderModule},
};

use crate::analyze::{
    AnalyzeModuleIndex, AnalyzeOutputFileCoverage, AnalyzeUnjoinedModule, ChunkLoadCandidate,
};

async fn join_chunk_item(
    module: Vc<Box<dyn Module>>,
    module_index: &AnalyzeModuleIndex,
    output_file_index: u32,
    indices: &mut FxIndexSet<u32>,
    unjoined: &mut Vec<AnalyzeUnjoinedModule>,
) -> Result<()> {
    let ident = module.ident().to_string().owned().await?;
    if let Some(&index) = module_index.by_ident.get(&ident) {
        indices.insert(index);
    } else {
        unjoined.push(AnalyzeUnjoinedModule {
            output_file_index,
            module_ident: ident,
            reason: "outside_whole_app_module_graph",
        });
    }
    Ok(())
}

/// Only a loader or manifest item supplies a typed async relationship;
/// generic output references do not establish an async load.
async fn chunk_item_load_candidates(
    item: ResolvedVc<Box<dyn turbopack_ecmascript::chunk::EcmascriptChunkItem>>,
    index: &AnalyzeModuleIndex,
    source: u32,
) -> Result<Vec<ChunkLoadCandidate>> {
    let module = item.module().to_resolved().await?;
    let kind = if ResolvedVc::try_downcast_type::<AsyncLoaderModule>(module).is_some()
        || ResolvedVc::try_downcast_type::<ManifestAsyncModule>(module).is_some()
    {
        "async"
    } else if ResolvedVc::try_downcast_type::<ManifestLoaderModule>(module).is_some() {
        "async_manifest"
    } else {
        return Ok(vec![]);
    };
    let ident = module.ident().to_string().owned().await?;
    let (trigger_module_index, unjoined_trigger_ident) = match index.by_ident.get(&ident) {
        Some(&i) => (Some(i), None),
        None => (None, Some(ident)),
    };
    let references = item.references().await?;
    let assets = references.assets.await?;
    Ok(assets
        .iter()
        .copied()
        .map(|target| ChunkLoadCandidate {
            source,
            target,
            kind: kind.into(),
            trigger_module_index,
            unjoined_trigger_ident: unjoined_trigger_ident.clone(),
        })
        .collect())
}

/// Enumerate known browser JS and CSS chunk items. Preserve unknown wrappers,
/// unjoined modules and unresolved references instead of claiming empty chunks.
pub(super) async fn output_chunk_modules(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    filename: &str,
    module_index: &AnalyzeModuleIndex,
    output_file_index: u32,
) -> Result<(
    Vec<u32>,
    AnalyzeOutputFileCoverage,
    Vec<AnalyzeUnjoinedModule>,
    Vec<ChunkLoadCandidate>,
    u32,
)> {
    let mut indices = FxIndexSet::default();
    let mut unjoined = Vec::new();
    let mut candidates = Vec::new();
    let mut enumerated = true;
    if let Some(browser_chunk) = ResolvedVc::try_downcast_type::<EcmascriptBrowserChunk>(asset) {
        let chunk: ResolvedVc<Box<dyn Chunk>> = browser_chunk.chunk().to_resolved().await?;
        let chunk = ResolvedVc::try_downcast_type::<EcmascriptChunk>(chunk)
            .ok_or_else(|| anyhow::anyhow!("browser output did not contain an ecmascript chunk"))?;
        let content = chunk.await?.content.await?;
        for chunk_item in &content.chunk_items {
            match chunk_item {
                EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
                    join_chunk_item(
                        item.chunk_item.module(),
                        module_index,
                        output_file_index,
                        &mut indices,
                        &mut unjoined,
                    )
                    .await?;
                    candidates.extend(
                        chunk_item_load_candidates(
                            item.chunk_item,
                            module_index,
                            output_file_index,
                        )
                        .await?,
                    );
                }
                EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                    for item in &batch.await?.chunk_items {
                        join_chunk_item(
                            item.chunk_item.module(),
                            module_index,
                            output_file_index,
                            &mut indices,
                            &mut unjoined,
                        )
                        .await?;
                        candidates.extend(
                            chunk_item_load_candidates(
                                item.chunk_item,
                                module_index,
                                output_file_index,
                            )
                            .await?,
                        );
                    }
                }
            }
        }
    } else if let Some(chunk) = ResolvedVc::try_downcast_type::<CssChunk>(asset) {
        let content = chunk.await?.content.await?;
        for chunk_item in &content.chunk_items {
            join_chunk_item(
                chunk_item.module(),
                module_index,
                output_file_index,
                &mut indices,
                &mut unjoined,
            )
            .await?;
        }
    } else if filename.ends_with(".js") || filename.ends_with(".css") {
        // Other emitted JS/CSS wrappers (evaluate/runtime entries, workers) still
        // record their generic references below, but their members are unknown.
        enumerated = false;
    } else {
        return Ok((
            vec![],
            AnalyzeOutputFileCoverage::NotAChunk,
            vec![],
            vec![],
            0,
        ));
    }
    let references = asset.references().await?;
    let unresolved_references = references.references.await?.len() as u32;
    for &target in references
        .assets
        .await?
        .iter()
        .chain(references.referenced_assets.await?.iter())
    {
        if target != asset {
            candidates.push(ChunkLoadCandidate {
                source: output_file_index,
                target,
                kind: "asset_reference".into(),
                trigger_module_index: None,
                unjoined_trigger_ident: None,
            });
        }
    }
    let coverage = if enumerated && unjoined.is_empty() {
        AnalyzeOutputFileCoverage::Exact
    } else {
        AnalyzeOutputFileCoverage::Unsupported
    };
    Ok((
        indices.into_iter().collect(),
        coverage,
        unjoined,
        candidates,
        unresolved_references,
    ))
}
