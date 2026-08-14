use std::io::Write;

use anyhow::{Context, Result, bail};
use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::rope::RopeBuilder;
use turbopack_core::{
    self,
    chunk::{AsyncModuleInfo, ChunkItem, ChunkableModule, ChunkingContext},
    context::AssetContext,
    emit_collect::{CollectingModule, EmittedModuleReference},
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
    references::esm::{EsmExport, EsmExports, Liveness},
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
        // Ignore the transforms.
        Ok(Vc::upcast(self))
    }
}

#[turbo_tasks::value]
pub struct CollectModule {
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

#[turbo_tasks::value_impl]
impl Module for CollectModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .parent_module
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("collect"))
            .with_modifier(self.namespace.clone())
            .with_layer(self.asset_context.await?.layer())
            .into_vc())
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
        entry_chunk_group: ResolvedVc<Modules>,
    ) -> Vc<Box<dyn ChunkItem>> {
        CollectModuleWithChunkGroup {
            module: self,
            entry_chunk_group,
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
    entry_chunk_group: ResolvedVc<Modules>,
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
        EcmascriptExports::EsmExports(
            EsmExports {
                exports: [(
                    "getList".into(),
                    EsmExport::LocalBinding(rcstr!("getList"), Liveness::Constant),
                )]
                .into(),
                star_exports: vec![],
            }
            .resolved_cell(),
        )
        .cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content_ident(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<AssetIdent>> {
        Ok(self
            .ident()
            .owned()
            .await?
            .with_modifier(
                format!(
                    "from {:?}",
                    self.await?
                        .entry_chunk_group
                        .await?
                        .iter()
                        .map(|m| m.ident_string())
                        .try_join()
                        .await?
                )
                .into(),
            )
            .into_vc())
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
            .entry_chunk_group
            .await?
            .into_iter()
            .collect::<FxHashSet<_>>();

        let collected_modules = module_graph.collected_modules().await?;
        let items = collected_modules
            .collected_references
            .iter()
            .filter_map(|((entry_modules, collecting_module), references)| {
                if *collecting_module == ResolvedVc::upcast(self.module)
                    && entry_modules.iter().any(|m| entries.contains(m))
                {
                    Some(references.iter())
                } else {
                    None
                }
            })
            .flatten();

        let items = items
            .map(async |(data, module)| {
                Ok((
                    chunk_item_id_strategy.get_id_from_module(**module).await?,
                    ResolvedVc::try_sidecast::<Box<dyn EmittedModuleReference>>(data.reference)
                        .context("Expected collected reference to be a EmittedModuleReference")?
                        .data()
                        .await?,
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect::<Vec<_>>();

        let mut code = RopeBuilder::default();

        code += "const data = ([\n";
        for (id, data) in items {
            writeln!(
                code,
                "{{id: {}, data: {}, import: () => {TURBOPACK_IMPORT}({})}},",
                StringifyJs(&id),
                data.as_ecmascript(),
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
