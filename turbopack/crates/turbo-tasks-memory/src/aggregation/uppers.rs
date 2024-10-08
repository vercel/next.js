use super::{
    balance_queue::BalanceQueue,
    in_progress::start_in_progress_count,
    optimize::{optimize_aggregation_number_for_uppers, MAX_UPPERS},
    AggegatingNode, AggregationContext, AggregationNode, AggregationNodeGuard,
    PreparedInternalOperation, PreparedOperation, StackVec,
};

/// Adds an upper node to a node. Returns the number of affected nodes by this
/// operation. This will also propagate the followers to the new upper node.
pub fn add_upper<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    node_id: &C::NodeRef,
    upper_id: &C::NodeRef,
    already_optimizing_for_upper: bool,
) -> usize {
    let added = match &mut *node {
        AggregationNode::Leaf { uppers, .. } => uppers.add_clonable(upper_id),
        AggregationNode::Aggegating(aggegating) => {
            let AggegatingNode { ref mut uppers, .. } = **aggegating;
            uppers.add_clonable(upper_id)
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
    affected_nodes
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
        (!already_optimizing_for_upper && uppers_len >= MAX_UPPERS && uppers_len.is_power_of_two())
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
