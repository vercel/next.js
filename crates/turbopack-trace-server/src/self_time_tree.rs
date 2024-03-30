use std::{
    cmp::{max, min},
    mem::{replace, take},
};

const SPLIT_COUNT: usize = 128;

pub struct SelfTimeTree<T> {
    entries: Vec<SelfTimeEntry<T>>,
    children: Option<Box<SelfTimeChildren<T>>>,
    count: usize,
}

struct SelfTimeEntry<T> {
    start: u64,
    end: u64,
    item: T,
}

struct SelfTimeChildren<T> {
    /// Entries < split_point
    left: SelfTimeTree<T>,
    split_point: u64,
    /// Entries >= split_point
    right: SelfTimeTree<T>,
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

    pub fn insert(&mut self, start: u64, end: u64, item: T) {
        self.count += 1;
        if let Some(children) = &mut self.children {
            if end <= children.split_point {
                children.left.insert(start, end, item);
            } else if start >= children.split_point {
                children.right.insert(start, end, item);
            } else {
                self.entries.push(SelfTimeEntry { start, end, item });
            }
            self.rebalance();
        } else {
            self.entries.push(SelfTimeEntry { start, end, item });
            if self.entries.len() >= SPLIT_COUNT {
                self.split();
            }
        }
    }

    fn split(&mut self) {
        if self.entries.is_empty() {
            return;
        }
        let entries = take(&mut self.entries);
        let start = entries.iter().min_by_key(|e| e.start).unwrap().start;
        let end = entries.iter().max_by_key(|e| e.end).unwrap().end;
        let middle = (start + end) / 2;
        self.children = Some(Box::new(SelfTimeChildren {
            left: SelfTimeTree::new(),
            split_point: middle,
            right: SelfTimeTree::new(),
        }));
        self.count = 0;
        for entry in entries {
            self.insert(entry.start, entry.end, entry.item);
        }
    }

    fn rebalance(&mut self) {
        if let Some(box SelfTimeChildren {
            left,
            split_point,
            right,
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
            if *left_count > *right_count * 3 + left_entries.len() {
                if let Some(box SelfTimeChildren {
                    left: left_left,
                    split_point: left_split_point,
                    right: left_right,
                }) = left_children
                {
                    let left_entries = take(left_entries);
                    *right = Self {
                        count: left_right.count + right.count + self.entries.len(),
                        entries: take(&mut self.entries),
                        children: Some(Box::new(SelfTimeChildren {
                            left: take(left_right),
                            split_point: *split_point,
                            right: take(right),
                        })),
                    };
                    *split_point = *left_split_point;
                    *left = take(left_left);
                    let entries = replace(&mut self.entries, left_entries);
                    self.count = left.count + right.count + self.entries.len();
                    for SelfTimeEntry { start, end, item } in entries {
                        self.insert(start, end, item);
                    }
                }
            } else if *right_count > *left_count * 3 + right_entries.len() {
                if let Some(box SelfTimeChildren {
                    left: right_left,
                    split_point: right_split_point,
                    right: right_right,
                }) = right_children
                {
                    let right_entries = take(right_entries);
                    *left = Self {
                        count: left.count + right_left.count + self.entries.len(),
                        entries: take(&mut self.entries),
                        children: Some(Box::new(SelfTimeChildren {
                            left: take(left),
                            split_point: *split_point,
                            right: take(right_left),
                        })),
                    };
                    *split_point = *right_split_point;
                    *right = take(right_right);
                    let entries = replace(&mut self.entries, right_entries);
                    self.count = left.count + right.count + self.entries.len();
                    for SelfTimeEntry { start, end, item } in entries {
                        self.insert(start, end, item);
                    }
                }
            }
        }
    }

    pub fn lookup_range_count(&self, start: u64, end: u64) -> u64 {
        let mut total_count = 0;
        for entry in &self.entries {
            if entry.start < end && entry.end > start {
                let start = max(entry.start, start);
                let end = min(entry.end, end);
                let span = end - start;
                total_count += span;
            }
        }
        if let Some(children) = &self.children {
            if start < children.split_point {
                total_count += children.left.lookup_range_count(start, end);
            }
            if end > children.split_point {
                total_count += children.right.lookup_range_count(start, end);
            }
        }
        total_count
    }

    pub fn for_each_in_range(&self, start: u64, end: u64, mut f: impl FnMut(u64, u64, &T)) {
        self.for_each_in_range_ref(start, end, &mut f);
    }

    fn for_each_in_range_ref(&self, start: u64, end: u64, f: &mut impl FnMut(u64, u64, &T)) {
        for entry in &self.entries {
            if entry.start < end && entry.end > start {
                f(entry.start, entry.end, &entry.item);
            }
        }
        if let Some(children) = &self.children {
            if start < children.split_point {
                children.left.for_each_in_range_ref(start, end, f);
            }
            if end > children.split_point {
                children.right.for_each_in_range_ref(start, end, f);
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
                "{}{} items (split at {}, {} total)",
                " ".repeat(indent),
                tree.entries.len(),
                children.split_point,
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

    #[test]
    fn test_simple() {
        let mut tree = SelfTimeTree::new();
        for i in 0..1000 {
            tree.insert(i, i + 1, i);
        }
        assert_eq!(tree.lookup_range_count(0, 1000), 1000);
        print_tree(&tree, 0);
    }

    #[test]
    fn test_overlapping() {
        let mut tree = SelfTimeTree::new();
        for i in 0..1000 {
            tree.insert(i, i + 100, i);
        }
        assert_eq!(tree.lookup_range_count(0, 1100), 1000 * 100);
        print_tree(&tree, 0);
    }

    #[test]
    fn test_overlapping_heavy() {
        let mut tree = SelfTimeTree::new();
        for i in 0..1000 {
            tree.insert(i, i + 500, i);
        }
        assert_eq!(tree.lookup_range_count(0, 2000), 1000 * 500);
        print_tree(&tree, 0);
    }
}
