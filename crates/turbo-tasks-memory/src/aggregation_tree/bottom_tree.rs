use std::{hash::Hash, ops::ControlFlow, sync::Arc};

use nohash_hasher::{BuildNoHashHasher, IsEnabled};
use parking_lot::{RwLock, RwLockReadGuard, RwLockWriteGuard};
use ref_cast::RefCast;

use super::{
    bottom_connection::BottomConnection,
    inner_refs::{BottomRef, ChildLocation, TopRef},
    leaf::{
        add_inner_upper_to_item, bottom_tree, remove_inner_upper_from_item,
        remove_left_upper_from_item,
    },
    top_tree::TopTree,
    AggregationContext, StackVec, CHILDREN_INNER_THRESHOLD, CONNECTIVITY_LIMIT,
};
use crate::count_hash_set::{CountHashSet, RemoveIfEntryResult};

/// The bottom half of the aggregation tree. It aggregates items up the a
/// certain connectivity depending on the "height". Every level of the tree
/// aggregates the previous level.
pub struct BottomTree<T, I: IsEnabled> {
    height: u8,
    item: I,
    state: RwLock<BottomTreeState<T, I>>,
}

pub struct BottomTreeState<T, I: IsEnabled> {
    data: T,
    bottom_upper: BottomConnection<T, I>,
    top_upper: CountHashSet<TopRef<T>, BuildNoHashHasher<TopRef<T>>>,
    // TODO can this become negative?
    following: CountHashSet<I, BuildNoHashHasher<I>>,
}

impl<T: Default, I: IsEnabled> BottomTree<T, I> {
    pub fn new(item: I, height: u8) -> Self {
        Self {
            height,
            item,
            state: RwLock::new(BottomTreeState {
                data: T::default(),
                bottom_upper: BottomConnection::new(),
                top_upper: CountHashSet::new(),
                following: CountHashSet::new(),
            }),
        }
    }
}

