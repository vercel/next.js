use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkType, ChunkableModule,
        ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets,
    },
    ident::AssetIdent,
    introspect::{
        module::IntrospectableModule, utils::content_to_details, Introspectable,
        IntrospectableChildren,
    },
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets},
    reference::{ModuleReference, ModuleReferences, SingleModuleReference},
};

use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    runtime_functions::TURBOPACK_EXPORT_VALUE,
    utils::StringifyJs,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("chunk group files".into())
}

/// An asset that exports a list of chunk URLs by putting the [asset] into a
/// ChunkGroup with the provided ChunkingContext.
#[turbo_tasks::value(shared)]
pub struct ChunkGroupFilesAsset {
    pub module: ResolvedVc<Box<dyn ChunkableModule>>,
    pub client_root: ResolvedVc<FileSystemPath>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
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
        let mut references: Vec<ResolvedVc<Box<dyn ModuleReference>>> = vec![ResolvedVc::upcast(
            SingleModuleReference::new(*ResolvedVc::upcast(self.module), module_description())
                .to_resolved()
                .await?,
        )];

        if let Some(runtime_entries) = self.runtime_entries {
            references.extend(
                runtime_entries
                    .await?
                    .iter()
                    .map(|&entry| async move {
                        Ok(ResolvedVc::upcast(
                            SingleModuleReference::new(
                                Vc::upcast(*entry),
                                runtime_entry_description(),
                            )
                            .to_resolved()
                            .await?,
                        ))
                    })
                    .try_join()
                    .await?,
            );
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
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let this = self.await?;
        Ok(Vc::upcast(
            ChunkGroupFilesChunkItem {
                module_graph,
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
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
    client_root: ResolvedVc<FileSystemPath>,
    inner: ResolvedVc<ChunkGroupFilesAsset>,
}

#[turbo_tasks::value_impl]
impl ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    async fn chunks(&self) -> Result<Vc<OutputAssets>> {
        let inner = self.inner.await?;
        let chunks = if let Some(ecma) =
            ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(inner.module)
        {
            inner.chunking_context.evaluated_chunk_group_assets(
                inner.module.ident(),
                inner
                    .runtime_entries
                    .as_deref()
                    .copied()
                    .unwrap_or_else(EvaluatableAssets::empty)
                    .with_entry(*ecma),
                *self.module_graph,
                Value::new(AvailabilityInfo::Root),
            )
        } else {
            inner
                .chunking_context
                .root_chunk_group_assets(*ResolvedVc::upcast(inner.module), *self.module_graph)
        };
        Ok(chunks)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
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
            .map(|chunk| chunk.path())
            .try_join()
            .await?;
        let chunks_paths: Vec<_> = chunks_paths
            .iter()
            .filter_map(|path| client_root.get_path_to(path))
            .collect();
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "{TURBOPACK_EXPORT_VALUE}({:#});\n",
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
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        self.chunks()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.inner)
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
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut children = FxIndexSet::default();
        children.insert((
            ResolvedVc::cell("inner asset".into()),
            IntrospectableModule::new(*ResolvedVc::upcast(self.module))
                .to_resolved()
                .await?,
        ));
        Ok(Vc::cell(children))
    }
}
