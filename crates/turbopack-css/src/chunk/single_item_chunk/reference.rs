use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    chunk::{
        ChunkItem, ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc,
        ChunkingType, ChunkingTypeOptionVc,
    },
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
};

use super::chunk::SingleItemCssChunkVc;
use crate::chunk::CssChunkItemVc;

/// A reference to a [`SingleItemCssChunkVc`].
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct SingleItemCssChunkReference {
    context: ChunkingContextVc,
    item: CssChunkItemVc,
}

#[turbo_tasks::value_impl]
impl SingleItemCssChunkReferenceVc {
    /// Creates a new [`SingleItemCssChunkReferenceVc`].
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, item: CssChunkItemVc) -> Self {
        Self::cell(SingleItemCssChunkReference { context, item })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for SingleItemCssChunkReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(SingleItemCssChunkVc::new(self.context, self.item).into()).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SingleItemCssChunkReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "css single item chunk {}",
            self.item.asset_ident().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for SingleItemCssChunkReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Result<ChunkingTypeOptionVc> {
        Ok(ChunkingTypeOptionVc::cell(Some(ChunkingType::Separate)))
    }
}