impl<T, I: Clone + Eq + Hash + IsEnabled> BottomTree<T, I> {
    pub fn add_children_of_child<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        child_location: ChildLocation,
        children: impl IntoIterator<Item = &'a I>,
        nesting_level: u8,
    ) where
        I: 'a,
    {
        match child_location {
            ChildLocation::Left => {
                // the left child has new children
                // this means it's a inner child of this node
                // We always want to aggregate over at least connectivity 1
                self.add_children_of_child_inner(aggregation_context, children, nesting_level);
            }
            ChildLocation::Inner => {
                // the inner child has new children
                // this means white children are inner children of this node
                // and blue children need to propagate up
                let mut children = children.into_iter().collect();
                if nesting_level > CONNECTIVITY_LIMIT {
                    self.add_children_of_child_following(aggregation_context, children);
                    return;
                }

                self.add_children_of_child_if_following(&mut children);
                self.add_children_of_child_inner(aggregation_context, children, nesting_level);
            }
        }
    }

    fn add_children_of_child_if_following(&self, children: &mut StackVec<&I>) {
        let mut state = self.state.write();
        children.retain(|&mut child| !state.following.add_if_entry(child));
    }

    fn add_children_of_child_following<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        mut children: StackVec<&I>,
    ) {
        let mut state = self.state.write();
        children.retain(|&mut child| state.following.add_clonable(child));
        if children.is_empty() {
            return;
        }
        let buttom_uppers = state.bottom_upper.as_cloned_uppers();
        let top_upper = state.top_upper.iter().cloned().collect::<Vec<_>>();
        drop(state);
        for TopRef { upper } in top_upper {
            upper.add_children_of_child(aggregation_context, children.iter().copied());
        }
        buttom_uppers.add_children_of_child(aggregation_context, children.iter().copied());
    }

    fn add_children_of_child_inner<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        children: impl IntoIterator<Item = &'a I>,
        nesting_level: u8,
    ) where
        I: 'a,
    {
        let mut following = StackVec::default();
        if self.height == 0 {
            for child in children {
                let can_be_inner =
                    add_inner_upper_to_item(aggregation_context, child, self, nesting_level);
                if !can_be_inner {
                    following.push(child);
                }
            }
        } else {
            for child in children {
                let can_be_inner = bottom_tree(aggregation_context, child, self.height - 1)
                    .add_inner_bottom_tree_upper(aggregation_context, self, nesting_level);
                if !can_be_inner {
                    following.push(child);
                }
            }
        }
        if !following.is_empty() {
            self.add_children_of_child_following(aggregation_context, following);
        }
    }

    pub fn add_child_of_child<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        child_location: ChildLocation,
        child_of_child: &I,
        nesting_level: u8,
    ) {
        debug_assert!(child_of_child != &self.item);
        match child_location {
            ChildLocation::Left => {
                // the left child has a new child
                // this means it's a inner child of this node
                // We always want to aggregate over at least connectivity 1
                self.add_child_of_child_inner(aggregation_context, child_of_child, nesting_level);
            }
            ChildLocation::Inner => {
                if nesting_level <= CONNECTIVITY_LIMIT {
                    // the inner child has a new child
                    // but it's not a blue node and we are not too deep
                    // this means it's a inner child of this node
                    // if it's not already a following child
                    if !self.add_child_of_child_if_following(child_of_child) {
                        self.add_child_of_child_inner(
                            aggregation_context,
                            child_of_child,
                            nesting_level,
                        );
                    }
                } else {
                    // the inner child has a new child
                    // this means we need to propagate the change up
                    // and store them in our own list
                    self.add_child_of_child_following(aggregation_context, child_of_child);
                }
            }
        }
    }

    fn add_child_of_child_if_following(&self, child_of_child: &I) -> bool {
        let mut state = self.state.write();
        state.following.add_if_entry(child_of_child)
    }

    fn add_child_of_child_following<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        child_of_child: &I,
    ) {
        let mut state = self.state.write();
        if !state.following.add_clonable(child_of_child) {
            // Already connect, nothing more to do
            return;
        }

        propagate_new_following_to_uppers(state, aggregation_context, child_of_child);
    }

    fn add_child_of_child_inner<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        child_of_child: &I,
        nesting_level: u8,
    ) {
        let can_be_inner = if self.height == 0 {
            add_inner_upper_to_item(aggregation_context, child_of_child, self, nesting_level)
        } else {
            bottom_tree(aggregation_context, child_of_child, self.height - 1)
                .add_inner_bottom_tree_upper(aggregation_context, self, nesting_level)
        };
        if !can_be_inner {
            self.add_child_of_child_following(aggregation_context, child_of_child);
        }
    }

    pub fn remove_child_of_child<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        child_of_child: &I,
    ) {
        if !self.remove_child_of_child_if_following(aggregation_context, child_of_child) {
            self.remove_child_of_child_inner(aggregation_context, child_of_child);
        }
    }

    pub fn remove_children_of_child<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        children: impl IntoIterator<Item = &'a I>,
    ) where
        I: 'a,
    {
        let mut children = children.into_iter().collect();
        self.remove_children_of_child_if_following(aggregation_context, &mut children);
        self.remove_children_of_child_inner(aggregation_context, children);
    }

    fn remove_child_of_child_if_following<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        child_of_child: &I,
    ) -> bool {
        let mut state = self.state.write();
        match state.following.remove_if_entry(child_of_child) {
            RemoveIfEntryResult::PartiallyRemoved => return true,
            RemoveIfEntryResult::NotPresent => return false,
            RemoveIfEntryResult::Removed => {}
        }
        propagate_lost_following_to_uppers(state, aggregation_context, child_of_child);
        true
    }

    fn remove_children_of_child_if_following<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        children: &mut Vec<&'a I>,
    ) {
        let mut state = self.state.write();
        let mut removed = StackVec::default();
        children.retain(|&child| match state.following.remove_if_entry(child) {
            RemoveIfEntryResult::PartiallyRemoved => false,
            RemoveIfEntryResult::NotPresent => true,
            RemoveIfEntryResult::Removed => {
                removed.push(child);
                false
            }
        });
        if !removed.is_empty() {
            propagate_lost_followings_to_uppers(state, aggregation_context, removed);
        }
    }

    fn remove_child_of_child_following<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        child_of_child: &I,
    ) -> bool {
        let mut state = self.state.write();
        if !state.following.remove_clonable(child_of_child) {
            // no present, nothing to do
            return false;
        }
        propagate_lost_following_to_uppers(state, aggregation_context, child_of_child);
        true
    }

    fn remove_children_of_child_following<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        mut children: StackVec<&I>,
    ) {
        let mut state = self.state.write();
        children.retain(|&mut child| state.following.remove_clonable(child));
        propagate_lost_followings_to_uppers(state, aggregation_context, children);
    }

    fn remove_child_of_child_inner<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        child_of_child: &I,
    ) {
        let can_remove_inner = if self.height == 0 {
            remove_inner_upper_from_item(aggregation_context, child_of_child, self)
        } else {
            bottom_tree(aggregation_context, child_of_child, self.height - 1)
                .remove_inner_bottom_tree_upper(aggregation_context, self)
        };
        if !can_remove_inner {
            self.remove_child_of_child_following(aggregation_context, child_of_child);
        }
    }

    fn remove_children_of_child_inner<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        children: impl IntoIterator<Item = &'a I>,
    ) where
        I: 'a,
    {
        let unremoveable: StackVec<_> = if self.height == 0 {
            children
                .into_iter()
                .filter(|&child| !remove_inner_upper_from_item(aggregation_context, child, self))
                .collect()
        } else {
            children
                .into_iter()
                .filter(|&child| {
                    !bottom_tree(aggregation_context, child, self.height - 1)
                        .remove_inner_bottom_tree_upper(aggregation_context, self)
                })
                .collect()
        };
        if !unremoveable.is_empty() {
            self.remove_children_of_child_following(aggregation_context, unremoveable);
        }
    }

    pub fn add_left_bottom_tree_upper<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        upper: &Arc<BottomTree<T, I>>,
    ) {
        let mut state = self.state.write();
        let old_inner = state.bottom_upper.set_left_upper(upper);
        let add_change = aggregation_context.info_to_add_change(&state.data);
        let children = state.following.iter().cloned().collect::<StackVec<_>>();

        let remove_change = (!old_inner.is_unset())
            .then(|| aggregation_context.info_to_remove_change(&state.data))
            .flatten();

        drop(state);
        if let Some(change) = add_change {
            upper.child_change(aggregation_context, &change);
        }
        if !children.is_empty() {
            upper.add_children_of_child(
                aggregation_context,
                ChildLocation::Left,
                children.iter(),
                1,
            );
        }

        // Convert this node into a following node for all old (inner) uppers
        //
        // Old state:
        // I1, I2
        //      \
        //       self
        // Adding L as new left upper:
        // I1, I2     L
        //      \    /
        //       self
        // Final state: (I1 and I2 have L as following instead)
        // I1, I2 ----> L
        //             /
        //         self
        // I1 and I2 have "self" change removed since it's now part of L instead.
        // L = upper, I1, I2 = old_inner
        //
        for (BottomRef { upper: old_upper }, count) in old_inner.into_counts() {
            let item = &self.item;
            old_upper.migrate_old_inner(
                aggregation_context,
                item,
                count,
                &remove_change,
                &children,
            );
        }
    }

    pub fn migrate_old_inner<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        item: &I,
        count: isize,
        remove_change: &Option<C::ItemChange>,
        following: &[I],
    ) {
        let mut state = self.state.write();
        if count > 0 {
            // add as following
            if state.following.add_count(item.clone(), count as usize) {
                propagate_new_following_to_uppers(state, aggregation_context, item);
            } else {
                drop(state);
            }
            // remove from self
            if let Some(change) = remove_change.as_ref() {
                self.child_change(aggregation_context, change);
            }
            self.remove_children_of_child(aggregation_context, following);
        } else {
            // remove count from following instead
            if state.following.remove_count(item.clone(), -count as usize) {
                propagate_lost_following_to_uppers(state, aggregation_context, item);
            }
        }
    }

    #[must_use]
    pub fn add_inner_bottom_tree_upper<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        upper: &Arc<BottomTree<T, I>>,
        nesting_level: u8,
    ) -> bool {
        let mut state = self.state.write();
        let number_of_following = state.following.len();
        let BottomConnection::Inner(inner) = &mut state.bottom_upper else {
            return false;
        };
        if inner.len() * number_of_following > CHILDREN_INNER_THRESHOLD {
            return false;
        };
        let new = inner.add_clonable(BottomRef::ref_cast(upper), nesting_level);
        if new {
            if let Some(change) = aggregation_context.info_to_add_change(&state.data) {
                upper.child_change(aggregation_context, &change);
            }
            let children = state.following.iter().cloned().collect::<StackVec<_>>();
            drop(state);
            if !children.is_empty() {
                upper.add_children_of_child(
                    aggregation_context,
                    ChildLocation::Inner,
                    &children,
                    nesting_level + 1,
                );
            }
        }
        true
    }

    pub fn remove_left_bottom_tree_upper<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        upper: &Arc<BottomTree<T, I>>,
    ) {
        let mut state = self.state.write();
        state.bottom_upper.unset_left_upper(upper);
        if let Some(change) = aggregation_context.info_to_remove_change(&state.data) {
            upper.child_change(aggregation_context, &change);
        }
        let following = state.following.iter().cloned().collect::<StackVec<_>>();
        if state.top_upper.is_empty() {
            drop(state);
            self.remove_self_from_lower(aggregation_context);
        } else {
            drop(state);
        }
        upper.remove_children_of_child(aggregation_context, &following);
    }

    #[must_use]
    pub fn remove_inner_bottom_tree_upper<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        upper: &Arc<BottomTree<T, I>>,
    ) -> bool {
        let mut state = self.state.write();
        let BottomConnection::Inner(inner) = &mut state.bottom_upper else {
            return false;
        };
        let removed = inner.remove_clonable(BottomRef::ref_cast(upper));
        if removed {
            let remove_change = aggregation_context.info_to_remove_change(&state.data);
            let following = state.following.iter().cloned().collect::<StackVec<_>>();
            drop(state);
            if let Some(change) = remove_change {
                upper.child_change(aggregation_context, &change);
            }
            upper.remove_children_of_child(aggregation_context, &following);
        }
        true
    }

    pub fn add_top_tree_upper<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        upper: &Arc<TopTree<T>>,
    ) {
        let mut state = self.state.write();
        let new = state.top_upper.add_clonable(TopRef::ref_cast(upper));
        if new {
            if let Some(change) = aggregation_context.info_to_add_change(&state.data) {
                upper.child_change(aggregation_context, &change);
            }
            for following in state.following.iter() {
                upper.add_child_of_child(aggregation_context, following);
            }
        }
    }

    #[allow(dead_code)]
    pub fn remove_top_tree_upper<C: AggregationContext<Info = T, ItemRef = I>>(
        self: &Arc<Self>,
        aggregation_context: &C,
        upper: &Arc<TopTree<T>>,
    ) {
        let mut state = self.state.write();
        let removed = state.top_upper.remove_clonable(TopRef::ref_cast(upper));
        if removed {
            if let Some(change) = aggregation_context.info_to_remove_change(&state.data) {
                upper.child_change(aggregation_context, &change);
            }
            for following in state.following.iter() {
                upper.remove_child_of_child(aggregation_context, following);
            }
            if state.top_upper.is_empty()
                && !matches!(state.bottom_upper, BottomConnection::Left(_))
            {
                drop(state);
                self.remove_self_from_lower(aggregation_context);
            }
        }
    }

    fn remove_self_from_lower(
        self: &Arc<Self>,
        aggregation_context: &impl AggregationContext<Info = T, ItemRef = I>,
    ) {
        if self.height == 0 {
            remove_left_upper_from_item(aggregation_context, &self.item, self);
        } else {
            bottom_tree(aggregation_context, &self.item, self.height - 1)
                .remove_left_bottom_tree_upper(aggregation_context, self);
        }
    }

    pub fn child_change<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        change: &C::ItemChange,
    ) {
        let mut state = self.state.write();
        let change = aggregation_context.apply_change(&mut state.data, change);
        let state = RwLockWriteGuard::downgrade(state);
        propagate_change_to_upper(&state, aggregation_context, change);
    }

    pub fn get_root_info<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        root_info_type: &C::RootInfoType,
    ) -> C::RootInfo {
        let mut result = aggregation_context.new_root_info(root_info_type);
        let top_uppers = {
            let state = self.state.read();
            state.top_upper.iter().cloned().collect::<StackVec<_>>()
        };
        for TopRef { upper } in top_uppers.iter() {
            let info = upper.get_root_info(aggregation_context, root_info_type);
            if aggregation_context.merge_root_info(&mut result, info) == ControlFlow::Break(()) {
                return result;
            }
        }
        let bottom_uppers = {
            let state = self.state.read();
            state.bottom_upper.as_cloned_uppers()
        };
        bottom_uppers.get_root_info(aggregation_context, root_info_type, result)
    }
}

