use std::sync::atomic::AtomicBool;

use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use rustc_hash::{FxHashMap, FxHashSet};
use smallvec::SmallVec;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{
    FxIndexSet, JoinIterExt, OperationVc, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
};

use super::{
    ChunkItemWithAsyncModuleInfo, ChunkingContext, availability_info::AvailabilityInfo,
    chunking::make_chunks,
};
use crate::{
    chunk::{
        ChunkGroupContent, ChunkGroupContentInner, ChunkableModule, ChunkingType, Chunks,
        available_modules::{AvailableModuleItem, AvailableModulesSet},
        chunk_item_batch::{ChunkItemBatchGroup, ChunkItemOrBatchWithAsyncModuleInfo},
    },
    emit_collect::CollectingModule,
    module::{Module, Modules},
    module_graph::{
        GraphTraversalAction, ModuleGraph,
        chunk_group_info::ChunkGroup,
        merged_modules::MergedModuleInfo,
        module_batch::{
            ChunkableModuleBatchGroup, ChunkableModuleOrBatch, ModuleBatch, ModuleBatchGroup,
            ModuleOrBatch,
        },
        module_batches::{BatchingConfig, ModuleBatchesGraphEdge},
    },
    output::OutputAssetsReference,
};

pub struct MakeChunkGroupResult {
    pub chunks: ResolvedVc<Chunks>,
    pub references: Vec<ResolvedVc<Box<dyn OutputAssetsReference>>>,
    pub availability_info: AvailabilityInfo,
}

/// Creates one chunk group from `chunk_groups`, chunking all of them together.
///
/// See [`chunk_group_content`] for how several groups are combined.
pub async fn make_chunk_group(
    chunk_groups: SmallVec<[ChunkGroup; 1]>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    availability_info: AvailabilityInfo,
) -> Result<MakeChunkGroupResult> {
    let can_split_async = chunking_context.chunk_loading().await?.can_split_async();
    let is_nested_async_availability_enabled = *chunking_context
        .is_nested_async_availability_enabled()
        .await?;
    let should_merge_modules = *chunking_context.is_module_merging_enabled().await?;
    let batching_config = chunking_context.batching_config().to_resolved().await?;

    let ChunkGroupContent {
        inner,
        availability_info: new_availability_info,
    } = chunk_group_content(
        module_graph,
        chunk_groups,
        ChunkGroupContentOptions {
            availability_info,
            can_split_async,
            should_merge_modules,
            batching_config,
        },
    )
    .await?;
    let ChunkGroupContentInner {
        chunkable_items,
        batch_groups,
        async_modules,
        collecting_modules,
        available_modules: _,
    } = &*inner;

    let async_module_info = module_graph.async_module_info();

    // Attach async info to chunkable modules
    let mut chunk_items = chunkable_items
        .iter()
        .copied()
        .map(|m| {
            ChunkItemOrBatchWithAsyncModuleInfo::from_chunkable_module_or_batch(
                m,
                async_module_info,
                *module_graph,
                *chunking_context,
            )
        })
        .join()
        .await
        .into_iter()
        .filter_map(Result::transpose)
        .collect::<Result<Vec<_>>>()?;

    let chunk_item_batch_groups = batch_groups
        .iter()
        .map(|&batch_group| {
            ChunkItemBatchGroup::from_module_batch_group(
                ChunkableModuleBatchGroup::from_module_batch_group(*batch_group),
                *module_graph,
                *chunking_context,
            )
            .to_resolved()
        })
        .try_join()
        .await?;

    chunk_items.extend(
        collecting_modules
            .into_iter()
            .map(async |module| {
                let Some(entry_chunk_group) = new_availability_info.entry_group() else {
                    bail!("unexpected collect module in non-entry chunk group",);
                };
                let chunk_item = module
                    .as_chunk_item(*module_graph, *chunking_context, *entry_chunk_group)
                    .to_resolved()
                    .await?;
                let chunk_type = chunk_item
                    .into_trait_ref()
                    .await?
                    .ty()
                    .to_resolved()
                    .await?;
                Ok(ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(
                    ChunkItemWithAsyncModuleInfo {
                        chunk_item,
                        chunk_type,
                        module: Some(ResolvedVc::upcast(*module)),
                        async_info: None,
                    },
                ))
            })
            .try_join()
            .await?,
    );

    // Insert async chunk loaders for every referenced async module
    let async_availability_info =
        if is_nested_async_availability_enabled || !availability_info.is_in_async_module() {
            new_availability_info.in_async_module()
        } else {
            availability_info
        };
    let async_loaders = async_modules
        .iter()
        .copied()
        .map(|module| {
            chunking_context
                .async_loader_chunk_item(*module, *module_graph, async_availability_info)
                .to_resolved()
        })
        .try_join()
        .await?;
    let async_loader_chunk_items = async_loaders
        .iter()
        .map(async |&chunk_item| {
            let chunk_type = chunk_item
                .into_trait_ref()
                .await?
                .ty()
                .to_resolved()
                .await?;
            Ok(ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(
                ChunkItemWithAsyncModuleInfo {
                    chunk_item,
                    chunk_type,
                    module: None,
                    async_info: None,
                },
            ))
        })
        .try_join()
        .await?;

    chunk_items.extend(async_loader_chunk_items);

    // Pass chunk items to chunking algorithm
    let chunks = make_chunks(
        *module_graph,
        *chunking_context,
        Vc::cell(chunk_items),
        Vc::cell(chunk_item_batch_groups),
        rcstr!(""),
    )
    .to_resolved()
    .await?;

    Ok(MakeChunkGroupResult {
        chunks,
        references: ResolvedVc::upcast_vec(async_loaders),
        availability_info: new_availability_info,
    })
}

