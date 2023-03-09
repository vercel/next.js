use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        Chunk, ChunkGroupVc, ChunkItem, ChunkItemVc, ChunkReferenceVc, ChunkVc, ChunkableAsset,
        ChunkableAssetVc, ChunkingContext, ChunkingContextVc,
    },
    ident::AssetIdentVc,
    introspect::{
        asset::{content_to_details, IntrospectableAssetVc},
        Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    reference::AssetReferencesVc,
};

use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkPlaceablesVc, EcmascriptChunkVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::stringify_js_pretty,
    EcmascriptModuleAssetVc,
};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("chunk group files".to_string())
}

/// An asset that exports a list of chunk URLs by putting the [asset] into a
/// ChunkGroup with the provided ChunkingContext.
#[turbo_tasks::value(shared)]
pub struct ChunkGroupFilesAsset {
    pub asset: ChunkableAssetVc,
    pub chunking_context: ChunkingContextVc,
    pub base_path: FileSystemPathVc,
    pub server_root: FileSystemPathVc,
    pub runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
}

#[turbo_tasks::value_impl]
impl ChunkGroupFilesAssetVc {
    #[turbo_tasks::function]
    async fn chunk_group(self) -> Result<ChunkGroupVc> {
        let this = self.await?;
        let chunk_group =
            if let Some(ecma) = EcmascriptModuleAssetVc::resolve_from(this.asset).await? {
                ChunkGroupVc::from_chunk(
                    ecma.as_evaluated_chunk(this.chunking_context, this.runtime_entries),
                )
            } else {
                ChunkGroupVc::from_asset(this.asset, this.chunking_context)
            };
        Ok(chunk_group)
    }

    #[turbo_tasks::function]
    async fn chunk_list_path(self) -> Result<FileSystemPathVc> {
        let this = &*self.await?;
        Ok(this.chunking_context.chunk_list_path(this.asset.ident()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ChunkGroupFilesAsset {
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
impl ChunkableAsset for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ChunkGroupFilesAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.as_ecmascript_chunk_placeable()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self_vc: ChunkGroupFilesAssetVc,
        context: ChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        let this = self_vc.await?;
        Ok(ChunkGroupFilesChunkItem {
            context,
            inner: self_vc,
            chunk: this.asset.as_chunk(context),
        }
        .cell()
        .into())
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct ChunkGroupFilesChunkItem {
    context: ChunkingContextVc,
    inner: ChunkGroupFilesAssetVc,
    chunk: ChunkVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let chunks = self.inner.chunk_group().chunks();
        let base_path = self.inner.await?.base_path.await?;
        let chunks_paths = chunks
            .await?
            .iter()
            .map(|chunk| chunk.path())
            .try_join()
            .await?;
        let chunks_paths: Vec<_> = chunks_paths
            .iter()
            .filter_map(|path| base_path.get_path_to(path))
            .collect();
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "__turbopack_export_value__({});\n",
                stringify_js_pretty(&chunks_paths)
            )
            .into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let chunk_group = self.inner.chunk_group();
        let chunks = chunk_group.chunks();

        let references: Vec<_> = chunks
            .await?
            .iter()
            .copied()
            .map(ChunkReferenceVc::new)
            .map(Into::into)
            .collect();

        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("chunk group files asset".to_string())
    }

    #[turbo_tasks::function]
    fn details(self_vc: ChunkGroupFilesAssetVc) -> StringVc {
        content_to_details(self_vc.content())
    }

    #[turbo_tasks::function]
    fn title(self_vc: ChunkGroupFilesAssetVc) -> StringVc {
        self_vc.ident().to_string()
    }

    #[turbo_tasks::function]
    async fn children(self_vc: ChunkGroupFilesAssetVc) -> Result<IntrospectableChildrenVc> {
        let mut children = IndexSet::new();
        let chunk_ty = StringVc::cell("chunk".to_string());
        for &chunk in self_vc.chunk_group().chunks().await?.iter() {
            children.insert((chunk_ty, IntrospectableAssetVc::new(chunk.into())));
        }
        children.insert((
            StringVc::cell("inner asset".to_string()),
            IntrospectableAssetVc::new(self_vc.await?.asset.into()),
        ));
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