fn propagate_lost_following_to_uppers<C: AggregationContext>(
    state: RwLockWriteGuard<'_, BottomTreeState<C::Info, C::ItemRef>>,
    aggregation_context: &C,
    child_of_child: &C::ItemRef,
) {
    let bottom_uppers = state.bottom_upper.as_cloned_uppers();
    let top_upper = state.top_upper.iter().cloned().collect::<StackVec<_>>();
    drop(state);
    for TopRef { upper } in top_upper {
        upper.remove_child_of_child(aggregation_context, child_of_child);
    }
    bottom_uppers.remove_child_of_child(aggregation_context, child_of_child);
}

fn propagate_lost_followings_to_uppers<'a, C: AggregationContext>(
    state: RwLockWriteGuard<'_, BottomTreeState<C::Info, C::ItemRef>>,
    aggregation_context: &C,
    children: impl IntoIterator<Item = &'a C::ItemRef> + Clone,
) where
    C::ItemRef: 'a,
{
    let bottom_uppers = state.bottom_upper.as_cloned_uppers();
    let top_upper = state.top_upper.iter().cloned().collect::<Vec<_>>();
    drop(state);
    for TopRef { upper } in top_upper {
        upper.remove_children_of_child(aggregation_context, children.clone());
    }
    bottom_uppers.remove_children_of_child(aggregation_context, children);
}

