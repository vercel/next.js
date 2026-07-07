use std::{
    cmp::Ordering,
    collections::{BinaryHeap, binary_heap::PeekMut},
};

use anyhow::Result;

use crate::lookup_entry::LookupEntry;

/// An active iterator that is being merged. It has peeked the next element and can be compared
/// according to that element. The `order` is used when multiple iterators have the same key.
struct ActiveIterator<T: Iterator<Item = Result<LookupEntry>>> {
    iter: T,
    order: usize,
    entry: LookupEntry,
}

/// A heap node that keeps the hash inline alongside a boxed `ActiveIterator`. By hoisting the hash
/// out of the Box we avoid a pointer chase on every comparison when the heap is re-ordered Only
/// when hashes collide (extremely rare with u64) do we dereference the Box to compare keys.
/// Note: we cannot use [Prehashed] because we need an non-trivial `Ord` implementation for the heap
/// (see below)
struct HeapNode<T: Iterator<Item = Result<LookupEntry>>> {
    /// Cached copy of the current entry's hash, kept in sync with `inner.entry.hash`.
    hash: u64,
    inner: Box<ActiveIterator<T>>,
}

impl<T: Iterator<Item = Result<LookupEntry>>> PartialEq for HeapNode<T> {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash && *self.inner.entry.key == *other.inner.entry.key
    }
}

impl<T: Iterator<Item = Result<LookupEntry>>> Eq for HeapNode<T> {}

impl<T: Iterator<Item = Result<LookupEntry>>> PartialOrd for HeapNode<T> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<T: Iterator<Item = Result<LookupEntry>>> Ord for HeapNode<T> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.hash
            .cmp(&other.hash)
            .then_with(|| (*self.inner.entry.key).cmp(&other.inner.entry.key))
            // Reverse order comparison to yield newest-first
            .then_with(|| other.inner.order.cmp(&self.inner.order))
            .reverse()
    }
}

/// An iterator that merges multiple sorted iterators into a single sorted iterator. Internally it
/// uses a heap of iterators to iterate them in order.
pub struct MergeIter<T: Iterator<Item = Result<LookupEntry>>> {
    heap: BinaryHeap<HeapNode<T>>,
}

impl<T: Iterator<Item = Result<LookupEntry>>> MergeIter<T> {
    pub fn new(iters: impl Iterator<Item = T>) -> Result<Self> {
        let mut heap = BinaryHeap::new();
        for (order, mut iter) in iters.enumerate() {
            if let Some(entry) = iter.next() {
                let entry = entry?;
                let hash = entry.hash;
                heap.push(HeapNode {
                    hash,
                    inner: Box::new(ActiveIterator { iter, order, entry }),
                });
            }
        }
        Ok(Self { heap })
    }
}

impl<T: Iterator<Item = Result<LookupEntry>>> Iterator for MergeIter<T> {
    type Item = Result<LookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        let mut peek = self.heap.peek_mut()?;
        let node = &mut *peek;
        match node.inner.iter.next() {
            None => {
                // This iterator is exhausted, drop it and return the last entry
                let node = PeekMut::pop(peek);
                Some(Ok(node.inner.entry))
            }
            Some(Err(e)) => {
                PeekMut::pop(peek);
                Some(Err(e))
            }
            Some(Ok(next)) => {
                let entry = std::mem::replace(&mut node.inner.entry, next);
                // Update the cached hash before dropping the PeekMut (which triggers sift-down)
                node.hash = node.inner.entry.hash;
                drop(peek);
                Some(Ok(entry))
            }
        }
    }
}
