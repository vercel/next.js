use std::{cmp::Ordering, collections::BinaryHeap};

use anyhow::Result;

use crate::lookup_entry::LookupEntry;

/// An active iterator that is being merged. It has peeked the next element and can be compared
/// according to that element. The `order` is used when multiple iterators have the same key.
///
/// Boxed so that BinaryHeap sift operations only move a pointer (8 bytes) instead of the full
/// struct (~312 bytes for StaticSortedFileIter), which is significant with 128 iterators.
struct ActiveIterator<T: Iterator<Item = Result<LookupEntry>>> {
    iter: T,
    order: usize,
    entry: LookupEntry,
}

impl<T: Iterator<Item = Result<LookupEntry>>> PartialEq for Box<ActiveIterator<T>> {
    fn eq(&self, other: &Self) -> bool {
        self.entry.hash == other.entry.hash && *self.entry.key == *other.entry.key
    }
}

impl<T: Iterator<Item = Result<LookupEntry>>> Eq for Box<ActiveIterator<T>> {}

impl<T: Iterator<Item = Result<LookupEntry>>> PartialOrd for Box<ActiveIterator<T>> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<T: Iterator<Item = Result<LookupEntry>>> Ord for Box<ActiveIterator<T>> {
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
pub struct MergeIter<T: Iterator<Item = Result<LookupEntry>>> {
    heap: BinaryHeap<Box<ActiveIterator<T>>>,
}

impl<T: Iterator<Item = Result<LookupEntry>>> MergeIter<T> {
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

impl<T: Iterator<Item = Result<LookupEntry>>> Iterator for MergeIter<T> {
    type Item = Result<LookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        let mut active = self.heap.pop()?;
        let entry = match active.iter.next() {
            None => return Some(Ok(active.entry)),
            Some(Err(e)) => return Some(Err(e)),
            Some(Ok(next)) => std::mem::replace(&mut active.entry, next),
        };
        self.heap.push(active);
        Some(Ok(entry))
    }
}
