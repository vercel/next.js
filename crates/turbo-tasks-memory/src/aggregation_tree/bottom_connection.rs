use std::{hash::Hash, ops::ControlFlow, sync::Arc};

use auto_hash_map::{map::RawEntry, AutoMap};
use nohash_hasher::{BuildNoHashHasher, IsEnabled};

use super::{
    bottom_tree::BottomTree,
    inner_refs::{BottomRef, ChildLocation},
    AggregationContext, StackVec,
};

struct BottomRefInfo {
    count: isize,
    distance: u8,
}

/// A map that stores references to bottom trees which a specific distance. It
/// stores the minimum distance added to the map.
///
/// This is used to store uppers of leafs or smaller bottom trees with the
/// current distance. The distance is imporant to keep the correct connectivity.
#[derive(Default)]
pub struct DistanceCountMap<T: IsEnabled> {
    map: AutoMap<T, BottomRefInfo, BuildNoHashHasher<T>>,
}

impl<T: IsEnabled + Eq + Hash + Clone> DistanceCountMap<T> {
    pub fn new() -> Self {
        Self {
            map: AutoMap::with_hasher(),
        }
    }

    pub fn is_unset(&self) -> bool {
        self.map.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&T, u8)> {
        self.map
            .iter()
            .filter(|(_, info)| info.count > 0)
            .map(|(item, &BottomRefInfo { distance, .. })| (item, distance))
    }

    pub fn add_clonable(&mut self, item: &T, distance: u8) -> bool {
        match self.map.raw_entry_mut(item) {
            RawEntry::Occupied(mut e) => {
                let info = e.get_mut();
                info.count += 1;
                match info.count.cmp(&0) {
                    std::cmp::Ordering::Equal => {
                        e.remove();
                    }
                    std::cmp::Ordering::Greater => {
                        if distance < info.distance {
                            info.distance = distance;
                        }
                    }
                    std::cmp::Ordering::Less => {
                        // We only track that for negative count tracking and no
                        // need to update the distance, it would reset anyway
                        // once we reach 0.
                    }
                }
                false
            }
            RawEntry::Vacant(e) => {
                e.insert(item.clone(), BottomRefInfo { count: 1, distance });
                true
            }
        }
    }

    pub fn remove_clonable(&mut self, item: &T) -> bool {
        match self.map.raw_entry_mut(item) {
            RawEntry::Occupied(mut e) => {
                let info = e.get_mut();
                info.count -= 1;
                if info.count == 0 {
                    e.remove();
                    true
                } else {
                    false
                }
            }
            RawEntry::Vacant(e) => {
                e.insert(
                    item.clone(),
                    BottomRefInfo {
                        count: -1,
                        distance: 0,
                    },
                );
                false
            }
        }
    }

    pub fn into_counts(self) -> impl Iterator<Item = (T, isize)> {
        self.map.into_iter().map(|(item, info)| (item, info.count))
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }
}

/// Connection to upper bottom trees. It has two modes: A single bottom tree,
/// where the current left/smaller bottom tree is the left-most child. Or
/// multiple bottom trees, where the current left/smaller bottom tree is an
/// inner child (not left-most).
pub enum BottomConnection<T, I: IsEnabled> {
    Left(Arc<BottomTree<T, I>>),
    Inner(DistanceCountMap<BottomRef<T, I>>),
}

impl<T, I: IsEnabled> BottomConnection<T, I> {
    pub fn new() -> Self {
        Self::Inner(DistanceCountMap::new())
    }

    pub fn is_unset(&self) -> bool {
        match self {
            Self::Left(_) => false,
            Self::Inner(list) => list.is_unset(),
        }
    }

    pub fn as_cloned_uppers(&self) -> BottomUppers<T, I> {
        match self {
            Self::Left(upper) => BottomUppers::Left(upper.clone()),
            Self::Inner(upper) => BottomUppers::Inner(
                upper
                    .iter()
                    .map(|(item, distance)| (item.clone(), distance))
                    .collect(),
            ),
        }
    }

    #[must_use]
    pub fn set_left_upper(
        &mut self,
        upper: &Arc<BottomTree<T, I>>,
    ) -> DistanceCountMap<BottomRef<T, I>> {
        match std::mem::replace(self, BottomConnection::Left(upper.clone())) {
            BottomConnection::Left(_) => unreachable!("Can't have two left children"),
            BottomConnection::Inner(old_inner) => old_inner,
        }
    }

    pub fn unset_left_upper(&mut self, upper: &Arc<BottomTree<T, I>>) {
        match std::mem::replace(self, BottomConnection::Inner(DistanceCountMap::new())) {
            BottomConnection::Left(old_upper) => {
                debug_assert!(Arc::ptr_eq(&old_upper, upper));
            }
            BottomConnection::Inner(_) => unreachable!("Must that a left child"),
        }
    }
}

