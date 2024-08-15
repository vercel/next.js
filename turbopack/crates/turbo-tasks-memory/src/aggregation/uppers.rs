use super::{
    balance_queue::BalanceQueue,
    in_progress::start_in_progress_count,
    optimize::{optimize_aggregation_number_for_uppers, MAX_UPPERS},
    AggegatingNode, AggregationContext, AggregationNode, AggregationNodeGuard,
    PreparedInternalOperation, PreparedOperation, StackVec,
};
use crate::count_hash_set::RemovePositiveCountResult;

/// Adds an upper node to a node. Returns the number of affected nodes by this
/// operation. This will also propagate the followers to the new upper node.
pub fn add_upper<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    node: C::Guard<'_>,
    node_id: &C::NodeRef,
    upper_id: &C::NodeRef,
    already_optimizing_for_upper: bool,
) -> usize {
    add_upper_count(
        ctx,
        balance_queue,
        node,
        node_id,
        upper_id,
        1,
        already_optimizing_for_upper,
    )
    .affected_nodes
}

pub struct AddUpperCountResult {
    pub new_count: isize,
    pub affected_nodes: usize,
}

/// Adds an upper node to a node with a given count. Returns the new count of
/// the upper node and the number of affected nodes by this operation. This will
/// also propagate the followers to the new upper node.
pub fn add_upper_count<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    node_id: &C::NodeRef,
    upper_id: &C::NodeRef,
    count: usize,
    already_optimizing_for_upper: bool,
) -> AddUpperCountResult {
    // TODO add_clonable_count could return the current count for better performance
    let (added, count) = match &mut *node {
        AggregationNode::Leaf { uppers, .. } => {
            if uppers.add_clonable_count(upper_id, count) {
                let count = uppers.get_count(upper_id);
                (true, count)
            } else {
                (false, uppers.get_count(upper_id))
            }
        }
        AggregationNode::Aggegating(aggegating) => {
            let AggegatingNode { ref mut uppers, .. } = **aggegating;
            if uppers.add_clonable_count(upper_id, count) {
                let count = uppers.get_count(upper_id);
                (true, count)
            } else {
                (false, uppers.get_count(upper_id))
            }
        }
    };
    let mut affected_nodes = 0;
    if added {
        affected_nodes = on_added(
            ctx,
            balance_queue,
            node,
            node_id,
            upper_id,
            already_optimizing_for_upper,
        );
    } else {
        drop(node);
    }
    AddUpperCountResult {
        new_count: count,
        affected_nodes,
    }
}

/// Called when an upper node was added to a node. This will propagate the
/// followers to the new upper node.
pub fn on_added<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    node_id: &C::NodeRef,
    upper_id: &C::NodeRef,
    already_optimizing_for_upper: bool,
) -> usize {
    let uppers = node.uppers();
    let uppers_len = uppers.len();
    let optimize =
        (!already_optimizing_for_upper && uppers_len >= MAX_UPPERS && uppers_len.count_ones() == 1)
            .then(|| (true, uppers.iter().cloned().collect::<StackVec<_>>()));
    let (add_change, followers) = match &mut *node {
        AggregationNode::Leaf { .. } => {
            let add_change = node.get_add_change();
            let children = node.children().collect::<StackVec<_>>();
            start_in_progress_count(ctx, upper_id, children.len() as u32);
            drop(node);
            (add_change, children)
        }
        AggregationNode::Aggegating(aggegating) => {
            let AggegatingNode { ref followers, .. } = **aggegating;
            let add_change = ctx.data_to_add_change(&aggegating.data);
            let followers = followers.iter().cloned().collect::<StackVec<_>>();
            start_in_progress_count(ctx, upper_id, followers.len() as u32);
            drop(node);

            (add_change, followers)
        }
    };

    let mut optimizing = false;

    // This heuristic ensures that we don’t have too many upper edges, which would
    // degrade update performance
    if let Some((leaf, uppers)) = optimize {
        optimizing =
            optimize_aggregation_number_for_uppers(ctx, balance_queue, node_id, leaf, uppers);
    }

    let mut affected_nodes = 0;

    // Make sure to propagate the change to the upper node
    let mut upper = ctx.node(upper_id);
    let add_prepared = add_change.and_then(|add_change| upper.apply_change(ctx, add_change));
    affected_nodes += followers.len();
    let prepared = followers
        .into_iter()
        .filter_map(|child_id| {
            upper.notify_new_follower(ctx, balance_queue, upper_id, &child_id, optimizing)
        })
        .collect::<StackVec<_>>();
    drop(upper);
    add_prepared.apply(ctx);
    for prepared in prepared {
        affected_nodes += prepared.apply(ctx, balance_queue);
    }

    affected_nodes
}

