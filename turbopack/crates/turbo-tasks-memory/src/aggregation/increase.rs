use std::{hash::Hash, mem::take};

use super::{
    balance_queue::BalanceQueue, AggegatingNode, AggregationContext, AggregationNode,
    AggregationNodeGuard, PreparedInternalOperation, PreparedOperation, StackVec,
};
pub(super) const LEAF_NUMBER: u32 = 16;

#[derive(Debug)]
pub enum IncreaseReason {
    Upgraded,
    AggregationData,
    EqualAggregationNumberOnBalance,
    EqualAggregationNumberOnNewFollower,
    OptimizeForUppers,
    OptimizeForFollowers,
    LeafEdge,
    LeafEdgeAfterIncrease,
    #[cfg(test)]
    Test,
}

impl<I: Clone + Eq + Hash, D> AggregationNode<I, D> {
    /// Increase the aggregation number of a node. This might temporarily
    /// violate the graph invariants between uppers and followers of that node.
    /// Therefore a balancing operation is enqueued to restore the invariants.
    /// The actual change to the aggregation number is applied in the prepared
    /// operation after checking all upper nodes aggregation numbers.
    #[must_use]
    pub(super) fn increase_aggregation_number_internal<
        C: AggregationContext<NodeRef = I, Data = D>,
    >(
        &mut self,
        _ctx: &C,
        node_id: &C::NodeRef,
        min_aggregation_number: u32,
        target_aggregation_number: u32,
        reason: IncreaseReason,
    ) -> Option<PreparedInternalIncreaseAggregationNumber<C>> {
        if self.aggregation_number() >= min_aggregation_number {
            return None;
        }
        Some(PreparedInternalIncreaseAggregationNumber::Lazy {
            node_id: node_id.clone(),
            uppers: self.uppers_mut().iter().cloned().collect(),
            min_aggregation_number,
            target_aggregation_number,
            reason,
        })
    }

    /// Increase the aggregation number of a node. This is only for testing
    /// proposes.
    #[cfg(test)]
    pub fn increase_aggregation_number<C: AggregationContext<NodeRef = I, Data = D>>(
        &mut self,
        _ctx: &C,
        node_id: &C::NodeRef,
        new_aggregation_number: u32,
    ) -> Option<PreparedIncreaseAggregationNumber<C>> {
        self.increase_aggregation_number_internal(
            _ctx,
            node_id,
            new_aggregation_number,
            new_aggregation_number,
            IncreaseReason::Test,
        )
        .map(PreparedIncreaseAggregationNumber)
    }
}

/// Increase the aggregation number of a node directly. This might temporarily
/// violate the graph invariants between uppers and followers of that node.
/// Therefore a balancing operation is enqueued to restore the invariants.
/// The actual change to the aggregation number is applied directly without
/// checking the upper nodes.
#[must_use]
pub(super) fn increase_aggregation_number_immediately<C: AggregationContext>(
    _ctx: &C,
    node: &mut C::Guard<'_>,
    node_id: C::NodeRef,
    min_aggregation_number: u32,
    target_aggregation_number: u32,
    reason: IncreaseReason,
) -> Option<PreparedInternalIncreaseAggregationNumber<C>> {
    if node.aggregation_number() >= min_aggregation_number {
        return None;
    }

    let _span = tracing::trace_span!(
        "increase_aggregation_number_immediately",
        reason = debug(&reason)
    )
    .entered();
    let children = matches!(**node, AggregationNode::Leaf { .. })
        .then(|| node.children().collect::<StackVec<_>>());
    match &mut **node {
        AggregationNode::Leaf {
            aggregation_number,
            uppers,
        } => {
            let children = children.unwrap();
            if target_aggregation_number < LEAF_NUMBER {
                *aggregation_number = target_aggregation_number as u8;
                Some(PreparedInternalIncreaseAggregationNumber::Leaf {
                    target_aggregation_number,
                    children,
                })
            } else {
                let uppers_copy = uppers.iter().cloned().collect::<StackVec<_>>();
                // Convert to Aggregating
                **node = AggregationNode::Aggegating(Box::new(AggegatingNode {
                    aggregation_number: target_aggregation_number,
                    uppers: take(uppers),
                    followers: children.iter().cloned().collect(),
                    data: node.get_initial_data(),
                    enqueued_balancing: Vec::new(),
                }));
                let followers = children;
                Some(PreparedInternalIncreaseAggregationNumber::Aggregating {
                    node_id,
                    uppers: uppers_copy,
                    followers,
                })
            }
        }
        AggregationNode::Aggegating(aggegating) => {
            let AggegatingNode {
                followers,
                uppers,
                aggregation_number,
                ..
            } = &mut **aggegating;
            let uppers = uppers.iter().cloned().collect::<StackVec<_>>();
            let followers = followers.iter().cloned().collect();
            *aggregation_number = target_aggregation_number;
            Some(PreparedInternalIncreaseAggregationNumber::Aggregating {
                node_id,
                uppers,
                followers,
            })
        }
    }
}

/// A prepared `increase_aggregation_number` operation.
pub enum PreparedInternalIncreaseAggregationNumber<C: AggregationContext> {
    Lazy {
        node_id: C::NodeRef,
        uppers: StackVec<C::NodeRef>,
        min_aggregation_number: u32,
        target_aggregation_number: u32,
        reason: IncreaseReason,
    },
    Leaf {
        children: StackVec<C::NodeRef>,
        target_aggregation_number: u32,
    },
    Aggregating {
        node_id: C::NodeRef,
        uppers: StackVec<C::NodeRef>,
        followers: StackVec<C::NodeRef>,
    },
}

