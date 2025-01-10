use super::{
    balance_queue::BalanceQueue,
    in_progress::start_in_progress_all,
    notify_new_follower,
    optimize::{optimize_aggregation_number_for_followers, MAX_FOLLOWERS},
    AggregationContext, AggregationNode, StackVec,
};

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
        && followers_len.is_power_of_two())
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
