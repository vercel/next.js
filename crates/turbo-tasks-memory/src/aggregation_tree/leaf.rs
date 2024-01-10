use std::{hash::Hash, sync::Arc};

use auto_hash_map::AutoSet;
use nohash_hasher::IsEnabled;
use ref_cast::RefCast;
use tracing::Level;

use super::{
    bottom_connection::{BottomConnection, DistanceCountMap},
    bottom_tree::BottomTree,
    inner_refs::{BottomRef, ChildLocation},
    top_tree::TopTree,
    AggregationContext, AggregationItemLock, LargeStackVec, CHILDREN_INNER_THRESHOLD,
};

/// The leaf of the aggregation tree. It's usually stored inside of the nodes
/// that should be aggregated by the aggregation tree. It caches [TopTree]s and
/// [BottomTree]s created from that node. And it also stores the upper bottom
/// trees.
pub struct AggregationTreeLeaf<T, I: IsEnabled> {
    top_trees: Vec<Option<Arc<TopTree<T>>>>,
    bottom_trees: Vec<Option<Arc<BottomTree<T, I>>>>,
    upper: BottomConnection<T, I>,
}

impl<T, I: Clone + Eq + Hash + IsEnabled> AggregationTreeLeaf<T, I> {
    pub fn new() -> Self {
        Self {
            top_trees: Vec::new(),
            bottom_trees: Vec::new(),
            upper: BottomConnection::new(),
        }
    }

    /// Prepares the addition of new children. It returns a closure that should
    /// be executed outside of the leaf lock.
    #[allow(unused)]
    pub fn add_children_job<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &'a C,
        children: Vec<I>,
    ) -> impl FnOnce() + 'a
    where
        I: 'a,
        T: 'a,
    {
        let uppers = self.upper.as_cloned_uppers();
        move || {
            uppers.add_children_of_child(aggregation_context, &children);
        }
    }

    /// Prepares the addition of a new child. It returns a closure that should
    /// be executed outside of the leaf lock.
    pub fn add_child_job<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &'a C,
        child: &'a I,
    ) -> impl FnOnce() + 'a
    where
        T: 'a,
    {
        let uppers = self.upper.as_cloned_uppers();
        move || {
            uppers.add_child_of_child(aggregation_context, child);
        }
    }

    /// Removes a child.
    pub fn remove_child<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        child: &I,
    ) {
        self.upper
            .as_cloned_uppers()
            .remove_child_of_child(aggregation_context, child);
    }

    /// Prepares the removal of a child. It returns a closure that should be
    /// executed outside of the leaf lock.
    pub fn remove_children_job<
        'a,
        C: AggregationContext<Info = T, ItemRef = I>,
        H,
        const N: usize,
    >(
        &self,
        aggregation_context: &'a C,
        children: AutoSet<I, H, N>,
    ) -> impl FnOnce() + 'a
    where
        T: 'a,
        I: 'a,
        H: 'a,
    {
        let uppers = self.upper.as_cloned_uppers();
        move || uppers.remove_children_of_child(aggregation_context, children.iter())
    }

    /// Communicates a change on the leaf to updated aggregated nodes. Prefer
    /// [Self::change_job] to avoid leaf locking.
    pub fn change<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        change: &C::ItemChange,
    ) {
        self.upper.child_change(aggregation_context, change);
    }

    /// Prepares the communication of a change on the leaf to updated aggregated
    /// nodes. It returns a closure that should be executed outside of the leaf
    /// lock.
    pub fn change_job<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &'a C,
        change: C::ItemChange,
    ) -> impl FnOnce() + 'a
    where
        I: 'a,
        T: 'a,
    {
        let uppers = self.upper.as_cloned_uppers();
        move || {
            uppers.child_change(aggregation_context, &change);
        }
    }

    /// Captures information about the aggregation tree roots.
    pub fn get_root_info<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        root_info_type: &C::RootInfoType,
    ) -> C::RootInfo {
        self.upper.get_root_info(
            aggregation_context,
            root_info_type,
            aggregation_context.new_root_info(root_info_type),
        )
    }

    pub fn has_upper(&self) -> bool {
        !self.upper.is_unset()
    }
}

