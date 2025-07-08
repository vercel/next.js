use std::{
    collections::{BTreeMap, btree_map},
    iter::Peekable,
    ops::{Bound, RangeBounds, RangeInclusive},
};

/// Values that can be used as the bound of an interval.
///
/// Currently only implemented for `u64`.
pub trait IntervalBound: Copy + Ord {
    fn bound_min() -> Self;
    fn bound_max() -> Self;
    fn checked_increment(&self) -> Option<Self>;
    fn checked_decrement(&self) -> Option<Self>;
}

impl IntervalBound for u64 {
    fn bound_min() -> Self {
        Self::MIN
    }
    fn bound_max() -> Self {
        Self::MAX
    }
    fn checked_increment(&self) -> Option<Self> {
        self.checked_add(1)
    }
    fn checked_decrement(&self) -> Option<Self> {
        self.checked_sub(1)
    }
}

fn into_range_inclusive<B>(bounds: impl RangeBounds<B>) -> RangeInclusive<B>
where
    B: IntervalBound,
{
    let start = match bounds.start_bound() {
        Bound::Included(b) => *b,
        Bound::Excluded(b) => b.checked_increment().unwrap_or_else(B::bound_max),
        Bound::Unbounded => B::bound_min(),
    };

    let end = match bounds.end_bound() {
        Bound::Included(b) => *b,
        Bound::Excluded(b) => b.checked_decrement().unwrap_or_else(B::bound_min),
        Bound::Unbounded => B::bound_max(),
    };

    start..=end
}

/// This is a conceptually more efficient version of an array `[T: u64::MAX]` (or `[T:
/// B::bound_max()]`), where entries are deduplicated using a variation on [run-length
/// encoding][rle].
///
/// Ranges can be split or merged by [`IntervalMap::update`] and [`IntervalMap::replace`].
///
/// [rle]: https://en.wikipedia.org/wiki/Run-length_encoding
pub struct IntervalMap<T, B = u64> {
    /// Represents the start of non-overlapping ranges with values.
    ///
    /// When constructing `IntervalMap`, we add a `Default::default()` interval starting at
    /// `B::bound_min()`.
    ///
    /// Each interval extends until the start of the next one (exclusive). The last span in the map
    /// extends to `B::bound_max()` (inclusive).
    interval_starts: BTreeMap<B, T>,
}

impl<T, B> Default for IntervalMap<T, B>
where
    T: Default,
    B: IntervalBound,
{
    fn default() -> Self {
        Self::new()
    }
}

impl<T, B> IntervalMap<T, B>
where
    T: Default,
    B: IntervalBound,
{
    /// Creates a new [`IntervalMap`] with a [`Default::default`] value spanning from
    /// [`IntervalBound::bound_min`] to [`IntervalBound::bound_max`] (inclusive). Typically, that's
    /// `0..=u64::MAX`.
    ///
    /// Note: Unlike many stdlib collections, this collection will perform an allocation during
    /// construction. This could be avoided in the future by special-casing of the initial default
    /// interval as a lazily constructed or stack allocated value.
    pub fn new() -> Self {
        let mut interval_starts = BTreeMap::new();
        interval_starts.insert(B::bound_min(), Default::default());
        Self { interval_starts }
    }
}

impl<T, B> IntervalMap<T, B>
where
    B: Ord,
{
    /// Returns the largest value that's less than ([`Bound::Excluded`]) or equal to
    /// ([`Bound::Included`]) the given `bound`.
    ///
    /// It is guaranteed to return a value, as there's always an interval starting at
    /// [`IntervalBound::bound_min`].
    ///
    /// This is an approximation of the nightly-only `BTreeMap::upper_bound` API, but it returns a
    /// key-value pair instead of a cursor.
    ///
    /// Panics if `bound` is `Bound::Excluded(IntervalBound::bound_min())`, as that would imply an
    /// empty range.
    fn upper_bound(&self, bound: Bound<&B>) -> Option<(&B, &T)> {
        self.interval_starts
            .range((Bound::Unbounded, bound))
            .next_back()
    }
}

