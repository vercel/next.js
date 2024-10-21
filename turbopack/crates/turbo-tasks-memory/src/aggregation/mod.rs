use std::{fmt::Debug, hash::Hash, ops::DerefMut, sync::atomic::AtomicU32};

use smallvec::SmallVec;

use crate::count_hash_set::CountHashSet;

mod aggregation_data;
mod balance_edge;
mod balance_queue;
mod change;
mod followers;
mod in_progress;
mod increase;
#[cfg(test)]
mod loom_tests;
mod lost_edge;
mod new_edge;
mod notify_lost_follower;
mod notify_new_follower;
mod optimize;
mod root_query;
#[cfg(test)]
mod tests;
mod uppers;
mod util;

pub use aggregation_data::{aggregation_data, AggregationDataGuard};
use balance_edge::balance_edge;
use increase::increase_aggregation_number_internal;
pub use new_edge::handle_new_edge;
use notify_new_follower::notify_new_follower;
pub use root_query::{query_root_info, RootQuery};

use self::balance_queue::BalanceQueue;

type StackVec<I> = SmallVec<[I; 16]>;

/// The aggregation node structure. This stores the aggregation number, the
/// aggregation edges to uppers and followers and the aggregated data.
pub enum AggregationNode<I, D> {
    Leaf {
        aggregation_number: u8,
        uppers: CountHashSet<I>,
    },
    Aggegating(Box<AggegatingNode<I, D>>),
}

/// The aggregation node structure for aggregating nodes.
pub struct AggegatingNode<I, D> {
    aggregation_number: u32,
    uppers: CountHashSet<I>,
    followers: CountHashSet<I>,
    data: D,
    enqueued_balancing: Vec<(I, I)>,
}

impl<I, A> AggregationNode<I, A> {
    pub fn new() -> Self {
        Self::Leaf {
            aggregation_number: 0,
            uppers: CountHashSet::new(),
        }
    }

    pub fn shrink_to_fit(&mut self)
    where
        I: Hash + Eq,
    {
        match self {
            AggregationNode::Leaf { uppers, .. } => uppers.shrink_to_fit(),
            AggregationNode::Aggegating(aggregating) => {
                aggregating.uppers.shrink_to_fit();
                aggregating.followers.shrink_to_fit();
            }
        }
    }

    /// Returns the aggregation number of the node.
    pub fn aggregation_number(&self) -> u32 {
        match self {
            AggregationNode::Leaf {
                aggregation_number, ..
            } => *aggregation_number as u32,
            AggregationNode::Aggegating(aggregating) => aggregating.aggregation_number,
        }
    }

    fn is_leaf(&self) -> bool {
        matches!(self, AggregationNode::Leaf { .. })
    }

    fn uppers(&self) -> &CountHashSet<I> {
        match self {
            AggregationNode::Leaf { uppers, .. } => uppers,
            AggregationNode::Aggegating(aggregating) => &aggregating.uppers,
        }
    }

    fn uppers_mut(&mut self) -> &mut CountHashSet<I> {
        match self {
            AggregationNode::Leaf { uppers, .. } => uppers,
            AggregationNode::Aggegating(aggregating) => &mut aggregating.uppers,
        }
    }

    fn followers(&self) -> Option<&CountHashSet<I>> {
        match self {
            AggregationNode::Leaf { .. } => None,
            AggregationNode::Aggegating(aggregating) => Some(&aggregating.followers),
        }
    }

    fn followers_mut(&mut self) -> Option<&mut CountHashSet<I>> {
        match self {
            AggregationNode::Leaf { .. } => None,
            AggregationNode::Aggegating(aggregating) => Some(&mut aggregating.followers),
        }
    }
}

/// A prepared operation. Must be applied outside of node locks.
#[must_use]
pub trait PreparedOperation<C: AggregationContext> {
    type Result;
    fn apply(self, ctx: &C) -> Self::Result;
}

impl<C: AggregationContext, T: PreparedOperation<C>> PreparedOperation<C> for Option<T> {
    type Result = Option<T::Result>;
    fn apply(self, ctx: &C) -> Self::Result {
        self.map(|prepared| prepared.apply(ctx))
    }
}

impl<C: AggregationContext, T: PreparedOperation<C>> PreparedOperation<C> for Vec<T> {
    type Result = ();
    fn apply(self, ctx: &C) -> Self::Result {
        for prepared in self {
            prepared.apply(ctx);
        }
    }
}

