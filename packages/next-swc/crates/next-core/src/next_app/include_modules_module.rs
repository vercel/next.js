use anyhow::Result;
use turbo_tasks::{RcStr, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContent},
        chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkableModuleReference, ChunkingContext},
        ident::AssetIdent,
        module::Module,
        reference::{ModuleReference, ModuleReferences},
        resolve::ModuleResolveResult,
    },
    ecmascript::chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
};

/// A virtual module that references other modules, but doesn't do anything at
/// runtime. It can be used to include modules into a chunk.
#[turbo_tasks::value]
pub struct IncludeModulesModule {
    ident: Vc<AssetIdent>,
    modules: Vec<Vc<Box<dyn Module>>>,
}

#[turbo_tasks::value_impl]
impl IncludeModulesModule {
    #[turbo_tasks::function]
    pub fn new(ident: Vc<AssetIdent>, modules: Vec<Vc<Box<dyn Module>>>) -> Vc<Self> {
        Self { ident, modules }.cell()
    }
}

impl Asset for IncludeModulesModule {
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        todo!("IncludeModulesModule doesn't implement content()")
    }
}

#[turbo_tasks::value_impl]
impl Module for IncludeModulesModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.ident
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(
            self.modules
                .iter()
                .map(|&module| async move {
                    Ok(Vc::upcast(
                        IncludedModuleReference::new(module).resolve().await?,
                    ))
                })
                .try_join()
                .await?,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for IncludeModulesModule {
    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        EcmascriptExports::None.cell()
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(self: Vc<Self>, _: Vc<Glob>) -> Vc<bool> {
        Vc::cell(true)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for IncludeModulesModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        Ok(Vc::upcast(
            IncludeModulesChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        ))
    }
}

/// The chunk item for [`IncludeModulesModule`].
#[turbo_tasks::value]
struct IncludeModulesChunkItem {
    module: Vc<IncludeModulesModule>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for IncludeModulesChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for IncludeModulesChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    fn content(&self) -> Vc<EcmascriptChunkItemContent> {
        EcmascriptChunkItemContent {
            ..Default::default()
        }
        .cell()
    }
}

/// A module reference that references a module that is references from the
/// [`IncludeModulesModule`].
#[turbo_tasks::value]
pub struct IncludedModuleReference {
    pub module: Vc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl IncludedModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: Vc<Box<dyn Module>>) -> Vc<Self> {
        IncludedModuleReference { module }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for IncludedModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("module".into())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for IncludedModuleReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        Ok(ModuleResolveResult::module(self.module).cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for IncludedModuleReference {}
