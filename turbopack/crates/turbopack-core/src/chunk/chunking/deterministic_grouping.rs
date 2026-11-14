//! Deterministically splits a list of keyed and sized items into groups that are not bigger than a
//! maximum size.
//!
//! This is a port of webpack's `deterministicGrouping` (used for `splitChunks.maxSize`), simplified
//! to a single scalar size:
//!
//! 1. Items are sorted by their key (the module identifier) in UTF-8 byte order.
//! 2. Items bigger than the maximum size become their own group.
//! 3. The remaining items are recursively bisected. A cut is placed where the key space is
//!    separated the most (the lowest similarity between two adjacent keys), while keeping both
//!    sides at least `max_size / 3` big when possible.
//!
//! Placing cuts at "natural" boundaries in the sorted key space (e.g. between two packages or
//! directories) is intended to keep unrelated changes from moving many boundaries. This is a
//! heuristic, not a guarantee.
//!
//! Unlike webpack, the maximum size is preferred over the minimum size: when no cut can keep both
//! sides at least `max_size / 3` big, a cut is made anyway. This can create groups smaller than
//! `max_size / 3`. A group bigger than `max_size` is only produced for a single oversized item.
//! Similarity also compares UTF-8 bytes instead of webpack's UTF-16 code units, which is identical
//! for ASCII keys and still deterministic for non-ASCII keys.

use std::ops::Range;

/// Splits `items` into groups whose total size is not bigger than `max_size`, unless a single item
/// is already bigger than `max_size`.
///
/// Each item is a tuple of the item itself, its key and its size. Keys are expected to be unique.
/// When items are split, unique keys make the result independent of the order of `items`; within a
/// group, items are sorted by key, and groups are sorted by the key of their first item.
///
/// When `max_size` is `0` or the total size is not bigger than `max_size`, nothing is split and a
/// single group with all items in their input order is returned (no group when there are no items).
pub fn deterministic_grouping<T, K: AsRef<str>>(
    items: Vec<(T, K, usize)>,
    max_size: usize,
) -> Vec<Vec<T>> {
    let total_size: usize = items.iter().map(|(_, _, size)| *size).sum();
    if max_size == 0 || total_size <= max_size {
        if items.is_empty() {
            return Vec::new();
        }
        return vec![items.into_iter().map(|(item, _, _)| item).collect()];
    }
    let min_size = max_size / 3;

    let mut items = items;
    // Stable sort, so equal keys keep their input order.
    items.sort_by(|(_, a, _), (_, b, _)| a.as_ref().cmp(b.as_ref()));

    // Items bigger than `max_size` are emitted as their own group.
    let mut nodes = Vec::with_capacity(items.len());
    let mut oversized = Vec::new();
    for (index, (_, key, size)) in items.iter().enumerate() {
        if *size > max_size {
            oversized.push(index..index + 1);
        } else {
            nodes.push(Node {
                index,
                key: key.as_ref(),
                size: *size,
            });
        }
    }

    // `prefix[i]` is the total size of `nodes[..i]`.
    let mut prefix = Vec::with_capacity(nodes.len() + 1);
    prefix.push(0usize);
    for node in &nodes {
        prefix.push(prefix.last().unwrap() + node.size);
    }
    let sum = |range: Range<usize>| prefix[range.end] - prefix[range.start];

    // `similarities[i]` is the similarity between `nodes[i]` and `nodes[i + 1]`, i.e. of the cut
    // at position `i + 1`.
    let similarities: Vec<usize> = nodes
        .windows(2)
        .map(|pair| similarity(pair[0].key, pair[1].key))
        .collect();

    // Groups of `nodes`, as ranges of node positions.
    let mut groups: Vec<Range<usize>> = Vec::new();
    if !nodes.is_empty() {
        let mut queue: Vec<Range<usize>> = Vec::new();
        queue.push(0..nodes.len());
        while let Some(range) = queue.pop() {
            if range.len() <= 1 || sum(range.clone()) <= max_size {
                groups.push(range);
                continue;
            }
            let cut = find_cut(range.clone(), min_size, max_size, &sum, &similarities);
            queue.push(cut..range.end);
            queue.push(range.start..cut);
        }
    }

    // Convert node ranges back into item indices, and order all groups by their first key.
    let mut result: Vec<Vec<usize>> = groups
        .into_iter()
        .map(|range| nodes[range].iter().map(|node| node.index).collect())
        .chain(oversized.into_iter().map(|range| range.collect()))
        .collect();
    // Item indices are positions in the key-sorted `items`, so ordering groups by their first
    // index orders them by their first key.
    result.sort_unstable_by_key(|group| group[0]);

    let mut items: Vec<Option<T>> = items.into_iter().map(|(item, _, _)| Some(item)).collect();
    result
        .into_iter()
        .map(|group| {
            group
                .into_iter()
                .map(|index| items[index].take().unwrap())
                .collect()
        })
        .collect()
}

