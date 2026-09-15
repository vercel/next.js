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
    source::OptionSource,
};

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    references::esm::{EsmExport, EsmExports, Liveness, mangle::generated_export_key},
    runtime_functions::{TURBOPACK_ESM, TURBOPACK_IMPORT},
    utils::StringifyJs,
};

/// The single export of the generated collect module.
///
/// Both the producer below and the read side in `references::emit_collect` resolve the key this is
/// actually *emitted* under through `generated_export_key`, rather than assuming the source name,
/// so the two cannot drift apart. Today that always resolves back to this name — see
/// `get_exports` for why — but wiring it through means mangling starts applying to both sides
/// together the moment it becomes possible, with no further change here.
pub const COLLECT_LIST_EXPORT: RcStr = rcstr!("getList");

#[turbo_tasks::value]
pub struct EcmascriptCollectModule {
    parent_module: ResolvedVc<Box<dyn Module>>,
    namespace: RcStr,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptCollectModule {
    #[turbo_tasks::function]
    pub fn new(
        parent_module: ResolvedVc<Box<dyn Module>>,
        namespace: RcStr,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        EcmascriptCollectModule {
            parent_module,
            namespace,
            asset_context,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptCollectModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .parent_module
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("collect"))
            .with_modifier(self.namespace.clone())
            .with_layer(self.asset_context.into_trait_ref().await?.layer())
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
impl CollectingModule for EcmascriptCollectModule {
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
        EcmascriptCollectModuleWithChunkGroup {
            module: self,
            entry_chunk_group,
        }
        .cell()
        .as_chunk_item(module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptCollectModule {
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
struct EcmascriptCollectModuleWithChunkGroup {
    module: ResolvedVc<EcmascriptCollectModule>,
    entry_chunk_group: ResolvedVc<Modules>,
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptCollectModuleWithChunkGroup {
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
impl ChunkableModule for EcmascriptCollectModuleWithChunkGroup {
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
impl EcmascriptChunkPlaceable for EcmascriptCollectModuleWithChunkGroup {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::EsmExports(
            EsmExports {
                exports: [(
                    COLLECT_LIST_EXPORT,
                    EsmExport::LocalBinding(COLLECT_LIST_EXPORT, Liveness::Constant),
                )]
                .into(),
                star_exports: vec![],
                // This module is code-generated but never referenced in the module graph (it is
                // reached through `collected_modules`), so it has no entry in the graph's
                // used-export map and `module_export_usage` cannot answer for it — the same class
                // of module as the wasm loader and the client-reference proxy, which
                // `BindingUsageInfo::used_exports` special-cases by ident with a `TODO fix these
                // cases`. Mangling therefore cannot be computed here at all, rather than being
                // merely undesirable. Keeping this `false` makes `mangled_export_names` answer
                // before it consults the graph; flip it once this module is graph-tracked.
                mangle_export_names: false,
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
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let chunk_item_id_strategy = chunking_context.chunk_item_id_strategy().await?;

        let entries = this
            .entry_chunk_group
            .await?
            .into_iter()
            .collect::<FxHashSet<_>>();

        let collected_modules = module_graph.collected_modules();
        let items = collected_modules
            .get(&ResolvedVc::upcast(this.module))
            .await?;
        let items = items
            .iter()
            .flat_map(|v| v.iter())
            .filter_map(|(entry_modules, references)| {
                if entry_modules.iter().any(|m| entries.contains(m)) {
                    Some(references.iter())
                } else {
                    None
                }
            })
            .flatten()
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
                data.display_ecmascript(),
                StringifyJs(&id),
            )?;
        }
        code += "]);";
        code += "function getList() { return data; }";

        // The *key* this is exposed under may be mangled; the local binding keeps its own name.
        // `references::emit_collect` resolves the same key for the read side, so both agree.
        let export = generated_export_key(
            ResolvedVc::upcast(self.to_resolved().await?),
            chunking_context,
            &COLLECT_LIST_EXPORT,
        )
        .await?;

        writeln!(
            code,
            "{TURBOPACK_ESM}([\n    {}, ()=>getList\n]);",
            StringifyJs(&export),
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.build(),
            ..Default::default()
        }
        .cell())
    }
}
