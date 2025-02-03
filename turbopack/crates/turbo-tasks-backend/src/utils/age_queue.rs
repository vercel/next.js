use std::mem::take;

use roaring::RoaringBitmap;

#[derive(Debug)]
pub struct AgeQueue {
    len: u64,
    /// The queue of bitmaps of items stored.
    /// Invariant: Two sibling bitmaps have no overlapping items.
    queue: Vec<RoaringBitmap>,
    /// Index in queue from which bitmaps contain no duplicates.
    no_duplicates_from: usize,
    counter: usize,
}

impl AgeQueue {
    pub fn new() -> Self {
        Self {
            len: 0,
            queue: vec![RoaringBitmap::new(), RoaringBitmap::new()],
            no_duplicates_from: 0,
            counter: 0,
        }
    }

    pub fn push(&mut self, items: &RoaringBitmap) {
        // Propagate items to older queue items.
        self.transfer();

        let second = &mut self.queue[1];
        // Remove new items from second bitmap.
        let old = second.len();
        *second -= items;
        let removed = old - second.len();
        self.len -= removed;

        // Insert new items into the first bitmap.
        let first = &mut self.queue[0];
        let old = first.len();
        *first |= items;
        let inserted = first.len() - old;
        self.len += inserted;

        // We added items to the first bitmap, so we might have duplicates now.
        self.no_duplicates_from = self.no_duplicates_from.max(1);
    }

    fn transfer_index(&mut self) -> usize {
        let index = counter_to_index(self.counter).min(self.queue.len());
        self.counter += 1;
        index
    }

    /// Do one step transferring of values to a older queue item.
    fn transfer(&mut self) {
        let mut index = self.transfer_index();

        if index == 0 {
            return;
        }

        if index == self.queue.len() {
            if self.queue.last().unwrap().len() > self.len / 2 {
                self.queue.push(RoaringBitmap::new());
            } else {
                index -= 1;
            }
        }

        debug_assert!(index < self.queue.len());

        let (before, remaining) = self.queue.split_at_mut(index);
        let prev = take(before.last_mut().unwrap());
        let prev_len = prev.len();

        let current =
            if let Some(([current], [next] | [next, ..])) = remaining.split_at_mut_checked(1) {
                // Remove prev items from next bitmap.
                let old = next.len();
                *next -= &prev;
                let removed = old - next.len();
                self.len -= removed;
                current
            } else {
                remaining.first_mut().unwrap()
            };

        // Move prev items to current bitmap.
        let old = current.len();
        *current |= prev;
        let inserted = current.len() - old;

        // We added items to the bitmap, so we might have duplicates now.
        self.no_duplicates_from = self.no_duplicates_from.max(index + 1);

        self.len += inserted;
        self.len -= prev_len;
    }

    fn remove_trailing_empty(&mut self) {
        // remove empty trailing bitmaps
        while self.queue.len() > 2 && self.queue.last().unwrap().is_empty() {
            self.queue.pop();
        }
    }

    fn remove_duplicates(&mut self) {
        for i in 0..self.no_duplicates_from.min(self.queue.len() - 2) {
            let (before, remaining) = self.queue.split_at_mut(i + 1);
            let current = before.last().unwrap();
            // We can skip one because of the invariant
            for bitmap in &mut remaining[1..] {
                let old = bitmap.len();
                *bitmap -= current;
                let removed = old - bitmap.len();
                self.len -= removed;
            }
        }
        self.no_duplicates_from = 0;
    }

    pub fn shrink_to_fit(&mut self) {
        self.remove_trailing_empty();
        self.remove_duplicates();
        self.queue.shrink_to_fit();
    }

    pub fn old_items_mut(&mut self) -> &mut RoaringBitmap {
        self.remove_trailing_empty();
        self.remove_duplicates();
        self.queue.last_mut().unwrap()
    }
}

fn counter_to_index(counter: usize) -> usize {
    (((counter ^ (counter + 1)) + 1).trailing_zeros() - 1) as usize
}

#[cfg(test)]
mod tests {
    use crate::utils::age_queue::AgeQueue;

    #[test]
    fn test_counter_to_index() {
        assert_eq!(super::counter_to_index(0), 0);
        assert_eq!(super::counter_to_index(1), 1);
        assert_eq!(super::counter_to_index(2), 0);
        assert_eq!(super::counter_to_index(3), 2);
        assert_eq!(super::counter_to_index(4), 0);
        assert_eq!(super::counter_to_index(5), 1);
        assert_eq!(super::counter_to_index(6), 0);
        assert_eq!(super::counter_to_index(7), 3);
        assert_eq!(super::counter_to_index(8), 0);
        assert_eq!(super::counter_to_index(9), 1);
        assert_eq!(super::counter_to_index(10), 0);
        assert_eq!(super::counter_to_index(11), 2);
        assert_eq!(super::counter_to_index(12), 0);
        assert_eq!(super::counter_to_index(13), 1);
        assert_eq!(super::counter_to_index(14), 0);
        assert_eq!(super::counter_to_index(15), 4);
    }

    #[test]
    fn test_simple() {
        let mut queue = AgeQueue::new();

        for i in 0..50 {
            let mut items = roaring::RoaringBitmap::new();
            // Normal tasks
            items.insert(i);
            // Frequently used tasks
            items.insert((i % 10) + 100);
            // Really hot tasks
            items.insert((i % 4) + 200);
            queue.push(&items);
        }

        let old_items = queue.old_items_mut().iter().collect::<Vec<_>>();
        assert_eq!(old_items.len(), 33);
        assert_eq!(queue.len, 64);
        assert_eq!(
            old_items,
            vec![
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
                23, 24, 25, 26, 27, 28, 29, 30, 31, 32
            ]
        );
    }
}
