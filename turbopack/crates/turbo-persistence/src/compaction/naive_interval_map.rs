use std::{
    fmt::{self, Display},
    iter::Peekable,
    ops::{RangeBounds, RangeInclusive},
    slice,
};

use crate::compaction::interval_map::IntervalBound;

/// An integer with a very limited range to allow for exhaustive unit tests of
/// all possible values.
#[derive(Clone, Copy, Debug, Default, Eq, Ord, PartialEq, PartialOrd)]
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
}

/// An impractically slow but very simple implementation of `IntervalMap` used as a known-good
/// version for testing the correctness of `IntervalMap`.
#[allow(dead_code)]
pub struct NaiveIntervalMap<T, B = TinyInt> {
    values: Vec<(B, T)>,
}

impl<T, B> NaiveIntervalMap<T, B>
where
    T: Default,
    B: IntervalBound,
{
    pub fn new() -> Self {
        let mut values = Vec::new();
        let mut pos = Some(B::bound_min());
        while let Some(cur) = &pos {
            values.push((*cur, T::default()));
            pos = cur.checked_increment();
        }

        Self { values }
    }
}

impl<T, B> NaiveIntervalMap<T, B>
where
    B: IntervalBound,
    T: Clone,
{
    pub fn update(&mut self, bounds: impl RangeBounds<B>, mut update: impl FnMut(&mut T)) {
        for (pos, cur_value) in &mut self.values {
            if bounds.contains(pos) {
                update(cur_value);
            }
        }
    }

    pub fn replace(&mut self, bounds: impl RangeBounds<B>, value: T) {
        self.update(bounds, |v| *v = value.clone());
    }
}

impl<T, B> NaiveIntervalMap<T, B>
where
    B: IntervalBound,
{
    pub fn iter(&self) -> NaiveIntervalMapIterator<'_, T, B> {
        NaiveIntervalMapIterator {
            values_iter: self.values.iter().peekable(),
        }
    }
}
pub struct NaiveIntervalMapIterator<'a, T, B> {
    values_iter: Peekable<slice::Iter<'a, (B, T)>>,
}

impl<'a, T, B> Iterator for NaiveIntervalMapIterator<'a, T, B>
where
    B: IntervalBound,
    T: Eq,
{
    type Item = (RangeInclusive<B>, &'a T);

    fn next(&mut self) -> Option<Self::Item> {
        let (start_pos, cur_value) = self.values_iter.next()?;
        let mut end_pos = *start_pos;
        while self.values_iter.peek().is_some_and(|(_, v)| v == cur_value) {
            end_pos = self.values_iter.next().unwrap().0;
        }
        Some(((*start_pos)..=end_pos, cur_value))
    }
}
