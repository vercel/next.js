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

/// This is a conceptually more efficient version of a sparse array `[T: u64::MAX]` (or `[T:
/// B::bound_max()]`), where entries are deduplicated using a variation on [run-length
/// encoding][rle].
///
/// Ranges can be split by [`IntervalMap::update`], but are never merged.
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
    /// Panics if `bound` is `Bound::Exclusive(IntervalBound::bound_min())`, as that would imply an
    /// empty range.
    fn upper_bound(&self, bound: Bound<&B>) -> (&B, &T) {
        self.interval_starts
            .range((Bound::Unbounded, bound))
            .next_back()
            .expect("interval_starts should always contain a value at `B::bound_min`")
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
        let closest_start = self.upper_bound(Bound::Included(&position));

        if *closest_start.0 == position {
            // there's already a point there, bail
            return;
        }

        self.interval_starts
            .insert(position, (*closest_start.1).clone());
    }

    /// Applies the update function to all values in the specified range. It doesn't iterate over
    /// every value one-by-one, but instead it iterates over intersecting ranges.
    ///
    /// This always splits intervals in case the value is modified. Split intervals are never
    /// merged. On average, `n` calls to `update` with unique ranges will create `n` intervals.
    pub fn update(&mut self, bounds: impl RangeBounds<B>, mut update: impl FnMut(&mut T)) {
        fn get_iter_mut<T, B>(
            this: &mut IntervalMap<T, B>,
            range: RangeInclusive<B>,
        ) -> impl Iterator<Item = (&B, &mut T)>
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

    pub fn insert(&mut self, bounds: impl RangeBounds<B>, value: T)
    where
        T: Clone,
    {
        fn inner<T, B>(this: &mut IntervalMap<T, B>, range: RangeInclusive<B>, value: T)
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

impl<T, B> IntervalMap<T, B>
where
    B: IntervalBound,
{
    /// Returns an iterator over all the intervals intersecting with the given range and their
    /// associated values.
    pub fn iter_itersecting(&self, range: impl RangeBounds<B>) -> IntervalMapIterator<'_, T, B> {
        fn inner<T, B>(
            this: &IntervalMap<T, B>,
            range: RangeInclusive<B>,
        ) -> IntervalMapIterator<'_, T, B>
        where
            B: Ord,
        {
            let (start_position, _) = this.upper_bound(Bound::Included(range.start()));
            IntervalMapIterator {
                starts_iter: this
                    .interval_starts
                    .range(start_position..=range.end())
                    .peekable(),
            }
        }
        // slightly reduce monomorphization
        inner(self, into_range_inclusive(range))
    }

    /// Returns an iterator over the non-`None` intervals and their associated values.
    pub fn iter(&self) -> IntervalMapIterator<'_, T, B> {
        IntervalMapIterator {
            starts_iter: self.interval_starts.range(..).peekable(),
        }
    }
}

pub struct IntervalMapIterator<'a, T, B> {
    starts_iter: Peekable<btree_map::Range<'a, B, T>>,
}

impl<'a, T, B> Iterator for IntervalMapIterator<'a, T, B>
where
    B: IntervalBound,
{
    type Item = (RangeInclusive<B>, &'a T);

    fn next(&mut self) -> Option<Self::Item> {
        let entry = self.starts_iter.next()?;
        let bound_end = self
            .starts_iter
            .peek()
            .map(|entry| entry.0.checked_decrement().unwrap_or_else(B::bound_min))
            .unwrap_or_else(|| B::bound_max());
        Some(((*entry.0)..=bound_end, entry.1))
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
        map.update(5..=15, |v| *v |= 1);
        map.update(10..=15, |v| *v |= 2);
        map.update(10..=20, |v| *v |= 4);
        map.update(0..=u64::MAX, |v| *v |= 8);
        map.update(15..=20, |v| *v |= 16);
        map.update(25..=30, |v| *v |= 32);

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

        assert!(map.iter_itersecting(0..=10).any(|(_, v)| *v & 1 != 0));
        assert!(map.iter_itersecting(0..=10).any(|(_, v)| *v & 2 != 0));
        assert!(!map.iter_itersecting(0..10).any(|(_, v)| *v & 2 != 0));
        assert!(map.iter_itersecting(0..=50).any(|(_, v)| *v & 4 != 0));
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

        assert_eq!(result.len(), 1);
        assert_eq!(result[0], (0..=u64::MAX, &0));
    }

    #[test]
    fn test_interval_map_single_point() {
        let mut map: IntervalMap<u32> = IntervalMap::new();
        map.insert(10..=10, 1);

        let expected = vec![(0..=9, &0), (10..=10, &1), (11..=u64::MAX, &0)];
        let result: Vec<_> = map.iter().collect();
        assert_eq!(result, expected);
    }
}
