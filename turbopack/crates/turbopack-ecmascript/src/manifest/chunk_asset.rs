use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkableModule, ChunkingContext, ChunkingContextExt, availability_info::AvailabilityInfo,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph, chunk_group_info::ChunkGroup, module_batch::ChunkableModuleOrBatch,
    },
    output::OutputAssetsWithReferenced,
    reference::{ModuleReferences, SingleOutputAssetReference},
};

use super::chunk_item::ManifestChunkItem;
use crate::chunk::{EcmascriptChunkPlaceable, EcmascriptExports};

/// The manifest module is deferred until requested by the manifest loader
/// item when the dynamic `import()` expression is reached.
///
/// Its responsibility is to generate a Promise that will resolve only after
/// all the necessary chunks needed by the dynamic import are loaded by the client.
///
/// Splitting the dynamic import into a quickly generate-able manifest loader
/// item and a slow-to-generate manifest chunk allows for faster incremental
/// compilation. The traversal won't be performed until the dynamic import is
/// actually reached, instead of eagerly as part of the chunk that the dynamic
/// import appears in.
#[turbo_tasks::value(shared)]
pub struct ManifestAsyncModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_impl]
impl ManifestAsyncModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        availability_info: AvailabilityInfo,
    ) -> Vc<Self> {
        Self::cell(ManifestAsyncModule {
            inner: module,
            module_graph,
            chunking_context,
            availability_info,
        })
    }

    #[turbo_tasks::function]
    pub(super) fn chunk_group(&self) -> Vc<OutputAssetsWithReferenced> {
        self.chunking_context.chunk_group_assets(
            self.inner.ident(),
            ChunkGroup::Async(ResolvedVc::upcast(self.inner)),
            *self.module_graph,
            self.availability_info,
        )
    }

    #[turbo_tasks::function]
    pub async fn manifest_chunk_group(
        self: ResolvedVc<Self>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        if let Some(chunk_items) = this.availability_info.available_modules() {
            let inner_module = ResolvedVc::upcast(this.inner);
            let batches = this
                .module_graph
                .module_batches(this.chunking_context.batching_config())
                .await?;
            let module_or_batch = batches.get_entry(inner_module).await?;
            if let Some(chunkable_module_or_batch) =
                ChunkableModuleOrBatch::from_module_or_batch(module_or_batch)
                && *chunk_items.get(chunkable_module_or_batch).await?
            {
                return Ok(OutputAssetsWithReferenced {
                    assets: ResolvedVc::cell(vec![]),
                    referenced_assets: ResolvedVc::cell(vec![]),
                }
                .cell());
            }
        }
        Ok(this.chunking_context.chunk_group_assets(
            self.ident(),
            ChunkGroup::Async(ResolvedVc::upcast(self)),
            *this.module_graph,
            this.availability_info,
        ))
    }

    #[turbo_tasks::function]
    pub fn module_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    pub async fn content_ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self.inner.ident();
        if let Some(available_modules) = self.availability_info.available_modules() {
            ident = ident.with_modifier(available_modules.hash().await?.to_string().into());
        }
        Ok(ident)
    }
}

fn manifest_chunk_reference_description() -> RcStr {
    rcstr!("manifest chunk")
}

#[turbo_tasks::value_impl]
impl Module for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.inner
            .ident()
            .with_modifier(manifest_chunk_reference_description())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let assets = self.chunk_group().all_assets().await?;

        Ok(Vc::cell(
            assets
                .into_iter()
                .copied()
                .map(|chunk| async move {
                    Ok(ResolvedVc::upcast(
                        SingleOutputAssetReference::new(
                            *chunk,
                            manifest_chunk_reference_description(),
                        )
                        .to_resolved()
                        .await?,
                    ))
                })
                .try_join()
                .await?,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        panic!("content() should not be called");
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            ManifestChunkItem {
                chunking_context,
                manifest: self,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}
