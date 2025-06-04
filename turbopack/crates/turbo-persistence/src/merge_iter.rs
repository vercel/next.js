use std::{cmp::Ordering, collections::BinaryHeap};

use anyhow::Result;

use crate::lookup_entry::LookupEntry;

/// An active iterator that is being merged. It has peeked the next element and can be compared
/// according to that element. The `order` is used when multiple iterators have the same key.
struct ActiveIterator<T: Iterator<Item = Result<LookupEntry>>> {
    iter: T,
    order: usize,
    entry: LookupEntry,
}

impl<T: Iterator<Item = Result<LookupEntry>>> PartialEq for ActiveIterator<T> {
    fn eq(&self, other: &Self) -> bool {
        self.entry.hash == other.entry.hash && *self.entry.key == *other.entry.key
    }
}

impl<T: Iterator<Item = Result<LookupEntry>>> Eq for ActiveIterator<T> {}

impl<T: Iterator<Item = Result<LookupEntry>>> PartialOrd for ActiveIterator<T> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<T: Iterator<Item = Result<LookupEntry>>> Ord for ActiveIterator<T> {
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
    heap: BinaryHeap<ActiveIterator<T>>,
}

impl<T: Iterator<Item = Result<LookupEntry>>> MergeIter<T> {
    pub fn new(iters: impl Iterator<Item = T>) -> Result<Self> {
        let mut heap = BinaryHeap::new();
        for (order, mut iter) in iters.enumerate() {
            if let Some(entry) = iter.next() {
                let entry = entry?;
                heap.push(ActiveIterator { iter, order, entry });
            }
        }
        Ok(Self { heap })
    }
}

impl<T: Iterator<Item = Result<LookupEntry>>> Iterator for MergeIter<T> {
    type Item = Result<LookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        let ActiveIterator {
            mut iter,
            order,
            entry,
        } = self.heap.pop()?;
        match iter.next() {
            None => {}
            Some(Err(e)) => return Some(Err(e)),
            Some(Ok(next)) => self.heap.push(ActiveIterator {
                iter,
                order,
                entry: next,
            }),
        }
        Some(Ok(entry))
    }
}
