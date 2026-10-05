//! Enumerate emitted chunk modules against this snapshot's ordered module index.
//! Unknown wrappers and modules outside the graph must not be reported as exact.

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, Vc};
use turbopack_browser::ecmascript::EcmascriptBrowserChunk;
use turbopack_core::{
    chunk::{Chunk, ChunkItem},
    module::Module,
    output::OutputAsset,
};
use turbopack_css::chunk::CssChunk;
use turbopack_ecmascript::{
    async_chunk::module::AsyncLoaderModule,
    chunk::{EcmascriptChunk, EcmascriptChunkItemOrBatchWithAsyncInfo},
};
use turbopack_nodejs::EcmascriptBuildNodeChunk;

use crate::analyze::{AnalyzeModuleIndex, AnalyzeOutputFileCoverage, AnalyzeUnjoinedModule};

/// Join an emitted chunk item's module to the same snapshot used for modules.data.
async fn join_chunk_item(
    module: Vc<Box<dyn Module>>,
    module_index: &AnalyzeModuleIndex,
    output_file_index: u32,
    indices: &mut FxIndexSet<u32>,
    unjoined: &mut Vec<AnalyzeUnjoinedModule>,
) -> Result<()> {
    let module = module.to_resolved().await?;
    let loader_target_ident =
        if let Some(loader) = ResolvedVc::try_downcast_type::<AsyncLoaderModule>(module) {
            Some(loader.await?.inner.ident().to_string().owned().await?)
        } else {
            None
        };
    join_chunk_item_ident(
        module.ident().to_string().owned().await?,
        loader_target_ident,
        &module_index.by_ident,
        output_file_index,
        indices,
        unjoined,
    );
    Ok(())
}

fn join_chunk_item_ident(
    ident: RcStr,
    loader_target_ident: Option<RcStr>,
    by_ident: &FxHashMap<RcStr, u32>,
    output_file_index: u32,
    indices: &mut FxIndexSet<u32>,
    unjoined: &mut Vec<AnalyzeUnjoinedModule>,
) {
    let (lookup_ident, reason) = match &loader_target_ident {
        Some(target) => (target, "async_loader_target_missing"),
        None => (&ident, "outside_whole_app_module_graph"),
    };
    if let Some(&index) = by_ident.get(lookup_ident) {
        // A typed loader is synthetic membership, not another copy of its target.
        // Exclude it only after confirming its target in this snapshot's index.
        if loader_target_ident.is_none() {
            indices.insert(index);
        }
    } else {
        unjoined.push(AnalyzeUnjoinedModule {
            output_file_index,
            module_ident: ident,
            reason,
        });
    }
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
    let ecmascript_content = if let Some(browser_chunk) =
        ResolvedVc::try_downcast_type::<EcmascriptBrowserChunk>(asset)
    {
        let chunk: ResolvedVc<Box<dyn Chunk>> = browser_chunk.chunk().to_resolved().await?;
        let chunk = ResolvedVc::try_downcast_type::<EcmascriptChunk>(chunk)
            .ok_or_else(|| anyhow::anyhow!("browser output did not contain an ecmascript chunk"))?;
        Some(chunk.chunk_content())
    } else {
        ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunk>(asset)
            .map(|node_chunk| node_chunk.chunk_content())
    };
    if let Some(content) = ecmascript_content {
        let content = content.await?;
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

#[cfg(test)]
mod tests {
    use rustc_hash::FxHashMap;
    use turbo_rcstr::RcStr;
    use turbo_tasks::FxIndexSet;

    use crate::analyze::{AnalyzeUnjoinedModule, membership::join_chunk_item_ident};

    fn join(ident: &str, loader_target: Option<&str>) -> (Vec<u32>, Vec<AnalyzeUnjoinedModule>) {
        let by_ident = FxHashMap::from_iter([
            (RcStr::from("target"), 7),
            (RcStr::from("ordinary (async loader)"), 9),
        ]);
        let mut indices = FxIndexSet::default();
        let mut unjoined = Vec::new();
        join_chunk_item_ident(
            ident.into(),
            loader_target.map(RcStr::from),
            &by_ident,
            3,
            &mut indices,
            &mut unjoined,
        );
        (indices.into_iter().collect(), unjoined)
    }

    #[test]
    fn confirmed_async_loader_is_not_a_member() {
        let (indices, unjoined) = join("target (async loader)", Some("target"));
        assert!(indices.is_empty());
        assert!(unjoined.is_empty());
    }

    #[test]
    fn missing_async_loader_target_stays_visible() {
        let (indices, unjoined) = join("missing (async loader)", Some("missing"));
        assert!(indices.is_empty());
        assert_eq!(unjoined.len(), 1);
        assert_eq!(unjoined[0].output_file_index, 3);
        assert_eq!(unjoined[0].module_ident, "missing (async loader)");
        assert_eq!(unjoined[0].reason, "async_loader_target_missing");
    }

    #[test]
    fn ordinary_members_are_not_classified_by_ident_suffix() {
        let (indices, unjoined) = join("ordinary (async loader)", None);
        assert_eq!(indices, [9]);
        assert!(unjoined.is_empty());

        let (indices, unjoined) = join("unknown (async loader)", None);
        assert!(indices.is_empty());
        assert_eq!(unjoined.len(), 1);
        assert_eq!(unjoined[0].reason, "outside_whole_app_module_graph");
    }
}
