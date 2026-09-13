use anyhow::{Result, bail};
use indoc::formatdoc;
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexSet, OperationVc, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkableModule, ChunkingContext, ChunkingContextExt,
        ChunkingType, ChunksData, ModuleChunkItemIdExt,
        availability_info::AvailabilityInfo,
        available_modules::{AvailableModuleItem, AvailableModules, AvailableModulesSet},
    },
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::{
        GraphTraversalAction, ModuleGraph,
        chunk_group_info::ChunkGroup,
        module_batch::{ChunkableModuleOrBatch, ModuleOrBatch},
    },
    output::OutputAssetsWithReferenced,
    reference::ModuleReferences,
};

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_LOAD},
    utils::{StringifyJs, StringifyModuleId},
};

/// The AsyncLoaderModule is a module that loads another module async, by
/// putting it into a separate chunk group.
#[turbo_tasks::value]
pub struct AsyncLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub availability_info: AvailabilityInfo,
}

/// Computes the subset of `availability_info` that `module`'s chunk group can observe.
///
/// The loader's output depends on the parent's availability only through the chunk group of
/// `module`, which only ever queries availability for modules reachable from `module`. Everything
/// else in the parent's availability is an over-approximation that splits the loader into one
/// variant per parent, even when every variant produces identical code.
///
/// Narrowing to the reachable set lets many parents collapse onto one `AsyncLoaderModule` cell, so
/// the chunk group, chunk items and output chunk are computed once instead of once per parent.
///
/// This is a plain helper rather than a cached function: it has the same inputs as its only
/// caller, so a task of its own would add bookkeeping without ever adding a cache hit.
///
/// The reachable set is taken over the whole subgraph, including across async edges, because the
/// result replaces the parent chain (see `AvailabilityInfo::with_flattened_modules`) and nested
/// chunk groups chain their own availability onto it.
async fn filtered_available_modules(
    module: ResolvedVc<Box<dyn ChunkableModule>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
    availability_info: AvailabilityInfo,
) -> Result<FxIndexSet<AvailableModuleItem>> {
    let Some(available_modules) = availability_info.available_modules() else {
        return Ok(FxIndexSet::default());
    };
    let snapshot = available_modules.snapshot().await?;
    let batches = module_graph
        .module_batches(chunking_context.batching_config())
        .await?;

    // Walk the whole subgraph reachable from the target, keeping the available items among it.
    // `active_page_entries` is passed through so that the same `Collected` edges are active here
    // as in `chunk_group_content`.
    let entry = batches.get_entry_index(ResolvedVc::upcast(module)).await?;
    let active_page_entries: Option<FxHashSet<ResolvedVc<Box<dyn Module>>>> =
        if let Some(entry_group) = availability_info.entry_group() {
            Some(entry_group.await?.iter().copied().collect())
        } else {
            None
        };
    let mut filtered: FxIndexSet<AvailableModuleItem> = FxIndexSet::default();
    batches.traverse_edges_from_entries_dfs(
        [entry],
        active_page_entries.as_ref(),
        &mut filtered,
        |parent_info, &node, filtered| {
            // Placeholder nodes carry no module; keep descending past them.
            if matches!(node, ModuleOrBatch::None(_)) {
                return Ok(GraphTraversalAction::Continue);
            }

            // Traced modules are ignored during chunking entirely.
            if let Some((_, edge)) = parent_info
                && matches!(edge.ty, ChunkingType::Traced { .. })
            {
                return Ok(GraphTraversalAction::Exclude);
            }

            // This chunk group stops at async edges: the target becomes its own chunk group, and
            // only its `AsyncLoader` item is probed here. But the nested chunk group *chains* its
            // availability onto this one, so the modules behind the edge have to be collected too
            // — otherwise the nested loader would inherit a set that is missing modules its parent
            // really did have available, and would redundantly re-chunk them.
            if let Some((_, edge)) = parent_info
                && matches!(edge.ty, ChunkingType::Async)
                && let Some(chunkable) = edge.module.and_then(ResolvedVc::try_downcast)
            {
                let item = AvailableModuleItem::AsyncLoader(chunkable);
                if snapshot.get(item) {
                    filtered.insert(item);
                }
            }

            let Some(chunkable_node) = ChunkableModuleOrBatch::from_module_or_batch(node) else {
                return Ok(GraphTraversalAction::Exclude);
            };
            let item: AvailableModuleItem = chunkable_node.into();
            if snapshot.get(item) {
                filtered.insert(item);
            }
            // Keep descending even through available nodes and async edges: `chunk_group_content`
            // prunes there, but a nested chunk group inheriting this set may not.
            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| {},
    )?;
    Ok(filtered)
}

/// Re-exposes an already-computed set as an operation.
///
/// `AvailableModules` stores its set as an `OperationVc`, whose identity is the task it came from.
/// Passing the filtered set through this function keys that task on the set *contents*, so two
/// parents whose filtered availability is equal share one task, one `AvailableModules` cell, one
/// `AvailabilityInfo` and therefore one `AsyncLoaderModule`.
#[turbo_tasks::function(operation)]
fn available_modules_set(items: Vec<AvailableModuleItem>) -> Vc<AvailableModulesSet> {
    Vc::cell(items.into_iter().collect())
}

#[turbo_tasks::value_impl]
impl AsyncLoaderModule {
    #[turbo_tasks::function]
    pub async fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        module_graph: ResolvedVc<ModuleGraph>,
        availability_info: AvailabilityInfo,
    ) -> Result<Vc<Self>> {
        let filtered =
            filtered_available_modules(module, chunking_context, module_graph, availability_info)
                .await?;
        let filtered: OperationVc<AvailableModulesSet> =
            available_modules_set(filtered.into_iter().collect());
        let mut availability_info = availability_info
            .with_flattened_modules(AvailableModules::new(filtered).to_resolved().await?);

        // `entry_group` only exists to activate `ChunkingType::Collected` edges during traversal
        // (and to serve collecting modules). When the graph has no collected modules at all, no
        // such edge exists, so the entry group cannot affect this chunk group and keeping it would
        // needlessly split the loader once per entry.
        if module_graph.collected_modules().await?.is_empty() {
            availability_info = availability_info.without_entry_group();
        }

        Ok(Self::new_deduped(
            *module,
            *chunking_context,
            availability_info,
        ))
    }

    #[turbo_tasks::function]
    fn new_deduped(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        availability_info: AvailabilityInfo,
    ) -> Vc<Self> {
        Self::cell(AsyncLoaderModule {
            inner: module,
            chunking_context,
            availability_info,
        })
    }

    #[turbo_tasks::function]
    pub async fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Result<Vc<AssetIdent>> {
        Ok(module
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("async loader"))
            .into_vc())
    }

    #[turbo_tasks::function]
    pub(super) async fn chunk_group(
        &self,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        if let Some(chunk_items) = self.availability_info.available_modules() {
            let inner_module = ResolvedVc::upcast(self.inner);
            let batches = module_graph
                .module_batches(self.chunking_context.batching_config())
                .await?;
            let module_or_batch = batches.get_entry(inner_module).await?;
            if let Some(chunkable_module_or_batch) =
                ChunkableModuleOrBatch::from_module_or_batch(module_or_batch)
                && *chunk_items.get(chunkable_module_or_batch.into()).await?
            {
                return Ok(OutputAssetsWithReferenced {
                    assets: ResolvedVc::cell(vec![]),
                    referenced_assets: ResolvedVc::cell(vec![]),
                    references: ResolvedVc::cell(vec![]),
                }
                .cell());
            }
        }
        Ok(self.chunking_context.chunk_group_assets(
            self.inner.ident(),
            ChunkGroup::Async(ResolvedVc::upcast(self.inner)),
            module_graph,
            self.availability_info,
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>, module_graph: Vc<ModuleGraph>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        let span = tracing::info_span!(
            "compute async chunks",
            name = self.ident().to_string().await?.as_str()
        );
        async move {
            Ok(ChunkData::from_assets(
                this.chunking_context.output_root().owned().await?,
                *self.chunk_group(module_graph).await?.assets,
            ))
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::value_impl]
impl Module for AsyncLoaderModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        Self::asset_ident_for(*self.inner)
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        bail!("AsyncLoaderModule::references should never be called")
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for AsyncLoaderModule {
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
impl EcmascriptChunkPlaceable for AsyncLoaderModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let options = EcmascriptChunkItemOptions {
            supports_arrow_functions: *chunking_context
                .environment()
                .runtime_versions()
                .supports_arrow_functions()
                .await?,
            ..Default::default()
        };

        if estimated {
            let code = formatdoc! {
                r#"
                    {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                        return Promise.all([].map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{}});
                    }});
                "#,
            };
            return Ok(EcmascriptChunkItemContent {
                inner_code: code.into(),
                options,
                ..Default::default()
            }
            .cell());
        }

        let this = self.await?;

        let id = if let Some(placeable) =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(this.inner)
        {
            Some(placeable.chunk_item_id(chunking_context).await?)
        } else {
            None
        };
        let id = id.as_ref();

        let chunks_data = self.chunks_data(module_graph).await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = match (id, chunks_data.is_empty()) {
            (Some(id), true) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.resolve().then(() => {{
                                return parentImport({id});
                            }});
                        }});
                    "#,
                    id = StringifyModuleId(id),
                }
            }
            (Some(id), false) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.all({chunks:#}.map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{
                                return parentImport({id});
                            }});
                        }});
                    "#,
                    chunks = StringifyJs(&chunks_data),
                    id = StringifyModuleId(id),
                }
            }
            (None, true) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.resolve();
                        }});
                    "#,
                }
            }
            (None, false) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.all({chunks:#}.map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{}});
                        }});
                    "#,
                    chunks = StringifyJs(&chunks_data),
                }
            }
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            options,
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
        let this = self.await?;

        let nested_async_availability = this
            .chunking_context
            .is_nested_async_availability_enabled()
            .await?;

        let availability_ident = if *nested_async_availability {
            Some(
                self.chunks_data(module_graph)
                    .hash()
                    .await?
                    .to_string()
                    .into(),
            )
        } else {
            this.availability_info.ident().await?
        };

        Ok(if let Some(availability_ident) = availability_ident {
            self.ident()
                .owned()
                .await?
                .with_modifier(availability_ident)
                .into_vc()
        } else {
            self.ident()
        })
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group(module_graph)
    }
}
