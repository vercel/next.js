use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc, AssetsVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset,
        ChunkableAssetVc, ChunkingContext, ChunkingContextVc, EvaluatableAssetsVc,
    },
    ident::AssetIdentVc,
    introspect::{
        asset::{content_to_details, IntrospectableAssetVc},
        Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
};

use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptChunkingContextVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::StringifyJs,
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
    pub client_root: FileSystemPathVc,
    pub chunking_context: ChunkingContextVc,
    pub runtime_entries: Option<EvaluatableAssetsVc>,
}

#[turbo_tasks::value_impl]
impl ChunkGroupFilesAssetVc {
    #[turbo_tasks::function]
    async fn chunks(self) -> Result<AssetsVc> {
        let this = self.await?;
        Ok(
            if let Some(ecma) = EcmascriptModuleAssetVc::resolve_from(this.asset).await? {
                this.chunking_context.evaluated_chunk_group(
                    ecma.as_root_chunk(this.chunking_context),
                    this.runtime_entries
                        .unwrap_or_else(EvaluatableAssetsVc::empty)
                        .with_entry(ecma.into()),
                )
            } else {
                this.chunking_context
                    .chunk_group(this.asset.as_root_chunk(this.chunking_context))
            },
        )
    }
}

#[turbo_tasks::function]
fn chunk_group_chunk_reference_description() -> StringVc {
    StringVc::cell("chunk group chunk".to_string())
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
    async fn references(self_vc: ChunkGroupFilesAssetVc) -> Result<AssetReferencesVc> {
        let chunks = self_vc.chunks();

        Ok(AssetReferencesVc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    SingleAssetReferenceVc::new(chunk, chunk_group_chunk_reference_description())
                })
                .map(Into::into)
                .collect(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: ChunkGroupFilesAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(
            context,
            self_vc.as_ecmascript_chunk_placeable(),
            availability_info,
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self_vc: ChunkGroupFilesAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        let this = self_vc.await?;
        Ok(ChunkGroupFilesChunkItem {
            context,
            client_root: this.client_root,
            inner: self_vc,
            chunk: this.asset.as_chunk(
                context.into(),
                Value::new(AvailabilityInfo::Root {
                    current_availability_root: this.asset.into(),
                }),
            ),
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
    context: EcmascriptChunkingContextVc,
    client_root: FileSystemPathVc,
    inner: ChunkGroupFilesAssetVc,
    chunk: ChunkVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let chunks = self.inner.chunks();
        let client_root = self.client_root.await?;
        let chunks_paths = chunks
            .await?
            .iter()
            .map(|chunk| chunk.ident().path())
            .try_join()
            .await?;
        let chunks_paths: Vec<_> = chunks_paths
            .iter()
            .filter_map(|path| client_root.get_path_to(path))
            .collect();
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "__turbopack_export_value__({:#});\n",
                StringifyJs(&chunks_paths)
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
    fn references(&self) -> AssetReferencesVc {
        self.inner.references()
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
        for &chunk in self_vc.chunks().await?.iter() {
            children.insert((chunk_ty, IntrospectableAssetVc::new(chunk)));
        }
        children.insert((
            StringVc::cell("inner asset".to_string()),
            IntrospectableAssetVc::new(self_vc.await?.asset.into()),
        ));
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