fn get_or_create_in_vec<T>(
    vec: &mut Vec<Option<T>>,
    index: usize,
    create: impl FnOnce() -> T,
) -> (&mut T, bool) {
    if vec.len() <= index {
        vec.resize_with(index + 1, || None);
    }
    let item = &mut vec[index];
    if item.is_none() {
        *item = Some(create());
        (item.as_mut().unwrap(), true)
    } else {
        (item.as_mut().unwrap(), false)
    }
}

#[tracing::instrument(level = Level::TRACE, skip(aggregation_context, reference))]
pub fn top_tree<C: AggregationContext>(
    aggregation_context: &C,
    reference: &C::ItemRef,
    depth: u8,
) -> Arc<TopTree<C::Info>> {
    let new_top_tree = {
        let mut item = aggregation_context.item(reference);
        let leaf = item.leaf();
        let (tree, new) = get_or_create_in_vec(&mut leaf.top_trees, depth as usize, || {
            Arc::new(TopTree::new(depth))
        });
        if !new {
            return tree.clone();
        }
        tree.clone()
    };
    let bottom_tree = bottom_tree(aggregation_context, reference, depth + 4);
    bottom_tree.add_top_tree_upper(aggregation_context, &new_top_tree);
    new_top_tree
}

pub fn bottom_tree<C: AggregationContext>(
    aggregation_context: &C,
    reference: &C::ItemRef,
    height: u8,
) -> Arc<BottomTree<C::Info, C::ItemRef>> {
    let _span;
    let new_bottom_tree;
    let mut result = None;
    {
        let mut item = aggregation_context.item(reference);
        let leaf = item.leaf();
        let (tree, new) = get_or_create_in_vec(&mut leaf.bottom_trees, height as usize, || {
            Arc::new(BottomTree::new(reference.clone(), height))
        });
        if !new {
            return tree.clone();
        }
        new_bottom_tree = tree.clone();
        _span = (height > 2).then(|| tracing::trace_span!("bottom_tree", height).entered());

        if height == 0 {
            result = Some(add_left_upper_to_item_step_1::<C>(
                &mut item,
                &new_bottom_tree,
            ));
        }
    }
    if let Some(result) = result {
        add_left_upper_to_item_step_2(aggregation_context, reference, &new_bottom_tree, result);
    }
    if height != 0 {
        bottom_tree(aggregation_context, reference, height - 1)
            .add_left_bottom_tree_upper(aggregation_context, &new_bottom_tree);
    }
    new_bottom_tree
}

#[must_use]
pub fn add_inner_upper_to_item<C: AggregationContext>(
    aggregation_context: &C,
    reference: &C::ItemRef,
    upper: &Arc<BottomTree<C::Info, C::ItemRef>>,
    nesting_level: u8,
) -> bool {
    let (change, children) = {
        let mut item = aggregation_context.item(reference);
        let number_of_children = item.number_of_children();
        let leaf = item.leaf();
        let BottomConnection::Inner(inner) = &mut leaf.upper else {
            return false;
        };
        if inner.len() * number_of_children > CHILDREN_INNER_THRESHOLD {
            return false;
        }
        let new = inner.add_clonable(BottomRef::ref_cast(upper), nesting_level);
        if new {
            let change = item.get_add_change();
            (
                change,
                item.children()
                    .map(|r| r.into_owned())
                    .collect::<LargeStackVec<_>>(),
            )
        } else {
            return true;
        }
    };
    if let Some(change) = change {
        upper.child_change(aggregation_context, &change);
    }
    if !children.is_empty() {
        upper.add_children_of_child(
            aggregation_context,
            ChildLocation::Inner,
            &children,
            nesting_level + 1,
        )
    }
    true
}

struct AddLeftUpperIntermediateResult<C: AggregationContext>(
    Option<C::ItemChange>,
    LargeStackVec<C::ItemRef>,
    DistanceCountMap<BottomRef<C::Info, C::ItemRef>>,
    Option<C::ItemChange>,
);