fn propagate_new_following_to_uppers<C: AggregationContext>(
    state: RwLockWriteGuard<'_, BottomTreeState<C::Info, C::ItemRef>>,
    aggregation_context: &C,
    child_of_child: &C::ItemRef,
) {
    let bottom_uppers = state.bottom_upper.as_cloned_uppers();
    let top_upper = state.top_upper.iter().cloned().collect::<Vec<_>>();
    drop(state);
    for TopRef { upper } in top_upper {
        upper.add_child_of_child(aggregation_context, child_of_child);
    }
    bottom_uppers.add_child_of_child(aggregation_context, child_of_child);
}

fn propagate_change_to_upper<C: AggregationContext>(
    state: &RwLockReadGuard<BottomTreeState<C::Info, C::ItemRef>>,
    aggregation_context: &C,
    change: Option<C::ItemChange>,
) {
    let Some(change) = change else {
        return;
    };
    state
        .bottom_upper
        .child_change(aggregation_context, &change);
    for TopRef { upper } in state.top_upper.iter() {
        upper.child_change(aggregation_context, &change);
    }
}

#[allow(clippy::disallowed_methods)] // Allow VecDeque::new() in this test
#[cfg(test)]
fn visit_graph<C: AggregationContext>(
    aggregation_context: &C,
    entry: &C::ItemRef,
    height: u8,
) -> (usize, usize) {
    use std::collections::{HashSet, VecDeque};
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();
    visited.insert(entry.clone());
    queue.push_back(entry.clone());
    let mut edges = 0;
    while let Some(item) = queue.pop_front() {
        let tree = bottom_tree(aggregation_context, &item, height);
        let state = tree.state.read();
        for next in state.following.iter() {
            edges += 1;
            if visited.insert(next.clone()) {
                queue.push_back(next.clone());
            }
        }
    }
    (visited.len(), edges)
}

