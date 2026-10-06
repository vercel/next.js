//! Enumerate emitted chunk modules and typed loader candidates against this
//! snapshot's ordered module index. Unknown wrappers remain unsupported.

use anyhow::{Context, Result, anyhow};
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, Vc};
use turbopack_browser::ecmascript::{
    EcmascriptBrowserChunk, EcmascriptBrowserRuntimeChunk, EcmascriptBrowserSingleEntryChunk,
    EcmascriptBrowserWorkerEntrypoint,
};
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
    single_file_ecmascript_output::SingleFileEcmascriptOutput,
};
use turbopack_nodejs::{EcmascriptBuildNodeChunk, EcmascriptBuildNodeRuntimeChunk};

use crate::analyze::{AnalyzeModuleIndex, AnalyzeOutputFileCoverage, ChunkLoadCandidate};

async fn insert_chunk_item(
    module: Vc<Box<dyn Module>>,
    module_index: &AnalyzeModuleIndex,
    indices: &mut FxIndexSet<u32>,
    async_loaders: &mut FxIndexSet<u32>,
) -> Result<()> {
    let module = module.to_resolved().await?;
    let loader_target_ident =
        if let Some(loader) = ResolvedVc::try_downcast_type::<AsyncLoaderModule>(module) {
            Some(loader.await?.inner.ident().to_string().owned().await?)
        } else {
            None
        };
    insert_chunk_item_ident(
        module.ident().to_string().owned().await?,
        loader_target_ident,
        &module_index.by_ident,
        indices,
        async_loaders,
    )
}