#[turbo_tasks::task_input]
#[derive(Debug, Clone, Hash, PartialEq, Eq, Encode, Decode)]
pub struct ChunkGroupContentOptions {
    /// The availability info of the chunk group
    pub availability_info: AvailabilityInfo,
    /// Whether async modules can be split into separate chunks
    pub can_split_async: bool,
    /// Whether module merging is enabled
    pub should_merge_modules: bool,
    /// The batching config to use
    pub batching_config: ResolvedVc<BatchingConfig>,
}

/// Computes the content of one chunk group made of all `chunk_groups`.
///
/// The groups are chunked together, in a single task: the traversal starts from the entries of each
/// group in list order and shares its state, so a module reached from an earlier group is not
/// collected again for a later one. The resulting availability includes all of them. The modules
/// of all [`ChunkGroup::Entry`] groups together form the entry group. Groups listed more than once
/// are chunked once; an empty list is an error.
pub async fn chunk_group_content(
    module_graph: ResolvedVc<ModuleGraph>,
    chunk_groups: SmallVec<[ChunkGroup; 1]>,
    options: ChunkGroupContentOptions,
) -> Result<ChunkGroupContent> {
    let availability_info = options.availability_info;
    let chunk_groups = dedup_chunk_groups(chunk_groups)?;

    let entry_group: Option<ResolvedVc<Modules>> =
        entry_group_modules(&chunk_groups).map(ResolvedVc::cell);

    let chunk_group_content = chunk_group_content_operation(module_graph, chunk_groups, options);
    let available_modules = available_modules_operation(chunk_group_content);
    let availability_info = availability_info.with_modules(available_modules).await?;

    let availability_info = if let Some(entry_group) = entry_group {
        availability_info.with_entry_group(entry_group)
    } else {
        availability_info
    };
    let inner = chunk_group_content.connect().await?;

    Ok(ChunkGroupContent {
        inner,
        availability_info,
    })
}

/// Rejects an empty list and drops groups that are listed more than once (by key), keeping list
/// order.
fn dedup_chunk_groups(
    chunk_groups: SmallVec<[ChunkGroup; 1]>,
) -> Result<SmallVec<[ChunkGroup; 1]>> {
    if chunk_groups.is_empty() {
        bail!("Cannot chunk an empty list of chunk groups");
    }
    let mut keys = FxHashSet::default();
    Ok(chunk_groups
        .into_iter()
        .filter(|chunk_group| keys.insert(chunk_group.key()))
        .collect())
}

/// The modules of all [`ChunkGroup::Entry`] groups in `chunk_groups`, in list order, or `None` if
/// there are none.
fn entry_group_modules(chunk_groups: &[ChunkGroup]) -> Option<Vec<ResolvedVc<Box<dyn Module>>>> {
    let mut modules = FxIndexSet::default();
    let mut has_entry_group = false;
    for chunk_group in chunk_groups {
        if let ChunkGroup::Entry(entries) = chunk_group {
            has_entry_group = true;
            modules.extend(entries.iter().copied());
        }
    }
    has_entry_group.then(|| modules.into_iter().collect())
}

#[turbo_tasks::function(operation)]
async fn available_modules_operation(
    chunk_group_content: OperationVc<ChunkGroupContentInner>,
) -> Result<Vc<AvailableModulesSet>> {
    Ok(*chunk_group_content.connect().await?.available_modules)
}

