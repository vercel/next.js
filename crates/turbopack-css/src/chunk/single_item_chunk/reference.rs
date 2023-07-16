use anyhow::Result;
use turbo_tasks::{ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkItem, ChunkingContext},
    reference::AssetReference,
    resolve::ResolveResult,
};

use super::chunk::SingleItemCssChunk;
use crate::chunk::CssChunkItem;

/// A reference to a [`Vc<SingleItemCssChunk>`].
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct SingleItemCssChunkReference {
    context: Vc<Box<dyn ChunkingContext>>,
    item: Vc<Box<dyn CssChunkItem>>,
}

#[turbo_tasks::value_impl]
impl SingleItemCssChunkReference {
    /// Creates a new [`Vc<SingleItemCssChunkReference>`].
    #[turbo_tasks::function]
    pub fn new(context: Vc<Box<dyn ChunkingContext>>, item: Vc<Box<dyn CssChunkItem>>) -> Vc<Self> {
        Self::cell(SingleItemCssChunkReference { context, item })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for SingleItemCssChunkReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ResolveResult> {
        ResolveResult::asset(Vc::upcast(SingleItemCssChunk::new(self.context, self.item))).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SingleItemCssChunkReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "css single item chunk {}",
            self.item.asset_ident().to_string().await?
        )))
    }
}
