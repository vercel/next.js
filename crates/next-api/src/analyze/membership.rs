//! Enumerate emitted chunk modules against this snapshot's ordered module index.
//! Unknown wrappers and modules outside the graph must not be reported as exact.

use anyhow::Result;
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, Vc};
use turbopack_browser::ecmascript::EcmascriptBrowserChunk;
use turbopack_core::{
    chunk::{Chunk, ChunkItem},
    module::Module,
    output::OutputAsset,
};
use turbopack_css::chunk::CssChunk;
use turbopack_ecmascript::chunk::{EcmascriptChunk, EcmascriptChunkItemOrBatchWithAsyncInfo};

use crate::analyze::{AnalyzeModuleIndex, AnalyzeOutputFileCoverage, AnalyzeUnjoinedModule};

/// Join an emitted chunk item's module to the same snapshot used for modules.data.
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

/// Get exact constituent module identities only for chunk types whose items we
/// can enumerate. Empty rows marked unsupported must not be treated as empty chunks.
pub(super) async fn output_chunk_modules(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    filename: &str,
    module_index: &AnalyzeModuleIndex,
    output_file_index: u32,
) -> Result<(
    Vec<u32>,
    AnalyzeOutputFileCoverage,
    Vec<AnalyzeUnjoinedModule>,
)> {
    let mut indices = FxIndexSet::default();
    let mut unjoined = Vec::new();
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
        // Other emitted JS/CSS wrappers cannot enumerate their module members.
        enumerated = false;
    } else {
        return Ok((vec![], AnalyzeOutputFileCoverage::NotAChunk, vec![]));
    }
    let coverage = if enumerated && unjoined.is_empty() {
        AnalyzeOutputFileCoverage::Exact
    } else {
        AnalyzeOutputFileCoverage::Unsupported
    };
    Ok((indices.into_iter().collect(), coverage, unjoined))
}
