use anyhow::{anyhow, Result};
use indoc::formatdoc;
use turbo_tasks::{TryJoinIterExt, Value, Vc};
use turbopack_core::{
    chunk::{
        ChunkData, ChunkItem, ChunkItemExt, ChunkType, ChunkableModule, ChunkingContext,
        ChunkingContextExt, ChunksData,
    },
    ident::AssetIdent,
    module::Module,
    output::OutputAssets,
    reference::{ModuleReferences, SingleOutputAssetReference},
};

use crate::{
    async_chunk::module::AsyncLoaderModule,
    chunk::{
        data::EcmascriptChunkData, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkPlaceable, EcmascriptChunkType, EcmascriptChunkingContext,
    },
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
pub struct AsyncLoaderChunkItem {
    pub module: Vc<AsyncLoaderModule>,
    pub chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl AsyncLoaderChunkItem {
    #[turbo_tasks::function]
    pub(super) async fn chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let module = this.module.await?;
        Ok(this.chunking_context.chunk_group_assets(
            Vc::upcast(module.inner),
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
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let module = this.module.await?;

        let placeable = Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module.inner)
            .await?
            .ok_or_else(|| anyhow!("asset is not placeable in ecmascript chunk"))?;
        let id = &*placeable
            .as_chunk_item(Vc::upcast(this.chunking_context))
            .id()
            .await?;

        let chunks_data = self.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = formatdoc! {
            r#"
                __turbopack_export_value__((__turbopack_import__) => {{
                    return Promise.all({chunks:#}.map((chunk) => __turbopack_load__(chunk))).then(() => {{
                        return __turbopack_import__({id});
                    }});
                }});
            "#,
            chunks = StringifyJs(&chunks_data),
            id = StringifyJs(id),
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}

#[turbo_tasks::function]
fn chunk_reference_description() -> Vc<String> {
    Vc::cell("chunk".to_string())
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
            self.module.await?.availability_info.available_chunk_items()
        {
            ident = ident.with_modifier(Vc::cell(available_chunk_items.hash().await?.to_string()));
        }
        Ok(ident)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let chunks = self.chunks();

        Ok(Vc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    Vc::upcast(SingleOutputAssetReference::new(
                        chunk,
                        chunk_reference_description(),
                    ))
                })
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.module)
    }
}