impl<T, I: IsEnabled + Eq + Hash + Clone> BottomConnection<T, I> {
    pub fn child_change<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        change: &C::ItemChange,
    ) {
        match self {
            BottomConnection::Left(upper) => {
                upper.child_change(aggregation_context, change);
            }
            BottomConnection::Inner(list) => {
                for (BottomRef { upper }, _) in list.iter() {
                    upper.child_change(aggregation_context, change);
                }
            }
        }
    }

    pub fn get_root_info<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        root_info_type: &C::RootInfoType,
        mut result: C::RootInfo,
    ) -> C::RootInfo {
        match &self {
            BottomConnection::Left(upper) => {
                let info = upper.get_root_info(aggregation_context, root_info_type);
                if aggregation_context.merge_root_info(&mut result, info) == ControlFlow::Break(())
                {
                    return result;
                }
            }
            BottomConnection::Inner(list) => {
                for (BottomRef { upper }, _) in list.iter() {
                    let info = upper.get_root_info(aggregation_context, root_info_type);
                    if aggregation_context.merge_root_info(&mut result, info)
                        == ControlFlow::Break(())
                    {
                        return result;
                    }
                }
            }
        }
        result
    }
}

pub enum BottomUppers<T, I: IsEnabled> {
    Left(Arc<BottomTree<T, I>>),
    Inner(StackVec<(BottomRef<T, I>, u8)>),
}

impl<T, I: IsEnabled + Eq + Hash + Clone> BottomUppers<T, I> {
    pub fn add_children_of_child<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        children: impl IntoIterator<Item = &'a I> + Clone,
    ) where
        I: 'a,
    {
        match self {
            BottomUppers::Left(upper) => {
                upper.add_children_of_child(aggregation_context, ChildLocation::Left, children, 0);
            }
            BottomUppers::Inner(list) => {
                for &(BottomRef { ref upper }, nesting_level) in list {
                    upper.add_children_of_child(
                        aggregation_context,
                        ChildLocation::Inner,
                        children.clone(),
                        nesting_level + 1,
                    );
                }
            }
        }
    }

    pub fn add_child_of_child<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        child_of_child: &I,
    ) {
        match self {
            BottomUppers::Left(upper) => {
                upper.add_child_of_child(
                    aggregation_context,
                    ChildLocation::Left,
                    child_of_child,
                    0,
                );
            }
            BottomUppers::Inner(list) => {
                for &(BottomRef { ref upper }, nesting_level) in list.iter() {
                    upper.add_child_of_child(
                        aggregation_context,
                        ChildLocation::Inner,
                        child_of_child,
                        nesting_level + 1,
                    );
                }
            }
        }
    }

    pub fn remove_child_of_child<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        child_of_child: &I,
    ) {
        match self {
            BottomUppers::Left(upper) => {
                upper.remove_child_of_child(aggregation_context, child_of_child);
            }
            BottomUppers::Inner(list) => {
                for (BottomRef { upper }, _) in list {
                    upper.remove_child_of_child(aggregation_context, child_of_child);
                }
            }
        }
    }

    pub fn remove_children_of_child<'a, C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        children: impl IntoIterator<Item = &'a I> + Clone,
    ) where
        I: 'a,
    {
        match self {
            BottomUppers::Left(upper) => {
                upper.remove_children_of_child(aggregation_context, children);
            }
            BottomUppers::Inner(list) => {
                for (BottomRef { upper }, _) in list {
                    upper.remove_children_of_child(aggregation_context, children.clone());
                }
            }
        }
    }

    pub fn child_change<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        change: &C::ItemChange,
    ) {
        match self {
            BottomUppers::Left(upper) => {
                upper.child_change(aggregation_context, change);
            }
            BottomUppers::Inner(list) => {
                for (BottomRef { upper }, _) in list {
                    upper.child_change(aggregation_context, change);
                }
            }
        }
    }

    pub fn get_root_info<C: AggregationContext<Info = T, ItemRef = I>>(
        &self,
        aggregation_context: &C,
        root_info_type: &C::RootInfoType,
        mut result: C::RootInfo,
    ) -> C::RootInfo {
        match &self {
            BottomUppers::Left(upper) => {
                let info = upper.get_root_info(aggregation_context, root_info_type);
                if aggregation_context.merge_root_info(&mut result, info) == ControlFlow::Break(())
                {
                    return result;
                }
            }
            BottomUppers::Inner(list) => {
                for (BottomRef { upper }, _) in list.iter() {
                    let info = upper.get_root_info(aggregation_context, root_info_type);
                    if aggregation_context.merge_root_info(&mut result, info)
                        == ControlFlow::Break(())
                    {
                        return result;
                    }
                }
            }
        }
        result
    }
}
