//! Algorithm-neutral output types for the style-chunking pipeline.
//!
//! [`StyleGroups`] is the cell type both algorithms — the default ("loose") one in
//! [`super::style_groups_loose`] and the graph-based one in [`super::style_groups_graph`] —
//! produce. Living here means neither algorithm has to import from the other.

use bincode::{Decode, Encode};
use turbo_tasks::{FxIndexMap, OperationValue, ResolvedVc, Vc, trace::TraceRawVcs};

use crate::chunk::{ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo};

/// Wrapper around an `f32` that implements [`TaskInput`] (and the other derives the
/// [`StyleGroupsAlgorithm`] enum needs) by going through the IEEE-754 bit pattern. Use
/// [`F32TaskInput::get`] / [`F32TaskInput::from`] at the boundary; do not match on the inner
/// `u32` directly.
#[turbo_tasks::task_input]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, OperationValue, TraceRawVcs, Encode, Decode)]
pub struct F32TaskInput(u32);

impl F32TaskInput {
    pub const fn from(value: f32) -> Self {
        Self(value.to_bits())
    }
    pub const fn get(self) -> f32 {
        f32::from_bits(self.0)
    }
}

/// Selects the algorithm used to compute [`StyleGroups`].
#[turbo_tasks::value(shared, operation, task_input)]
#[derive(Clone, Debug, Default, Hash)]
pub enum StyleGroupsAlgorithm {
    /// Default ("loose") algorithm, see
    /// [`crate::module_graph::style_groups_loose::compute_style_groups`].
    #[default]
    Default,
    /// Graph-analysis based algorithm, see
    /// [`crate::module_graph::style_groups_graph::compute_style_groups_graph`].
    Graph {
        /// See `experimental.cssChunking.requestCost` in Next.js.
        request_cost: F32TaskInput,
        /// See `experimental.cssChunking.moduleFactorCost` in Next.js.
        module_factor_cost: F32TaskInput,
    },
}

impl StyleGroupsAlgorithm {
    /// Build a [`StyleGroupsAlgorithm::Graph`] variant from real `f32` cost parameters.
    pub fn graph(request_cost: f32, module_factor_cost: f32) -> Self {
        Self::Graph {
            request_cost: F32TaskInput::from(request_cost),
            module_factor_cost: F32TaskInput::from(module_factor_cost),
        }
    }
}

#[turbo_tasks::task_input]
#[derive(Debug, Clone, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub struct StyleGroupsConfig {
    pub max_chunk_size: usize,
    pub algorithm: StyleGroupsAlgorithm,
}

/// Per-item metadata produced by the style chunking algorithms.
#[turbo_tasks::task_input]
#[derive(Debug, Clone, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub struct StyleItemInfo {
    /// Stable sort key applied by the production-chunking pass when ordering chunks within a chunk
    /// group. The loose algorithm produces all `None` orders and relies on input order; the graph
    /// algorithm produces all `Some(_)` orders (including for singletons). Mixing `Some` and
    /// `None` within a single [`StyleGroups`] result is not produced in practice — the
    /// production-chunking sort treats `None` as a sort key that is less than any `Some(_)`, but
    /// this branch is only exercised in the all-`None` (loose) case.
    pub order: Option<u32>,
    /// `Some(batch)` when this chunk item shares its emitted chunk with other items. `None` for
    /// items that end up alone in their own chunk under the graph algorithm.
    pub batch: Option<ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>>,
}

/// Styling must not be duplicated in the application. The simplest way to achieve this is to put
/// every styling chunk item into a separate chunk. That works, but isn't efficient since it would
/// cause a lot of requests. Instead, multiple chunk items are grouped together and placed in a
/// single shared chunk. `StyleGroups` specifies how chunk items are grouped together.
#[turbo_tasks::value(shared)]
pub struct StyleGroups {
    /// Per-item info keyed by chunk item.
    ///
    /// The loose algorithm only inserts items it actively grouped into shared chunks (everything
    /// else is implicitly emitted as a singleton chunk preserving input order). The graph
    /// algorithm inserts every input item — including singletons — so its result fully determines
    /// the final per-chunk-group ordering through `StyleItemInfo::order`.
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
