//! Deterministically splits a list of keyed and sized items into groups that are not bigger than a
//! maximum size.
//!
//! This is based on webpack's `deterministicGrouping` (used for `splitChunks.maxSize`), simplified
//! to a single scalar size:
//!
//! 1. Items bigger than the maximum size become their own group.
//! 2. The remaining items are sorted by their key (the module identifier) in UTF-8 byte order.
//! 3. The sorted items are recursively bisected. A cut is placed where the key space is separated
//!    the most (the shortest shared prefix of two adjacent keys), while keeping both sides at least
//!    the minimum size big when possible. On ties, the cut that splits the size most evenly wins,
//!    then the leftmost one.
//!
//! Placing cuts at "natural" boundaries in the sorted key space (e.g. between two packages or
//! directories) is intended to keep unrelated changes from moving many boundaries. This is a
//! heuristic, not a guarantee.
//!
//! Unlike webpack, the maximum size is preferred over the minimum size: when no cut can keep both
//! sides at least the minimum size big, a cut is made anyway. This can create groups smaller than
//! the minimum size. A group bigger than the maximum size is only produced for a single oversized
//! item.

use std::{cmp::Ordering, ops::Range};

/// Splits `items` into groups whose total size is not bigger than `max_size`, unless a single item
/// is already bigger than `max_size`. Groups are kept at least `min_size` big where possible.
///
/// Each item is a tuple of the item itself, its key and its size. Keys are expected to be unique.
/// When items are split, unique keys make the result independent of the order of `items`; within a
/// group, items are sorted by key, and groups are sorted by the key of their first item.
///
/// When `max_size` is `0` or the total size is not bigger than `max_size`, nothing is split and a
/// single group with all items in their input order is returned (no group when there are no items).
pub fn deterministic_grouping<T, K: AsRef<str>>(
    items: Vec<(T, K, usize)>,
    min_size: usize,
    max_size: usize,
) -> Vec<Vec<T>> {
    let total_size: usize = items.iter().map(|(_, _, size)| *size).sum();
    if max_size == 0 || total_size <= max_size {
        if items.is_empty() {
            return Vec::new();
        }
        return vec![items.into_iter().map(|(item, _, _)| item).collect()];
    }

    // Items bigger than `max_size` are emitted as their own group. Only the remaining items need to
    // be sorted and bisected.
    let (oversized, mut nodes): (Vec<_>, Vec<_>) =
        items.into_iter().partition(|(_, _, size)| *size > max_size);
    // Stable sort, so equal keys keep their input order.
    nodes.sort_by(|(_, a, _), (_, b, _)| a.as_ref().cmp(b.as_ref()));

    // `prefix[i]` is the total size of `nodes[..i]`.
    let mut prefix = Vec::with_capacity(nodes.len() + 1);
    prefix.push(0usize);
    for (_, _, size) in &nodes {
        prefix.push(prefix.last().unwrap() + size);
    }
    let sum = |range: Range<usize>| prefix[range.end] - prefix[range.start];

    // `similarities[i]` is the similarity between `nodes[i]` and `nodes[i + 1]`, i.e. of the cut
    // at position `i + 1`.
    let similarities: Vec<usize> = nodes
        .windows(2)
        .map(|pair| similarity(pair[0].1.as_ref(), pair[1].1.as_ref()))
        .collect();

    enum Group {
        /// A range of positions in `nodes`.
        Nodes(Range<usize>),
        /// An index into `oversized`.
        Oversized(usize),
    }

    let mut groups: Vec<Group> = Vec::new();
    if !nodes.is_empty() {
        let mut queue: Vec<Range<usize>> = Vec::new();
        queue.push(0..nodes.len());
        while let Some(range) = queue.pop() {
            if range.len() <= 1 || sum(range.clone()) <= max_size {
                groups.push(Group::Nodes(range));
                continue;
            }
            let cut = find_cut(range.clone(), min_size, max_size, &sum, &similarities);
            queue.push(cut..range.end);
            queue.push(range.start..cut);
        }
    }
    groups.extend((0..oversized.len()).map(Group::Oversized));

    // Order all groups by their first key.
    let first_key = |group: &Group| match group {
        Group::Nodes(range) => nodes[range.start].1.as_ref(),
        Group::Oversized(index) => oversized[*index].1.as_ref(),
    };
    groups.sort_by(|a, b| first_key(a).cmp(first_key(b)));

    let mut nodes: Vec<Option<T>> = nodes.into_iter().map(|(item, _, _)| Some(item)).collect();
    let mut oversized: Vec<Option<T>> = oversized
        .into_iter()
        .map(|(item, _, _)| Some(item))
        .collect();
    groups
        .into_iter()
        .map(|group| match group {
            Group::Nodes(range) => range.map(|i| nodes[i].take().unwrap()).collect(),
            Group::Oversized(index) => vec![oversized[index].take().unwrap()],
        })
        .collect()
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
    let best_cut = |cuts: &mut dyn Iterator<Item = usize>| {
        cuts.min_by(|&a, &b| compare_cuts(a, b, range.clone(), sum, similarities))
    };

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
        return best_cut(&mut (lo..hi + 1)).unwrap();
    }

    // No cut keeps both sides at least `min_size` big. Prefer the maximum size: split where the key
    // space is separated the most among cuts that make both sides small enough...
    if let Some(cut) = best_cut(
        &mut cuts
            .clone()
            .filter(|&cut| sum(range.start..cut) <= max_size && sum(cut..range.end) <= max_size),
    ) {
        return cut;
    }
    // ...or, if there is no such cut, where the bigger side is as small as possible (the leftmost
    // on ties). Both sides are then split further.
    cuts.min_by_key(|&cut| sum(range.start..cut).max(sum(cut..range.end)))
        .unwrap()
}

