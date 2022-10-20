use anyhow::Result;
use serde_json::Value;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::stringify_module_id,
};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        ChunkGroupVc, ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetReference,
        ChunkableAssetReferenceVc, ChunkableAssetVc, ChunkingContextVc, ChunkingType,
        ChunkingTypeOptionVc,
    },
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
};

use crate::next_client_component::in_chunking_context_asset::InChunkingContextAsset;

#[turbo_tasks::value(shared)]
pub struct WithChunksAsset {
    pub asset: EcmascriptChunkPlaceableVc,
    pub server_root: FileSystemPathVc,
    pub chunking_context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl Asset for WithChunksAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path().join("with-chunks.js")
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        unimplemented!()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        unimplemented!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for WithChunksAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: WithChunksAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.as_ecmascript_chunk_placeable()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithChunksAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self_vc: WithChunksAssetVc,
        context: ChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        let this = self_vc.await?;
        Ok(WithChunksChunkItem {
            context,
            inner_context: this.chunking_context,
            inner: self_vc,
        }
        .cell()
        .into())
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        // TODO This should be EsmExports
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct WithChunksChunkItem {
    context: ChunkingContextVc,
    inner_context: ChunkingContextVc,
    inner: WithChunksAssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for WithChunksChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{}/with-chunks.js",
            self.inner.await?.asset.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WithChunksChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let inner = self.inner.await?;
        let group = ChunkGroupVc::from_asset(inner.asset.into(), self.inner_context);
        let chunks = group.chunks().await?;
        let server_root = inner.server_root.await?;
        let mut client_chunks = Vec::new();
        for chunk_path in chunks.iter().map(|c| c.path()).try_join().await? {
            if let Some(path) = server_root.get_path_to(&chunk_path) {
                client_chunks.push(Value::String(path.to_string()));
            }
        }
        let module_id =
            stringify_module_id(&*inner.asset.as_chunk_item(self.inner_context).id().await?);
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "__turbopack_esm__({{
  default: () => {},
  chunks: () => chunks
}});
const chunks = {};
",
                module_id,
                Value::Array(client_chunks)
            ),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for WithChunksChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let inner = self.inner.await?;
        Ok(AssetReferencesVc::cell(vec![WithChunksAssetReference {
            asset: InChunkingContextAsset {
                asset: inner.asset,
                chunking_context: self.inner_context,
            }
            .cell()
            .into(),
        }
        .cell()
        .into()]))
    }
}

#[turbo_tasks::value]
struct WithChunksAssetReference {
    asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for WithChunksAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "referenced asset {}",
            self.asset.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for WithChunksAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.asset, Vec::new()).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for WithChunksAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, _context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::Separate))
    }
}
