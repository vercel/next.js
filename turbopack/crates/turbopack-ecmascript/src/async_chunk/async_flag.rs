use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, ChunkingType},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    resolve::{ModuleResolveResult, ModuleResolveResultItem},
};

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    runtime_functions::TURBOPACK_EXPORT_VALUE,
};

/// A module that exports whether `inner` is an async module (it, or one of its dependencies, uses
/// top-level await).
///
/// Used by `import.defer()` in environments that can't split async chunks: an async module has to
/// be evaluated eagerly by `import.defer()`, but whether a module is async is only known from the
/// module graph, not to the code generation of the importing module. (With async chunk loading,
/// the async loader module passes this information instead.)
#[turbo_tasks::value]
pub struct AsyncModuleFlagModule {
    inner: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl AsyncModuleFlagModule {
    #[turbo_tasks::function]
    pub fn new(inner: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        AsyncModuleFlagModule { inner }.cell()
    }

    #[turbo_tasks::function]
    async fn is_async(&self, module_graph: Vc<ModuleGraph>) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            module_graph
                .async_module_info()
                .is_async(self.inner)
                .await?,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Module for AsyncModuleFlagModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .inner
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("async module flag"))
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for AsyncModuleFlagModule {
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
impl EcmascriptChunkPlaceable for AsyncModuleFlagModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let is_async = !estimated && *self.is_async(module_graph).await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: format!("{TURBOPACK_EXPORT_VALUE}({is_async});\n").into(),
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn chunk_item_content_ident(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<AssetIdent>> {
        // The content depends on the module graph
        Ok(if *self.is_async(module_graph).await? {
            self.ident()
                .owned()
                .await?
                .with_modifier(rcstr!("async"))
                .into_vc()
        } else {
            self.ident()
        })
    }
}

/// References the [`AsyncModuleFlagModule`]s of the targets of an `import.defer()` reference.
#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("async module flags of {target}")]
pub struct AsyncModuleFlagsReference {
    /// The `import.defer()` reference
    target: ResolvedVc<Box<dyn ModuleReference>>,
}

#[turbo_tasks::value_impl]
impl AsyncModuleFlagsReference {
    #[turbo_tasks::function]
    pub fn new(target: ResolvedVc<Box<dyn ModuleReference>>) -> Vc<Self> {
        AsyncModuleFlagsReference { target }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for AsyncModuleFlagsReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let result = self.target.resolve_reference().await?;
        let mut modules = Vec::new();
        for (key, item) in result.primary.iter() {
            match item {
                ModuleResolveResultItem::Module(module) => modules.push((
                    key.clone(),
                    ResolvedVc::upcast(AsyncModuleFlagModule::new(**module).to_resolved().await?),
                )),
                ModuleResolveResultItem::Duplicate(_)
                | ModuleResolveResultItem::External { .. }
                | ModuleResolveResultItem::Ignore
                | ModuleResolveResultItem::Empty
                | ModuleResolveResultItem::Error(_)
                | ModuleResolveResultItem::Unknown { .. }
                | ModuleResolveResultItem::Custom(_) => {}
            }
        }
        Ok(*ModuleResolveResult::modules(modules))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }
}
