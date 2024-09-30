use std::{hash::Hash, thread::yield_now};

use super::{
    balance_queue::BalanceQueue,
    in_progress::{finish_in_progress_without_node, start_in_progress, start_in_progress_all},
    util::get_aggregated_remove_change,
    AggegatingNode, AggregationContext, AggregationNode, AggregationNodeGuard,
    PreparedInternalOperation, PreparedOperation, StackVec,
};
use crate::count_hash_set::RemoveIfEntryResult;

impl<I: Clone + Eq + Hash, D> AggregationNode<I, D> {
    /// Called when a inner node of the upper node has lost a follower
    /// It's expected that the upper node is flagged as "in progress".
    pub(super) fn notify_lost_follower<C: AggregationContext<NodeRef = I, Data = D>>(
        &mut self,
        ctx: &C,
        balance_queue: &mut BalanceQueue<I>,
        upper_id: &C::NodeRef,
        follower_id: &C::NodeRef,
    ) -> Option<PreparedNotifyLostFollower<C>> {
        let AggregationNode::Aggegating(aggregating) = self else {
            unreachable!();
        };
        match aggregating.followers.remove_if_entry(follower_id) {
            RemoveIfEntryResult::PartiallyRemoved => {
                self.finish_in_progress(ctx, balance_queue, upper_id);
                None
            }
            RemoveIfEntryResult::Removed => {
                aggregating.followers.shrink_amortized();
                let uppers = aggregating.uppers.iter().cloned().collect::<StackVec<_>>();
                start_in_progress_all(ctx, &uppers);
                self.finish_in_progress(ctx, balance_queue, upper_id);
                Some(PreparedNotifyLostFollower::RemovedFollower {
                    uppers,
                    follower_id: follower_id.clone(),
                })
            }
            RemoveIfEntryResult::NotPresent => Some(PreparedNotifyLostFollower::NotFollower {
                upper_id: upper_id.clone(),
                follower_id: follower_id.clone(),
            }),
        }
    }

    /// Called when a inner node of the upper node has lost a follower.
    /// It's expected that the upper node is NOT flagged as "in progress".
    pub(super) fn notify_lost_follower_not_in_progress<
        C: AggregationContext<NodeRef = I, Data = D>,
    >(
        &mut self,
        ctx: &C,
        upper_id: &C::NodeRef,
        follower_id: &C::NodeRef,
    ) -> Option<PreparedNotifyLostFollower<C>> {
        let AggregationNode::Aggegating(aggregating) = self else {
            unreachable!();
        };
        match aggregating.followers.remove_if_entry(follower_id) {
            RemoveIfEntryResult::PartiallyRemoved => None,
            RemoveIfEntryResult::Removed => {
                aggregating.followers.shrink_amortized();
                let uppers = aggregating.uppers.iter().cloned().collect::<StackVec<_>>();
                start_in_progress_all(ctx, &uppers);
                Some(PreparedNotifyLostFollower::RemovedFollower {
                    uppers,
                    follower_id: follower_id.clone(),
                })
            }
            RemoveIfEntryResult::NotPresent => {
                start_in_progress(ctx, upper_id);
                Some(PreparedNotifyLostFollower::NotFollower {
                    upper_id: upper_id.clone(),
                    follower_id: follower_id.clone(),
                })
            }
        }
    }
}

/// A prepared `notify_lost_follower` operation.
pub(super) enum PreparedNotifyLostFollower<C: AggregationContext> {
    RemovedFollower {
        uppers: StackVec<C::NodeRef>,
        follower_id: C::NodeRef,
    },
    NotFollower {
        upper_id: C::NodeRef,
        follower_id: C::NodeRef,
    },
}

impl<C: AggregationContext> PreparedInternalOperation<C> for PreparedNotifyLostFollower<C> {
    type Result = ();
    fn apply(self, ctx: &C, balance_queue: &mut BalanceQueue<C::NodeRef>) {
        match self {
            PreparedNotifyLostFollower::RemovedFollower {
                uppers,
                follower_id,
            } => {
                for upper_id in uppers {
                    notify_lost_follower(
                        ctx,
                        balance_queue,
                        ctx.node(&upper_id),
                        &upper_id,
                        &follower_id,
                    );
                }
            }
            PreparedNotifyLostFollower::NotFollower {
                upper_id,
                follower_id,
            } => {
                loop {
                    let mut follower = ctx.node(&follower_id);
                    match follower.uppers_mut().remove_if_entry(&upper_id) {
                        RemoveIfEntryResult::PartiallyRemoved => {
                            finish_in_progress_without_node(ctx, balance_queue, &upper_id);
                            drop(follower);
                            return;
                        }
                        RemoveIfEntryResult::Removed => {
                            let remove_change = get_aggregated_remove_change(ctx, &follower);
                            let followers = match &*follower {
                                AggregationNode::Leaf { .. } => {
                                    follower.children().collect::<StackVec<_>>()
                                }
                                AggregationNode::Aggegating(aggregating) => {
                                    let AggegatingNode { ref followers, .. } = **aggregating;
                                    followers.iter().cloned().collect::<StackVec<_>>()
                                }
                            };
                            drop(follower);

                            let mut upper = ctx.node(&upper_id);
                            let remove_change = remove_change
                                .map(|remove_change| upper.apply_change(ctx, remove_change));
                            let prepared = followers
                                .into_iter()
                                .filter_map(|follower_id| {
                                    upper.notify_lost_follower_not_in_progress(
                                        ctx,
                                        &upper_id,
                                        &follower_id,
                                    )
                                })
                                .collect::<StackVec<_>>();
                            upper.finish_in_progress(ctx, balance_queue, &upper_id);
                            drop(upper);
                            prepared.apply(ctx, balance_queue);
                            remove_change.apply(ctx);
                            return;
                        }
                        RemoveIfEntryResult::NotPresent => {
                            drop(follower);
                            let mut upper = ctx.node(&upper_id);
                            let AggregationNode::Aggegating(aggregating) = &mut *upper else {
                                unreachable!();
                            };
                            match aggregating.followers.remove_if_entry(&follower_id) {
                                RemoveIfEntryResult::PartiallyRemoved => {
                                    upper.finish_in_progress(ctx, balance_queue, &upper_id);
                                    return;
                                }
                                RemoveIfEntryResult::Removed => {
                                    aggregating.followers.shrink_amortized();
                                    let uppers =
                                        aggregating.uppers.iter().cloned().collect::<StackVec<_>>();
                                    start_in_progress_all(ctx, &uppers);
                                    upper.finish_in_progress(ctx, balance_queue, &upper_id);
                                    drop(upper);
                                    for upper_id in uppers {
                                        notify_lost_follower(
                                            ctx,
                                            balance_queue,
                                            ctx.node(&upper_id),
                                            &upper_id,
                                            &follower_id,
                                        );
                                    }
                                    return;
                                }
                                RemoveIfEntryResult::NotPresent => {
                                    drop(upper);
                                    yield_now()
                                    // Retry, concurrency
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Notifies the upper node that a follower has been lost.
/// It's expected that the upper node is flagged as "in progress".
pub fn notify_lost_follower<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut upper: C::Guard<'_>,
    upper_id: &C::NodeRef,
    follower_id: &C::NodeRef,
) {
    let p = upper.notify_lost_follower(ctx, balance_queue, upper_id, follower_id);
    drop(upper);
    p.apply(ctx, balance_queue);
}
