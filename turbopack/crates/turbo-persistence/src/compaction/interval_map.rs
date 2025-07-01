struct IntervalPoint<T> {
    start: u64,
    value: Option<T>,
}

pub struct IntervalMap<T> {
    intervals: Vec<IntervalPoint<T>>,
}

impl<T> Default for IntervalMap<T> {
    fn default() -> Self {
        Self {
            intervals: Vec::new(),
        }
    }
}

impl<T> IntervalMap<T> {
    pub fn new() -> Self {
        Default::default()
    }

    /// Ensures that there is an interval point at the specified location.
    fn ensure_point(&mut self, location: u64) -> usize
    where
        T: Clone,
    {
        match self
            .intervals
            .binary_search_by_key(&location, |point| point.start)
        {
            Ok(index) => index,
            Err(index) => {
                // If the location does not exist, we need to insert a new interval
                let value = if index > 0 {
                    self.intervals[index - 1].value.clone()
                } else {
                    None
                };
                self.intervals.insert(
                    index,
                    IntervalPoint {
                        start: location,
                        value,
                    },
                );
                index
            }
        }
    }

    /// Applies the update function to all values in the specified range.
    pub fn update(&mut self, range: &(u64, u64), mut update: impl FnMut(&mut T))
    where
        T: Default + Clone,
    {
        let start = range.0;
        let end = range.1;
        if start > end {
            return;
        }

        let start = self.ensure_point(start);
        if end == u64::MAX {
            for i in start..self.intervals.len() {
                update(self.intervals[i].value.get_or_insert_default());
            }
        } else {
            let end = self.ensure_point(end + 1);

            for i in start..end {
                update(self.intervals[i].value.get_or_insert_default());
            }
        }
    }

    /// Tests if any values in the specified range satisfy the predicate.
    pub fn test(&self, range: &(u64, u64), mut predicate: impl FnMut(&T) -> bool) -> bool {
        let start = range.0;
        let end = range.1;
        if start > end {
            return false;
        }

        let start_index = match self
            .intervals
            .binary_search_by_key(&start, |point| point.start)
        {
            Ok(index) => index,
            Err(0) => 0,
            Err(index) => index - 1,
        };

        let end_index = match self
            .intervals
            .binary_search_by_key(&end, |point| point.start)
        {
            Ok(index) => index + 1,
            Err(index) => index,
        };

        for i in start_index..end_index {
            if let Some(value) = &self.intervals[i].value
                && predicate(value)
            {
                return true;
            }
        }
        false
    }

    /// Returns an iterator over the ranges and their associated values.
    pub fn ranges(&self) -> impl Iterator<Item = ((u64, u64), &T)> {
        (0..self.intervals.len()).filter_map(move |i| {
            let start = self.intervals[i].start;
            let end = if i + 1 < self.intervals.len() {
                self.intervals[i + 1].start - 1
            } else {
                u64::MAX
            };
            self.intervals[i]
                .value
                .as_ref()
                .map(|value| ((start, end), value))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interval_map() {
        let mut map = IntervalMap::new();
        map.update(&(5, 15), |v| *v |= 1);
        map.update(&(10, 15), |v| *v |= 2);
        map.update(&(10, 20), |v| *v |= 4);
        map.update(&(0, u64::MAX), |v| *v |= 8);
        map.update(&(15, 20), |v| *v |= 16);

        let expected = vec![
            ((0, 4), &8),
            ((5, 9), &(1 | 8)),
            ((10, 14), &(1 | 2 | 4 | 8)),
            ((15, 15), &(1 | 2 | 4 | 8 | 16)),
            ((16, 20), &(4 | 8 | 16)),
            ((21, u64::MAX), &8),
        ];
        let result: Vec<_> = map.ranges().collect();
        assert_eq!(result, expected);

        // test the `test` method
        assert!(map.test(&(0, 10), |v| *v & 1 != 0));
        assert!(map.test(&(0, 10), |v| *v & 2 != 0));
        assert!(map.test(&(0, 50), |v| *v & 4 != 0));
        assert!(map.test(&(15, 15), |v| *v & 16 != 0));
        assert!(map.test(&(0, 15), |v| *v & 16 != 0));
        assert!(map.test(&(20, 20), |v| *v & 16 != 0));
        assert!(map.test(&(20, u64::MAX), |v| *v & 16 != 0));
        assert!(map.test(&(0, u64::MAX), |v| *v & 8 != 0));
        assert!(map.test(&(0, 0), |v| *v & 8 != 0));
        assert!(map.test(&(u64::MAX, u64::MAX), |v| *v & 8 != 0));
        assert!(map.test(&(123, 1234), |v| *v & 8 != 0));
    }

    #[test]
    fn test_interval_map_empty() {
        let map: IntervalMap<u32> = IntervalMap::new();
        let result: Vec<_> = map.ranges().collect();
        assert!(result.is_empty());
    }

    #[test]
    fn test_interval_map_single_point() {
        let mut map: IntervalMap<u32> = IntervalMap::new();
        map.update(&(10, 10), |v| *v += 1);

        let result: Vec<_> = map.ranges().collect();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], ((10, 10), &1));
    }
}