/// Removes an upper node from a node with a count.
pub fn remove_upper_count<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    upper_id: &C::NodeRef,
    count: usize,
) {
    let uppers = match &mut *node {
        AggregationNode::Leaf { uppers, .. } => uppers,
        AggregationNode::Aggegating(aggegating) => {
            let AggegatingNode { ref mut uppers, .. } = **aggegating;
            uppers
        }
    };
    let removed = uppers.remove_clonable_count(upper_id, count);
    if removed {
        uppers.shrink_amortized();
        on_removed(ctx, balance_queue, node, upper_id);
    }
}

pub struct RemovePositiveUpperCountResult {
    pub removed_count: usize,
    pub remaining_count: isize,
}

/// Removes a positive count of an upper node from a node.
/// Returns the removed count and the remaining count of the upper node.
/// This will also propagate the followers to the removed upper node.
pub fn remove_positive_upper_count<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    upper_id: &C::NodeRef,
    count: usize,
) -> RemovePositiveUpperCountResult {
    let uppers = match &mut *node {
        AggregationNode::Leaf { uppers, .. } => uppers,
        AggregationNode::Aggegating(aggegating) => {
            let AggegatingNode { ref mut uppers, .. } = **aggegating;
            uppers
        }
    };
    let RemovePositiveCountResult {
        removed,
        removed_count,
        count,
    } = uppers.remove_positive_clonable_count(upper_id, count);
    if removed {
        uppers.shrink_amortized();
        on_removed(ctx, balance_queue, node, upper_id);
    }
    RemovePositiveUpperCountResult {
        removed_count,
        remaining_count: count,
    }
}

/// Called when an upper node was removed from a node. This will propagate the
/// followers to the removed upper node.
pub fn on_removed<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    node: C::Guard<'_>,
    upper_id: &C::NodeRef,
) {
    match &*node {
        AggregationNode::Leaf { .. } => {
            let remove_change = node.get_remove_change();
            let children = node.children().collect::<StackVec<_>>();
            drop(node);
            let mut upper = ctx.node(upper_id);
            let remove_prepared =
                remove_change.and_then(|remove_change| upper.apply_change(ctx, remove_change));
            start_in_progress_count(ctx, upper_id, children.len() as u32);
            let prepared = children
                .into_iter()
                .map(|child_id| upper.notify_lost_follower(ctx, balance_queue, upper_id, &child_id))
                .collect::<StackVec<_>>();
            drop(upper);
            remove_prepared.apply(ctx);
            prepared.apply(ctx, balance_queue);
        }
        AggregationNode::Aggegating(aggegating) => {
            let remove_change = ctx.data_to_remove_change(&aggegating.data);
            let followers = aggegating
                .followers
                .iter()
                .cloned()
                .collect::<StackVec<_>>();
            drop(node);
            let mut upper = ctx.node(upper_id);
            let remove_prepared =
                remove_change.and_then(|remove_change| upper.apply_change(ctx, remove_change));
            start_in_progress_count(ctx, upper_id, followers.len() as u32);
            let prepared = followers
                .into_iter()
                .map(|child_id| upper.notify_lost_follower(ctx, balance_queue, upper_id, &child_id))
                .collect::<StackVec<_>>();
            drop(upper);
            remove_prepared.apply(ctx);
            prepared.apply(ctx, balance_queue);
        }
    }
}
