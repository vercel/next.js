use std::{cmp::Ordering, collections::BinaryHeap, mem::replace};

use anyhow::Result;

use crate::lookup_entry::LookupEntry;

/// An active iterator that is being merged. It has peeked the next element and can be compared
/// according to that element. The `order` is used when multiple iterators have the same key.
struct ActiveIterator<'l, T: Iterator<Item = Result<LookupEntry<'l>>>> {
    iter: T,
    order: usize,
    entry: LookupEntry<'l>,
}

impl<'l, T: Iterator<Item = Result<LookupEntry<'l>>>> PartialEq for ActiveIterator<'l, T> {
    fn eq(&self, other: &Self) -> bool {
        self.entry.hash == other.entry.hash && *self.entry.key == *other.entry.key
    }
}

impl<'l, T: Iterator<Item = Result<LookupEntry<'l>>>> Eq for ActiveIterator<'l, T> {}

impl<'l, T: Iterator<Item = Result<LookupEntry<'l>>>> PartialOrd for ActiveIterator<'l, T> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<'l, T: Iterator<Item = Result<LookupEntry<'l>>>> Ord for ActiveIterator<'l, T> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.entry
            .hash
            .cmp(&other.entry.hash)
            .then_with(|| (*self.entry.key).cmp(&other.entry.key))
            .then_with(|| self.order.cmp(&other.order))
            .reverse()
    }
}

/// An iterator that merges multiple sorted iterators into a single sorted iterator. Internal it
/// uses an heap of iterators to iterate them in order.
pub struct MergeIter<'l, T: Iterator<Item = Result<LookupEntry<'l>>>> {
    heap: BinaryHeap<Box<ActiveIterator<'l, T>>>,
}

impl<'l, T: Iterator<Item = Result<LookupEntry<'l>>>> MergeIter<'l, T> {
    pub fn new(iters: impl Iterator<Item = T>) -> Result<Self> {
        let mut heap = BinaryHeap::new();
        for (order, mut iter) in iters.enumerate() {
            if let Some(entry) = iter.next() {
                let entry = entry?;
                heap.push(Box::new(ActiveIterator { iter, order, entry }));
            }
        }
        Ok(Self { heap })
    }
}

impl<'l, T: Iterator<Item = Result<LookupEntry<'l>>>> Iterator for MergeIter<'l, T> {
    type Item = Result<LookupEntry<'l>>;

    fn next(&mut self) -> Option<Self::Item> {
        let mut active_iter = self.heap.pop()?;
        let entry = match active_iter.iter.next() {
            None => active_iter.entry,
            Some(Err(e)) => return Some(Err(e)),
            Some(Ok(next)) => {
                let entry = replace(&mut active_iter.entry, next);
                self.heap.push(active_iter);
                entry
            }
        };
        Some(Ok(entry))
    }
}
