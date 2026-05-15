//! Algorithm-neutral output types for the style-chunking pipeline.
//!
//! [`StyleGroups`] is the cell type both algorithms — the default ("loose") one in
//! [`super::style_groups_loose`] and the graph-based one in [`super::style_groups_graph`] —
//! produce. Living here means neither algorithm has to import from the other.

use bincode::{Decode, Encode};
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};

use crate::chunk::{ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo};

/// Per-item metadata produced by the style chunking algorithms.
#[derive(
    Debug, Clone, PartialEq, Eq, Hash, NonLocalValue, TraceRawVcs, Encode, Decode, TaskInput,
)]
pub struct StyleItemInfo {
    /// Stable sort key applied by the production-chunking pass when ordering chunks within a chunk
    /// group. `None` means "no preferred order" — entries with `None` keep their original input
    /// position relative to each other (the legacy algorithm produces all `None`).
    pub order: Option<u32>,
    /// `Some(batch)` when this chunk item shares its emitted chunk with other items. `None` for
    /// items that end up alone in their own chunk under the graph algorithm.
    pub batch: Option<ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>>,
}

/// Styling must not be duplicated in the application. The simplest way to achieve this is to put
/// every styling chunk item into a separate chunk. That works, but isn't efficient since it would
/// cause a lot of requests. Instead we multiple chunk items are groups together and placed in a
/// single shared chunk. `StyleGroups` specifies how chunk items are grouped together.
#[turbo_tasks::value(shared)]
pub struct StyleGroups {
    /// Per-item info keyed by chunk item. Items not present in this map are emitted as a separate
    /// chunk per item with the original input order.
    #[bincode(with = "turbo_bincode::indexmap")]
    pub shared_chunk_items: FxIndexMap<ChunkItemWithAsyncModuleInfo, StyleItemInfo>,
}

/// Constructor for [`StyleGroups`] that's accessible from both algorithm modules without
/// forcing the cell visibility wider.
pub(super) fn make_style_groups(
    shared_chunk_items: FxIndexMap<ChunkItemWithAsyncModuleInfo, StyleItemInfo>,
) -> Vc<StyleGroups> {
    StyleGroups { shared_chunk_items }.cell()
}
