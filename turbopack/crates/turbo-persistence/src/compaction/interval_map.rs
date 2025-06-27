use std::{
    collections::{BTreeMap, btree_map},
    iter::{self, Peekable},
    ops::{Bound, RangeBounds, RangeInclusive},
};

use either::Either;

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

/// This is a conceptually more efficient version of a sparse array `[Option<T>: u64::MAX]` (or
/// `[Option<T>: B::max()]`), where entries are deduplicated using a variation on [run-length
/// encoding][rle].
///
/// Ranges can be split by [`IntervalMap::update`], but are never merged.
///
/// [rle]: https://en.wikipedia.org/wiki/Run-length_encoding
pub struct IntervalMap<T, B = u64> {
    /// Represents the start of non-overlapping ranges with values. There's an implicit `None`
    /// interval starting at `B::bound_min()`. The last span extends to `B::bound_max()`
    /// (inclusive). When splitting an existing interval (with [`IntervalMap::update`])
    interval_starts: BTreeMap<B, Option<T>>,
}

impl<T, B> Default for IntervalMap<T, B> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, B> IntervalMap<T, B> {
    pub const fn new() -> Self {
        Self {
            interval_starts: BTreeMap::new(),
        }
    }
}

impl<T, B> IntervalMap<T, B>
where
    B: Ord,
{
    fn upper_bound(&self, bound: Bound<&B>) -> Option<(&B, &Option<T>)> {
        self.interval_starts
            .range((Bound::Unbounded, bound))
            .next_back()
    }
}

impl<T, B> IntervalMap<T, B>
where
    B: IntervalBound,
{
    /// Returns an iterator over the non-`None` intervals intersecting with the given range and
    /// their associated values.
    pub fn iter_range(&self, range: impl RangeBounds<B>) -> IntervalMapIterator<'_, T, B> {
        fn inner<T, B>(
            this: &IntervalMap<T, B>,
            range: RangeInclusive<B>,
        ) -> IntervalMapIterator<'_, T, B>
        where
            B: Ord,
        {
            let start = this
                .upper_bound(Bound::Included(range.start()))
                .map_or_else(|| range.start(), |(pos, _)| pos);
            IntervalMapIterator {
                starts_iter: this.interval_starts.range(start..=range.end()).peekable(),
            }
        }
        inner(self, into_range_inclusive(range))
    }

    /// Returns an iterator over the non-`None` intervals and their associated values.
    pub fn iter(&self) -> IntervalMapIterator<'_, T, B> {
        IntervalMapIterator {
            starts_iter: self.interval_starts.range(..).peekable(),
        }
    }
}

impl<T, B> IntervalMap<T, B>
where
    B: IntervalBound,
    T: Clone,
{
    /// Helper for inserting a new interval start.
    ///
    /// Splits any existing intervals by inserting a new interval start with the current value of
    /// that position. If there's already a point at that position, this is a no-op.
    ///
    /// Returns a mutable reference to the value at the interval start.
    fn ensure_split_interval(&mut self, position: B) {
        // This could be slightly optimized with `BTreeMap::upper_bound_mut` from the nightly
        // `btree_cursors` feature (we could let `update` use the cursor), but this is good enough.
        let closest_start = self.upper_bound(Bound::Included(&position));
        let value = if let Some(closest_start) = closest_start {
            // there's already a point there, bail
            if *closest_start.0 == position {
                return;
            }
            (*closest_start.1).clone()
        } else {
            // there's an implicit interval with `None` starting at `B::bound_min()`.
            None
        };
        // this insert could happen with a cursor
        self.interval_starts.insert(position, value);
    }

    /// Applies the update function to all values in the specified range. Some of these values may
    /// be `None`. It doesn't iterate over every value one-by-one, but instead it iterates over
    /// ranges.
    ///
    /// This always splits intervals in case the value is modified. Split intervals are never
    /// merged. On average, `n` calls to `update` with unique ranges will create `n` intervals.
    pub fn update(&mut self, bounds: impl RangeBounds<B>, mut update: impl FnMut(&mut Option<T>)) {
        fn get_iter_mut<T, B>(
            this: &mut IntervalMap<T, B>,
            range: RangeInclusive<B>,
        ) -> impl Iterator<Item = (&B, &mut Option<T>)>
        where
            B: IntervalBound,
            T: Clone,
        {
            let start = *range.start();
            let end = *range.end();
            if start > end {
                return Either::Left(iter::empty());
            }

            // split at start/end points, ideally these methods would return cursors
            this.ensure_split_interval(start);
            if let Some(end_plus_one) = end.checked_increment() {
                this.ensure_split_interval(end_plus_one);
            }

            Either::Right(this.interval_starts.range_mut(range))
        }

        get_iter_mut(self, into_range_inclusive(bounds)).for_each(|(_, value)| update(value));
    }

    /// Applies the update function to all values in the specified range, using
    /// [`Default::default()`] where the current value is `None`.
    ///
    /// This is a modified version of [`IntervalMap::update`] for types that implement
    /// [`Default`].
    pub fn update_with_default(
        &mut self,
        bounds: impl RangeBounds<B>,
        mut update: impl FnMut(&mut T),
    ) where
        T: Default,
    {
        self.update(bounds, |opt_value| {
            if let Some(v) = opt_value.as_mut() {
                update(v);
            } else {
                let mut v = T::default();
                update(&mut v);
                *opt_value = Some(v)
            }
        });
    }

    pub fn insert(&mut self, bounds: impl RangeBounds<B>, value: Option<T>)
    where
        T: Clone,
    {
        // this would be a lot more efficient with the `btree_cursors` nightly feature, but either
        // way, it's still O(n log n)
        fn inner<T, B>(this: &mut IntervalMap<T, B>, range: RangeInclusive<B>, value: Option<T>)
        where
            B: IntervalBound,
            T: Clone,
        {
            let start = *range.start();
            let end = *range.end();
            if start > end {
                return;
            }

            // add the `end` first, in case adding the `start` changes the value at that point
            if let Some(end_plus_one) = end.checked_increment() {
                this.ensure_split_interval(end_plus_one);
            }

            // don't use `ensure_split_interval`, we just want to set a value, not update one
            this.interval_starts.insert(start, value);

            // drop any `interval_starts`s in the middle of this new range
            if start != end {
                let middle_positions: Vec<_> = this
                    .interval_starts
                    .range((Bound::Excluded(start), Bound::Excluded(end)))
                    .map(|(pos, _)| *pos)
                    .collect();
                for pos in middle_positions {
                    this.interval_starts.remove(&pos);
                }
            }
        }
        inner(self, into_range_inclusive(bounds), value)
    }
}

