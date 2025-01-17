use std::{cmp::Ordering, hash::Hash};

use super::{
    balance_queue::BalanceQueue,
    followers::add_follower,
    in_progress::{finish_in_progress_without_node, start_in_progress},
    increase::IncreaseReason,
    increase_aggregation_number_internal,
    optimize::optimize_aggregation_number_for_uppers,
    uppers::add_upper,
    AggregationContext, AggregationNode, PreparedInternalOperation, StackVec,
};

const MAX_AFFECTED_NODES: usize = 4096;

impl<I: Clone + Eq + Hash, D> AggregationNode<I, D> {
    // Called when a inner node of the upper node has a new follower.
    // It's expected that the upper node is flagged as "in progress".
    pub(super) fn notify_new_follower<C: AggregationContext<NodeRef = I, Data = D>>(
        &mut self,
        ctx: &C,
        balance_queue: &mut BalanceQueue<I>,
        upper_id: &C::NodeRef,
        follower_id: &C::NodeRef,
        already_optimizing_for_upper: bool,
    ) -> Option<PreparedNotifyNewFollower<C>> {
        let AggregationNode::Aggegating(aggregating) = self else {
            unreachable!();
        };
        if aggregating.followers.add_if_entry(follower_id) {
            self.finish_in_progress(ctx, balance_queue, upper_id);
            None
        } else {
            let upper_aggregation_number = aggregating.aggregation_number;
            if upper_aggregation_number == u32::MAX {
                Some(PreparedNotifyNewFollower::Inner {
                    upper_id: upper_id.clone(),
                    follower_id: follower_id.clone(),
                    already_optimizing_for_upper,
                })
            } else {
                Some(PreparedNotifyNewFollower::FollowerOrInner {
                    upper_aggregation_number,
                    upper_id: upper_id.clone(),
                    follower_id: follower_id.clone(),
                    already_optimizing_for_upper,
                })
            }
        }
    }

    // Called when a inner node of the upper node has a new follower.
    // It's expected that the upper node is NOT flagged as "in progress".
    pub(super) fn notify_new_follower_not_in_progress<
        C: AggregationContext<NodeRef = I, Data = D>,
    >(
        &mut self,
        ctx: &C,
        upper_id: &C::NodeRef,
        follower_id: &C::NodeRef,
    ) -> Option<PreparedNotifyNewFollower<C>> {
        let AggregationNode::Aggegating(aggregating) = self else {
            unreachable!();
        };
        if aggregating.followers.add_if_entry(follower_id) {
            None
        } else {
            start_in_progress(ctx, upper_id);
            let upper_aggregation_number = aggregating.aggregation_number;
            if upper_aggregation_number == u32::MAX {
                Some(PreparedNotifyNewFollower::Inner {
                    upper_id: upper_id.clone(),
                    follower_id: follower_id.clone(),
                    already_optimizing_for_upper: false,
                })
            } else {
                Some(PreparedNotifyNewFollower::FollowerOrInner {
                    upper_aggregation_number,
                    upper_id: upper_id.clone(),
                    follower_id: follower_id.clone(),
                    already_optimizing_for_upper: false,
                })
            }
        }
    }
}

/// A prepared `notify_new_follower` operation.
pub(super) enum PreparedNotifyNewFollower<C: AggregationContext> {
    Inner {
        upper_id: C::NodeRef,
        follower_id: C::NodeRef,
        already_optimizing_for_upper: bool,
    },
    FollowerOrInner {
        upper_aggregation_number: u32,
        upper_id: C::NodeRef,
        follower_id: C::NodeRef,
        already_optimizing_for_upper: bool,
    },
}

