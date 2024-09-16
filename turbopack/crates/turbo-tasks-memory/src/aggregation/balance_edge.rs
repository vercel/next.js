use std::cmp::Ordering;

use super::{
    balance_queue::BalanceQueue,
    followers::{
        add_follower_count, remove_follower_count, remove_positive_follower_count,
        RemovePositveFollowerCountResult,
    },
    in_progress::is_in_progress,
    increase::IncreaseReason,
    increase_aggregation_number_internal,
    uppers::{
        add_upper_count, remove_positive_upper_count, remove_upper_count,
        RemovePositiveUpperCountResult,
    },
    AggregationContext, AggregationNode,
};

// Migrated followers to uppers or uppers to followers depending on the
// aggregation numbers of the nodes involved in the edge. Might increase targets
// aggregation number if they are equal.
pub(super) fn balance_edge<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    upper_id: &C::NodeRef,
    mut upper_aggregation_number: u32,
    target_id: &C::NodeRef,
    mut target_aggregation_number: u32,
) -> (u32, u32) {
    // too many uppers on target
    let mut extra_uppers = 0;
    // too many followers on upper
    let mut extra_followers = 0;
    // The last info about uppers
    let mut uppers_count: Option<isize> = None;
    // The last info about followers
    let mut followers_count = None;

    loop {
        let root = upper_aggregation_number == u32::MAX || target_aggregation_number == u32::MAX;
        let order = if root {
            Ordering::Greater
        } else {
            upper_aggregation_number.cmp(&target_aggregation_number)
        };
        match order {
            Ordering::Equal => {
                // we probably want to increase the aggregation number of target
                let upper = ctx.node(upper_id);
                upper_aggregation_number = upper.aggregation_number();
                drop(upper);
                if upper_aggregation_number != u32::MAX
                    && upper_aggregation_number == target_aggregation_number
                {
                    let target = ctx.node(target_id);
                    target_aggregation_number = target.aggregation_number();
                    if upper_aggregation_number == target_aggregation_number {
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
                }
            }
            Ordering::Less => {
                // target should probably be a follower of upper
                if uppers_count.map_or(false, |count| count <= 0) {
                    // We already removed all uppers, maybe too many
                    break;
                } else if extra_followers == 0 {
                    let upper = ctx.node(upper_id);
                    upper_aggregation_number = upper.aggregation_number();
                    if upper_aggregation_number < target_aggregation_number {
                        // target should be a follower of upper
                        // add some extra followers
                        let count = uppers_count.unwrap_or(1) as usize;
                        extra_followers += count;
                        followers_count = Some(add_follower_count(
                            ctx,
                            balance_queue,
                            upper,
                            upper_id,
                            target_id,
                            count,
                            true,
                        ));
                    }
                } else {
                    // we already have extra followers, remove some uppers to balance
                    let count = extra_followers + extra_uppers;
                    let target = ctx.node(target_id);
                    if is_in_progress(ctx, upper_id) {
                        drop(target);
                        let mut upper = ctx.node(upper_id);
                        if is_in_progress(ctx, upper_id) {
                            let AggregationNode::Aggegating(aggregating) = &mut *upper else {
                                unreachable!();
                            };
                            aggregating.enqueued_balancing.push((
                                upper_id.clone(),
                                upper_aggregation_number,
                                target_id.clone(),
                                target_aggregation_number,
                            ));
                            drop(upper);
                            // Somebody else will balance this edge
                            return (upper_aggregation_number, target_aggregation_number);
                        }
                    } else {
                        let RemovePositiveUpperCountResult {
                            removed_count,
                            remaining_count,
                        } = remove_positive_upper_count(
                            ctx,
                            balance_queue,
                            target,
                            upper_id,
                            count,
                        );
                        decrease_numbers(removed_count, &mut extra_uppers, &mut extra_followers);
                        uppers_count = Some(remaining_count);
                    }
                }
            }
            Ordering::Greater => {
                // target should probably be an inner node of upper
                if followers_count.map_or(false, |count| count <= 0) {
                    // We already removed all followers, maybe too many
                    break;
                } else if extra_uppers == 0 {
                    let target = ctx.node(target_id);
                    target_aggregation_number = target.aggregation_number();
                    if root || target_aggregation_number < upper_aggregation_number {
                        // target should be a inner node of upper
                        if is_in_progress(ctx, upper_id) {
                            drop(target);
                            let mut upper = ctx.node(upper_id);
                            if is_in_progress(ctx, upper_id) {
                                let AggregationNode::Aggegating(aggregating) = &mut *upper else {
                                    unreachable!();
                                };
                                aggregating.enqueued_balancing.push((
                                    upper_id.clone(),
                                    upper_aggregation_number,
                                    target_id.clone(),
                                    target_aggregation_number,
                                ));
                                drop(upper);
                                // Somebody else will balance this edge
                                return (upper_aggregation_number, target_aggregation_number);
                            }
                        } else {
                            // add some extra uppers
                            let count = followers_count.unwrap_or(1) as usize;
                            extra_uppers += count;
                            uppers_count = Some(
                                add_upper_count(
                                    ctx,
                                    balance_queue,
                                    target,
                                    target_id,
                                    upper_id,
                                    count,
                                    true,
                                )
                                .new_count,
                            );
                        }
                    }
                } else {
                    // we already have extra uppers, try to remove some followers to balance
                    let count = extra_followers + extra_uppers;
                    let upper = ctx.node(upper_id);
                    let RemovePositveFollowerCountResult {
                        removed_count,
                        remaining_count,
                    } = remove_positive_follower_count(ctx, balance_queue, upper, target_id, count);
                    decrease_numbers(removed_count, &mut extra_followers, &mut extra_uppers);
                    followers_count = Some(remaining_count);
                }
            }
        }
    }
    if extra_followers > 0 {
        let upper = ctx.node(upper_id);
        remove_follower_count(ctx, balance_queue, upper, target_id, extra_followers);
    }
    if extra_uppers > 0 {
        let target = ctx.node(target_id);
        remove_upper_count(ctx, balance_queue, target, upper_id, extra_uppers);
    }
    (upper_aggregation_number, target_aggregation_number)
}

fn decrease_numbers(amount: usize, a: &mut usize, b: &mut usize) {
    if *a >= amount {
        *a -= amount;
    } else {
        *b -= amount - *a;
        *a = 0;
    }
}