pub struct IntervalMapIterator<'a, T, B> {
    starts_iter: Peekable<btree_map::Range<'a, B, Option<T>>>,
}

impl<'a, T, B> Iterator for IntervalMapIterator<'a, T, B>
where
    B: IntervalBound,
{
    type Item = (RangeInclusive<B>, &'a T);

    fn next(&mut self) -> Option<Self::Item> {
        while let Some(entry) = self.starts_iter.next() {
            if let Some(value) = entry.1.as_ref() {
                let bound_end = self
                    .starts_iter
                    .peek()
                    .map(|entry| entry.0.checked_decrement().unwrap_or_else(B::bound_min))
                    .unwrap_or_else(|| B::bound_max());
                return Some(((*entry.0)..=bound_end, value));
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
    use std::fmt::{self, Display};

    /// An integer with a very limited range to allow for exhaustive unit tests of
    /// all possible values.
    #[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
    pub struct TinyInt(pub u8);

    impl TinyInt {
        pub const MIN: TinyInt = TinyInt(0);
        pub const MAX: TinyInt = TinyInt(6);
    }

    impl IntervalBound for TinyInt {
        fn bound_min() -> Self {
            Self::MIN
        }
        fn bound_max() -> Self {
            Self::MAX
        }
        fn checked_increment(&self) -> Option<Self> {
            if self < &Self::bound_max() {
                Some(Self(self.0 + 1))
            } else {
                None
            }
        }
        fn checked_decrement(&self) -> Option<Self> {
            if self > &Self::bound_min() {
                Some(Self(self.0 - 1))
            } else {
                None
            }
        }
    }

    impl Display for TinyInt {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(f, "{}", self.0)
        }
    }*/

    #[test]
    fn test_interval_map() {
        let mut map = IntervalMap::new();
        map.update_with_default(5..=15, |v| *v |= 1);
        map.update_with_default(10..=15, |v| *v |= 2);
        map.update_with_default(10..=20, |v| *v |= 4);
        map.update_with_default(0..=u64::MAX, |v| *v |= 8);
        map.update_with_default(15..=20, |v| *v |= 16);
        map.update_with_default(25..=30, |v| *v |= 32);

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
        let result: Vec<_> = map.iter().collect();
        assert_eq!(result, expected);

        assert!(map.iter_range(0..=10).any(|(_, v)| *v & 1 != 0));
        assert!(map.iter_range(0..=10).any(|(_, v)| *v & 2 != 0));
        assert!(!map.iter_range(0..10).any(|(_, v)| *v & 2 != 0));
        assert!(map.iter_range(0..=50).any(|(_, v)| *v & 4 != 0));
        /*assert!(map.test(&(15, 15), |v| *v & 16 != 0));
        assert!(map.test(&(0, 15), |v| *v & 16 != 0));
        assert!(map.test(&(20, 20), |v| *v & 16 != 0));
        assert!(map.test(&(20, u64::MAX), |v| *v & 16 != 0));
        assert!(map.test(&(0, u64::MAX), |v| *v & 8 != 0));
        assert!(map.test(&(0, 0), |v| *v & 8 != 0));
        assert!(map.test(&(u64::MAX, u64::MAX), |v| *v & 8 != 0));
        assert!(map.test(&(123, 1234), |v| *v & 8 != 0));*/
    }

    #[test]
    fn test_interval_map_empty() {
        let map: IntervalMap<u32> = IntervalMap::new();
        let result: Vec<_> = map.iter().collect();
        assert!(result.is_empty());
    }

    #[test]
    fn test_interval_map_single_point() {
        let mut map: IntervalMap<u32> = IntervalMap::new();
        map.insert(10..=10, Some(1));

        let result: Vec<_> = map.iter().collect();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], (10..=10, &1));
    }
}
