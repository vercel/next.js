use anyhow::{Context, Result};
use swc_core::alloc::collections::FxHashMap;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, Vc};

use super::{availability_info, ChunkGroupContent, ChunkableModule, ChunkingType};
use crate::{
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
};

type ModuleToChunkableMap =
    FxHashMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn ChunkableModule>>>;

#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
pub struct ChunkGraph {
    graph: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::value_impl]
impl ChunkGraph {
    #[turbo_tasks::function]
    pub fn new(graph: ResolvedVc<ModuleGraph>) -> Vc<Self> {
        Self { graph }.cell()
    }
}

impl ChunkGraph {
    pub async fn chunk_group_content(
        &self,
        chunk_group_entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        availability_info: availability_info::AvailabilityInfo,
        can_split_async: bool,
        should_trace: bool,
    ) -> Result<ChunkGroupContent> {
        struct TraverseState {
            unsorted_chunkable_modules: ModuleToChunkableMap,
            result: ChunkGroupContent,
        }

        let mut state = TraverseState {
            unsorted_chunkable_modules: FxHashMap::default(),
            result: ChunkGroupContent {
                chunkable_modules: FxIndexSet::default(),
                async_modules: FxIndexSet::default(),
                traced_modules: FxIndexSet::default(),
                passthrough_modules: FxIndexSet::default(),
                forward_edges_inherit_async: FxIndexMap::default(),
                local_back_edges_inherit_async: FxIndexMap::default(),
                available_async_modules_back_edges_inherit_async: FxIndexMap::default(),
            },
        };

        let graph = self.graph.await?;
        let available_modules = match availability_info.available_modules() {
            Some(available_modules) => Some(available_modules.snapshot().await?),
            None => None,
        };

        graph
            .traverse_edges_from_entries_topological(
                chunk_group_entries,
                &mut state,
                |parent_info,
                 node,
                 TraverseState {
                     unsorted_chunkable_modules,
                     result,
                 }| {
                    let Some(chunkable_module) =
                        ResolvedVc::try_sidecast_sync::<Box<dyn ChunkableModule>>(node.module)
                    else {
                        return Ok(GraphTraversalAction::Skip);
                    };

                    let available_info = available_modules
                        .as_ref()
                        .and_then(|available_modules| available_modules.get(chunkable_module));

                    let Some((parent_node, edge)) = parent_info else {
                        return Ok(if available_info.is_some() {
                            GraphTraversalAction::Skip
                        } else {
                            unsorted_chunkable_modules.insert(node.module, chunkable_module);
                            GraphTraversalAction::Continue
                        });
                    };

                    let parent_module = ResolvedVc::try_sidecast_sync::<Box<dyn ChunkableModule>>(
                        parent_node.module,
                    )
                    .context("Expected parent module to be chunkable")?;

                    Ok(match edge {
                        ChunkingType::Passthrough => {
                            result.passthrough_modules.insert(chunkable_module);
                            GraphTraversalAction::Continue
                        }
                        ChunkingType::Parallel => {
                            if available_info.is_some() {
                                GraphTraversalAction::Skip
                            } else {
                                unsorted_chunkable_modules.insert(node.module, chunkable_module);
                                GraphTraversalAction::Continue
                            }
                        }
                        ChunkingType::ParallelInheritAsync => {
                            result
                                .forward_edges_inherit_async
                                .entry(parent_module)
                                .or_default()
                                .push(chunkable_module);
                            if let Some(info) = available_info {
                                if info.is_async {
                                    result
                                        .available_async_modules_back_edges_inherit_async
                                        .entry(chunkable_module)
                                        .or_default()
                                        .push(parent_module);
                                }
                                GraphTraversalAction::Skip
                            } else {
                                result
                                    .local_back_edges_inherit_async
                                    .entry(chunkable_module)
                                    .or_default()
                                    .push(parent_module);
                                unsorted_chunkable_modules.insert(node.module, chunkable_module);
                                GraphTraversalAction::Continue
                            }
                        }
                        ChunkingType::Async => {
                            if can_split_async {
                                result.async_modules.insert(chunkable_module);
                                GraphTraversalAction::Skip
                            } else if available_info.is_some() {
                                GraphTraversalAction::Skip
                            } else {
                                unsorted_chunkable_modules.insert(node.module, chunkable_module);
                                GraphTraversalAction::Continue
                            }
                        }
                        ChunkingType::Traced => {
                            if should_trace {
                                result.traced_modules.insert(node.module);
                            }
                            GraphTraversalAction::Skip
                        }
                        ChunkingType::Isolated { .. } => GraphTraversalAction::Skip,
                    })
                },
                |_,
                 node,
                 TraverseState {
                     unsorted_chunkable_modules,
                     result,
                 }| {
                    // Insert modules in topological order
                    if let Some(chunkable_module) =
                        unsorted_chunkable_modules.get(&node.module).copied()
                    {
                        result.chunkable_modules.insert(chunkable_module);
                    }
                },
            )
            .await?;

        Ok(state.result)
    }
}
