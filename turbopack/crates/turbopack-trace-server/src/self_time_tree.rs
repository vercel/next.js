use std::mem::take;

use crate::timestamp::Timestamp;

const SPLIT_COUNT: usize = 128;
/// Start balancing the tree when there are N times more items on one side. Must be at least 3.
const BALANCE_THRESHOLD: usize = 3;

pub struct SelfTimeTree<T> {
    entries: Vec<SelfTimeEntry<T>>,
    children: Option<Box<SelfTimeChildren<T>>>,
    count: usize,
}

struct SelfTimeEntry<T> {
    start: Timestamp,
    end: Timestamp,
    item: T,
}

struct SelfTimeChildren<T> {
    /// Entries < split_point
    left: SelfTimeTree<T>,
    split_point: Timestamp,
    /// Entries >= split_point
    right: SelfTimeTree<T>,
    /// Number of entries in the SelfTimeTree::entries list that overlap the split point
    spanning_entries: usize,
}

impl<T> Default for SelfTimeTree<T> {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            children: None,
            count: 0,
        }
    }
}

impl<T> SelfTimeTree<T> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.count
    }

    pub fn insert(&mut self, start: Timestamp, end: Timestamp, item: T) {
        self.count += 1;
        self.entries.push(SelfTimeEntry { start, end, item });
        self.check_for_split();
    }

    fn insert_without_check(&mut self, start: Timestamp, end: Timestamp, item: T) {
        self.count += 1;
        self.entries.push(SelfTimeEntry { start, end, item });
    }

    fn check_for_split(&mut self) {
        if self.entries.len() >= SPLIT_COUNT {
            let spanning_entries = if let Some(children) = &mut self.children {
                children.spanning_entries
            } else {
                0
            };
            if self.entries.len() - spanning_entries >= SPLIT_COUNT {
                self.split();
            }
        }
    }

    pub fn optimize(&mut self) {
        if self.children.is_some() {
            self.distribute_entries();
            self.rebalance();
            let children = self.children.as_mut().unwrap();
            children.left.optimize();
            children.right.optimize();
        }
        self.entries.shrink_to_fit();
    }

    fn split(&mut self) {
        debug_assert!(!self.entries.is_empty());
        self.distribute_entries();
        self.rebalance();
    }

    fn distribute_entries(&mut self) {
        if self.children.is_none() {
            let (start, end) = self
                .entries
                .iter()
                .fold((Timestamp::MAX, Timestamp::ZERO), |(lo, hi), e| {
                    (lo.min(e.start), hi.max(e.end))
                });
            let middle = (start + end) / 2;
            // Pre-allocate half the split threshold: after distributing, each child
            // typically receives ~SPLIT_COUNT / 2 entries.
            self.children = Some(Box::new(SelfTimeChildren {
                left: SelfTimeTree {
                    entries: Vec::with_capacity(SPLIT_COUNT / 2),
                    ..SelfTimeTree::default()
                },
                split_point: middle,
                right: SelfTimeTree {
                    entries: Vec::with_capacity(SPLIT_COUNT / 2),
                    ..SelfTimeTree::default()
                },
                spanning_entries: 0,
            }));
        }
        let Some(children) = &mut self.children else {
            unreachable!();
        };
        let mut i = children.spanning_entries;
        while i < self.entries.len() {
            let SelfTimeEntry { start, end, .. } = self.entries[i];
            if end <= children.split_point {
                let SelfTimeEntry { start, end, item } = self.entries.swap_remove(i);
                children.left.insert_without_check(start, end, item);
            } else if start >= children.split_point {
                let SelfTimeEntry { start, end, item } = self.entries.swap_remove(i);
                children.right.insert_without_check(start, end, item);
            } else {
                self.entries.swap(i, children.spanning_entries);
                children.spanning_entries += 1;
                i += 1;
            }
        }
        children.left.check_for_split();
        children.right.check_for_split();
    }

    fn rebalance(&mut self) {
        if let Some(box SelfTimeChildren {
            left,
            split_point,
            right,
            spanning_entries,
        }) = &mut self.children
        {
            let SelfTimeTree {
                count: left_count,
                children: left_children,
                entries: left_entries,
            } = left;
            let SelfTimeTree {
                count: right_count,
                children: right_children,
                entries: right_entries,
            } = right;
            if *left_count > *right_count * BALANCE_THRESHOLD + *spanning_entries {
                // The left side has overweight
                // We want to have a new tree that is:
                // left' = left.left
                // right' = (left.right, right) with self.split_point
                // split_point' = left.split_point
                // direct entries in self and left are put in self and are redistributed
                if let Some(box SelfTimeChildren {
                    left: left_left,
                    split_point: left_split_point,
                    right: left_right,
                    spanning_entries: _,
                }) = left_children
                {
                    *right = Self {
                        count: left_right.count + right.count,
                        entries: Vec::new(),
                        children: Some(Box::new(SelfTimeChildren {
                            left: take(left_right),
                            split_point: *split_point,
                            right: take(right),
                            spanning_entries: 0,
                        })),
                    };
                    *split_point = *left_split_point;
                    self.entries.append(left_entries);
                    *left = take(left_left);
                    *spanning_entries = 0;
                    self.distribute_entries();
                }
            } else if *right_count > *left_count * BALANCE_THRESHOLD + *spanning_entries {
                // The right side has overweight
                // We want to have a new tree that is:
                // left' = (left, right.left) with self.split_point
                // right' = right.right
                // split_point' = right.split_point
                // direct entries in self and right are put in self and are redistributed
                if let Some(box SelfTimeChildren {
                    left: right_left,
                    split_point: right_split_point,
                    right: right_right,
                    spanning_entries: _,
                }) = right_children
                {
                    *left = Self {
                        count: left.count + right_left.count,
                        entries: Vec::new(),
                        children: Some(Box::new(SelfTimeChildren {
                            left: take(left),
                            split_point: *split_point,
                            right: take(right_left),
                            spanning_entries: 0,
                        })),
                    };
                    *split_point = *right_split_point;
                    self.entries.append(right_entries);
                    *right = take(right_right);
                    *spanning_entries = 0;
                    self.distribute_entries();
                }
            }
        }
    }

    #[cfg(test)]
    pub fn lookup_range_count(&self, start: Timestamp, end: Timestamp) -> Timestamp {
        let mut total_count = Timestamp::ZERO;
        for entry in &self.entries {
            if entry.start <= end && entry.end >= start {
                let start = std::cmp::max(entry.start, start);
                let end = std::cmp::min(entry.end, end);
                let span = end - start;
                total_count += span;
            }
        }
        if let Some(children) = &self.children {
            if start <= children.split_point {
                total_count += children.left.lookup_range_count(start, end);
            }
            if end >= children.split_point {
                total_count += children.right.lookup_range_count(start, end);
            }
        }
        total_count
    }

    pub fn lookup_range_corrected_time(&self, start: Timestamp, end: Timestamp) -> Timestamp {
        #[derive(PartialEq, Eq, PartialOrd, Ord)]
        enum Change {
            Start,
            End,
        }
        let mut current_count = 0;
        let mut changes = Vec::new();
        self.for_each_in_range(start, end, &mut |s, e, _| {
            if s <= start {
                current_count += 1;
            } else {
                changes.push((s, Change::Start));
            }
            if e < end {
                changes.push((e, Change::End));
            }
        });

        // Fast path: every overlapping interval fully contains `[start, end]`, so the
        // count is constant over the whole window. Skip the sort and the sweep.
        if changes.is_empty() {
            if current_count == 0 {
                return Timestamp::ZERO;
            }
            return Timestamp::from_value(*(end - start) / current_count);
        }

        changes.sort_unstable();
        let mut factor_times_1000 = 0u64;
        let mut current_ts = start;
        for (ts, change) in changes {
            if current_ts < ts {
                // Move time
                let time_diff = ts - current_ts;
                factor_times_1000 += *time_diff * 1000 / current_count;
                current_ts = ts;
            }
            match change {
                Change::Start => current_count += 1,
                Change::End => current_count -= 1,
            }
        }
        if current_ts < end {
            let time_diff = end - current_ts;
            factor_times_1000 += *time_diff * 1000 / current_count;
        }
        Timestamp::from_value(factor_times_1000 / 1000)
    }

    pub fn for_each_in_range(
        &self,
        start: Timestamp,
        end: Timestamp,
        f: &mut impl FnMut(Timestamp, Timestamp, &T),
    ) {
        for entry in &self.entries {
            if entry.start <= end && entry.end >= start {
                f(entry.start, entry.end, &entry.item);
            }
        }
        if let Some(children) = &self.children {
            if start <= children.split_point {
                children.left.for_each_in_range(start, end, f);
            }
            if end >= children.split_point {
                children.right.for_each_in_range(start, end, f);
            }
        }
    }

    pub fn for_each_in_range_optimize(
        &mut self,
        start: Timestamp,
        end: Timestamp,
        f: &mut impl FnMut(Timestamp, Timestamp, &T),
    ) {
        if self.children.is_some() {
            self.distribute_entries();
            self.rebalance();
        }
        for entry in &self.entries {
            if entry.start <= end && entry.end >= start {
                f(entry.start, entry.end, &entry.item);
            }
        }
        if let Some(children) = &mut self.children {
            if start <= children.split_point {
                children.left.for_each_in_range_optimize(start, end, f);
            }
            if end >= children.split_point {
                children.right.for_each_in_range_optimize(start, end, f);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn print_tree<T>(tree: &SelfTimeTree<T>, indent: usize) {
        if let Some(children) = &tree.children {
            println!(
                "{}{} items (split at {}, {} overlapping, {} total)",
                " ".repeat(indent),
                tree.entries.len(),
                children.split_point,
                children.spanning_entries,
                tree.count
            );
            print_tree(&children.left, indent + 2);
            print_tree(&children.right, indent + 2);
        } else {
            println!(
                "{}{} items ({} total)",
                " ".repeat(indent),
                tree.entries.len(),
                tree.count
            );
        }
    }

    fn assert_balanced<T>(tree: &SelfTimeTree<T>) {
        if let Some(children) = &tree.children {
            let l = children.left.count;
            let r = children.right.count;
            let s = children.spanning_entries;
            if (l > SPLIT_COUNT || r > SPLIT_COUNT)
                && ((l > r * BALANCE_THRESHOLD + s) || (r > l * BALANCE_THRESHOLD + s))
            {
                print_tree(tree, 0);
                panic!("Tree is not balanced");
            }
            assert_balanced(&children.left);
            assert_balanced(&children.right);
        }
    }

    #[test]
    fn test_simple() {
        let mut tree = SelfTimeTree::new();
        let count = 10000;
        for i in 0..count {
            tree.insert(Timestamp::from_micros(i), Timestamp::from_micros(i + 1), i);
            assert_eq!(tree.count, (i + 1) as usize);
            assert_balanced(&tree);
        }
        assert_eq!(
            tree.lookup_range_count(Timestamp::ZERO, Timestamp::from_micros(count)),
            Timestamp::from_micros(count)
        );
        print_tree(&tree, 0);
        assert_balanced(&tree);
    }

    #[test]
    fn test_evenly() {
        let mut tree = SelfTimeTree::new();
        let count = 10000;
        for a in 0..10 {
            for b in 0..10 {
                for c in 0..10 {
                    for d in 0..10 {
                        let i = d * 1000 + c * 100 + b * 10 + a;
                        tree.insert(Timestamp::from_micros(i), Timestamp::from_micros(i + 1), i);
                        assert_balanced(&tree);
                    }
                }
            }
        }
        assert_eq!(
            tree.lookup_range_count(Timestamp::ZERO, Timestamp::from_micros(count)),
            Timestamp::from_micros(count)
        );
        print_tree(&tree, 0);
        assert_balanced(&tree);
    }

    #[test]
    fn test_overlapping() {
        let mut tree = SelfTimeTree::new();
        let count = 10000;
        for i in 0..count {
            tree.insert(
                Timestamp::from_micros(i),
                Timestamp::from_micros(i + 100),
                i,
            );
            assert_eq!(tree.count, (i + 1) as usize);
            assert_balanced(&tree);
        }
        assert_eq!(
            tree.lookup_range_count(Timestamp::ZERO, Timestamp::from_micros(count + 100)),
            Timestamp::from_micros(count * 100)
        );
        print_tree(&tree, 0);
        assert_balanced(&tree);
    }

    #[test]
    fn test_overlapping_heavy() {
        let mut tree = SelfTimeTree::new();
        let count = 10000;
        for i in 0..count {
            tree.insert(
                Timestamp::from_micros(i),
                Timestamp::from_micros(i + 500),
                i,
            );
            assert_eq!(tree.count, (i + 1) as usize);
        }
        assert_eq!(
            tree.lookup_range_count(Timestamp::ZERO, Timestamp::from_micros(count + 500)),
            Timestamp::from_micros(count * 500)
        );
        print_tree(&tree, 0);
        assert_balanced(&tree);
    }

    #[test]
    fn test_corrected_time_no_overlap() {
        // No intervals at all — corrected time of an empty range is zero.
        let tree: SelfTimeTree<u32> = SelfTimeTree::new();
        let r = tree
            .lookup_range_corrected_time(Timestamp::from_micros(0), Timestamp::from_micros(100));
        assert_eq!(r, Timestamp::ZERO);
    }

    #[test]
    fn test_corrected_time_single_interval() {
        // One interval matching the query window exactly: correction factor 1, returns full
        // duration.
        let mut tree = SelfTimeTree::new();
        tree.insert(Timestamp::from_micros(0), Timestamp::from_micros(100), 0u32);
        let r = tree
            .lookup_range_corrected_time(Timestamp::from_micros(0), Timestamp::from_micros(100));
        assert_eq!(r, Timestamp::from_micros(100));
    }

    #[test]
    fn test_corrected_time_fast_path_full_containment() {
        // Two intervals each fully contain [10, 20]: count is 2 throughout, answer = 10/2 = 5us.
        let mut tree = SelfTimeTree::new();
        tree.insert(Timestamp::from_micros(0), Timestamp::from_micros(100), 0u32);
        tree.insert(Timestamp::from_micros(5), Timestamp::from_micros(50), 1u32);
        let r = tree
            .lookup_range_corrected_time(Timestamp::from_micros(10), Timestamp::from_micros(20));
        assert_eq!(r, Timestamp::from_micros(5));
    }

    #[test]
    fn test_corrected_time_partial_overlap() {
        // [0, 100] is the query window. Intervals:
        //   A: [0, 100]    (covers whole window)
        //   B: [30, 70]    (fully inside, contributes corrections during [30, 70])
        // Expected:
        //   [0, 30):  count=1, time=30, corrected = 30 / 1 = 30
        //   [30, 70): count=2, time=40, corrected = 40 / 2 = 20
        //   [70, 100): count=1, time=30, corrected = 30 / 1 = 30
        // Total: 80us
        let mut tree = SelfTimeTree::new();
        tree.insert(Timestamp::from_micros(0), Timestamp::from_micros(100), 0u32);
        tree.insert(Timestamp::from_micros(30), Timestamp::from_micros(70), 1u32);
        let r = tree
            .lookup_range_corrected_time(Timestamp::from_micros(0), Timestamp::from_micros(100));
        assert_eq!(r, Timestamp::from_micros(80));
    }
}
