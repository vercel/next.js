use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkItem, ChunkType, ChunkingContext, ChunkingContextExt,
        ChunksData, ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph, chunk_group_info::ChunkGroup, module_batch::ChunkableModuleOrBatch,
    },
    output::{OutputAssetsReference, OutputAssetsWithReferenced},
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
                    references: ResolvedVc::cell(vec![]),
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
        .cell())
    }

    #[turbo_tasks::function]
    fn content_with_async_module_info(
        self: Vc<Self>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Vc<EcmascriptChunkItemContent> {
        if estimated {
            let code = formatdoc! {
                r#"
                    {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                        return Promise.all([].map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{}});
                    }});
                "#,
            };
            EcmascriptChunkItemContent {
                inner_code: code.into(),
                ..Default::default()
            }
            .cell()
        } else {
            self.content()
        }
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for AsyncLoaderChunkItem {
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group()
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
        let mut ident = self.module().ident();

        let this = self.await?;

        let nested_async_availability = this
            .chunking_context
            .is_nested_async_availability_enabled()
            .await?;

        let availability_ident = if *nested_async_availability {
            Some(self.chunks_data().hash().await?.to_string().into())
        } else {
            this.module.await?.availability_info.ident().await?
        };

        if let Some(availability_ident) = availability_ident {
            ident = ident.with_modifier(availability_ident)
        }

        Ok(ident)
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
