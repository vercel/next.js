use anyhow::Result;
use indoc::formatdoc;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    boundary::{BoundaryInfo, OptionBoundaryInfo},
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, ModuleChunkItemIdExt},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    resolve::ModulePart,
    source::OptionSource,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    references::esm::EsmExports,
    runtime_functions::{TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_IMPORT},
    utils::StringifyJs,
};

use super::server_utility_reference::NextServerUtilityModuleReference;
use crate::boundary_types::boundary_type_server_utility;

#[turbo_tasks::value(shared)]
pub struct NextServerUtilityModule {
    pub module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl NextServerUtilityModule {
    #[turbo_tasks::function]
    pub async fn new(module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>) -> Result<Vc<Self>> {
        // Get the facade module to ensure we re-export with original names, not mangled names.
        // The module might be a locals module (if splitting already happened), a facade,
        // or the original module.
        //
        // IMPORTANT: We normalize to the facade first, then delegate to new_inner with the facade.
        // This ensures that regardless of whether we receive the original, facade, or locals,
        // we always wrap the same facade module, avoiding duplicate NextServerUtilityModule
        // instances.
        let split_module = module.get_split(ModulePart::Facade).to_resolved().await?;

        // Always delegate to new_inner with the normalized module.
        // If the input was already the facade, split_module == module, and turbo_tasks
        // memoization will return the same result.
        // If the input was locals/original, split_module is the facade, and we'll
        // get the same wrapper as if the facade had been passed directly.
        Ok(Self::new_inner(*split_module))
    }

    /// Internal constructor that wraps the module directly.
    /// This is called with the normalized facade module from `new()`.
    #[turbo_tasks::function]
    async fn new_inner(module: Vc<Box<dyn EcmascriptChunkPlaceable>>) -> Result<Vc<Self>> {
        Ok(NextServerUtilityModule {
            module: module.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub fn server_path(&self) -> Vc<FileSystemPath> {
        self.module.ident().path()
    }
}

#[turbo_tasks::value_impl]
impl Module for NextServerUtilityModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module
            .ident()
            .with_modifier(rcstr!("Next.js server utility"))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            NextServerUtilityModuleReference::new(Vc::upcast(*self.module))
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
            BoundaryInfo::new(boundary_type_server_utility())
                .with_inner_module(ResolvedVc::upcast(self.module)),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for NextServerUtilityModule {
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
impl EcmascriptChunkPlaceable for NextServerUtilityModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        let module_reference: Vc<Box<dyn ModuleReference>> = Vc::upcast(
            NextServerUtilityModuleReference::new(Vc::upcast(*self.module)),
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
        let module_id = self.module.chunk_item_id(chunking_context).await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: formatdoc!(
                r#"
                    {TURBOPACK_EXPORT_NAMESPACE}({TURBOPACK_IMPORT}({}));
                "#,
                StringifyJs(&module_id),
            )
            .into(),
            ..Default::default()
        }
        .cell())
    }
}
