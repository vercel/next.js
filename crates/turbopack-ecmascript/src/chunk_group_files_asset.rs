use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString};
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemVc, ChunkVc, ChunkableModule,
        ChunkableModuleVc, ChunkingContext, ChunkingContextVc, EvaluatableAssetsVc,
    },
    ident::AssetIdentVc,
    introspect::{
        asset::{content_to_details, IntrospectableAssetVc},
        Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    module::{Module, ModuleVc},
    output::OutputAssetsVc,
    reference::{AssetReferenceVc, AssetReferencesVc, SingleAssetReferenceVc},
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
    pub module: ChunkableModuleVc,
    pub client_root: FileSystemPathVc,
    pub chunking_context: ChunkingContextVc,
    pub runtime_entries: Option<EvaluatableAssetsVc>,
}

#[turbo_tasks::function]
fn module_description() -> StringVc {
    StringVc::cell("module".to_string())
}

#[turbo_tasks::function]
fn runtime_entry_description() -> StringVc {
    StringVc::cell("runtime entry".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.module.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        AssetContentVc::from(File::from("// Chunking only content".to_string()))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let mut references: Vec<AssetReferenceVc> =
            vec![SingleAssetReferenceVc::new(self.module.into(), module_description()).into()];

        if let Some(runtime_entries) = self.runtime_entries {
            references.extend(runtime_entries.await?.iter().map(|&entry| {
                let reference: AssetReferenceVc =
                    SingleAssetReferenceVc::new(entry.into(), runtime_entry_description()).into();
                reference
            }));
        }

        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Module for ChunkGroupFilesAsset {}

#[turbo_tasks::value_impl]
impl ChunkableModule for ChunkGroupFilesAsset {
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
        chunking_context: EcmascriptChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        let this = self_vc.await?;
        Ok(ChunkGroupFilesChunkItem {
            chunking_context,
            client_root: this.client_root,
            inner: self_vc,
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
    chunking_context: EcmascriptChunkingContextVc,
    client_root: FileSystemPathVc,
    inner: ChunkGroupFilesAssetVc,
}

#[turbo_tasks::value_impl]
impl ChunkGroupFilesChunkItemVc {
    #[turbo_tasks::function]
    async fn chunks(self) -> Result<OutputAssetsVc> {
        let this = self.await?;
        let module = this.inner.await?;
        let chunks =
            if let Some(ecma) = EcmascriptModuleAssetVc::resolve_from(module.module).await? {
                module.chunking_context.evaluated_chunk_group(
                    ecma.as_root_chunk(module.chunking_context),
                    module
                        .runtime_entries
                        .unwrap_or_else(EvaluatableAssetsVc::empty)
                        .with_entry(ecma.into()),
                )
            } else {
                module
                    .chunking_context
                    .chunk_group(module.module.as_root_chunk(module.chunking_context))
            };
        Ok(chunks)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(self_vc: ChunkGroupFilesChunkItemVc) -> Result<EcmascriptChunkItemContentVc> {
        let chunks = self_vc.chunks();
        let this = self_vc.await?;
        let module = this.inner.await?;
        let client_root = module.client_root.await?;
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

#[turbo_tasks::function]
fn chunk_group_chunk_reference_description() -> StringVc {
    StringVc::cell("chunk group chunk".to_string())
}

#[turbo_tasks::value_impl]
impl ChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: ChunkGroupFilesChunkItemVc) -> Result<AssetReferencesVc> {
        let chunks = self_vc.chunks();

        Ok(AssetReferencesVc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    SingleAssetReferenceVc::new(
                        chunk.into(),
                        chunk_group_chunk_reference_description(),
                    )
                })
                .map(Into::into)
                .collect(),
        ))
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
        children.insert((
            StringVc::cell("inner asset".to_string()),
            IntrospectableAssetVc::new(self_vc.await?.module.into()),
        ));
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
