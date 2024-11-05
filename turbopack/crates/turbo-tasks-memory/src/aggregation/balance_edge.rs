use std::cmp::Ordering;

use super::{
    balance_queue::BalanceQueue,
    in_progress::{is_in_progress, start_in_progress_all, start_in_progress_count},
    increase::IncreaseReason,
    increase_aggregation_number_internal,
    notify_lost_follower::notify_lost_follower,
    notify_new_follower::notify_new_follower,
    util::{get_aggregated_add_change, get_aggregated_remove_change, get_followers_or_children},
    AggregationContext, AggregationNode, PreparedInternalOperation, PreparedOperation, StackVec,
};

// Migrate followers to uppers or uppers to followers depending on the
// aggregation numbers of the nodes involved in the edge. Might increase targets
// aggregation number if they are equal.
pub(super) fn balance_edge<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    upper_id: &C::NodeRef,
    target_id: &C::NodeRef,
) {
    loop {
        let (mut upper, mut target) = ctx.node_pair(upper_id, target_id);
        let upper_aggregation_number = upper.aggregation_number();
        let target_aggregation_number = target.aggregation_number();

        let root = upper_aggregation_number == u32::MAX || target_aggregation_number == u32::MAX;
        let order = if root {
            Ordering::Greater
        } else {
            upper_aggregation_number.cmp(&target_aggregation_number)
        };
        match order {
            Ordering::Equal => {
                drop(upper);
                // increase target aggregation number
                increase_aggregation_number_internal(
                    ctx,
                    balance_queue,
                    target,
                    target_id,
                    target_aggregation_number + 1,
                    target_aggregation_number + 1,
                    IncreaseReason::EqualAggregationNumberOnBalance,
                );
            }
            Ordering::Less => {
                if is_in_progress(ctx, upper_id) {
                    drop(target);
                    let AggregationNode::Aggegating(aggregating) = &mut *upper else {
                        unreachable!();
                    };
                    aggregating
                        .enqueued_balancing
                        .push((upper_id.clone(), target_id.clone()));
                    drop(upper);
                    // Somebody else will balance this edge
                    break;
                }

                // target should be a follower of upper
                let count = target
                    .uppers_mut()
                    .remove_all_positive_clonable_count(upper_id);
                if count == 0 {
                    break;
                }
                let added = upper
                    .followers_mut()
                    .unwrap()
                    .add_clonable_count(target_id, count);

                // target removed as upper
                let remove_change = get_aggregated_remove_change(ctx, &target);
                let followers = get_followers_or_children(ctx, &target);

                let upper_uppers = if added {
                    // target added as follower
                    let uppers = upper.uppers().iter().cloned().collect::<StackVec<_>>();
                    start_in_progress_all(ctx, &uppers);
                    uppers
                } else {
                    Default::default()
                };

                drop(target);

                // target removed as upper
                let remove_prepared =
                    remove_change.and_then(|remove_change| upper.apply_change(ctx, remove_change));
                start_in_progress_count(ctx, upper_id, followers.len() as u32);
                let prepared = followers
                    .into_iter()
                    .map(|child_id| {
                        upper.notify_lost_follower(ctx, balance_queue, upper_id, &child_id)
                    })
                    .collect::<StackVec<_>>();
                drop(upper);

                // target added as follower
                for upper_id in upper_uppers {
                    notify_new_follower(
                        ctx,
                        balance_queue,
                        ctx.node(&upper_id),
                        &upper_id,
                        target_id,
                        false,
                    );
                }

                // target removed as upper
                remove_prepared.apply(ctx);
                prepared.apply(ctx, balance_queue);

                break;
            }
            Ordering::Greater => {
                if is_in_progress(ctx, upper_id) {
                    let AggregationNode::Aggegating(aggregating) = &mut *upper else {
                        unreachable!();
                    };
                    aggregating
                        .enqueued_balancing
                        .push((upper_id.clone(), target_id.clone()));
                    drop(upper);
                    // Somebody else will balance this edge
                    break;
                }

                // target should be a inner node of upper
                let count = upper
                    .followers_mut()
                    .unwrap()
                    .remove_all_positive_clonable_count(target_id);
                if count == 0 {
                    break;
                }
                let added = target.uppers_mut().add_clonable_count(upper_id, count);

                // target removed as follower
                let uppers = upper.uppers().iter().cloned().collect::<StackVec<_>>();
                start_in_progress_all(ctx, &uppers);

                let (add_change, followers) = if added {
                    // target added as upper
                    let add_change = get_aggregated_add_change(ctx, &target);
                    let followers = get_followers_or_children(ctx, &target);
                    start_in_progress_count(ctx, upper_id, followers.len() as u32);
                    (add_change, followers)
                } else {
                    (None, Default::default())
                };

                drop(target);

                // target added as upper
                let add_prepared =
                    add_change.and_then(|add_change| upper.apply_change(ctx, add_change));
                let prepared = followers
                    .into_iter()
                    .filter_map(|child_id| {
                        upper.notify_new_follower(ctx, balance_queue, upper_id, &child_id, false)
                    })
                    .collect::<StackVec<_>>();

                drop(upper);

                add_prepared.apply(ctx);
                for prepared in prepared {
                    prepared.apply(ctx, balance_queue);
                }

                // target removed as follower
                for upper_id in uppers {
                    notify_lost_follower(
                        ctx,
                        balance_queue,
                        ctx.node(&upper_id),
                        &upper_id,
                        target_id,
                    );
                }

                break;
            }
        }
    }
}