impl<T, B> IntervalMap<T, B>
where
    B: IntervalBound,
    T: Clone + Eq,
{
    /// Applies the update function to all values in the specified range. It doesn't iterate over
    /// every value one-by-one, but instead it iterates over intersecting ranges.
    ///
    /// Newly equal intervals are merged.
    pub fn update(&mut self, range: impl RangeBounds<B>, mut update: impl FnMut(&mut T)) {
        let range = into_range_inclusive(range);
        let start_bound = *range.start();
        let end_bound = *range.end();
        if start_bound > end_bound {
            return;
        }

        let tail = end_bound.checked_increment().map(|tb| {
            (
                tb,
                self.upper_bound(Bound::Included(&tb))
                    .expect("at least one interval starting at `B::bound_min`")
                    .1
                    .clone(),
            )
        });

        // defer insertions and removals to avoid multiple simultaneous mutable borrows
        let mut updated_start_value = None;
        let mut remove_list = Vec::new();

        // N.B. `prev_value` can be `None` if `start_bound` is `B::bound_min()`
        // this value must be cloned because we mutably borrow `interval_starts` below
        let prev_value = self
            .upper_bound(Bound::Excluded(&start_bound))
            .map(|(_, v)| v.clone());

        let mut starts_iter = self
            .interval_starts
            .range_mut((Bound::Included(start_bound), Bound::Included(end_bound)))
            .peekable();

        // insert or update an interval starting at `start_bound`
        let mut prev_value_inner;
        let mut prev_value =
            if let Some((_, cur_value)) = starts_iter.next_if(|(b, _)| *b == &start_bound) {
                update(cur_value);

                if Some(&*cur_value) == prev_value.as_ref() {
                    // merge identical adjacent intervals
                    remove_list.push(start_bound);
                }

                cur_value
            } else {
                prev_value_inner = prev_value.expect(
                    "there's no interval starting at `start_bound`, so there must be one before it",
                );

                let mut cur_value = prev_value_inner.clone();
                update(&mut cur_value);
                if cur_value != prev_value_inner {
                    // only start a new interval if it's different
                    updated_start_value.get_or_insert(cur_value)
                } else {
                    &mut prev_value_inner
                }
            };

        // update existing intervals from start_bound (exclusive) to end_bound (inclusive)
        if start_bound < end_bound {
            for (cur_bound, cur_value) in starts_iter {
                update(cur_value);
                if cur_value == prev_value {
                    remove_list.push(*cur_bound);
                }
                prev_value = cur_value;
            }
        }

        // don't modify any intervals following the ones we updated
        if let Some((tail_bound, tail_value)) = tail {
            if prev_value != &tail_value {
                self.interval_starts.insert(tail_bound, tail_value);
            } else {
                // there *might* be a no-longer-needed interval start here, try to remove it
                remove_list.push(tail_bound);
            }
        }

        // apply deferred insertions and removals
        for pos in remove_list {
            self.interval_starts.remove(&pos);
        }
        if let Some(start_value) = updated_start_value {
            self.interval_starts.insert(start_bound, start_value);
        }
    }

    pub fn replace(&mut self, bounds: impl RangeBounds<B>, value: T) {
        // it would be more efficient to implement this directly, but this is good enough for our
        // current use-cases
        self.update(bounds, |v| *v = value.clone());
    }
}

impl<T, B> IntervalMap<T, B>
where
    B: IntervalBound,
{
    /// Returns an iterator over all the intervals intersecting with the given range and their
    /// associated values.
    pub fn iter_intersecting(&self, range: impl RangeBounds<B>) -> IntervalMapIterator<'_, T, B> {
        fn inner<T, B>(
            this: &IntervalMap<T, B>,
            range: RangeInclusive<B>,
        ) -> IntervalMapIterator<'_, T, B>
        where
            B: IntervalBound,
        {
            // the first intersecting range may begin before `range.start()`
            let (start_position, _) = this
                .upper_bound(Bound::Included(range.start()))
                .expect("at least one interval starting at `B::bound_min`");
            IntervalMapIterator {
                starts_iter: this.interval_starts.range(start_position..).peekable(),
                end_bound: *range.end(),
            }
        }
        // slightly reduce monomorphization
        inner(self, into_range_inclusive(range))
    }

    /// Returns an iterator over all the intervals and their associated values.
    pub fn iter(&self) -> IntervalMapIterator<'_, T, B> {
        IntervalMapIterator {
            starts_iter: self.interval_starts.range(..).peekable(),
            end_bound: B::bound_max(),
        }
    }
}

pub struct IntervalMapIterator<'a, T, B> {
    /// An iterator of `interval_starts` with an unbounded end.
    starts_iter: Peekable<btree_map::Range<'a, B, T>>,
    end_bound: B,
}

