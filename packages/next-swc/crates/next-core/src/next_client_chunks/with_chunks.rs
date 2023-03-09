use anyhow::{bail, Result};
use indoc::formatdoc;
use serde_json::Value;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::stringify_js,
};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        Chunk, ChunkGroupVc, ChunkItem, ChunkItemVc, ChunkListReferenceVc, ChunkVc, ChunkableAsset,
        ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkableAssetVc, ChunkingContext,
        ChunkingContextVc, ChunkingType, ChunkingTypeOptionVc,
    },
    ident::AssetIdentVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
};
use turbopack_ecmascript::utils::stringify_js_pretty;

use super::in_chunking_context_asset::InChunkingContextAsset;

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("chunks".to_string())
}

#[turbo_tasks::value(shared)]
pub struct WithChunksAsset {
    pub asset: EcmascriptChunkPlaceableVc,
    pub server_root: FileSystemPathVc,
    pub chunking_context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl Asset for WithChunksAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.asset.ident().with_modifier(modifier())
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
impl WithChunksChunkItemVc {
    #[turbo_tasks::function]
    async fn chunk_list_path(self) -> Result<FileSystemPathVc> {
        let this = self.await?;
        Ok(this.inner_context.chunk_list_path(this.inner.ident()))
    }

    #[turbo_tasks::function]
    async fn chunk_group(self) -> Result<ChunkGroupVc> {
        let this = self.await?;
        let inner = this.inner.await?;
        Ok(ChunkGroupVc::from_asset(
            inner.asset.into(),
            this.inner_context,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WithChunksChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(self_vc: WithChunksChunkItemVc) -> Result<EcmascriptChunkItemContentVc> {
        let this = self_vc.await?;
        let inner = this.inner.await?;
        let group = self_vc.chunk_group();
        let chunks = group.chunks().await?;
        let server_root = inner.server_root.await?;
        let mut client_chunks = Vec::new();

        let chunk_list_path = self_vc.chunk_list_path().await?;
        let chunk_list_path = if let Some(path) = server_root.get_path_to(&chunk_list_path) {
            path
        } else {
            bail!("could not get path to chunk list");
        };

        for chunk_path in chunks.iter().map(|c| c.path()).try_join().await? {
            if let Some(path) = server_root.get_path_to(&chunk_path) {
                client_chunks.push(Value::String(path.to_string()));
            }
        }
        let module_id = stringify_js(&*inner.asset.as_chunk_item(this.inner_context).id().await?);
        Ok(EcmascriptChunkItemContent {
            inner_code: formatdoc! {
                r#"
                __turbopack_esm__({{
                    default: () => {},
                    chunks: () => {},
                    chunkListPath: () => {},
                }});
                "#,
                module_id,
                stringify_js_pretty(&client_chunks),
                stringify_js(&chunk_list_path),
            }
            .into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for WithChunksChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: WithChunksChunkItemVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let inner = this.inner.await?;
        Ok(AssetReferencesVc::cell(vec![
            WithChunksAssetReference {
                asset: InChunkingContextAsset {
                    asset: inner.asset,
                    chunking_context: this.inner_context,
                }
                .cell()
                .into(),
            }
            .cell()
            .into(),
            ChunkListReferenceVc::new(
                inner.server_root,
                self_vc.chunk_group(),
                self_vc.chunk_list_path(),
            )
            .into(),
        ]))
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
            self.asset.ident().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for WithChunksAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(self.asset).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for WithChunksAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::Separate))
    }
}