#[turbo_tasks::function(operation)]
async fn chunk_group_content_operation(
    module_graph: ResolvedVc<ModuleGraph>,
    chunk_groups: SmallVec<[ChunkGroup; 1]>,
    ChunkGroupContentOptions {
        availability_info,
        can_split_async,
        should_merge_modules,
        batching_config,
    }: ChunkGroupContentOptions,
) -> Result<Vc<ChunkGroupContentInner>> {
    let module_batches_graph = module_graph.module_batches(*batching_config).await?;

    type ModuleToChunkableMap = FxHashMap<ModuleOrBatch, ChunkableModuleOrBatch>;

    struct TraverseState {
        unsorted_items: ModuleToChunkableMap,
        chunkable_items: FxIndexSet<ChunkableModuleOrBatch>,
        async_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
        collecting_modules: FxIndexSet<ResolvedVc<Box<dyn CollectingModule>>>,
    }

    let mut state = TraverseState {
        unsorted_items: FxHashMap::default(),
        chunkable_items: FxIndexSet::default(),
        async_modules: FxIndexSet::default(),
        collecting_modules: FxIndexSet::default(),
    };

    let available_modules = match availability_info.available_modules() {
        Some(available_modules) => Some(available_modules.snapshot().await?),
        None => None,
    };

    // The entries of all groups, in list order. An entry shared by several groups is traversed
    // once.
    let entries = chunk_groups
        .iter()
        .flat_map(|chunk_group| chunk_group.entries())
        .collect::<FxIndexSet<_>>()
        .into_iter()
        .map(|entry| module_batches_graph.get_entry_index(entry))
        .try_join()
        .await?;

    let active_page_entries: Option<FxHashSet<ResolvedVc<Box<dyn Module>>>> =
        if let Some(entry_modules) = entry_group_modules(&chunk_groups) {
            Some(entry_modules.into_iter().collect())
        } else if let Some(entry_group) = availability_info.entry_group() {
            Some(entry_group.await?.iter().copied().collect())
        } else {
            None
        };

    {
        let _span = tracing::trace_span!("traversal").entered();
        module_batches_graph.traverse_edges_from_entries_dfs(
            entries,
            active_page_entries.as_ref(),
            &mut state,
            |parent_info, &node, state| {
                if matches!(node, ModuleOrBatch::None(_)) {
                    return Ok(GraphTraversalAction::Continue);
                }
                // Traced modules are completely ignored during chunking
                if let Some((
                    _,
                    ModuleBatchesGraphEdge {
                        ty: ChunkingType::Traced { .. },
                        ..
                    },
                )) = parent_info
                {
                    return Ok(GraphTraversalAction::Exclude);
                }

                if let Some(collecting_module) = parent_info
                    .and_then(|(_, edge)| edge.module)
                    .and_then(ResolvedVc::try_downcast::<Box<dyn CollectingModule>>)
                {
                    state.collecting_modules.insert(collecting_module);
                    return Ok(GraphTraversalAction::Continue);
                }

                let Some(chunkable_node) = ChunkableModuleOrBatch::from_module_or_batch(node)
                else {
                    return Ok(GraphTraversalAction::Exclude);
                };

                let is_available = available_modules
                    .as_ref()
                    .is_some_and(|available_modules| available_modules.get(chunkable_node.into()));

                let Some((_, edge)) = parent_info else {
                    // An entry from the entries list
                    return Ok(if is_available {
                        GraphTraversalAction::Exclude
                    } else if state
                        .unsorted_items
                        .try_insert(node, chunkable_node)
                        .is_ok()
                    {
                        GraphTraversalAction::Continue
                    } else {
                        GraphTraversalAction::Exclude
                    });
                };

                Ok(match edge.ty {
                    ChunkingType::Parallel { .. }
                    | ChunkingType::Shared { .. }
                    | ChunkingType::Collected { .. } => {
                        if is_available {
                            GraphTraversalAction::Exclude
                        } else if state
                            .unsorted_items
                            .try_insert(node, chunkable_node)
                            .is_ok()
                        {
                            GraphTraversalAction::Continue
                        } else {
                            GraphTraversalAction::Exclude
                        }
                    }
                    ChunkingType::Async => {
                        if can_split_async {
                            let chunkable_module =
                                ResolvedVc::try_downcast(edge.module.unwrap())
                                    .context("Module in async chunking edge is not chunkable")?;
                            let is_async_loader_available =
                                available_modules.as_ref().is_some_and(|available_modules| {
                                    available_modules
                                        .get(AvailableModuleItem::AsyncLoader(chunkable_module))
                                });
                            if !is_async_loader_available {
                                state.async_modules.insert(chunkable_module);
                            }
                            GraphTraversalAction::Exclude
                        } else if is_available {
                            GraphTraversalAction::Exclude
                        } else if state
                            .unsorted_items
                            .try_insert(node, chunkable_node)
                            .is_ok()
                        {
                            GraphTraversalAction::Continue
                        } else {
                            GraphTraversalAction::Exclude
                        }
                    }
                    ChunkingType::Traced { .. } => {
                        // handled above before the sidecast
                        unreachable!();
                    }
                    ChunkingType::PerEntry => {
                        // TODO currently not implemented
                        bail!(
                            "ChunkingType::PerEntry is currently only supported for \
                             CollectingModule"
                        );
                    }
                    ChunkingType::Emitted { .. } => {
                        // Already handled during module graph construction
                        GraphTraversalAction::Exclude
                    }
                    ChunkingType::Isolated { .. } => {
                        // TODO currently not implemented
                        GraphTraversalAction::Exclude
                    }
                })
            },
            |_, node, state| {
                // Insert modules in topological order
                if let Some(chunkable_module) = state.unsorted_items.get(node).copied() {
                    state.chunkable_items.insert(chunkable_module);
                }
            },
        )?;
    }

    // This needs to use the unmerged items
    let available_modules: FxIndexSet<AvailableModuleItem> = state
        .chunkable_items
        .iter()
        .copied()
        .map(Into::into)
        .chain(
            state
                .async_modules
                .iter()
                .copied()
                .map(AvailableModuleItem::AsyncLoader),
        )
        .collect();
    let available_modules: ResolvedVc<AvailableModulesSet> =
        Vc::<AvailableModulesSet>::cell(available_modules)
            .to_resolved()
            .await?;

    let should_merge_modules = if should_merge_modules {
        let merged_modules = module_graph.merged_modules();
        let merged_modules_ref = merged_modules.await?;
        Some((merged_modules, merged_modules_ref))
    } else {
        None
    };

    let chunkable_items = if let Some((merged_modules, merged_modules_ref)) = &should_merge_modules
    {
        state
            .chunkable_items
            .into_iter()
            .map(async |chunkable_module| match chunkable_module {
                ChunkableModuleOrBatch::Module(module) => {
                    let module = match merged_modules_ref
                        .should_replace_module(ResolvedVc::upcast(module))
                        .await?
                    {
                        Some(None) => return Ok(None),
                        Some(Some(replacement)) => replacement,
                        None => module,
                    };

                    Ok(Some(ChunkableModuleOrBatch::Module(module)))
                }
                ChunkableModuleOrBatch::Batch(batch) => Ok(Some(ChunkableModuleOrBatch::Batch(
                    map_module_batch(*merged_modules, *batch)
                        .to_resolved()
                        .await?,
                ))),
                ChunkableModuleOrBatch::None(i) => Ok(Some(ChunkableModuleOrBatch::None(i))),
            })
            .try_flat_join()
            .instrument(tracing::trace_span!("replace with merged modules"))
            .await?
    } else {
        state.chunkable_items.into_iter().collect()
    };

    let mut batch_groups = FxIndexSet::default();
    for &module in &chunkable_items {
        if let Some(batch_group) = module_batches_graph.get_batch_group(&module.into()) {
            batch_groups.insert(batch_group);
        }
    }

    let batch_groups = if let Some((merged_modules, _)) = &should_merge_modules {
        batch_groups
            .into_iter()
            .map(|group| map_module_batch_group(*merged_modules, *group).to_resolved())
            .try_join()
            .await?
    } else {
        batch_groups.into_iter().collect()
    };

    Ok(ChunkGroupContentInner {
        chunkable_items,
        batch_groups,
        async_modules: state.async_modules,
        collecting_modules: state.collecting_modules,
        available_modules,
    }
    .cell())
}

