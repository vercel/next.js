use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContent},
        chunk::{ChunkableModule, ChunkingContext},
        ident::AssetIdent,
        module::Module,
        reference::ModuleReferences,
    },
    turbopack::ecmascript::chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
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

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.asset.references()
    }
}

#[turbo_tasks::value_impl]
impl Asset for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.asset.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_binding::turbopack::core::chunk::ChunkItem>> {
        Vc::upcast(ChunkableModule::as_chunk_item(
            self.asset,
            chunking_context.with_layer(self.layer.clone()),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        self.asset.get_exports()
    }
}