impl<C: AggregationContext> PreparedInternalOperation<C> for PreparedNotifyNewFollower<C> {
    type Result = usize;
    fn apply(self, ctx: &C, balance_queue: &mut BalanceQueue<C::NodeRef>) -> Self::Result {
        match self {
            PreparedNotifyNewFollower::Inner {
                upper_id,
                follower_id,
                already_optimizing_for_upper,
            } => {
                let follower = ctx.node(&follower_id);
                let affected_nodes = add_upper(
                    ctx,
                    balance_queue,
                    follower,
                    &follower_id,
                    &upper_id,
                    already_optimizing_for_upper,
                );
                finish_in_progress_without_node(ctx, balance_queue, &upper_id);
                if !already_optimizing_for_upper && affected_nodes > MAX_AFFECTED_NODES {
                    let follower = ctx.node(&follower_id);
                    let uppers = follower.uppers().iter().cloned().collect::<StackVec<_>>();
                    let leaf: bool = follower.is_leaf();
                    drop(follower);
                    if optimize_aggregation_number_for_uppers(
                        ctx,
                        balance_queue,
                        &follower_id,
                        leaf,
                        uppers,
                    ) {
                        return 1;
                    }
                }
                affected_nodes
            }
            PreparedNotifyNewFollower::FollowerOrInner {
                mut upper_aggregation_number,
                upper_id,
                follower_id,
                already_optimizing_for_upper,
            } => loop {
                let follower = ctx.node(&follower_id);
                let follower_aggregation_number = follower.aggregation_number();
                if follower_aggregation_number < upper_aggregation_number {
                    let affected_nodes = add_upper(
                        ctx,
                        balance_queue,
                        follower,
                        &follower_id,
                        &upper_id,
                        already_optimizing_for_upper,
                    );
                    finish_in_progress_without_node(ctx, balance_queue, &upper_id);
                    if !already_optimizing_for_upper && affected_nodes > MAX_AFFECTED_NODES {
                        let follower = ctx.node(&follower_id);
                        let uppers = follower.uppers().iter().cloned().collect::<StackVec<_>>();
                        let leaf = follower.is_leaf();
                        drop(follower);
                        if optimize_aggregation_number_for_uppers(
                            ctx,
                            balance_queue,
                            &follower_id,
                            leaf,
                            uppers,
                        ) {
                            return 1;
                        }
                    }
                    return affected_nodes;
                } else {
                    drop(follower);
                    let mut upper = ctx.node(&upper_id);
                    let AggregationNode::Aggegating(aggregating) = &mut *upper else {
                        unreachable!();
                    };
                    upper_aggregation_number = aggregating.aggregation_number;
                    if upper_aggregation_number == u32::MAX {
                        // retry, concurrency
                    } else {
                        match follower_aggregation_number.cmp(&upper_aggregation_number) {
                            Ordering::Less => {
                                // retry, concurrency
                            }
                            Ordering::Equal => {
                                drop(upper);
                                let follower = ctx.node(&follower_id);
                                let follower_aggregation_number = follower.aggregation_number();
                                if follower_aggregation_number == upper_aggregation_number {
                                    if upper_id == follower_id {
                                        panic!(
                                            "Cycle in call graph (A function calls itself \
                                             recursively with the same arguments. This will never \
                                             finish and would hang indefinitely.)"
                                        );
                                    }
                                    increase_aggregation_number_internal(
                                        ctx,
                                        balance_queue,
                                        follower,
                                        &follower_id,
                                        upper_aggregation_number + 1,
                                        upper_aggregation_number + 1,
                                        IncreaseReason::EqualAggregationNumberOnNewFollower,
                                    );
                                    // retry
                                } else {
                                    // retry, concurrency
                                }
                            }
                            Ordering::Greater => {
                                upper.finish_in_progress(ctx, balance_queue, &upper_id);
                                return add_follower(
                                    ctx,
                                    balance_queue,
                                    upper,
                                    &upper_id,
                                    &follower_id,
                                    already_optimizing_for_upper,
                                );
                            }
                        }
                    }
                }
            },
        }
    }
}

/// Notifies the upper node that it has a new follower.
/// Returns the number of affected nodes.
/// The upper node is expected to be flagged as "in progress".
pub fn notify_new_follower<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut upper: C::Guard<'_>,
    upper_id: &C::NodeRef,
    follower_id: &C::NodeRef,
    already_optimizing_for_upper: bool,
) -> usize {
    let p = upper.notify_new_follower(
        ctx,
        balance_queue,
        upper_id,
        follower_id,
        already_optimizing_for_upper,
    );
    drop(upper);
    p.apply(ctx, balance_queue).unwrap_or_default()
}
