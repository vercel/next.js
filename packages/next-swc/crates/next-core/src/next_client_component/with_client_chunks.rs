use anyhow::Result;
use serde_json::Value;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
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
pub struct WithClientChunksAsset {
    pub asset: EcmascriptChunkPlaceableVc,
    pub server_root: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Asset for WithClientChunksAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path().join("with-client-chunks.js")
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
impl ChunkableAsset for WithClientChunksAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: WithClientChunksAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(
            context.with_layer("rsc"),
            self_vc.as_ecmascript_chunk_placeable(),
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithClientChunksAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: WithClientChunksAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        WithClientChunksChunkItem {
            context: context.with_layer("rsc"),
            inner: self_vc,
        }
        .cell()
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        // TODO This should be EsmExports
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct WithClientChunksChunkItem {
    context: ChunkingContextVc,
    inner: WithClientChunksAssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for WithClientChunksChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{}/with-client-chunks.js",
            self.inner.await?.asset.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WithClientChunksChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let inner = self.inner.await?;
        let group = ChunkGroupVc::from_asset(inner.asset.into(), self.context);
        let chunks = group.chunks().await?;
        let server_root = inner.server_root.await?;
        let mut client_chunks = Vec::new();
        for chunk in chunks.iter() {
            for reference in chunk.references().await?.iter() {
                let assets = &*reference.resolve_reference().primary_assets().await?;
                for asset in assets.iter() {
                    let path = &*asset.path().await?;

                    // only client chunks have an path from the server root
                    if let Some(path) = server_root.get_path_to(path) {
                        client_chunks.push(Value::String(path.to_string()));
                    }
                }
            }
        }
        let module_id = stringify_module_id(&*inner.asset.as_chunk_item(self.context).id().await?);
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "__turbopack_esm__({{
  default: () => __turbopack_import__({}),
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
impl ChunkItem for WithClientChunksChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let inner = self.inner.await?;
        Ok(AssetReferencesVc::cell(vec![
            WithClientChunksAssetReference {
                asset: InChunkingContextAsset {
                    asset: inner.asset,
                    chunking_context: self.context,
                }
                .cell()
                .into(),
            }
            .cell()
            .into(),
        ]))
    }
}

#[turbo_tasks::value]
struct WithClientChunksAssetReference {
    asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for WithClientChunksAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "local asset {}",
            self.asset.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for WithClientChunksAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.asset, Vec::new()).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for WithClientChunksAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, _context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::PlacedOrParallel))
    }
}
