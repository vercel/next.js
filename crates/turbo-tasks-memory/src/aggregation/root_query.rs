use std::ops::ControlFlow;

use auto_hash_map::AutoSet;

use super::{AggregationContext, AggregationNode, StackVec};

/// A query about aggregation data in a root node.
pub trait RootQuery {
    type Data;
    type Result;

    /// Processes the aggregated data of a root node. Can decide to stop the
    /// query.
    fn query(&mut self, data: &Self::Data) -> ControlFlow<()>;
    /// Returns the result of the query.
    fn result(self) -> Self::Result;
}

/// Queries the root node of an aggregation tree.
pub fn query_root_info<C: AggregationContext, Q: RootQuery<Data = C::Data>>(
    ctx: &C,
    mut query: Q,
    node_id: C::NodeRef,
) -> Q::Result {
    let mut queue = StackVec::new();
    queue.push(node_id);
    let mut visited = AutoSet::new();
    while let Some(node_id) = queue.pop() {
        let node = ctx.node(&node_id);
        match &*node {
            AggregationNode::Leaf { uppers, .. } => {
                for upper_id in uppers.iter() {
                    if visited.insert(upper_id.clone()) {
                        queue.push(upper_id.clone());
                    }
                }
            }
            AggregationNode::Aggegating(aggegrating) => {
                if let ControlFlow::Break(_) = query.query(&aggegrating.data) {
                    return query.result();
                }
                for upper_id in aggegrating.uppers.iter() {
                    if visited.insert(upper_id.clone()) {
                        queue.push(upper_id.clone());
                    }
                }
            }
        }
    }
    query.result()
}
