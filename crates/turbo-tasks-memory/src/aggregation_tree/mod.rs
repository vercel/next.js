//! The module implements a datastructure that aggregates a "forest" into less
//! nodes. For any node one can ask for a single aggregated version of all
//! children on that node. Changes the the forest will propagate up the
//! aggregation tree to keep it up to date. So asking of an aggregated
//! information is cheap and one can even wait for aggregated info to change.
//!
//! The aggregation will try to reuse aggregated nodes on every level to reduce
//! memory and cpu usage of propagating changes. The tree structure is designed
//! for multi-thread usage.
//!
//! The aggregation tree is build out of two halfs. The top tree and the bottom
//! tree. One node of the bottom tree can aggregate items of connectivity
//! 2^height. It will do that by having bottom trees of height - 1 as children.
//! One node of the top tree can aggregate items of any connectivity. It will do
//! that by having a bottom tree of height = depth as a child and top trees of
//! depth + 1 as children. So it's basically a linked list of bottom trees of
//! increasing height. Any top or bottom node can be shared between multiple
//! parents.
//!
//! Notations:
//! - parent/child: Relationship in the original forest resp. the aggregated
//!   version of the relationships.
//! - upper: Relationship to a aggregated node in a higher level (more
//!   aggregated). Since all communication is strictly upwards there is no down
//!   relationship for that.

mod bottom_connection;
mod bottom_tree;
mod inner_refs;
mod leaf;
#[cfg(test)]
mod tests;
mod top_tree;

use std::{borrow::Cow, hash::Hash, ops::ControlFlow, sync::Arc};

use nohash_hasher::IsEnabled;
use smallvec::SmallVec;

use self::{leaf::top_tree, top_tree::TopTree};
pub use self::{
    leaf::{ensure_thresholds, AggregationTreeLeaf},
    top_tree::AggregationInfoGuard,
};

/// The maximum connectivity of one layer of bottom tree.
const CONNECTIVITY_LIMIT: u8 = 7;

/// The maximum of number of children muliplied by number of upper bottom trees.
/// When reached the parent of the children will form a new bottom tree.
const CHILDREN_INNER_THRESHOLD: usize = 2000;

type StackVec<I> = SmallVec<[I; 16]>;
type LargeStackVec<I> = SmallVec<[I; 32]>;

/// The context trait which defines how the aggregation tree should behave.
pub trait AggregationContext {
    type ItemLock<'a>: AggregationItemLock<
        ItemRef = Self::ItemRef,
        Info = Self::Info,
        ItemChange = Self::ItemChange,
    >
    where
        Self: 'a;
    type Info: Default;
    type ItemChange;
    type ItemRef: Eq + Hash + Clone + IsEnabled;
    type RootInfo;
    type RootInfoType;

    /// Gets mutable access to an item.
    fn item<'a>(&'a self, reference: &Self::ItemRef) -> Self::ItemLock<'a>;

    /// Apply a changeset to an aggregated info object. Returns a new changeset
    /// that should be applied to the next aggregation level. Might return None,
    /// if no change should be applied to the next level.
    fn apply_change(
        &self,
        info: &mut Self::Info,
        change: &Self::ItemChange,
    ) -> Option<Self::ItemChange>;

    /// Creates a changeset from an aggregated info object, that represents
    /// adding the aggregated node to an aggregated node of the next level.
    fn info_to_add_change(&self, info: &Self::Info) -> Option<Self::ItemChange>;
    /// Creates a changeset from an aggregated info object, that represents
    /// removing the aggregated node from an aggregated node of the next level.
    fn info_to_remove_change(&self, info: &Self::Info) -> Option<Self::ItemChange>;

    /// Initializes a new empty root info object.
    fn new_root_info(&self, root_info_type: &Self::RootInfoType) -> Self::RootInfo;
    /// Creates a new root info object from an aggregated info object. This is
    /// only called on the root of the aggregation tree.
    fn info_to_root_info(
        &self,
        info: &Self::Info,
        root_info_type: &Self::RootInfoType,
    ) -> Self::RootInfo;
    /// Merges two root info objects. Can optionally break the root info
    /// gathering which will return this root info object as final result.
    fn merge_root_info(
        &self,
        root_info: &mut Self::RootInfo,
        other: Self::RootInfo,
    ) -> ControlFlow<()>;
}

/// A lock on a single item.
pub trait AggregationItemLock {
    type Info;
    type ItemRef: Clone + IsEnabled;
    type ItemChange;
    type ChildrenIter<'a>: Iterator<Item = Cow<'a, Self::ItemRef>> + 'a
    where
        Self: 'a;
    /// Returns a reference to the item.
    fn reference(&self) -> &Self::ItemRef;
    /// Get mutable access to the leaf info.
    fn leaf(&mut self) -> &mut AggregationTreeLeaf<Self::Info, Self::ItemRef>;
    /// Returns the number of children.
    fn number_of_children(&self) -> usize;
    /// Returns an iterator over the children.
    fn children(&self) -> Self::ChildrenIter<'_>;
    /// Returns a changeset that represents the addition of the item.
    fn get_add_change(&self) -> Option<Self::ItemChange>;
    /// Returns a changeset that represents the removal of the item.
    fn get_remove_change(&self) -> Option<Self::ItemChange>;
}

/// Gives an reference to the root aggregated info for a given item.
pub fn aggregation_info<C: AggregationContext>(
    aggregation_context: &C,
    reference: &C::ItemRef,
) -> AggregationInfoReference<C::Info> {
    AggregationInfoReference {
        tree: top_tree(aggregation_context, reference, 0),
    }
}

/// A reference to the root aggregated info of a node.
pub struct AggregationInfoReference<T> {
    tree: Arc<TopTree<T>>,
}

impl<T> AggregationInfoReference<T> {
    /// Locks the info and gives mutable access to it.
    pub fn lock(&self) -> AggregationInfoGuard<T> {
        self.tree.lock_info()
    }
}