#[turbo_tasks::function]
async fn map_module_batch(
    merged_modules: Vc<MergedModuleInfo>,
    batch: Vc<ModuleBatch>,
) -> Result<Vc<ModuleBatch>> {
    let merged_modules = merged_modules.await?;
    let batch_ref = batch.await?;

    let modified = AtomicBool::new(false);
    let modules = batch_ref
        .modules
        .iter()
        .copied()
        .map(async |module| {
            let module = match merged_modules
                .should_replace_module(ResolvedVc::upcast(module))
                .await?
            {
                Some(None) => {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                    return Ok(None);
                }
                Some(Some(replacement)) => {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                    replacement
                }
                None => module,
            };

            Ok(Some(module))
        })
        .try_flat_join()
        .await?;

    if modified.into_inner() {
        Ok(ModuleBatch::new(
            ResolvedVc::deref_vec(modules),
            batch_ref.chunk_groups.clone(),
        ))
    } else {
        Ok(batch)
    }
}

#[turbo_tasks::function]
async fn map_module_batch_group(
    merged_modules: Vc<MergedModuleInfo>,
    group: Vc<ModuleBatchGroup>,
) -> Result<Vc<ModuleBatchGroup>> {
    let merged_modules_ref = merged_modules.await?;
    let group_ref = group.await?;

    let modified = AtomicBool::new(false);
    let items = group_ref
        .items
        .iter()
        .copied()
        .map(async |chunkable_module| match chunkable_module {
            ModuleOrBatch::Module(module) => {
                let module = match merged_modules_ref.should_replace_module(module).await? {
                    Some(None) => {
                        modified.store(true, std::sync::atomic::Ordering::Relaxed);
                        return Ok(None);
                    }
                    Some(Some(replacement)) => {
                        modified.store(true, std::sync::atomic::Ordering::Relaxed);
                        ResolvedVc::upcast(replacement)
                    }
                    None => module,
                };

                Ok(Some(ModuleOrBatch::Module(module)))
            }
            ModuleOrBatch::Batch(batch) => {
                let replacement = map_module_batch(merged_modules, *batch)
                    .to_resolved()
                    .await?;
                if replacement != batch {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                }
                Ok(Some(ModuleOrBatch::Batch(replacement)))
            }
            ModuleOrBatch::None(i) => Ok(Some(ModuleOrBatch::None(i))),
        })
        .try_flat_join()
        .await?;

    if modified.into_inner() {
        Ok(ModuleBatchGroup::new(items, group_ref.chunk_groups.clone()))
    } else {
        Ok(group)
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use smallvec::smallvec;
    use turbo_rcstr::rcstr;
    use turbo_tasks::{Completion, ResolvedVc, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{File, FileContent, FileSystem, VirtualFileSystem};

    use super::{dedup_chunk_groups, entry_group_modules};
    use crate::{
        asset::AssetContent, module::Module, module_graph::chunk_group_info::ChunkGroup,
        raw_module::RawModule, source::Source, virtual_source::VirtualSource,
    };

    async fn test_module(name: &str) -> Result<ResolvedVc<Box<dyn Module>>> {
        let root = VirtualFileSystem::new_with_name(rcstr!("chunk-group-test"))
            .root()
            .await?;
        let source = Vc::upcast::<Box<dyn Source>>(VirtualSource::new(
            root.join(name)?,
            AssetContent::file(FileContent::Content(File::from("")).cell()),
        ));
        Vc::upcast::<Box<dyn Module>>(RawModule::new(source))
            .to_resolved()
            .await
    }

    #[turbo_tasks::function(operation, root)]
    async fn combines_chunk_group_lists_operation() -> Result<Vc<Completion>> {
        let error = dedup_chunk_groups(smallvec![]).unwrap_err().to_string();
        assert_eq!(error, "Cannot chunk an empty list of chunk groups");

        let a = test_module("a.js").await?;
        let b = test_module("b.js").await?;
        let c = test_module("c.js").await?;

        let shared_a = ChunkGroup::Shared(a);
        let shared_b = ChunkGroup::Shared(b);
        let groups = dedup_chunk_groups(smallvec![
            shared_a.clone(),
            shared_b.clone(),
            shared_a.clone()
        ])?;
        assert_eq!(
            groups.iter().map(ChunkGroup::key).collect::<Vec<_>>(),
            vec![shared_a.key(), shared_b.key()]
        );

        assert_eq!(entry_group_modules(&[ChunkGroup::Shared(a)]), None);
        assert_eq!(
            entry_group_modules(&[
                ChunkGroup::Entry(vec![a, b]),
                ChunkGroup::Shared(c),
                ChunkGroup::Entry(vec![b, c]),
            ]),
            Some(vec![a, b, c])
        );

        Ok(Completion::new())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn combines_chunk_group_lists() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            combines_chunk_group_lists_operation()
                .read_strongly_consistent()
                .await?;
            Ok(())
        })
        .await
        .unwrap();
    }
}
