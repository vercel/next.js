use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Value, Vc};
use turbopack_core::{
    chunk::{
        ChunkData, ChunkItem, ChunkItemExt, ChunkType, ChunkableModule, ChunkingContext,
        ChunkingContextExt, ChunksData,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    output::OutputAssets,
};

use crate::{
    async_chunk::module::AsyncLoaderModule,
    chunk::{
        data::EcmascriptChunkData, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkPlaceable, EcmascriptChunkType,
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
    pub(super) async fn chunks(&self) -> Result<Vc<OutputAssets>> {
        let module = self.module.await?;
        if let Some(chunk_items) = module.availability_info.available_modules() {
            if chunk_items.get(*module.inner).await?.is_some() {
                return Ok(Vc::cell(vec![]));
            }
        }
        Ok(self.chunking_context.chunk_group_assets(
            *ResolvedVc::upcast(module.inner),
            *self.module_graph,
            Value::new(module.availability_info),
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        Ok(ChunkData::from_assets(
            this.chunking_context.output_root(),
            self.chunks(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for AsyncLoaderChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let module = this.module.await?;

        let id = if let Some(placeable) =
            Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(*module.inner).await?
        {
            Some(
                placeable
                    .as_chunk_item(
                        *this.module_graph,
                        *ResolvedVc::upcast(this.chunking_context),
                    )
                    .id()
                    .await?,
            )
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

#[turbo_tasks::function]
fn chunk_reference_description() -> Vc<RcStr> {
    Vc::cell("chunk".into())
}

#[turbo_tasks::value_impl]
impl ChunkItem for AsyncLoaderChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn content_ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self.module.ident();
        if let Some(available_chunk_items) =
            self.module.await?.availability_info.available_modules()
        {
            ident = ident.with_modifier(Vc::cell(
                available_chunk_items.hash().await?.to_string().into(),
            ));
        }
        Ok(ident)
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        self.chunks()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
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
