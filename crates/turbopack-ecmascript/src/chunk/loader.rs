use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::ChunkableAssetVc,
    reference::AssetReferenceVc,
};

use super::{
    EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemVc, EcmascriptChunkPlaceable,
    EcmascriptChunkPlaceableVc,
};

#[turbo_tasks::value(Asset, EcmascriptChunkPlaceable)]
struct ChunkGroupLoaderAsset {
    asset: ChunkableAssetVc,
}

#[turbo_tasks::value_impl]
impl Asset for ChunkGroupLoaderAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<Vec<AssetReferenceVc>> {
        todo!()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ChunkGroupLoaderAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(&self, context: EcmascriptChunkContextVc) -> EcmascriptChunkItemVc {
        ChunkGroupLoaderChunkItemVc::slot(ChunkGroupLoaderChunkItem {
            context,
            asset: self.asset,
        })
        .into()
    }
}

#[turbo_tasks::value(EcmascriptChunkItem)]
struct ChunkGroupLoaderChunkItem {
    context: EcmascriptChunkContextVc,
    asset: ChunkableAssetVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupLoaderChunkItem {}

#[turbo_tasks::value_impl]
impl Asset for ChunkGroupLoaderChunkItem {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        let asset: AssetVc = self.asset.into();
        asset.path().join("chunk-loader.turbopack")
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<FileContentVc> {
        let chunk_group = self.context.chunking_context().as_chunk_group(self.asset);
        let chunks = chunk_group.chunks().await?;
        let mut code = "TODO load chunk group".to_string();
        for chunk in chunks.iter() {
            let asset: AssetVc = (*chunk).into();
            let path = asset.path().await?;
            code += &format!("\n/{}", path.path);
        }
        Ok(FileContent::Content(File::from_source(code)).into())
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<Vec<AssetReferenceVc>> {
        todo!()
    }
}
