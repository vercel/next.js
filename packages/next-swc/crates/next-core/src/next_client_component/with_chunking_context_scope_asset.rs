use anyhow::{Context, Result};
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
    Vc::cell("with chunking context scope".to_string())
}

#[turbo_tasks::value(shared)]
pub struct WithChunkingContextScopeAsset {
    pub asset: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    pub layer: String,
}

#[turbo_tasks::value_impl]
impl Module for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.asset.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::value_impl]
impl Asset for WithChunkingContextScopeAsset {
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
impl ChunkableModule for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        &self,
        context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            context.with_layer(self.layer.clone()),
            self.asset,
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        &self,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<Box<dyn EcmascriptChunkItem>>> {
        Ok(self.asset.as_chunk_item(
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkingContext>>(
                context.with_layer(self.layer.clone()),
            )
            .await?
            .context(
                "ChunkingContext::with_layer should not return a different kind of chunking \
                 context",
            )?,
        ))
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        self.asset.get_exports()
    }
}
