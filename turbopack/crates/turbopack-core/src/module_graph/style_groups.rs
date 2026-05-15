//! Shared post-order walk that collects each chunk group's CSS modules plus per-module
//! metadata. Used by both style-chunking algorithms ([`super::style_groups_loose`] and
//! [`super::style_groups_graph`]).

use anyhow::Result;
use indexmap::map::Entry;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, ValueToString, Vc};

use crate::{
    chunk::{
        ChunkItemWithAsyncModuleInfo, ChunkType, ChunkableModule, ChunkingContext,
        chunk_item_batch::attach_async_info_to_chunkable_module,
    },
    module::{Module, StyleModule, StyleType},
    module_graph::{
        GraphTraversalAction, ModuleGraph, module_batch::ModuleOrBatch,
        module_batches::ModuleBatchesGraphEdge,
    },
};

#[derive(Debug)]
pub(super) struct ModuleInfo {
    pub(super) style_type: StyleType,
    pub(super) ident: RcStr,
    pub(super) chunk_group_indices: FxHashMap<usize, usize>,
    pub(super) index_sum: usize,
    pub(super) size: usize,
    pub(super) chunk_item: Option<ChunkItemWithAsyncModuleInfo>,
}

impl ModuleInfo {
    fn new(style_type: StyleType, ident: RcStr) -> Self {
        Self {
            style_type,
            ident,
            chunk_group_indices: Default::default(),
            index_sum: 0,
            size: 0,
            chunk_item: None,
        }
    }
}

pub(super) struct ChunkGroupState {
    pub(super) styles: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
    /// Number of distinct chunks this chunk group still needs to load. The loose algorithm
    /// decrements this as it merges items into shared chunks.
    pub(super) requests: usize,
}

/// Per-chunk-group style module collection plus per-module metadata.
pub(super) struct StyleCollection {
    /// Per-module info, keyed by chunkable module. After collection, every value is `Some`
    /// (vacant entries used while traversing have been dropped). The map is sorted by
    /// `(index_sum, ident)` so insertion order is deterministic.
    pub(super) module_info_map:
        FxIndexMap<ResolvedVc<Box<dyn ChunkableModule>>, Option<ModuleInfo>>,
    /// Per-chunk-group state. Indexed by the same `idx` stored in
    /// `ModuleInfo::chunk_group_indices`.
    pub(super) chunk_group_state: Vec<ChunkGroupState>,
}

/// Walk every chunk group in `module_graph` post-order, collecting:
///  * the ordered list of CSS modules each chunk group loads,
///  * per-module metadata (style type, ident, size, chunk item, and per-group position).
pub(super) async fn collect_style_modules_per_chunk_group(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<StyleCollection> {
    let chunk_group_info = module_graph.chunk_group_info().await?;
    let batches_graph = module_graph
        .module_batches(chunking_context.batching_config())
        .await?;
    let async_module_info = module_graph.async_module_info();
    let mut module_info_map: FxIndexMap<ResolvedVc<Box<dyn ChunkableModule>>, Option<ModuleInfo>> =
        FxIndexMap::default();

    // Compute the style modules in each chunk group
    let mut chunk_group_state: Vec<ChunkGroupState> = Vec::new();
    let mut idx = 0;
    for (i, chunk_group) in chunk_group_info.chunk_groups.iter().enumerate() {
        let ordered_entries = batches_graph.get_ordered_entries(&chunk_group_info, i);
        let mut entries = Vec::with_capacity(chunk_group.entries_count());
        for entry in ordered_entries {
            entries.push(batches_graph.get_entry_index(entry).await?);
        }
        let mut visited = FxHashSet::default();
        let mut items_in_postorder = FxIndexSet::default();
        batches_graph.traverse_edges_from_entries_dfs(
            entries.iter().copied(),
            &mut (),
            |parent_info, module, _| {
                if let Some((_, ModuleBatchesGraphEdge { ty, .. })) = parent_info
                    && !ty.is_parallel()
                {
                    return Ok(GraphTraversalAction::Exclude);
                }
                if visited.insert(module) {
                    Ok(GraphTraversalAction::Continue)
                } else {
                    Ok(GraphTraversalAction::Exclude)
                }
            },
            |parent_info, item, _| {
                if let Some((_, ModuleBatchesGraphEdge { ty, .. })) = parent_info
                    && !ty.is_parallel()
                {
                    return;
                }
                items_in_postorder.insert(*item);
            },
        )?;

        let mut styles = FxIndexSet::default();
        let mut handle_module = async |module| {
            match module_info_map.entry(module) {
                Entry::Occupied(mut e) => {
                    if let Some(info) = e.get_mut() {
                        info.chunk_group_indices.insert(idx, styles.len());
                        info.index_sum += styles.len();
                        styles.insert(module);
                    }
                }
                Entry::Vacant(e) => {
                    if let Some(style_module) =
                        ResolvedVc::try_sidecast::<Box<dyn StyleModule>>(module)
                    {
                        let style_type = *style_module.style_type().await?;
                        let mut info =
                            ModuleInfo::new(style_type, module.ident().to_string().owned().await?);
                        info.chunk_group_indices.insert(idx, styles.len());
                        info.index_sum += styles.len();
                        styles.insert(module);
                        e.insert(Some(info));
                    } else {
                        e.insert(None);
                    }
                }
            }
            anyhow::Ok(())
        };

        for item in items_in_postorder {
            match item {
                ModuleOrBatch::Batch(batch) => {
                    for &module in &batch.await?.modules {
                        handle_module(module).await?;
                    }
                }
                ModuleOrBatch::Module(module) => {
                    if let Some(chunkable_module) = ResolvedVc::try_downcast(module) {
                        handle_module(chunkable_module).await?;
                    }
                }
                ModuleOrBatch::None(_) => {}
            }
        }

        if !styles.is_empty() {
            chunk_group_state.push(ChunkGroupState {
                requests: styles.len(),
                styles,
            });
            idx += 1;
        }
    }

    module_info_map.retain(|_, info| info.is_some());

    module_info_map.sort_by(|_, a, _, b| {
        let a = a.as_ref().unwrap();
        let b = b.as_ref().unwrap();
        a.index_sum
            .cmp(&b.index_sum)
            .then_with(|| a.ident.cmp(&b.ident))
    });

    // Compute the chunk item and size of each module
    let chunk_item_and_sizes = module_info_map
        .keys()
        .map(async |&module| {
            let chunk_item = attach_async_info_to_chunkable_module(
                module,
                async_module_info,
                module_graph,
                chunking_context,
            )
            .await?;
            let size = *chunk_item
                .chunk_type
                .chunk_item_size(chunking_context, *chunk_item.chunk_item, None)
                .await?;
            Ok((chunk_item, size))
        })
        .try_join()
        .await?;
    module_info_map
        .iter_mut()
        .zip(chunk_item_and_sizes)
        .for_each(|((_, info), (chunk_item, size))| {
            let info = info.as_mut().unwrap();
            info.size = size;
            info.chunk_item = Some(chunk_item);
        });

    Ok(StyleCollection {
        module_info_map,
        chunk_group_state,
    })
}
