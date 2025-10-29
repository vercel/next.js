use std::io::Write;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{FileSystem, VirtualFileSystem, glob::Glob, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkItem, ChunkType, ChunkableModule, ChunkableModuleReference, ChunkingContext,
        EvaluatableAsset,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    resolve::ModuleResolveResult,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptChunkType, EcmascriptExports,
    },
    runtime_functions::TURBOPACK_REQUIRE,
    utils::StringifyJs,
};

/// Each entry point in the HMR system has an ident with a different nested asset.
/// This produces the 'base' ident for the HMR entry point, which is then modified
#[turbo_tasks::function]
async fn hmr_entry_point_base_ident() -> Result<Vc<AssetIdent>> {
    Ok(AssetIdent::from_path(
        VirtualFileSystem::new_with_name(rcstr!("hmr-entry"))
            .root()
            .await?
            .join("hmr-entry.js")?,
    ))
}

#[turbo_tasks::value(shared)]
pub struct HmrEntryModule {
    pub ident: ResolvedVc<AssetIdent>,
    pub module: ResolvedVc<Box<dyn ChunkableModule>>,
}

#[turbo_tasks::value_impl]
impl HmrEntryModule {
    #[turbo_tasks::function]
    pub fn new(
        ident: ResolvedVc<AssetIdent>,
        module: ResolvedVc<Box<dyn ChunkableModule>>,
    ) -> Vc<Self> {
        Self { ident, module }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for HmrEntryModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        hmr_entry_point_base_ident().with_asset(rcstr!("ENTRY"), *self.ident)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            HmrEntryModuleReference::new(Vc::upcast(*self.module))
                .to_resolved()
                .await?,
        )]))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for HmrEntryModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>> {
        Vc::upcast(
            HmrEntryChunkItem {
                module: self,
                module_graph,
                chunking_context,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl Asset for HmrEntryModule {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        todo!("HmrEntryModule doesn't implement content()")
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for HmrEntryModule {
    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        EcmascriptExports::None.cell()
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(self: Vc<Self>, _: Vc<Glob>) -> Vc<bool> {
        Vc::cell(false)
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for HmrEntryModule {}

#[turbo_tasks::value]
pub struct HmrEntryModuleReference {
    pub module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl HmrEntryModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        HmrEntryModuleReference { module }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for HmrEntryModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("entry"))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for HmrEntryModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for HmrEntryModuleReference {}

/// The chunk item for [`HmrEntryModule`].
#[turbo_tasks::value]
struct HmrEntryChunkItem {
    module: ResolvedVc<HmrEntryModule>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for HmrEntryChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for HmrEntryChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.module.await?;
        let module = this.module;
        let chunk_item = module.as_chunk_item(*self.module_graph, *self.chunking_context);
        let id = self.chunking_context.chunk_item_id(chunk_item).await?;

        let mut code = RopeBuilder::default();
        writeln!(code, "{TURBOPACK_REQUIRE}({});", StringifyJs(&id))?;
        Ok(EcmascriptChunkItemContent {
            inner_code: code.build(),
            options: EcmascriptChunkItemOptions {
                strict: true,
                ..Default::default()
            },
            ..Default::default()
        }
        .cell())
    }
}
