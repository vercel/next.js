use std::{hash::Hash, mem::take};

use super::{balance_queue::BalanceQueue, AggregationContext, AggregationNode, StackVec};

impl<I: Clone + Eq + Hash, D> AggregationNode<I, D> {
    /// Finishes an in progress operation. This might enqueue balancing
    /// operations when they weren't possible due to the in progress operation.
    pub(super) fn finish_in_progress<C: AggregationContext<NodeRef = I, Data = D>>(
        &mut self,
        ctx: &C,
        balance_queue: &mut BalanceQueue<I>,
        node_id: &I,
    ) {
        let value = ctx
            .atomic_in_progress_counter(node_id)
            .fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
        debug_assert!(value > 0);
        if value == 1 {
            if let AggregationNode::Aggegating(aggegating) = &mut *self {
                balance_queue.balance_all(take(&mut aggegating.enqueued_balancing))
            }
        }
    }
}

/// Finishes an in progress operation. This might enqueue balancing
/// operations when they weren't possible due to the in progress operation.
/// This version doesn't require a node guard.
pub fn finish_in_progress_without_node<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    node_id: &C::NodeRef,
) {
    let value = ctx
        .atomic_in_progress_counter(node_id)
        .fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
    debug_assert!(value > 0);
    if value == 1 {
        let mut node = ctx.node(node_id);
        if let AggregationNode::Aggegating(aggegating) = &mut *node {
            balance_queue.balance_all(take(&mut aggegating.enqueued_balancing))
        }
    }
}

/// Starts an in progress operation for all nodes in the list.
pub fn start_in_progress_all<C: AggregationContext>(ctx: &C, node_ids: &StackVec<C::NodeRef>) {
    for node_id in node_ids {
        start_in_progress(ctx, node_id);
    }
}

/// Starts an in progress operation for a node.
pub fn start_in_progress<C: AggregationContext>(ctx: &C, node_id: &C::NodeRef) {
    start_in_progress_count(ctx, node_id, 1);
}

/// Starts multiple in progress operations for a node.
pub fn start_in_progress_count<C: AggregationContext>(ctx: &C, node_id: &C::NodeRef, count: u32) {
    if count == 0 {
        return;
    }
    ctx.atomic_in_progress_counter(node_id)
        .fetch_add(count, std::sync::atomic::Ordering::Release);
}

/// Checks if there is an in progress operation for a node.
/// It doesn't require a lock, but should run under a lock of the node or a
/// follower/inner node.
pub fn is_in_progress<C: AggregationContext>(ctx: &C, node_id: &C::NodeRef) -> bool {
    let counter = ctx
        .atomic_in_progress_counter(node_id)
        .load(std::sync::atomic::Ordering::Acquire);
    counter > 0
}
