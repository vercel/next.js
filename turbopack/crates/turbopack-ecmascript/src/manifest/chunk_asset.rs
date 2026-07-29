use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkableModule, ChunkingContext, ChunkingContextExt,
        ChunksData, HmrChunkListSource, availability_info::AvailabilityInfo,
    },
    ident::AssetIdent,
    lazy_output_asset::LazyOutputAsset,
    module::{Module, ModuleSideEffects},
    module_graph::{
        ModuleGraph, chunk_group_info::ChunkGroup, module_batch::ChunkableModuleOrBatch,
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
};

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    runtime_functions::TURBOPACK_EXPORT_VALUE,
    utils::StringifyJs,
};

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

    /// A chunk list tracking the dynamic import's chunks for HMR, empty when HMR is disabled.
    ///
    /// Nothing else covers those chunks. An evaluated chunk group builds one chunk list for
    /// everything it can reach, but it reaches this dynamic import through the manifest chunk,
    /// which is a lazy boundary, so the traversal stops before the chunks behind it. Without a
    /// list of their own, an edit to the dynamically imported module has no subscription to
    /// arrive through and never reaches a component that is already mounted.
    ///
    /// This is generated behind the same boundary as the chunks it tracks, so it costs nothing
    /// until the dynamic import is actually reached.
    #[turbo_tasks::function]
    async fn hmr_chunk_list(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        if !*this
            .chunking_context
            .is_hot_module_replacement_enabled()
            .await?
        {
            return Ok(OutputAssets::empty());
        }
        Ok(this.chunking_context.hmr_chunk_list(
            self.ident(),
            *self.chunk_group().await?.assets,
            HmrChunkListSource::Dynamic,
        ))
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
                && *chunk_items.get(chunkable_module_or_batch.into()).await?
            {
                return Ok(OutputAssetsWithReferenced {
                    assets: ResolvedVc::cell(vec![]),
                    referenced_assets: ResolvedVc::cell(vec![]),
                    references: ResolvedVc::cell(vec![]),
                }
                .cell());
            }
        }
        let module_graph = ModuleGraph::isolated_async_entry(*ResolvedVc::upcast(self));
        let manifest_group = this
            .chunking_context
            .chunk_group_assets(
                self.ident(),
                ChunkGroup::Async(ResolvedVc::upcast(self)),
                module_graph,
                this.availability_info,
            )
            .await?;

        // Only the group's own assets become lazy boundaries. `referenced_assets` and `references`
        // are group-level and get expanded eagerly, so anything reachable through them would drag
        // the dynamic import's real chunk group back onto the eager path. They are empty for an
        // async group today; assert it rather than let a future change defeat the deferral in
        // silence.
        debug_assert!(
            manifest_group.referenced_assets.await?.is_empty()
                && manifest_group.references.await?.is_empty(),
            "a manifest chunk group must not have group-level references, or they would be \
             emitted eagerly"
        );

        let assets = manifest_group
            .assets
            .await?
            .iter()
            .map(async |asset| {
                Ok(ResolvedVc::upcast::<Box<dyn OutputAsset>>(
                    LazyOutputAsset::new(**asset).to_resolved().await?,
                ))
            })
            .try_join()
            .await?;
        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(assets),
            referenced_assets: manifest_group.referenced_assets,
            references: manifest_group.references,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub fn module_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    pub async fn content_ident(&self) -> Result<Vc<AssetIdent>> {
        let ident = self.inner.ident();
        Ok(
            if let Some(available_modules) = self.availability_info.available_modules() {
                ident
                    .owned()
                    .await?
                    .with_modifier(available_modules.hash().await?.to_string().into())
                    .into_vc()
            } else {
                ident
            },
        )
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        // The chunk list is loaded alongside the chunks it tracks, because loading it is what
        // registers the HMR subscription on the client.
        Ok(ChunkData::from_assets(
            this.chunking_context.output_root().owned().await?,
            self.chunk_group()
                .await?
                .assets
                .concatenate(self.hmr_chunk_list()),
        ))
    }
}

fn manifest_chunk_reference_description() -> RcStr {
    rcstr!("manifest chunk")
}

#[turbo_tasks::value_impl]
impl Module for ManifestAsyncModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .inner
            .ident()
            .owned()
            .await?
            .with_modifier(manifest_chunk_reference_description())
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ManifestAsyncModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let chunks_data = self.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = formatdoc! {
            r#"
                {TURBOPACK_EXPORT_VALUE}({:#});
            "#,
            StringifyJs(&chunks_data)
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunk_item_content_ident(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Vc<AssetIdent> {
        self.content_ident()
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        // Making the chunk list an output asset of this module is what gets it emitted, alongside
        // the target chunks, when the boundary is materialized.
        self.chunk_group()
            .concatenate(OutputAssetsWithReferenced::from_assets(
                self.hmr_chunk_list(),
            ))
    }
}
