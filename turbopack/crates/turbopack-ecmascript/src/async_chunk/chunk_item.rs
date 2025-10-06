use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{
        ChunkData, ChunkItem, ChunkType, ChunkingContext, ChunkingContextExt, ChunksData,
        ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph, chunk_group_info::ChunkGroup, module_batch::ChunkableModuleOrBatch,
    },
    output::{OutputAssets, OutputAssetsWithReferenced},
};

use crate::{
    async_chunk::module::AsyncLoaderModule,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, data::EcmascriptChunkData,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_LOAD},
    utils::{StringifyJs, StringifyModuleId},
};

#[turbo_tasks::value(shared)]
pub struct AsyncLoaderChunkItem {
    pub module: ResolvedVc<AsyncLoaderModule>,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl AsyncLoaderChunkItem {
    #[turbo_tasks::function]
    pub(super) async fn chunk_group(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let module = self.module.await?;
        if let Some(chunk_items) = module.availability_info.available_modules() {
            let inner_module = ResolvedVc::upcast(module.inner);
            let batches = self
                .module_graph
                .module_batches(self.chunking_context.batching_config())
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
        Ok(self.chunking_context.chunk_group_assets(
            module.inner.ident(),
            ChunkGroup::Async(ResolvedVc::upcast(module.inner)),
            *self.module_graph,
            module.availability_info,
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        Ok(ChunkData::from_assets(
            this.chunking_context.output_root().owned().await?,
            *self.chunk_group().await?.assets,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for AsyncLoaderChunkItem {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let module = this.module.await?;

        let id = if let Some(placeable) =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module.inner)
        {
            Some(placeable.chunk_item_id(*this.chunking_context).await?)
        } else {
            None
        };
        let id = id.as_deref();

        let chunks_data = self.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = match (id, chunks_data.is_empty()) {
            (Some(id), true) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.resolve().then(() => {{
                                return parentImport({id});
                            }});
                        }});
                    "#,
                    id = StringifyModuleId(id),
                }
            }
            (Some(id), false) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.all({chunks:#}.map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{
                                return parentImport({id});
                            }});
                        }});
                    "#,
                    chunks = StringifyJs(&chunks_data),
                    id = StringifyModuleId(id),
                }
            }
            (None, true) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.resolve();
                        }});
                    "#,
                }
            }
            (None, false) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.all({chunks:#}.map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{}});
                        }});
                    "#,
                    chunks = StringifyJs(&chunks_data),
                }
            }
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for AsyncLoaderChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn content_ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        let ident = self.module().ident();

        Ok(ident.with_modifier(self.chunks_data().hash().await?.to_string().into()))
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        self.chunk_group().all_assets()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }
}