#[allow(clippy::disallowed_methods)] // Allow VecDeque::new() in this test
#[cfg(test)]
pub fn print_graph<C: AggregationContext>(
    aggregation_context: &C,
    entry: &C::ItemRef,
    height: u8,
    color_upper: bool,
    name_fn: impl Fn(&C::ItemRef) -> String,
) {
    use std::{
        collections::{HashSet, VecDeque},
        fmt::Write,
    };
    let (nodes, edges) = visit_graph(aggregation_context, entry, height);
    if !color_upper {
        print!("subgraph cluster_{} {{", height);
        print!(
            "label = \"Level {}\\n{} nodes, {} edges\";",
            height, nodes, edges
        );
        print!("color = \"black\";");
    }
    let mut edges = String::new();
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();
    visited.insert(entry.clone());
    queue.push_back(entry.clone());
    while let Some(item) = queue.pop_front() {
        let tree = bottom_tree(aggregation_context, &item, height);
        let name = name_fn(&item);
        let label = name.to_string();
        let state = tree.state.read();
        if color_upper {
            print!(r#""{} {}" [color=red];"#, height - 1, name);
        } else {
            print!(r#""{} {}" [label="{}"];"#, height, name, label);
        }
        for next in state.following.iter() {
            if !color_upper {
                write!(
                    edges,
                    r#""{} {}" -> "{} {}";"#,
                    height,
                    name,
                    height,
                    name_fn(next)
                )
                .unwrap();
            }
            if visited.insert(next.clone()) {
                queue.push_back(next.clone());
            }
        }
    }
    if !color_upper {
        println!("}}");
        println!("{}", edges);
    }
}
