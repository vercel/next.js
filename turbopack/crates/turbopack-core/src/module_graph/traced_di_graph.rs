use std::ops::Deref;

use bincode::{Decode, Encode};
use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use turbo_tasks::{
    NonLocalValue,
    debug::ValueDebugFormat,
    trace::{TraceRawVcs, TraceRawVcsContext},
};

#[derive(Clone, Debug, ValueDebugFormat, Serialize, Deserialize, Encode, Decode)]
#[bincode(
    encode_bounds = "N: Serialize, E: Serialize",
    decode_bounds = "N: DeserializeOwned, E: DeserializeOwned",
    borrow_decode_bounds = "N: Deserialize<'__de>, E: Deserialize<'__de>"
)]
pub struct TracedDiGraph<N, E>(#[bincode(with_serde)] pub DiGraph<N, E>);
impl<N, E> Default for TracedDiGraph<N, E> {
    fn default() -> Self {
        Self(Default::default())
    }
}

impl<N, E> TracedDiGraph<N, E> {
    pub fn new(graph: DiGraph<N, E>) -> Self {
        Self(graph)
    }
}

impl<N, E> TraceRawVcs for TracedDiGraph<N, E>
where
    N: TraceRawVcs,
    E: TraceRawVcs,
{
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for node in self.0.node_weights() {
            node.trace_raw_vcs(trace_context);
        }
        for edge in self.0.edge_weights() {
            edge.trace_raw_vcs(trace_context);
        }
    }
}

impl<N, E> Deref for TracedDiGraph<N, E> {
    type Target = DiGraph<N, E>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

unsafe impl<N, E> NonLocalValue for TracedDiGraph<N, E>
where
    N: NonLocalValue,
    E: NonLocalValue,
{
}

/// Iterate the edges of a node REVERSED!
pub fn iter_neighbors_rev<N, E>(
    graph: &DiGraph<N, E>,
    node: NodeIndex,
) -> impl Iterator<Item = (EdgeIndex, NodeIndex)> + '_ {
    let mut walker = graph.neighbors(node).detach();
    std::iter::from_fn(move || walker.next(graph))
}