struct Node<'a> {
    /// Index into the key-sorted items.
    index: usize,
    key: &'a str,
    size: usize,
}

/// Finds the position to split the (too big, at least two nodes) `range` at. A cut at position `p`
/// splits `range` into `range.start..p` and `p..range.end`.
fn find_cut(
    range: Range<usize>,
    min_size: usize,
    max_size: usize,
    sum: &impl Fn(Range<usize>) -> usize,
    similarities: &[usize],
) -> usize {
    // Possible cuts are `range.start + 1..range.end`, so that both sides have at least one node.
    let cuts = range.start + 1..range.end;
    let similarity_of_cut = |cut: usize| similarities[cut - 1];

    // Cuts that keep both sides at least `min_size` big form a contiguous range, since the left
    // side grows and the right side shrinks with the cut position.
    let lo = cuts
        .clone()
        .find(|&cut| sum(range.start..cut) >= min_size)
        .unwrap_or(range.end);
    let hi = cuts
        .clone()
        .rev()
        .find(|&cut| sum(cut..range.end) >= min_size)
        .unwrap_or(range.start);
    if lo <= hi {
        // Split where the key space is separated the most, without creating too small groups.
        return lowest_similarity(lo..hi + 1, similarity_of_cut).unwrap();
    }

    // No cut keeps both sides at least `min_size` big. Prefer the maximum size: split where the key
    // space is separated the most among cuts that make both sides small enough...
    if let Some(cut) = lowest_similarity(
        cuts.clone()
            .filter(|&cut| sum(range.start..cut) <= max_size && sum(cut..range.end) <= max_size),
        similarity_of_cut,
    ) {
        return cut;
    }
    // ...or, if there is no such cut, where the bigger side is as small as possible. Both sides
    // are then split further.
    let mut best = cuts.start;
    let mut best_size = usize::MAX;
    for cut in cuts {
        let size = sum(range.start..cut).max(sum(cut..range.end));
        if size < best_size {
            best = cut;
            best_size = size;
        }
    }
    best
}

/// Returns the cut with the lowest similarity, preferring the first one on ties.
fn lowest_similarity(
    cuts: impl Iterator<Item = usize>,
    similarity_of_cut: impl Fn(usize) -> usize,
) -> Option<usize> {
    let mut best = None;
    let mut best_similarity = usize::MAX;
    for cut in cuts {
        let similarity = similarity_of_cut(cut);
        if best.is_none() || similarity < best_similarity {
            best = Some(cut);
            best_similarity = similarity;
        }
    }
    best
}

