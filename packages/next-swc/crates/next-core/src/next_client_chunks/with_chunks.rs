use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::{
        tasks::{TryJoinIterExt, Value},
        tasks_fs::rope::RopeBuilder,
    },
    turbopack::{
        core::{
            asset::{Asset, AssetContent},
            chunk::{
                availability_info::AvailabilityInfo, Chunk, ChunkData, ChunkGroupReference,
                ChunkItem, ChunkableModule, ChunkingContext, ChunksData,
            },
            ident::AssetIdent,
            module::Module,
            output::OutputAssets,
            reference::AssetReferences,
        },
        ecmascript::{
            chunk::{
                EcmascriptChunk, EcmascriptChunkData, EcmascriptChunkItem,
                EcmascriptChunkItemContent, EcmascriptChunkItemExt, EcmascriptChunkPlaceable,
                EcmascriptChunkingContext, EcmascriptExports,
            },
            utils::StringifyJs,
        },
    },
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("chunks".to_string())
}

#[turbo_tasks::value]
pub struct WithChunksAsset {
    asset: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl WithChunksAsset {
    /// Create a new [`WithChunksAsset`].
    ///
    /// # Arguments
    ///
    /// * `asset` - The asset to wrap.
    /// * `chunking_context` - The chunking context of the asset.
    #[turbo_tasks::function]
    pub fn new(
        asset: Vc<Box<dyn EcmascriptChunkPlaceable>>,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<WithChunksAsset> {
        WithChunksAsset::cell(WithChunksAsset {
            asset,
            chunking_context,
        })
    }

    #[turbo_tasks::function]
    async fn entry_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn Chunk>>> {
        let this = self.await?;
        Ok(this.asset.as_root_chunk(Vc::upcast(this.chunking_context)))
    }

    #[turbo_tasks::function]
    async fn chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        Ok(this.chunking_context.chunk_group(self.entry_chunk()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for WithChunksAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.asset.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        unimplemented!()
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<AssetReferences>> {
        let this = self.await?;
        let entry_chunk = self.entry_chunk();

        Ok(Vc::cell(vec![Vc::upcast(ChunkGroupReference::new(
            Vc::upcast(this.chunking_context),
            entry_chunk,
        ))]))
    }
}

#[turbo_tasks::value_impl]
impl Module for WithChunksAsset {}

#[turbo_tasks::value_impl]
impl ChunkableModule for WithChunksAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            context,
            Vc::upcast(self),
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithChunksAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<Box<dyn EcmascriptChunkItem>>> {
        Ok(Vc::upcast(
            WithChunksChunkItem {
                context,
                inner: self,
            }
            .cell(),
        ))
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        // TODO This should be EsmExports
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct WithChunksChunkItem {
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
    inner: Vc<WithChunksAsset>,
}

#[turbo_tasks::value_impl]
impl WithChunksChunkItem {
    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        let inner = this.inner.await?;
        Ok(ChunkData::from_assets(
            inner.chunking_context.output_root(),
            this.inner.chunks(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WithChunksChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let inner = this.inner.await?;

        let chunks_data = self.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let module_id = &*inner
            .asset
            .as_chunk_item(inner.chunking_context)
            .id()
            .await?;

        let mut code = RopeBuilder::default();

        writedoc!(
            code,
            r#"
            __turbopack_esm__({{
                default: () => {},
                chunks: () => chunks,
            }});
            const chunks = {:#};
            "#,
            StringifyJs(&module_id),
            StringifyJs(&chunks_data),
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.build(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for WithChunksChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<AssetReferences>> {
        let mut references = self.await?.inner.references().await?.clone_value();

        for chunk_data in &*self.chunks_data().await? {
            references.extend(chunk_data.references().await?.iter().copied());
        }

        Ok(Vc::cell(references))
    }
}
