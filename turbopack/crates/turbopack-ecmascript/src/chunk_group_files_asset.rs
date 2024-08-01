use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{RcStr, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkType, ChunkableModule,
        ChunkingContext, ChunkingContextExt, EvaluatableAssets,
    },
    ident::AssetIdent,
    introspect::{
        module::IntrospectableModule, utils::content_to_details, Introspectable,
        IntrospectableChildren,
    },
    module::Module,
    output::{OutputAsset, OutputAssets},
    reference::{
        ModuleReference, ModuleReferences, SingleModuleReference, SingleOutputAssetReference,
    },
};

use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    utils::StringifyJs,
    EcmascriptModuleAsset,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("chunk group files".into())
}

/// An asset that exports a list of chunk URLs by putting the [asset] into a
/// ChunkGroup with the provided ChunkingContext.
#[turbo_tasks::value(shared)]
pub struct ChunkGroupFilesAsset {
    pub module: Vc<Box<dyn ChunkableModule>>,
    pub client_root: Vc<FileSystemPath>,
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub runtime_entries: Option<Vc<EvaluatableAssets>>,
}

#[turbo_tasks::function]
fn module_description() -> Vc<RcStr> {
    Vc::cell("module".into())
}

#[turbo_tasks::function]
fn runtime_entry_description() -> Vc<RcStr> {
    Vc::cell("runtime entry".into())
}

#[turbo_tasks::value_impl]
impl Module for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let mut references: Vec<Vc<Box<dyn ModuleReference>>> = vec![Vc::upcast(
            SingleModuleReference::new(Vc::upcast(self.module), module_description()),
        )];

        if let Some(runtime_entries) = self.runtime_entries {
            references.extend(runtime_entries.await?.iter().map(|&entry| {
                Vc::upcast(SingleModuleReference::new(
                    Vc::upcast(entry),
                    runtime_entry_description(),
                ))
            }));
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        AssetContent::file(File::from(RcStr::from("// Chunking only content")).into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let this = self.await?;
        Ok(Vc::upcast(
            ChunkGroupFilesChunkItem {
                chunking_context,
                client_root: this.client_root,
                inner: self,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct ChunkGroupFilesChunkItem {
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    client_root: Vc<FileSystemPath>,
    inner: Vc<ChunkGroupFilesAsset>,
}

#[turbo_tasks::value_impl]
impl ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    async fn chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let inner = this.inner.await?;
        let chunks = if let Some(ecma) =
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(inner.module).await?
        {
            inner.chunking_context.evaluated_chunk_group_assets(
                inner.module.ident(),
                inner
                    .runtime_entries
                    .unwrap_or_else(EvaluatableAssets::empty)
                    .with_entry(Vc::upcast(ecma)),
                Value::new(AvailabilityInfo::Root),
            )
        } else {
            inner
                .chunking_context
                .root_chunk_group_assets(Vc::upcast(inner.module))
        };
        Ok(chunks)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let chunks = self.chunks();
        let this = self.await?;
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
fn chunk_group_chunk_reference_description() -> Vc<RcStr> {
    Vc::cell("chunk group chunk".into())
}

#[turbo_tasks::value_impl]
impl ChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let chunks = self.chunks();

        Ok(Vc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    SingleOutputAssetReference::new(
                        chunk,
                        chunk_group_chunk_reference_description(),
                    )
                })
                .map(Vc::upcast)
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.inner)
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell("chunk group files asset".into())
    }

    #[turbo_tasks::function]
    fn details(self: Vc<Self>) -> Vc<RcStr> {
        content_to_details(self.content())
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.ident().to_string()
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let mut children = IndexSet::new();
        children.insert((
            Vc::cell("inner asset".into()),
            IntrospectableModule::new(Vc::upcast(self.await?.module)),
        ));
        Ok(Vc::cell(children))
    }
}
