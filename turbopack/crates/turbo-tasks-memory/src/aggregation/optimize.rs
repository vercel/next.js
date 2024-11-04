use tracing::Level;

use super::{
    balance_queue::BalanceQueue,
    increase::{increase_aggregation_number_internal, IncreaseReason, LEAF_NUMBER},
    AggregationContext, StackVec,
};

pub const MAX_UPPERS: usize = 512;

pub const MAX_FOLLOWERS: usize = 128;

/// Optimize the aggregation number for a node based on a list of upper nodes.
/// The goal is to reduce the number of upper nodes, so we try to find a
/// aggregation number that is higher than some of the upper nodes.
/// Returns true if the aggregation number was increased.
#[tracing::instrument(level = Level::TRACE, skip(ctx, balance_queue, node_id, uppers))]
pub fn optimize_aggregation_number_for_uppers<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    node_id: &C::NodeRef,
    leaf: bool,
    uppers: StackVec<C::NodeRef>,
) -> bool {
    let count = uppers.len();
    let mut root_count = 0;
    let mut min = u32::MAX;
    let mut max = 0;
    let mut uppers_uppers = 0;
    for upper_id in uppers.into_iter() {
        let upper = ctx.node(&upper_id);
        let aggregation_number = upper.aggregation_number();
        if aggregation_number == u32::MAX {
            root_count += 1;
        } else {
            let upper_uppers = upper.uppers().len();
            uppers_uppers += upper_uppers;
            if aggregation_number < min {
                min = aggregation_number;
            }
            if aggregation_number > max {
                max = aggregation_number;
            }
        }
    }
    if min == u32::MAX {
        min = LEAF_NUMBER - 1;
    }
    if max < LEAF_NUMBER {
        max = LEAF_NUMBER - 1;
    }
    let aggregation_number = (min + max) / 2 + 1;
    if leaf {
        increase_aggregation_number_internal(
            ctx,
            balance_queue,
            ctx.node(node_id),
            node_id,
            aggregation_number,
            aggregation_number,
            IncreaseReason::OptimizeForUppers,
        );
        return true;
    } else {
        let normal_count = count - root_count;
        if normal_count > 0 {
            let avg_uppers_uppers = uppers_uppers / normal_count;
            if count > avg_uppers_uppers && root_count * 2 < count {
                increase_aggregation_number_internal(
                    ctx,
                    balance_queue,
                    ctx.node(node_id),
                    node_id,
                    aggregation_number,
                    aggregation_number,
                    IncreaseReason::OptimizeForUppers,
                );
                return true;
            }
        }
    }
    false
}

/// Optimize the aggregation number for a node based on a list of followers.
/// The goal is to reduce the number of followers, so we try to find a
/// aggregation number that is higher than some of the followers.
/// Returns true if the aggregation number was increased.
#[tracing::instrument(level = Level::TRACE, skip(ctx, balance_queue, node_id, followers))]
pub fn optimize_aggregation_number_for_followers<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    node_id: &C::NodeRef,
    followers: StackVec<C::NodeRef>,
    force: bool,
) -> bool {
    let count = followers.len();
    let mut root_count = 0;
    let mut min = u32::MAX;
    let mut max = 0;
    let mut followers_followers = 0;
    for follower_id in followers.into_iter() {
        let follower = ctx.node(&follower_id);
        let aggregation_number = follower.aggregation_number();
        if aggregation_number == u32::MAX {
            root_count += 1;
        } else {
            let follower_followers = follower.followers().map_or(0, |f| f.len());
            followers_followers += follower_followers;
            if aggregation_number < min {
                min = aggregation_number;
            }
            if aggregation_number > max {
                max = aggregation_number;
            }
        }
    }
    if min == u32::MAX {
        min = LEAF_NUMBER - 1;
    }
    if min < LEAF_NUMBER {
        min = LEAF_NUMBER - 1;
    }
    if max < min {
        max = min;
    }
    let normal_count = count - root_count;
    if normal_count > 0 {
        let avg_followers_followers = followers_followers / normal_count;
        let makes_sense = count > avg_followers_followers || force;
        if makes_sense && root_count * 2 < count {
            let aggregation_number = (min + max) / 2 + 1;
            increase_aggregation_number_internal(
                ctx,
                balance_queue,
                ctx.node(node_id),
                node_id,
                aggregation_number,
                aggregation_number,
                IncreaseReason::OptimizeForFollowers,
            );
            return true;
        }
    }
    false
}