/// Orders cuts by preference: the lowest similarity first, then the most even split of the size of
/// `range`, then the leftmost cut.
fn compare_cuts(
    a: usize,
    b: usize,
    range: Range<usize>,
    sum: &impl Fn(Range<usize>) -> usize,
    similarities: &[usize],
) -> Ordering {
    let imbalance = |cut: usize| sum(range.start..cut).abs_diff(sum(cut..range.end));
    similarities[a - 1]
        .cmp(&similarities[b - 1])
        .then_with(|| imbalance(a).cmp(&imbalance(b)))
        .then_with(|| a.cmp(&b))
}

/// How similar two keys are: the length of their shared prefix, in bytes. A low similarity means
/// the key space is separated a lot between the two keys.
fn similarity(a: &str, b: &str) -> usize {
    a.bytes().zip(b.bytes()).take_while(|(a, b)| a == b).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn group(items: &[(&str, usize)], min_size: usize, max_size: usize) -> Vec<Vec<String>> {
        deterministic_grouping(
            items
                .iter()
                .map(|&(key, size)| (key.to_string(), key, size))
                .collect(),
            min_size,
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
    fn similarity_is_shared_prefix_length() {
        assert_eq!(similarity("abc", "abd"), 2);
        assert_eq!(similarity("abc", "abc"), 3);
        assert_eq!(similarity("abc", "ab"), 2);
        assert_eq!(similarity("abc", "xbc"), 0);
        assert_eq!(similarity("", "abc"), 0);
    }

    #[test]
    fn no_split_when_small_enough() {
        let items = [("b", 30), ("a", 40), ("c", 30)];
        // Order is preserved when nothing is split.
        assert_eq!(group(&items, 0, 100), vec![vec!["b", "a", "c"]]);
        assert_eq!(group(&items, 0, 0), vec![vec!["b", "a", "c"]]);
        assert!(group(&[], 0, 100).is_empty());
    }

    #[test]
    fn splits_into_groups_not_bigger_than_max() {
        let items: Vec<(String, usize)> = (0..100)
            .map(|i| (format!("[project]/src/file{i:03}.js"), 7 + (i * 13) % 17))
            .collect();
        let items: Vec<(&str, usize)> = items.iter().map(|(k, s)| (k.as_str(), *s)).collect();
        let groups = group(&items, 30, 100);
        assert!(groups.len() > 1);
        for size in sizes(&groups, &items) {
            assert!(size <= 100, "group size {size} is bigger than max");
            assert!(size >= 30, "group size {size} is smaller than min");
        }
        // All items are kept, sorted by key.
        let flat: Vec<&str> = groups.iter().flatten().map(|s| s.as_str()).collect();
        let mut expected: Vec<&str> = items.iter().map(|(k, _)| *k).collect();
        expected.sort();
        assert_eq!(flat, expected);
    }

    #[test]
    fn respects_min_size_when_possible() {
        // The key space is separated most between "a" and "b", but that cut would leave a too small
        // group of 10. The next best cut keeps both sides at least 30 big.
        let items = [("a", 10), ("ba", 40), ("bb", 40), ("bc", 40)];
        assert_eq!(
            group(&items, 30, 100),
            vec![vec!["a", "ba"], vec!["bb", "bc"]]
        );
        // Without a minimum size, the most separating cut wins.
        assert_eq!(
            group(&items, 0, 100),
            vec![vec!["a"], vec!["ba"], vec!["bb", "bc"]]
        );
    }

    #[test]
    fn prefers_max_size_over_min_size() {
        // No cut keeps both sides at least 34 big, but the items fit on their own.
        assert_eq!(
            group(&[("a", 80), ("b", 25)], 34, 100),
            vec![vec!["a"], vec!["b"]]
        );
    }

    #[test]
    fn keeps_oversized_item_whole() {
        let items = [("a", 10), ("b", 500), ("c", 10)];
        // The remaining items are grouped as if the oversized item didn't exist.
        let groups = group(&items, 0, 100);
        assert_eq!(groups, vec![vec!["a", "c"], vec!["b"]]);

        let items = [("a", 30), ("b", 30), ("c", 500), ("d", 30), ("e", 30)];
        let groups = group(&items, 0, 100);
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
            .chain([("[project]/node_modules/big/index.js".to_string(), 500)])
            .collect();
        let items: Vec<(&str, usize)> = items.iter().map(|(k, s)| (k.as_str(), *s)).collect();
        let expected = group(&items, 40, 120);
        let mut reversed = items.clone();
        reversed.reverse();
        assert_eq!(group(&reversed, 40, 120), expected);
        let mut shuffled = items.clone();
        shuffled.sort_by_key(|(k, _)| k.bytes().rev().collect::<Vec<_>>());
        assert_eq!(group(&shuffled, 40, 120), expected);
    }

    #[test]
    fn handles_zero_sized_items() {
        let items = [("a", 0), ("b", 60), ("c", 0), ("d", 60), ("e", 0)];
        let groups = group(&items, 30, 100);
        for size in sizes(&groups, &items) {
            assert!(size <= 100);
        }
        assert_eq!(groups.iter().map(|g| g.len()).sum::<usize>(), 5);
        assert_eq!(group(&[("a", 0), ("b", 0)], 0, 100), vec![vec!["a", "b"]]);
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
        let groups = group(&items, 30, 100);
        assert_eq!(groups.len(), 2);
        assert!(groups[0].iter().all(|k| k.contains("/aaa/")));
        assert!(groups[1].iter().all(|k| k.contains("/zzz/")));
    }

    #[test]
    fn ties_prefer_the_most_even_split() {
        // All adjacent similarities are equal, so the cut that splits the size most evenly wins
        // (50 | 50 instead of 10 | 90 or 20 | 80).
        let items = [("a", 10), ("b", 10), ("c", 30), ("d", 50)];
        assert_eq!(group(&items, 0, 90), vec![vec!["a", "b", "c"], vec!["d"]]);
    }

    #[test]
    fn remaining_ties_prefer_the_leftmost_cut() {
        // Both valid cuts have the same similarity and split the size equally unevenly.
        let items = [("a", 40), ("b", 40), ("c", 40)];
        assert_eq!(group(&items, 0, 100), vec![vec!["a"], vec!["b", "c"]]);
    }

    #[test]
    fn deterministic_for_non_ascii_keys() {
        let items = [
            ("[project]/src/ä/a.js", 40),
            ("[project]/src/z/a.js", 40),
            ("[project]/src/é/a.js", 40),
        ];
        let expected = group(&items, 0, 100);
        assert_eq!(expected.len(), 2);
        let mut reversed = items;
        reversed.reverse();
        assert_eq!(group(&reversed, 0, 100), expected);
    }

    #[test]
    fn stable_outside_of_the_changed_part_when_adding_an_item() {
        let keys: Vec<String> = (0..100)
            .map(|i| format!("[project]/src/dir{}/file{}.js", i / 10, i % 10))
            .collect();
        let items: Vec<(&str, usize)> = keys.iter().map(|k| (k.as_str(), 10)).collect();
        let before = group(&items, 60, 200);

        let mut with_new = items.clone();
        with_new.push(("[project]/src/dir4/file4b.js", 10));
        let after = group(&with_new, 60, 200);

        // The first cut is placed between `dir4` and `dir5` in both cases. Balancing the sizes can
        // move the cuts within the half with the new item, but the other half is unchanged.
        let in_second_half = |group: &Vec<String>| {
            group
                .iter()
                .all(|key| key.as_str() >= "[project]/src/dir5/")
        };
        let before_second_half: Vec<_> = before.iter().filter(|g| in_second_half(g)).collect();
        let after_second_half: Vec<_> = after.iter().filter(|g| in_second_half(g)).collect();
        assert!(!before_second_half.is_empty());
        assert_eq!(before_second_half, after_second_half);
        for group in &after {
            assert!(group.len() * 10 <= 200);
        }
    }
}