/// How similar two keys are. Equal bytes at the same position add 10, bytes that are close add
/// less. A low similarity means the key space is separated a lot between the two keys.
fn similarity(a: &str, b: &str) -> usize {
    a.bytes()
        .zip(b.bytes())
        .map(|(a, b)| 10usize.saturating_sub(a.abs_diff(b) as usize))
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn group(items: &[(&str, usize)], max_size: usize) -> Vec<Vec<String>> {
        deterministic_grouping(
            items
                .iter()
                .map(|&(key, size)| (key.to_string(), key, size))
                .collect(),
            max_size,
        )
    }

    fn sizes(groups: &[Vec<String>], items: &[(&str, usize)]) -> Vec<usize> {
        groups
            .iter()
            .map(|group| {
                group
                    .iter()
                    .map(|key| items.iter().find(|(k, _)| k == key).unwrap().1)
                    .sum()
            })
            .collect()
    }

    #[test]
    fn no_split_when_small_enough() {
        let items = [("b", 30), ("a", 40), ("c", 30)];
        // Order is preserved when nothing is split.
        assert_eq!(group(&items, 100), vec![vec!["b", "a", "c"]]);
        assert_eq!(group(&items, 0), vec![vec!["b", "a", "c"]]);
        assert!(group(&[], 100).is_empty());
    }

    #[test]
    fn splits_into_groups_not_bigger_than_max() {
        let items: Vec<(String, usize)> = (0..100)
            .map(|i| (format!("[project]/src/file{i:03}.js"), 7 + (i * 13) % 17))
            .collect();
        let items: Vec<(&str, usize)> = items.iter().map(|(k, s)| (k.as_str(), *s)).collect();
        let groups = group(&items, 100);
        assert!(groups.len() > 1);
        for size in sizes(&groups, &items) {
            assert!(size <= 100, "group size {size} is bigger than max");
        }
        // All items are kept, sorted by key.
        let flat: Vec<&str> = groups.iter().flatten().map(|s| s.as_str()).collect();
        let mut expected: Vec<&str> = items.iter().map(|(k, _)| *k).collect();
        expected.sort();
        assert_eq!(flat, expected);
    }

    #[test]
    fn prefers_max_size_over_min_size() {
        // No cut keeps both sides at least 100 / 3 big, but the items fit on their own.
        assert_eq!(
            group(&[("a", 80), ("b", 25)], 100),
            vec![vec!["a"], vec!["b"]]
        );
    }

    #[test]
    fn keeps_oversized_item_whole() {
        let items = [("a", 10), ("b", 500), ("c", 10)];
        // The remaining items are grouped as if the oversized item didn't exist.
        let groups = group(&items, 100);
        assert_eq!(groups, vec![vec!["a", "c"], vec!["b"]]);

        let items = [("a", 30), ("b", 30), ("c", 500), ("d", 30), ("e", 30)];
        let groups = group(&items, 100);
        assert_eq!(groups, vec![vec!["a", "b"], vec!["c"], vec!["d", "e"]]);
    }

    #[test]
    fn independent_of_input_order() {
        let items: Vec<(String, usize)> = (0..50)
            .map(|i| {
                (
                    format!("[project]/node_modules/pkg{}/f{i}.js", i % 5),
                    10 + i % 7,
                )
            })
            .collect();
        let items: Vec<(&str, usize)> = items.iter().map(|(k, s)| (k.as_str(), *s)).collect();
        let expected = group(&items, 120);
        let mut reversed = items.clone();
        reversed.reverse();
        assert_eq!(group(&reversed, 120), expected);
        let mut shuffled = items.clone();
        shuffled.sort_by_key(|(k, _)| k.bytes().rev().collect::<Vec<_>>());
        assert_eq!(group(&shuffled, 120), expected);
    }

    #[test]
    fn handles_zero_sized_items() {
        let items = [("a", 0), ("b", 60), ("c", 0), ("d", 60), ("e", 0)];
        let groups = group(&items, 100);
        for size in sizes(&groups, &items) {
            assert!(size <= 100);
        }
        assert_eq!(groups.iter().map(|g| g.len()).sum::<usize>(), 5);
        assert_eq!(group(&[("a", 0), ("b", 0)], 100), vec![vec!["a", "b"]]);
    }

    #[test]
    fn cuts_at_key_space_gaps() {
        let mut items = Vec::new();
        for i in 0..6 {
            items.push((format!("[project]/node_modules/aaa/file{i}.js"), 10));
        }
        for i in 0..6 {
            items.push((format!("[project]/node_modules/zzz/file{i}.js"), 10));
        }
        let items: Vec<(&str, usize)> = items.iter().map(|(k, s)| (k.as_str(), *s)).collect();
        // 120 in total, max 100: the split happens between the two packages, although a split in
        // the middle of one package would also be valid.
        let groups = group(&items, 100);
        assert_eq!(groups.len(), 2);
        assert!(groups[0].iter().all(|k| k.contains("/aaa/")));
        assert!(groups[1].iter().all(|k| k.contains("/zzz/")));
    }

    #[test]
    fn deterministic_tie_breaking() {
        // All adjacent similarities are equal, so the leftmost valid cut is chosen.
        let items = [("a", 40), ("b", 40), ("c", 40)];
        assert_eq!(group(&items, 100), vec![vec!["a"], vec!["b", "c"]]);
    }

    #[test]
    fn deterministic_for_non_ascii_keys() {
        let items = [
            ("[project]/src/ä/a.js", 40),
            ("[project]/src/z/a.js", 40),
            ("[project]/src/é/a.js", 40),
        ];
        let expected = vec![
            vec!["[project]/src/z/a.js"],
            vec!["[project]/src/ä/a.js", "[project]/src/é/a.js"],
        ];
        assert_eq!(group(&items, 100), expected);
        let mut reversed = items;
        reversed.reverse();
        assert_eq!(group(&reversed, 100), expected);
    }

    #[test]
    fn mostly_stable_when_adding_an_item() {
        let keys: Vec<String> = (0..100)
            .map(|i| format!("[project]/src/dir{}/file{}.js", i / 10, i % 10))
            .collect();
        let items: Vec<(&str, usize)> = keys.iter().map(|k| (k.as_str(), 10)).collect();
        let before = group(&items, 200);

        let mut with_new = items.clone();
        with_new.push(("[project]/src/dir4/file4b.js", 10));
        let after = group(&with_new, 200);

        let changed = after.iter().filter(|g| !before.contains(g)).count();
        assert!(
            changed <= 2,
            "adding one item changed {changed} of {} groups",
            after.len()
        );
    }
}
