use super::{AggregationContext, AggregationNode, AggregationNodeGuard, StackVec};

pub fn get_aggregated_remove_change<C: AggregationContext>(
    ctx: &C,
    guard: &C::Guard<'_>,
) -> Option<C::DataChange> {
    match &**guard {
        AggregationNode::Leaf { .. } => guard.get_remove_change(),
        AggregationNode::Aggegating(aggegating) => ctx.data_to_remove_change(&aggegating.data),
    }
}

pub fn get_aggregated_add_change<C: AggregationContext>(
    ctx: &C,
    guard: &C::Guard<'_>,
) -> Option<C::DataChange> {
    match &**guard {
        AggregationNode::Leaf { .. } => guard.get_add_change(),
        AggregationNode::Aggegating(aggegating) => ctx.data_to_add_change(&aggegating.data),
    }
}

pub fn get_followers_or_children<C: AggregationContext>(
    _ctx: &C,
    guard: &C::Guard<'_>,
) -> StackVec<C::NodeRef> {
    match &**guard {
        AggregationNode::Leaf { .. } => guard.children().collect(),
        AggregationNode::Aggegating(aggegating) => aggegating.followers.iter().cloned().collect(),
    }
}