impl<C: AggregationContext, T: PreparedOperation<C>, const N: usize> PreparedOperation<C>
    for SmallVec<[T; N]>
{
    type Result = ();
    fn apply(self, ctx: &C) -> Self::Result {
        for prepared in self {
            prepared.apply(ctx);
        }
    }
}

/// A prepared internal operation. Must be applied inside of node locks and with
/// a balance queue.
#[must_use]
trait PreparedInternalOperation<C: AggregationContext> {
    type Result;
    fn apply(self, ctx: &C, balance_queue: &mut BalanceQueue<C::NodeRef>) -> Self::Result;
}

impl<C: AggregationContext, T: PreparedInternalOperation<C>> PreparedInternalOperation<C>
    for Option<T>
{
    type Result = Option<T::Result>;
    fn apply(self, ctx: &C, balance_queue: &mut BalanceQueue<C::NodeRef>) -> Self::Result {
        self.map(|prepared| prepared.apply(ctx, balance_queue))
    }
}

impl<C: AggregationContext, T: PreparedInternalOperation<C>> PreparedInternalOperation<C>
    for Vec<T>
{
    type Result = ();
    fn apply(self, ctx: &C, balance_queue: &mut BalanceQueue<C::NodeRef>) -> Self::Result {
        for prepared in self {
            prepared.apply(ctx, balance_queue);
        }
    }
}

impl<C: AggregationContext, T: PreparedInternalOperation<C>, const N: usize>
    PreparedInternalOperation<C> for SmallVec<[T; N]>
{
    type Result = ();
    fn apply(self, ctx: &C, balance_queue: &mut BalanceQueue<C::NodeRef>) -> Self::Result {
        for prepared in self {
            prepared.apply(ctx, balance_queue);
        }
    }
}

/// Context for aggregation operations.
pub trait AggregationContext {
    type NodeRef: Clone + Eq + Hash + Debug + 'static;
    type Guard<'l>: AggregationNodeGuard<
        NodeRef = Self::NodeRef,
        Data = Self::Data,
        DataChange = Self::DataChange,
    >
    where
        Self: 'l;
    type Data: 'static;
    type DataChange: 'static;

    /// Gets mutable access to an item.
    fn node<'l>(&'l self, id: &Self::NodeRef) -> Self::Guard<'l>;

    /// Gets mutable access to two items.
    fn node_pair<'l>(
        &'l self,
        id1: &Self::NodeRef,
        id2: &Self::NodeRef,
    ) -> (Self::Guard<'l>, Self::Guard<'l>);

    /// Get the atomic in progress counter for a node.
    fn atomic_in_progress_counter<'l>(&self, id: &'l Self::NodeRef) -> &'l AtomicU32
    where
        Self: 'l;

    /// Apply a changeset to an aggregated data object. Returns a new changeset
    /// that should be applied to the next aggregation level. Might return None,
    /// if no change should be applied to the next level.
    fn apply_change(
        &self,
        data: &mut Self::Data,
        change: &Self::DataChange,
    ) -> Option<Self::DataChange>;

    /// Creates a changeset from an aggregated data object, that represents
    /// adding the aggregated node to an aggregated node of the next level.
    fn data_to_add_change(&self, data: &Self::Data) -> Option<Self::DataChange>;
    /// Creates a changeset from an aggregated data object, that represents
    /// removing the aggregated node from an aggregated node of the next level.
    fn data_to_remove_change(&self, data: &Self::Data) -> Option<Self::DataChange>;
}

/// A guard for a node that allows to access the aggregation node, children and
/// data.
pub trait AggregationNodeGuard:
    DerefMut<Target = AggregationNode<Self::NodeRef, Self::Data>>
{
    type NodeRef: Clone + Eq + Hash;
    type Data;
    type DataChange;

    type ChildrenIter<'a>: Iterator<Item = Self::NodeRef> + 'a
    where
        Self: 'a;

    /// Returns an iterator over the children.
    fn children(&self) -> Self::ChildrenIter<'_>;
    /// Returns a changeset that represents the addition of the node.
    fn get_add_change(&self) -> Option<Self::DataChange>;
    /// Returns a changeset that represents the removal of the node.
    fn get_remove_change(&self) -> Option<Self::DataChange>;
    /// Returns the aggregated data which contains only that node
    fn get_initial_data(&self) -> Self::Data;
}
