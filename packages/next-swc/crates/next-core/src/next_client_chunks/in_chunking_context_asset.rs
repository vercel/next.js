use anyhow::{bail, Result};
use turbo_tasks::{Value, Vc};
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContent},
        chunk::{availability_info::AvailabilityInfo, Chunk, ChunkableModule, ChunkingContext},
        ident::AssetIdent,
        module::Module,
        reference::AssetReferences,
    },
    ecmascript::chunk::EcmascriptChunkingContext,
    turbopack::ecmascript::chunk::{
        EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkPlaceable, EcmascriptExports,
    },
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("in chunking context".to_string())
}

#[turbo_tasks::value(shared)]
pub struct InChunkingContextAsset {
    pub asset: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl Module for InChunkingContextAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.asset.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::value_impl]
impl Asset for InChunkingContextAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.asset.content()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<AssetReferences> {
        self.asset.references()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for InChunkingContextAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        &self,
        _context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            self.chunking_context,
            self.asset,
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for InChunkingContextAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        &self,
        _context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<Box<dyn EcmascriptChunkItem>>> {
        let Some(chunking_context) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkingContext>>(self.chunking_context)
                .await?
        else {
            bail!("chunking context is not an EcmascriptChunkingContext")
        };
        Ok(self.asset.as_chunk_item(chunking_context))
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        self.asset.get_exports()
    }
}
