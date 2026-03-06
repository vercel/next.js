use std::io::Write;

use anyhow::{Result, bail};
use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{VirtualFileSystem, rope::RopeBuilder};
use turbopack_core::{
    self,
    chunk::{AsyncModuleInfo, ChunkItem, ChunkableModule, ChunkingContext},
    context::AssetContext,
    emit_collect::CollectingModule,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects, Modules},
    module_graph::ModuleGraph,
    reference::ModuleReferences,
    reference_type::ReferenceType,
    source::{OptionSource, Source},
};
use turbopack_ecmascript::{
    EcmascriptInputTransforms,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_ESM, TURBOPACK_IMPORT},
    utils::StringifyJs,
};

use crate::{ModuleAssetContext, module_options::CustomModuleType};

#[turbo_tasks::value]
pub struct CollectModuleType {}

#[turbo_tasks::value_impl]
impl CollectModuleType {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        CollectModuleType {}.cell()
    }
}

#[turbo_tasks::value_impl]
impl CustomModuleType for CollectModuleType {
    #[turbo_tasks::function]
    fn create_module(
        self: turbo_tasks::Vc<Self>,
        _source: Vc<Box<dyn Source>>,
        asset_context: Vc<ModuleAssetContext>,
        reference_type: ReferenceType,
    ) -> Result<Vc<Box<dyn Module>>> {
        let ReferenceType::Collect {
            namespace,
            parent_module,
        } = reference_type
        else {
            bail!("CollectModuleType only supports ReferenceType::Collect");
        };

        Ok(Vc::upcast(CollectModule::new(
            *parent_module,
            namespace,
            asset_context,
        )))
    }

    #[turbo_tasks::function]
    fn extend_ecmascript_transforms(
        self: Vc<Self>,
        _preprocess: Vc<EcmascriptInputTransforms>,
        _main: Vc<EcmascriptInputTransforms>,
        _postprocess: Vc<EcmascriptInputTransforms>,
    ) -> Result<Vc<Box<dyn CustomModuleType>>> {
        // TODO
        // bail!("CollectModuleType does not support ECMAScript transforms")
        Ok(Vc::upcast(self))
    }
}

#[turbo_tasks::value]
pub struct CollectModule {
    // TODO have a different way of having unique collect modules per page. This still breaks if
    // the collect module is imported in shared code
    parent_module: ResolvedVc<Box<dyn Module>>,
    namespace: RcStr,
    asset_context: ResolvedVc<ModuleAssetContext>,
}

#[turbo_tasks::value_impl]
impl CollectModule {
    #[turbo_tasks::function]
    pub fn new(
        parent_module: ResolvedVc<Box<dyn Module>>,
        namespace: RcStr,
        asset_context: ResolvedVc<ModuleAssetContext>,
    ) -> Vc<Self> {
        CollectModule {
            parent_module,
            namespace,
            asset_context,
        }
        .cell()
    }
}

/// Each entry point in the HMR system has an ident with a different nested asset.
/// This produces the 'base' ident for the HMR entry point, which is then modified
#[turbo_tasks::function]
fn virtual_fs() -> Vc<VirtualFileSystem> {
    VirtualFileSystem::new_with_name(rcstr!("turbopack-collect"))
}

#[turbo_tasks::value_impl]
impl Module for CollectModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .parent_module
            .ident()
            .with_modifier(rcstr!("collect"))
            .with_modifier(self.namespace.clone())
            .with_layer(self.asset_context.await?.layer()))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl CollectingModule for CollectModule {
    #[turbo_tasks::function]
    fn namespace(&self) -> Vc<RcStr> {
        Vc::cell(self.namespace.clone())
    }

    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_group: ResolvedVc<Modules>,
    ) -> Vc<Box<dyn ChunkItem>> {
        CollectModuleWithChunkGroup {
            module: self,
            chunk_group,
        }
        .cell()
        .as_chunk_item(module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for CollectModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        bail!("shouldn't be called, but needed for chunkable.chunk_item_id");
    }
}

#[turbo_tasks::value]
struct CollectModuleWithChunkGroup {
    module: ResolvedVc<CollectModule>,
    chunk_group: ResolvedVc<Modules>,
}

#[turbo_tasks::value_impl]
impl Module for CollectModuleWithChunkGroup {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        self.module.source()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    fn side_effects(&self) -> Vc<ModuleSideEffects> {
        self.module.side_effects()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for CollectModuleWithChunkGroup {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for CollectModuleWithChunkGroup {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let chunk_item_id_strategy = chunking_context.chunk_item_id_strategy().await?;

        let entries = self
            .chunk_group
            .await?
            .into_iter()
            .collect::<FxHashSet<_>>();

        // println!(
        //     "collect codegen, searching for {:?} {:#?}",
        //     self.module.ident_string().await?,
        //     entries.iter().map(|m| m.ident_string()).try_join().await?
        // );

        // TODO don't read whole graph
        let module_graph = module_graph.await?;
        let collect = module_graph.collected_modules.as_ref().unwrap();
        let items = collect
            .collected_references
            .iter()
            .find_map(|((page, collect), references)| {
                if *collect == ResolvedVc::upcast(self.module) && entries.contains(page) {
                    Some(references.iter())
                } else {
                    None
                }
            })
            .into_iter()
            .flatten();

        let items = items
            .map(async |(_data, module, _)| {
                Ok((
                    chunk_item_id_strategy.get_id_from_module(**module).await?,
                    None::<()>, // TODO ResolvedVc::try_downcast(data.reference).data()
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect::<FxIndexMap<_, _>>();

        let mut code = RopeBuilder::default();

        code += "const data = ([\n";
        for (id, data) in items {
            writeln!(
                code,
                "{{id: {}, data: {}, import: () => {TURBOPACK_IMPORT}({})}},",
                StringifyJs(&id),
                StringifyJs(&data),
                StringifyJs(&id),
            )?;
        }
        code += "]);";
        code += "function getList() { return data; }";

        writeln!(
            code,
            "{TURBOPACK_ESM}([
    'getList', ()=>getList
]);"
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.build(),
            ..Default::default()
        }
        .cell())
    }
}
