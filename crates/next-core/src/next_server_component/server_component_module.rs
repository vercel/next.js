use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    boundary::{BoundaryInfo, OptionBoundaryInfo},
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    source::OptionSource,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    references::esm::EsmExports,
};

use super::server_component_reference::NextServerComponentModuleReference;
use crate::boundary_types::boundary_type_server_component;

#[turbo_tasks::value(shared)]
pub struct NextServerComponentModule {
    pub module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    /// The original source path before any transformations (e.g., page.mdx before it becomes
    /// page.mdx.tsx). This is used to generate consistent manifest keys that match what the
    /// LoaderTree stores.
    source_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl NextServerComponentModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        source_path: FileSystemPath,
    ) -> Vc<Self> {
        NextServerComponentModule {
            module,
            source_path,
        }
        .cell()
    }

    /// Returns the original source path (before transformations like MDX -> MDX.tsx).
    /// Use this for manifest key generation to match the LoaderTree paths.
    #[turbo_tasks::function]
    pub fn source_path(&self) -> Vc<FileSystemPath> {
        self.source_path.clone().cell()
    }

    /// Returns the transformed module path (e.g., page.mdx.tsx for MDX files).
    /// This is the path of the actual compiled module.
    #[turbo_tasks::function]
    pub fn server_path(&self) -> Vc<FileSystemPath> {
        self.module.ident().path()
    }
}

#[turbo_tasks::value_impl]
impl Module for NextServerComponentModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module
            .ident()
            .with_modifier(rcstr!("Next.js Server Component"))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            NextServerComponentModuleReference::new(Vc::upcast(*self.module))
                .to_resolved()
                .await?,
        )]))
    }
    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        // This just exports another import
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
    }

    #[turbo_tasks::function]
    fn boundary_info(&self) -> Vc<OptionBoundaryInfo> {
        Vc::cell(Some(
            BoundaryInfo::with_source_path(
                boundary_type_server_component(),
                self.source_path.clone(),
            )
            .with_inner_module(ResolvedVc::upcast(self.module)),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for NextServerComponentModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for NextServerComponentModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        let module_reference: Vc<Box<dyn ModuleReference>> = Vc::upcast(
            NextServerComponentModuleReference::new(Vc::upcast(*self.module)),
        );
        EsmExports::reexport(module_reference)
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        Ok(EcmascriptChunkItemContent {
            inner_code: EsmExports::reexport_all_code(self.module, chunking_context)
                .await?
                .into(),
            ..Default::default()
        }
        .cell())
    }
}