fn insert_chunk_item_ident(
    ident: RcStr,
    loader_target_ident: Option<RcStr>,
    by_ident: &FxHashMap<RcStr, u32>,
    indices: &mut FxIndexSet<u32>,
    async_loaders: &mut FxIndexSet<u32>,
) -> Result<()> {
    let lookup_ident = loader_target_ident.as_ref().unwrap_or(&ident);
    let &index = by_ident.get(lookup_ident).ok_or_else(|| {
        if loader_target_ident.is_some() {
            anyhow!(
                "Async loader {ident} target {lookup_ident} is missing from the analyzer module \
                 index"
            )
        } else {
            anyhow!("Chunk module {ident} is missing from the analyzer module index")
        }
    })?;
    if loader_target_ident.is_some() {
        async_loaders.insert(index);
    } else {
        indices.insert(index);
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
    let trigger = if let Some(loader) = ResolvedVc::try_downcast_type::<AsyncLoaderModule>(module) {
        loader.await?.inner
    } else if let Some(manifest) = ResolvedVc::try_downcast_type::<ManifestAsyncModule>(module) {
        manifest.await?.inner
    } else if let Some(loader) = ResolvedVc::try_downcast_type::<ManifestLoaderModule>(module) {
        loader.await?.manifest.await?.inner
    } else {
        return Ok(vec![]);
    };
    // Use the same typed target as the module graph's async dependency, including
    // next/dynamic entry wrappers. Synthetic loader identities do not join it.
    let ident = trigger.ident().to_string().owned().await?;
    let trigger_module_index = *index.by_ident.get(&ident).ok_or_else(|| {
        anyhow!("Async group trigger {ident} is missing from the analyzer module index")
    })?;
    let references = item.references().await?;
    let assets = references.assets.await?;
    Ok(assets
        .iter()
        .copied()
        .map(|target| ChunkLoadCandidate {
            source,
            target,
            trigger_module_index,
        })
        .collect())
}

/// Enumerate known browser/Node.js JS and CSS chunk items; unknown wrappers remain unsupported.
pub(super) async fn output_chunk_modules(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    filename: &str,
    module_index: &AnalyzeModuleIndex,
    output_file_index: u32,
) -> Result<(
    Vec<u32>,
    AnalyzeOutputFileCoverage,
    Vec<ChunkLoadCandidate>,
    Vec<u32>,
)> {
    if ResolvedVc::try_downcast_type::<EcmascriptBrowserRuntimeChunk>(asset).is_some()
        || ResolvedVc::try_downcast_type::<EcmascriptBuildNodeRuntimeChunk>(asset).is_some()
        || ResolvedVc::try_downcast_type::<SingleFileEcmascriptOutput>(asset).is_some()
        || ResolvedVc::try_downcast_type::<EcmascriptBrowserSingleEntryChunk>(asset).is_some()
        || ResolvedVc::try_downcast_type::<EcmascriptBrowserWorkerEntrypoint>(asset).is_some()
    {
        return Ok((vec![], AnalyzeOutputFileCoverage::NotAChunk, vec![], vec![]));
    }
    let mut indices = FxIndexSet::default();
    let mut async_loaders = FxIndexSet::default();
    let mut candidates = Vec::new();
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
                    insert_chunk_item(
                        item.chunk_item.module(),
                        module_index,
                        &mut indices,
                        &mut async_loaders,
                    )
                    .await
                    .with_context(|| format!("Analyzing output {filename}"))?;
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
                        insert_chunk_item(
                            item.chunk_item.module(),
                            module_index,
                            &mut indices,
                            &mut async_loaders,
                        )
                        .await
                        .with_context(|| format!("Analyzing output {filename}"))?;
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
            insert_chunk_item(
                chunk_item.module(),
                module_index,
                &mut indices,
                &mut async_loaders,
            )
            .await
            .with_context(|| format!("Analyzing output {filename}"))?;
        }
    } else if filename.ends_with(".js") || filename.ends_with(".css") {
        // Other emitted JS/CSS wrappers cannot enumerate their module members.
        enumerated = false;
    } else {
        return Ok((vec![], AnalyzeOutputFileCoverage::NotAChunk, vec![], vec![]));
    }
    let coverage = if enumerated {
        AnalyzeOutputFileCoverage::Exact
    } else {
        AnalyzeOutputFileCoverage::Unsupported
    };
    Ok((
        indices.into_iter().collect(),
        coverage,
        candidates,
        async_loaders.into_iter().collect(),
    ))
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use rustc_hash::FxHashMap;
    use turbo_rcstr::RcStr;
    use turbo_tasks::FxIndexSet;

    use crate::analyze::membership::insert_chunk_item_ident;

    fn insert(ident: &str, loader_target: Option<&str>) -> Result<(Vec<u32>, Vec<u32>)> {
        let by_ident = FxHashMap::from_iter([
            (RcStr::from("target"), 7),
            (RcStr::from("ordinary (async loader)"), 9),
        ]);
        let mut indices = FxIndexSet::default();
        let mut async_loaders = FxIndexSet::default();
        insert_chunk_item_ident(
            ident.into(),
            loader_target.map(RcStr::from),
            &by_ident,
            &mut indices,
            &mut async_loaders,
        )?;
        Ok((
            indices.into_iter().collect(),
            async_loaders.into_iter().collect(),
        ))
    }

    #[test]
    fn confirmed_async_loader_is_not_a_member() {
        let (indices, async_loaders) = insert("target (async loader)", Some("target")).unwrap();
        assert!(indices.is_empty());
        assert_eq!(async_loaders, [7]);
    }

    #[test]
    fn missing_async_loader_target_is_an_error() {
        let error = insert("missing (async loader)", Some("missing")).unwrap_err();
        assert_eq!(
            error.to_string(),
            "Async loader missing (async loader) target missing is missing from the analyzer \
             module index"
        );
    }

    #[test]
    fn ordinary_members_are_not_classified_by_ident_suffix() {
        let (indices, async_loaders) = insert("ordinary (async loader)", None).unwrap();
        assert_eq!(indices, [9]);
        assert!(async_loaders.is_empty());

        let error = insert("unknown (async loader)", None).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("Chunk module unknown (async loader)")
        );
    }
}
