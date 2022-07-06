use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkGroupVc, ChunkableAssetVc, ChunkingContextVc},
};

use super::{EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemVc};

#[turbo_tasks::value(EcmascriptChunkItem, ValueToString)]
pub struct ChunkGroupLoaderChunkItem {
    asset: ChunkableAssetVc,
}

#[turbo_tasks::value_impl]
impl ChunkGroupLoaderChunkItemVc {
    #[turbo_tasks::function]
    pub fn new(asset: ChunkableAssetVc) -> Self {
        Self::cell(ChunkGroupLoaderChunkItem { asset })
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkGroupLoaderChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk loader for {}",
            self.asset.path().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupLoaderChunkItem {
    #[turbo_tasks::function]
    async fn content(
        &self,
        _chunk_content: EcmascriptChunkContextVc,
        context: ChunkingContextVc,
    ) -> Result<StringVc> {
        let chunk_group = ChunkGroupVc::from_asset(self.asset, context);
        let chunks = chunk_group.chunks().await?;
        let mut code = "TODO load chunk group".to_string();
        for chunk in chunks.iter() {
            let asset: AssetVc = (*chunk).into();
            let path = asset.path().await?;
            code += &format!("\n/{}", path.path);
        }
        Ok(StringVc::cell(code))
    }
}
