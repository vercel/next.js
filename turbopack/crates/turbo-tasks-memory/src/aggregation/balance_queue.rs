use std::{hash::Hash, mem::take};

use turbo_tasks::FxIndexSet;

use super::{balance_edge, AggregationContext};

/// Enqueued edges that need to be balanced. Deduplicates edges and keeps track
/// of aggregation numbers read during balancing.
pub struct BalanceQueue<I> {
    queue: FxIndexSet<(I, I)>,
}

impl<I: Hash + Eq + Clone> BalanceQueue<I> {
    pub fn new() -> Self {
        Self {
            queue: FxIndexSet::default(),
        }
    }

    /// Add an edge to the queue. The edge will be balanced during the next
    /// call.
    pub fn balance(&mut self, upper_id: I, target_id: I) {
        debug_assert!(upper_id != target_id);
        self.queue.insert((upper_id.clone(), target_id.clone()));
    }

    /// Add multiple edges to the queue. The edges will be balanced during the
    /// next call.
    pub fn balance_all(&mut self, edges: Vec<(I, I)>) {
        for (upper_id, target_id) in edges {
            self.balance(upper_id, target_id);
        }
    }

    /// Process the queue and balance all enqueued edges.
    pub fn process<C: AggregationContext<NodeRef = I>>(mut self, ctx: &C) {
        while !self.queue.is_empty() {
            let queue = take(&mut self.queue);
            for (upper_id, target_id) in queue {
                balance_edge(ctx, &mut self, &upper_id, &target_id);
            }
        }
    }
}