impl<C: AggregationContext> PreparedInternalOperation<C>
    for PreparedInternalIncreaseAggregationNumber<C>
{
    type Result = ();
    fn apply(self, ctx: &C, balance_queue: &mut BalanceQueue<C::NodeRef>) {
        match self {
            PreparedInternalIncreaseAggregationNumber::Lazy {
                min_aggregation_number,
                mut target_aggregation_number,
                node_id,
                uppers,
                reason,
            } => {
                if target_aggregation_number >= LEAF_NUMBER {
                    let mut need_to_run = true;
                    while need_to_run {
                        need_to_run = false;
                        let mut max = 0;
                        for upper_id in &uppers {
                            let upper = ctx.node(upper_id);
                            let aggregation_number = upper.aggregation_number();
                            if aggregation_number != u32::MAX {
                                if aggregation_number > max {
                                    max = aggregation_number;
                                }
                                if aggregation_number == target_aggregation_number {
                                    target_aggregation_number += 1;
                                    if max >= target_aggregation_number {
                                        need_to_run = true;
                                    }
                                }
                            }
                        }
                    }
                }
                drop(uppers);
                let mut node = ctx.node(&node_id);
                if node.aggregation_number() >= min_aggregation_number {
                    return;
                }
                let _span =
                    tracing::trace_span!("increase_aggregation_number", reason = debug(&reason))
                        .entered();
                let children = matches!(*node, AggregationNode::Leaf { .. })
                    .then(|| node.children().collect::<StackVec<_>>());
                let (uppers, followers) = match &mut *node {
                    AggregationNode::Leaf {
                        aggregation_number,
                        uppers,
                    } => {
                        let children = children.unwrap();
                        if target_aggregation_number < LEAF_NUMBER {
                            *aggregation_number = target_aggregation_number as u8;
                            drop(node);
                            for child_id in children {
                                increase_aggregation_number_internal(
                                    ctx,
                                    balance_queue,
                                    ctx.node(&child_id),
                                    &child_id,
                                    target_aggregation_number + 1,
                                    target_aggregation_number + 1,
                                    IncreaseReason::LeafEdgeAfterIncrease,
                                );
                            }
                            return;
                        } else {
                            let uppers_copy = uppers.iter().cloned().collect::<StackVec<_>>();
                            // Convert to Aggregating
                            *node = AggregationNode::Aggegating(Box::new(AggegatingNode {
                                aggregation_number: target_aggregation_number,
                                uppers: take(uppers),
                                followers: children.iter().cloned().collect(),
                                data: node.get_initial_data(),
                                enqueued_balancing: Vec::new(),
                            }));
                            let followers = children;
                            drop(node);
                            (uppers_copy, followers)
                        }
                    }
                    AggregationNode::Aggegating(aggegating) => {
                        let AggegatingNode {
                            followers,
                            uppers,
                            aggregation_number,
                            ..
                        } = &mut **aggegating;
                        let uppers = uppers.iter().cloned().collect::<StackVec<_>>();
                        let followers = followers.iter().cloned().collect();
                        *aggregation_number = target_aggregation_number;
                        drop(node);
                        (uppers, followers)
                    }
                };
                for follower_id in followers {
                    balance_queue.balance(node_id.clone(), follower_id);
                }
                for upper_id in uppers {
                    balance_queue.balance(upper_id, node_id.clone());
                }
            }
            PreparedInternalIncreaseAggregationNumber::Leaf {
                children,
                target_aggregation_number,
            } => {
                for child_id in children {
                    increase_aggregation_number_internal(
                        ctx,
                        balance_queue,
                        ctx.node(&child_id),
                        &child_id,
                        target_aggregation_number + 1,
                        target_aggregation_number + 1,
                        IncreaseReason::LeafEdgeAfterIncrease,
                    );
                }
            }
            PreparedInternalIncreaseAggregationNumber::Aggregating {
                node_id,
                uppers,
                followers,
            } => {
                for follower_id in followers {
                    balance_queue.balance(node_id.clone(), follower_id);
                }
                for upper_id in uppers {
                    balance_queue.balance(upper_id, node_id.clone());
                }
            }
        }
    }
}

pub fn increase_aggregation_number_internal<C: AggregationContext>(
    ctx: &C,
    balance_queue: &mut BalanceQueue<C::NodeRef>,
    mut node: C::Guard<'_>,
    node_id: &C::NodeRef,
    min_aggregation_number: u32,
    target_aggregation_number: u32,
    reason: IncreaseReason,
) {
    let prepared = node.increase_aggregation_number_internal(
        ctx,
        node_id,
        min_aggregation_number,
        target_aggregation_number,
        reason,
    );
    drop(node);
    prepared.apply(ctx, balance_queue);
}

#[allow(dead_code)]
/// A prepared `increase_aggregation_number` operation.
pub struct PreparedIncreaseAggregationNumber<C: AggregationContext>(
    PreparedInternalIncreaseAggregationNumber<C>,
);

impl<C: AggregationContext> PreparedOperation<C> for PreparedIncreaseAggregationNumber<C> {
    type Result = ();
    fn apply(self, ctx: &C) {
        let mut balance_queue = BalanceQueue::new();
        self.0.apply(ctx, &mut balance_queue);
        balance_queue.process(ctx);
    }
}
