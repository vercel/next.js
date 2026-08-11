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
    module::{Module, ModuleSideEffects},
    module_graph::{
        ModuleGraph, chunk_group_info::ChunkGroup, module_batch::ChunkableModuleOrBatch,
    },
    output::{OutputAssets, OutputAssetsWithReferenced},
};

use crate::{
    async_chunk::proxy::LazyCompilationProxyModule,
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
        // The manifest module is synthesized while chunking, so it is not a member of
        // `this.module_graph` and has to be placed in a graph of its own.
        Ok(this.chunking_context.chunk_group_assets(
            self.ident(),
            ChunkGroup::Async(ResolvedVc::upcast(self)),
            ModuleGraph::isolated_async_entry(*ResolvedVc::upcast(self)),
            this.availability_info,
        ))
    }

    /// Without a chunk list of its own, modules that are only reachable through this dynamic
    /// import never receive updates.
    #[turbo_tasks::function]
    async fn hmr_chunk_list(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        Ok(this.chunking_context.hmr_chunk_list(
            self.ident(),
            *self.chunk_group().await?.assets,
            HmrChunkListSource::Dynamic,
        ))
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
        let ident = self
            .inner
            .ident()
            .owned()
            .await?
            .with_modifier(manifest_chunk_reference_description());
        // Requesting the manifest chunk of a lazily compiled dynamic import is what activates it,
        // so the key has to survive into the file name, and the path is the only part of an ident
        // that appears there literally. It must not move to the proxy's own ident, which also
        // names chunks that ship with the entrypoint and would activate the import on page load.
        let Some(proxy) = ResolvedVc::try_downcast_type::<LazyCompilationProxyModule>(self.inner)
        else {
            return Ok(ident.into_vc());
        };
        Ok(ident
            .rename_as(&format!("*.{}.js", proxy.await?.key))
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
        self.chunk_group()
            .concatenate(OutputAssetsWithReferenced::from_assets(
                self.hmr_chunk_list(),
            ))
    }
}
