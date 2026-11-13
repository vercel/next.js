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
/// Note: we cannot use `Prehashed` because we need an non-trivial `Ord` implementation for the heap
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
///
/// A tournament tree of losers was tried instead (fewer comparisons per entry, and branchless with
/// `select_unpredictable`), but it wasn't worth it: about 1.5% faster on a full compaction of 32
/// equally sized, interleaved inputs of tiny entries, its best case, and no change on realistic
/// data. Matches nearly always compare two hashes, which `HeapNode` keeps inline, so they are cheap
/// either way, and in bottom merges, which are dominated by the bottom run, the heap's sift-down
/// usually stops at the root.
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

#[cfg(test)]
mod tests {
    use rand::{RngExt, SeedableRng, rngs::SmallRng};

    use super::*;
    use crate::{lookup_entry::IterValue, rc_bytes::RcBytes};

    /// An entry tagged with the input it came from and its position in that input.
    fn entry(hash: u64, key: &[u8], input: u32, position: u32) -> LookupEntry {
        LookupEntry {
            hash,
            key: RcBytes::from(Box::<[u8]>::from(key)),
            value: IterValue::Blob {
                sequence_number: input << 16 | position,
            },
        }
    }

    fn tag(entry: &LookupEntry) -> (u64, Vec<u8>, u32, u32) {
        let IterValue::Blob { sequence_number } = entry.value else {
            panic!("test entries are blobs");
        };
        (
            entry.hash,
            entry.key.to_vec(),
            sequence_number >> 16,
            sequence_number & 0xffff,
        )
    }

    type Input = std::vec::IntoIter<Result<LookupEntry>>;

    fn input(index: u32, entries: &[(u64, &[u8])]) -> Input {
        entries
            .iter()
            .enumerate()
            .map(|(position, &(hash, key))| Ok(entry(hash, key, index, position as u32)))
            .collect::<Vec<_>>()
            .into_iter()
    }

    fn merge(inputs: Vec<Input>) -> Vec<(u64, Vec<u8>, u32, u32)> {
        MergeIter::new(inputs.into_iter())
            .unwrap()
            .map(|entry| tag(&entry.unwrap()))
            .collect()
    }

    #[test]
    fn test_empty() {
        assert!(merge(vec![]).is_empty());
        assert!(merge(vec![input(0, &[]), input(1, &[])]).is_empty());
    }

    #[test]
    fn test_single_input() {
        let merged = merge(vec![input(0, &[(1, b"a"), (2, b"b"), (3, b"c")])]);
        assert_eq!(
            merged.iter().map(|e| e.0).collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn test_orders_by_hash_then_key() {
        let merged = merge(vec![
            input(0, &[(1, b"b"), (3, b"a")]),
            input(1, &[(1, b"a"), (2, b"z")]),
        ]);
        assert_eq!(
            merged
                .iter()
                .map(|e| (e.0, e.1.clone()))
                .collect::<Vec<_>>(),
            vec![
                (1, b"a".to_vec()),
                (1, b"b".to_vec()),
                (2, b"z".to_vec()),
                (3, b"a".to_vec())
            ]
        );
    }

    #[test]
    fn test_equal_keys_come_from_later_inputs_first() {
        // Input 2 holds two entries of the key (a MultiValue group), which stay together and in
        // their order, before those of the older inputs.
        let merged = merge(vec![
            input(0, &[(5, b"k")]),
            input(1, &[(5, b"k")]),
            input(2, &[(5, b"k"), (5, b"k")]),
        ]);
        assert_eq!(
            merged.iter().map(|e| (e.2, e.3)).collect::<Vec<_>>(),
            vec![(2, 0), (2, 1), (1, 0), (0, 0)]
        );
    }

    #[test]
    fn test_error_drops_the_failing_input() {
        let failing = vec![
            Ok(entry(1, b"a", 0, 0)),
            Err(anyhow::anyhow!("broken")),
            Ok(entry(9, b"z", 0, 2)),
        ]
        .into_iter();
        let mut merge =
            MergeIter::new(vec![failing, input(1, &[(2, b"b"), (3, b"c")])].into_iter()).unwrap();
        // Input 0 wins, but advancing it fails, which drops the input with the entry it was
        // holding.
        assert!(merge.next().unwrap().is_err());
        let rest = merge.map(|e| tag(&e.unwrap()).0).collect::<Vec<_>>();
        assert_eq!(rest, vec![2, 3]);
    }

    /// Compares against sorting all entries by `(hash, key, newest input, position)`, for input
    /// counts that are and aren't powers of two.
    #[test]
    fn test_matches_sorting() {
        let mut rng = SmallRng::seed_from_u64(7);
        for input_count in 1..=19u32 {
            for _ in 0..10 {
                let inputs = (0..input_count)
                    .map(|index| {
                        let len = rng.random_range(0..40);
                        // Few distinct hashes and keys, so that equal hashes and equal keys are
                        // common.
                        let mut entries = (0..len)
                            .map(|_| (rng.random_range(0..16u64), [rng.random_range(b'a'..b'e')]))
                            .collect::<Vec<_>>();
                        entries.sort();
                        (index, entries)
                    })
                    .collect::<Vec<_>>();
                let mut expected = inputs
                    .iter()
                    .flat_map(|(index, entries)| {
                        entries
                            .iter()
                            .enumerate()
                            .map(move |(position, (hash, key))| {
                                (*hash, key.to_vec(), *index, position as u32)
                            })
                    })
                    .collect::<Vec<_>>();
                expected.sort_by(|a, b| {
                    (a.0, &a.1)
                        .cmp(&(b.0, &b.1))
                        .then(b.2.cmp(&a.2))
                        .then(a.3.cmp(&b.3))
                });
                let merged = merge(
                    inputs
                        .iter()
                        .map(|(index, entries)| {
                            let entries = entries
                                .iter()
                                .map(|(hash, key)| (*hash, &key[..]))
                                .collect::<Vec<_>>();
                            input(*index, &entries)
                        })
                        .collect(),
                );
                assert_eq!(merged, expected, "{input_count} inputs");
            }
        }
    }
}
