use super::{
    balance_queue::BalanceQueue,
    in_progress::start_in_progress_all,
    notify_lost_follower, notify_new_follower,
    optimize::{optimize_aggregation_number_for_followers, MAX_FOLLOWERS},
    AggregationContext, AggregationNode, StackVec,
};
use crate::count_hash_set::RemovePositiveCountResult;

/// Add a follower to a node. Followers will be propagated to the uppers of the
/// node.
pub fn add_follower<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    node_id: &C::NodeRef,
    follower_id: &C::NodeRef,
    already_optimizing_for_node: bool,
) -> usize {
    let AggregationNode::Aggegating(aggregating) = &mut *node else {
        unreachable!();
    };
    if aggregating.followers.add_clonable(follower_id) {
        on_added(
            ctx,
            balance_queue,
            node,
            node_id,
            follower_id,
            already_optimizing_for_node,
        )
    } else {
        0
    }
}

/// Handle the addition of a follower to a node. This function is called after
/// the follower has been added to the node.
pub fn on_added<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    node_id: &C::NodeRef,
    follower_id: &C::NodeRef,
    already_optimizing_for_node: bool,
) -> usize {
    let AggregationNode::Aggegating(aggregating) = &mut *node else {
        unreachable!();
    };
    let followers_len = aggregating.followers.len();
    let optimize = (!already_optimizing_for_node
        && followers_len >= MAX_FOLLOWERS
        && followers_len.count_ones() == 1)
        .then(|| {
            aggregating
                .followers
                .iter()
                .cloned()
                .collect::<StackVec<_>>()
        });
    let uppers = aggregating.uppers.iter().cloned().collect::<StackVec<_>>();
    start_in_progress_all(ctx, &uppers);
    drop(node);

    let mut optimizing = false;

    if let Some(followers) = optimize {
        optimizing = optimize_aggregation_number_for_followers(
            ctx,
            balance_queue,
            node_id,
            followers,
            false,
        );
    }

    let mut affected_nodes = uppers.len();
    for upper_id in uppers {
        affected_nodes += notify_new_follower(
            ctx,
            balance_queue,
            ctx.node(&upper_id),
            &upper_id,
            follower_id,
            optimizing,
        );
    }
    affected_nodes
}

/// Add a follower to a node with a count. Followers will be propagated to the
/// uppers of the node.
pub fn add_follower_count<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    node_id: &C::NodeRef,
    follower_id: &C::NodeRef,
    follower_count: usize,
    already_optimizing_for_node: bool,
) -> isize {
    let AggregationNode::Aggegating(aggregating) = &mut *node else {
        unreachable!();
    };
    if aggregating
        .followers
        .add_clonable_count(follower_id, follower_count)
    {
        let count = aggregating.followers.get_count(follower_id);
        on_added(
            ctx,
            balance_queue,
            node,
            node_id,
            follower_id,
            already_optimizing_for_node,
        );
        count
    } else {
        aggregating.followers.get_count(follower_id)
    }
}

/// Remove a follower from a node. Followers will be propagated to the uppers of
/// the node.
pub fn remove_follower_count<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    follower_id: &C::NodeRef,
    follower_count: usize,
) {
    let AggregationNode::Aggegating(aggregating) = &mut *node else {
        unreachable!();
    };
    if aggregating
        .followers
        .remove_clonable_count(follower_id, follower_count)
    {
        let uppers = aggregating.uppers.iter().cloned().collect::<StackVec<_>>();
        start_in_progress_all(ctx, &uppers);
        drop(node);
        for upper_id in uppers {
            notify_lost_follower(
                ctx,
                balance_queue,
                ctx.node(&upper_id),
                &upper_id,
                follower_id,
            );
        }
    }
}

pub struct RemovePositveFollowerCountResult {
    /// The amount of followers that have been removed.
    pub removed_count: usize,
    /// The amount of followers that are remaining. Might be negative.
    pub remaining_count: isize,
}

/// Remove a positive count of a follower from a node. Negative counts will not
/// be increased. The function returns how much of the count has been removed
/// and whats remaining. Followers will be propagated to the uppers of the node.
pub fn remove_positive_follower_count<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    follower_id: &C::NodeRef,
    follower_count: usize,
) -> RemovePositveFollowerCountResult {
    let AggregationNode::Aggegating(aggregating) = &mut *node else {
        unreachable!();
    };
    let RemovePositiveCountResult {
        removed,
        removed_count,
        count,
    } = aggregating
        .followers
        .remove_positive_clonable_count(follower_id, follower_count);

    if removed {
        let uppers = aggregating.uppers.iter().cloned().collect::<StackVec<_>>();
        start_in_progress_all(ctx, &uppers);
        drop(node);
        for upper_id in uppers {
            notify_lost_follower(
                ctx,
                balance_queue,
                ctx.node(&upper_id),
                &upper_id,
                follower_id,
            );
        }
    }
    RemovePositveFollowerCountResult {
        removed_count,
        remaining_count: count,
    }
}