#[must_use]
fn add_left_upper_to_item_step_1<C: AggregationContext>(
    item: &mut C::ItemLock<'_>,
    upper: &Arc<BottomTree<C::Info, C::ItemRef>>,
) -> AddLeftUpperIntermediateResult<C> {
    let old_inner = item.leaf().upper.set_left_upper(upper);
    let remove_change_for_old_inner = (!old_inner.is_unset())
        .then(|| item.get_remove_change())
        .flatten();
    let children = item.children().map(|r| r.into_owned()).collect();
    AddLeftUpperIntermediateResult(
        item.get_add_change(),
        children,
        old_inner,
        remove_change_for_old_inner,
    )
}

fn add_left_upper_to_item_step_2<C: AggregationContext>(
    aggregation_context: &C,
    reference: &C::ItemRef,
    upper: &Arc<BottomTree<C::Info, C::ItemRef>>,
    step_1_result: AddLeftUpperIntermediateResult<C>,
) {
    let AddLeftUpperIntermediateResult(change, children, old_inner, remove_change_for_old_inner) =
        step_1_result;
    if let Some(change) = change {
        upper.child_change(aggregation_context, &change);
    }
    if !children.is_empty() {
        upper.add_children_of_child(aggregation_context, ChildLocation::Left, &children, 1)
    }
    for (BottomRef { upper: old_upper }, count) in old_inner.into_counts() {
        old_upper.migrate_old_inner(
            aggregation_context,
            reference,
            count,
            &remove_change_for_old_inner,
            &children,
        );
    }
}

pub fn remove_left_upper_from_item<C: AggregationContext>(
    aggregation_context: &C,
    reference: &C::ItemRef,
    upper: &Arc<BottomTree<C::Info, C::ItemRef>>,
) {
    let mut item = aggregation_context.item(reference);
    let leaf = &mut item.leaf();
    leaf.upper.unset_left_upper(upper);
    let change = item.get_remove_change();
    let children = item.children().map(|r| r.into_owned()).collect::<Vec<_>>();
    drop(item);
    if let Some(change) = change {
        upper.child_change(aggregation_context, &change);
    }
    for child in children {
        upper.remove_child_of_child(aggregation_context, &child)
    }
}

#[must_use]
pub fn remove_inner_upper_from_item<C: AggregationContext>(
    aggregation_context: &C,
    reference: &C::ItemRef,
    upper: &Arc<BottomTree<C::Info, C::ItemRef>>,
) -> bool {
    let mut item = aggregation_context.item(reference);
    let BottomConnection::Inner(inner) = &mut item.leaf().upper else {
        return false;
    };
    if !inner.remove_clonable(BottomRef::ref_cast(upper)) {
        // Nothing to do
        return true;
    }
    let change = item.get_remove_change();
    let children = item
        .children()
        .map(|r| r.into_owned())
        .collect::<LargeStackVec<_>>();
    drop(item);

    if let Some(change) = change {
        upper.child_change(aggregation_context, &change);
    }
    for child in children {
        upper.remove_child_of_child(aggregation_context, &child)
    }
    true
}

/// Checks thresholds for an item to ensure the aggregation graph stays
/// well-formed. Run this before adding a child to an item. Returns a closure
/// that should be executed outside of the leaf lock.
pub fn ensure_thresholds<'a, C: AggregationContext>(
    aggregation_context: &'a C,
    item: &mut C::ItemLock<'_>,
) -> Option<impl FnOnce() + 'a> {
    let mut result = None;

    let number_of_total_children = item.number_of_children();
    let reference = item.reference().clone();
    let leaf = item.leaf();
    if let BottomConnection::Inner(list) = &leaf.upper {
        if list.len() * number_of_total_children > CHILDREN_INNER_THRESHOLD {
            let (tree, new) = get_or_create_in_vec(&mut leaf.bottom_trees, 0, || {
                Arc::new(BottomTree::new(reference.clone(), 0))
            });
            debug_assert!(new);
            let new_bottom_tree = tree.clone();
            result = Some((
                add_left_upper_to_item_step_1::<C>(item, &new_bottom_tree),
                reference,
                new_bottom_tree,
            ));
        }
    }
    result.map(|(result, reference, new_bottom_tree)| {
        move || {
            let _span = tracing::trace_span!("aggregation_tree::reorganize").entered();
            add_left_upper_to_item_step_2(
                aggregation_context,
                &reference,
                &new_bottom_tree,
                result,
            );
        }
    })
}