impl<'a, T, B> Iterator for IntervalMapIterator<'a, T, B>
where
    B: IntervalBound,
{
    type Item = (RangeInclusive<B>, &'a T);

    fn next(&mut self) -> Option<Self::Item> {
        let (start_bound, value) = self.starts_iter.next()?;
        if start_bound > &self.end_bound {
            return None;
        }
        let bound_end = self
            .starts_iter
            .peek()
            .map(|entry| entry.0.checked_decrement().unwrap_or_else(B::bound_min))
            .unwrap_or_else(|| B::bound_max());
        Some(((*start_bound)..=bound_end, value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compaction::naive_interval_map::{NaiveIntervalMap, TinyInt};

    #[test]
    fn test_interval_map() {
        let mut map = IntervalMap::new();
        map.update(5..=15, |v| *v |= 1);
        map.update(10..=15, |v| *v |= 2);
        map.update(10..=20, |v| *v |= 4);
        map.update(0..=u64::MAX, |v| *v |= 8);
        map.update(15..=20, |v| *v |= 16);
        map.update(25..=30, |v| *v |= 32);

        let result: Vec<_> = map.iter().collect();
        let expected = vec![
            (0..=4, &8),
            (5..=9, &(1 | 8)),
            (10..=14, &(1 | 2 | 4 | 8)),
            (15..=15, &(1 | 2 | 4 | 8 | 16)),
            (16..=20, &(4 | 8 | 16)),
            (21..=24, &8),
            (25..=30, &(8 | 32)),
            (31..=u64::MAX, &8),
        ];
        assert_eq!(result, expected);

        // re-use expecting from above
        let result: Vec<_> = map.iter_intersecting(..).collect();
        assert_eq!(result, expected);

        let result: Vec<_> = map.iter_intersecting(14..=20).collect();
        let expected = vec![
            (10..=14, &(1 | 2 | 4 | 8)),
            (15..=15, &(1 | 2 | 4 | 8 | 16)),
            (16..=20, &(4 | 8 | 16)),
        ];
        assert_eq!(result, expected);

        let result: Vec<_> = map.iter_intersecting(..=0).collect();
        let expected = vec![(0..=4, &8)];
        assert_eq!(result, expected);

        let result: Vec<_> = map.iter_intersecting(u64::MAX..).collect();
        let expected = vec![(31..=u64::MAX, &8)];
        assert_eq!(result, expected);

        assert!(map.iter_intersecting(0..=10).any(|(_, v)| *v & 1 != 0));
        assert!(map.iter_intersecting(0..=10).any(|(_, v)| *v & 2 != 0));
        assert!(!map.iter_intersecting(0..10).any(|(_, v)| *v & 2 != 0));
        assert!(map.iter_intersecting(0..=50).any(|(_, v)| *v & 4 != 0));
        assert!(map.iter_intersecting(15..=15).all(|(_, v)| *v & 16 != 0));
        assert!(!map.iter_intersecting(0..=15).all(|(_, v)| *v & 16 != 0));
        assert!(map.iter_intersecting(0..=15).any(|(_, v)| *v & 16 != 0));
        assert!(map.iter_intersecting(20..=20).all(|(_, v)| *v & 16 != 0));
        assert!(map.iter_intersecting(20..).any(|(_, v)| *v & 16 != 0));
        assert!(map.iter_intersecting(..).all(|(_, v)| *v & 8 != 0));
        assert!(map.iter_intersecting(0..=0).all(|(_, v)| *v & 8 != 0));
        assert!(map.iter_intersecting(u64::MAX..).all(|(_, v)| *v & 8 != 0));
        assert!(map.iter_intersecting(123..=1234).all(|(_, v)| *v & 8 != 0));
    }

    #[test]
    fn test_interval_map_empty() {
        let map: IntervalMap<u32> = IntervalMap::new();
        let result: Vec<_> = map.iter().collect();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0], (0..=u64::MAX, &0));
    }

    #[test]
    fn test_interval_map_single_point() {
        let mut map: IntervalMap<u32> = IntervalMap::new();
        map.replace(10..=10, 1);

        let expected = vec![(0..=9, &0), (10..=10, &1), (11..=u64::MAX, &0)];
        let result: Vec<_> = map.iter().collect();
        assert_eq!(result, expected);
    }

    fn for_all_tiny_int_ranges<T: Copy>(
        values: impl IntoIterator<Item = T>,
        mut cb: impl FnMut((RangeInclusive<TinyInt>, T)),
    ) {
        for value in values {
            for start in 0..=TinyInt::MAX.0 {
                for end in start..=TinyInt::MAX.0 {
                    cb((TinyInt(start)..=TinyInt(end), value));
                }
            }
        }
    }

    #[test]
    fn test_exhaustive_replace_versus_naive() {
        for_all_tiny_int_ranges([0, 1], |a| {
            for_all_tiny_int_ranges([1, 2], |b| {
                for_all_tiny_int_ranges([2, 3], |c| {
                    let mut real_map = IntervalMap::<u32, TinyInt>::new();
                    let mut naive_map = NaiveIntervalMap::<u32, TinyInt>::new();
                    for (range, value) in [&a, &b, &c] {
                        real_map.replace(range.clone(), *value);
                        naive_map.replace(range.clone(), *value);
                    }
                    assert_eq!(
                        real_map.iter().collect::<Vec<_>>(),
                        naive_map.iter().collect::<Vec<_>>(),
                    )
                });
            });
        });
    }

    #[test]
    fn test_exhaustive_update_versus_naive() {
        for_all_tiny_int_ranges([1, 2], |a| {
            for_all_tiny_int_ranges([2, 4], |b| {
                for_all_tiny_int_ranges([4, 8], |c| {
                    let mut real_map = IntervalMap::<u32, TinyInt>::new();
                    let mut naive_map = NaiveIntervalMap::<u32, TinyInt>::new();
                    for (range, flag) in [&a, &b, &c] {
                        real_map.update(range.clone(), |v| *v |= flag);
                        naive_map.update(range.clone(), |v| *v |= flag);
                    }
                    assert_eq!(
                        real_map.iter().collect::<Vec<_>>(),
                        naive_map.iter().collect::<Vec<_>>(),
                    )
                });
            });
        });
    }
}
