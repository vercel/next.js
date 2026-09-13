use anyhow::Result;
use bincode::{Decode, Encode};
use bitfield::bitfield;
use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, OperationVc, ResolvedVc, Vc, trace::TraceRawVcs};

use crate::{
    chunk::{
        ChunkableModule, ChunkingContext, ChunkingType,
        available_modules::{AvailableModuleItem, AvailableModules, AvailableModulesSet},
    },
    module::{Module, Modules},
    module_graph::{
        GraphTraversalAction, ModuleGraph,
        module_batch::{ChunkableModuleOrBatch, ModuleOrBatch},
    },
};

bitfield! {
    #[turbo_tasks::task_input]
    #[derive(Clone, Copy, Default, TraceRawVcs, PartialEq, Eq, Hash, Encode, Decode)]
    pub struct AvailabilityFlags(u8);
    impl Debug;
    pub is_in_async_module, set_is_in_async_module: 0;
}

#[turbo_tasks::task_input]
#[derive(Eq, PartialEq, Hash, Clone, Copy, Debug, TraceRawVcs, Encode, Decode)]
pub struct AvailabilityInfo {
    flags: AvailabilityFlags,
    /// There are modules already available.
    available_modules: Option<ResolvedVc<AvailableModules>>,
    /// The root ChunkGroup::Entry
    entry_group: Option<ResolvedVc<Modules>>,
}

impl AvailabilityInfo {
    pub fn root() -> Self {
        Self {
            flags: AvailabilityFlags::default(),
            available_modules: None,
            entry_group: None,
        }
    }

    pub fn available_modules(&self) -> Option<ResolvedVc<AvailableModules>> {
        self.available_modules
    }

    pub async fn with_modules(self, modules: OperationVc<AvailableModulesSet>) -> Result<Self> {
        Ok(if let Some(available_modules) = self.available_modules {
            Self {
                flags: self.flags,
                available_modules: Some(
                    available_modules
                        .with_modules(modules)
                        .to_resolved()
                        .await?,
                ),
                entry_group: self.entry_group,
            }
        } else {
            Self {
                flags: self.flags,
                available_modules: Some(AvailableModules::new(modules).to_resolved().await?),
                entry_group: self.entry_group,
            }
        })
    }

    /// Replaces the available modules with a flat, single-link set, discarding the parent chain.
    ///
    /// Used to build a minimal `AvailabilityInfo` for async loaders: the set is pre-filtered to
    /// the modules that the loader's target can actually observe, so many different parent
    /// availabilities collapse onto the same value.
    pub fn with_flattened_modules(self, modules: ResolvedVc<AvailableModules>) -> Self {
        Self {
            flags: self.flags,
            available_modules: Some(modules),
            entry_group: self.entry_group,
        }
    }

    /// Removes the entry group. Only valid when no `ChunkingType::Collected` edge is reachable,
    /// since the entry group exists to activate those edges during traversal.
    pub fn without_entry_group(self) -> Self {
        Self {
            flags: self.flags,
            available_modules: self.available_modules,
            entry_group: None,
        }
    }

    pub fn in_async_module(self) -> Self {
        let mut flags = self.flags;
        flags.set_is_in_async_module(true);
        Self {
            flags,
            available_modules: self.available_modules,
            entry_group: self.entry_group,
        }
    }

    pub fn is_in_async_module(&self) -> bool {
        self.flags.is_in_async_module()
    }

    pub fn with_entry_group(self, entry_group: ResolvedVc<Modules>) -> Self {
        Self {
            flags: self.flags,
            available_modules: self.available_modules,
            entry_group: Some(entry_group),
        }
    }

    pub fn entry_group(&self) -> Option<ResolvedVc<Modules>> {
        self.entry_group
    }

    pub async fn ident(&self) -> Result<Option<RcStr>> {
        Ok(if let Some(available_modules) = self.available_modules {
            Some(available_modules.hash().await?.to_string().into())
        } else {
            None
        })
    }
}

/// Narrows `availability_info` to the part that an async chunk group rooted at `module` can
/// observe, discarding the parent chain.
///
/// A synthesized module that wraps an async chunk group (an async loader or a manifest chunk) is
/// keyed by the availability of whichever parent chunk group reached it. That availability
/// influences the result only through the chunk group of `module`, which only queries availability
/// for modules reachable from `module`. Everything else is an over-approximation that splits the
/// synthesized module into one copy per parent, even when every copy produces identical code.
///
/// Narrowing to the reachable set lets many parents collapse onto one cell, so the chunk group,
/// its chunk items and its output chunk are computed once instead of once per parent.
///
/// The reachable set is taken over the whole subgraph, *including* across async edges: the result
/// replaces the parent chain, and nested chunk groups chain their own availability onto it, so
/// anything a nested group might observe has to survive the filter.
///
/// `entry_group` is preserved, since it decides which `ChunkingType::Collected` edges are active
/// during traversal. When the graph has no collected modules at all, no such edge can exist and it
/// is dropped, which is what lets sibling entries share a cell.
pub async fn availability_info_for_async_chunk_group(
    module: ResolvedVc<Box<dyn ChunkableModule>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
    availability_info: AvailabilityInfo,
) -> Result<AvailabilityInfo> {
    let Some(available_modules) = availability_info.available_modules() else {
        return Ok(availability_info);
    };
    let snapshot = available_modules.snapshot().await?;
    let batches = module_graph
        .module_batches(chunking_context.batching_config())
        .await?;

    // Walk the subgraph reachable from the target, keeping the available items among it.
    // `active_page_entries` is passed through so the same `Collected` edges are active here as in
    // `chunk_group_content`.
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

            // The chunk group stops at async edges, probing only the `AsyncLoader` item, but a
            // nested chunk group chains its availability onto this one — so keep walking past the
            // edge and collect what lies behind it too.
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
            // Keep descending even through available nodes: `chunk_group_content` prunes there,
            // but a nested chunk group inheriting this set may not.
            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| {},
    )?;

    let flattened = AvailableModules::new(available_modules_set(filtered.into_iter().collect()))
        .to_resolved()
        .await?;
    let mut availability_info = availability_info.with_flattened_modules(flattened);
    if module_graph.collected_modules().await?.is_empty() {
        availability_info = availability_info.without_entry_group();
    }
    Ok(availability_info)
}

/// Re-exposes an already-computed set as an operation.
///
/// [`AvailableModules`] stores its set as an [`OperationVc`], whose identity is the task it came
/// from. Keying that task on the set *contents* is what makes two parents with equal filtered
/// availability share one `AvailableModules` cell.
#[turbo_tasks::function(operation)]
fn available_modules_set(items: Vec<AvailableModuleItem>) -> Vc<AvailableModulesSet> {
    Vc::cell(items.into_iter().collect())
}
