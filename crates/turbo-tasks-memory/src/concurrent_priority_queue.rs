use std::{
    cmp::min,
    collections::{hash_map::RandomState, BinaryHeap},
    fmt::Debug,
    hash::{BuildHasher, Hash},
};

use once_cell::sync::OnceCell;
use parking_lot::{Mutex, MutexGuard};
use priority_queue::PriorityQueue;

// shard_amount and shift are stolen from the dashmap crate implementation:
// https://github.com/xacrimon/dashmap/blob/0b2a2269b2d368494eeb41d4218da1b142da8e77/src/lib.rs#L64-L69
// They are changed to use use 4 times the number of shards, since inserting
// into a priority queue is more expensive than a hashmap. So creating more
// shards will reduce contention.

// Returns the number of shards to use.
fn shard_amount() -> usize {
    static SHARD_AMOUNT: OnceCell<usize> = OnceCell::new();
    *SHARD_AMOUNT.get_or_init(|| {
        (std::thread::available_parallelism().map_or(1, usize::from) * 16).next_power_of_two()
    })
}

/// Returns the number of bits to shift a hash to get the shard index.
fn shift() -> usize {
    static SHIFT: OnceCell<usize> = OnceCell::new();
    *SHIFT
        .get_or_init(|| std::mem::size_of::<usize>() * 8 - shard_amount().trailing_zeros() as usize)
}

pub struct ConcurrentPriorityQueue<K: Hash + Eq, V: Ord, H = RandomState> {
    shards: Box<[Mutex<PriorityQueue<K, V, H>>]>,
    hasher: H,
}

impl<K: Hash + Eq, V: Ord + Clone + Debug, H: BuildHasher + Default + Clone>
    ConcurrentPriorityQueue<K, V, H>
{
    pub fn new() -> Self {
        Self::with_hasher(Default::default())
    }
}

impl<K: Hash + Eq, V: Ord + Clone + Debug, H: BuildHasher + Clone>
    ConcurrentPriorityQueue<K, V, H>
{
    pub fn with_hasher(hasher: H) -> Self {
        let shards = (0..shard_amount())
            .map(|_| Mutex::new(PriorityQueue::with_hasher(hasher.clone())))
            .collect::<Vec<_>>();
        Self {
            shards: shards.into_boxed_slice(),
            hasher,
        }
    }

    fn shard(&self, key: &K) -> MutexGuard<PriorityQueue<K, V, H>> {
        // Leave the high 7 bits for the HashBrown SIMD tag.
        // see https://github.com/xacrimon/dashmap/blob/0b2a2269b2d368494eeb41d4218da1b142da8e77/src/lib.rs#L374
        let index = ((self.hasher.hash_one(key) as usize) << 7) >> shift();
        unsafe { self.shards.get_unchecked(index) }.lock()
    }

    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        let mut len = 0;
        for shard in self.shards.iter() {
            len += shard.lock().len()
        }
        len
    }

    pub fn insert(&self, key: K, value: V) {
        let mut inner = self.shard(&key);
        inner.push(key, value);
    }

    pub fn upsert_with(
        &self,
        key: K,
        default_value: impl FnOnce() -> V,
        value_update: impl FnOnce(&mut V),
    ) {
        let mut inner = self.shard(&key);
        if !inner.change_priority_by(&key, value_update) {
            inner.push(key, default_value());
        }
    }

    /// Pops at most `min(factor / 256 * len, max_count)` items from the queue.
    /// Due to concurrency, the actual amount of items may vary. The
    /// returned vector is in any order, if you want items to be ordered you
    /// need to sort it.
    pub fn pop_factor(&self, factor: u8, max_count: usize) -> Vec<(K, V)> {
        struct ShardsQueueItem<V> {
            index: usize,
            value: V,
            len: usize,
        }
        impl<V: Ord> Ord for ShardsQueueItem<V> {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                self.value
                    .cmp(&other.value)
                    // In case of equal priority we want to select the shard with the
                    // largest number of items, so we balance the load on shards.
                    .then_with(|| self.len.cmp(&other.len))
            }
        }
        impl<V: Ord> PartialOrd for ShardsQueueItem<V> {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }
        impl<V: Ord> PartialEq for ShardsQueueItem<V> {
            fn eq(&self, _other: &Self) -> bool {
                unreachable!()
            }
        }
        impl<V: Ord> Eq for ShardsQueueItem<V> {}

        // We build a priority queue of the shards so we can select from the shards in
        // correct order. But this is only a snapshot of the shards, so any
        // concurrent change to the shard will not be respected, but we are fine with
        // that.
        let mut shards_queue = BinaryHeap::with_capacity(self.shards.len());
        let mut total_len = 0;
        for (i, shard) in self.shards.iter().enumerate() {
            let shard = shard.lock();
            let len = shard.len();
            total_len += len;
            if let Some((_, v)) = shard.peek() {
                shards_queue.push(ShardsQueueItem {
                    index: i,
                    value: v.clone(),
                    len,
                });
            }
        }
        let count = min(factor as usize * total_len / u8::MAX as usize, max_count);
        let mut result = Vec::with_capacity(count);
        loop {
            if let Some(ShardsQueueItem { index: i, .. }) = shards_queue.pop() {
                let mut shard = unsafe { self.shards.get_unchecked(i) }.lock();
                if let Some(ShardsQueueItem {
                    value: next_value, ..
                }) = shards_queue.peek()
                {
                    // The peek will be None if the shard has become empty concurrently
                    while let Some((_, peeked_value)) = shard.peek() {
                        // Is the next item in this shard (still) the global next
                        if peeked_value < next_value {
                            // some other shard is next
                            // enqueue this shard again
                            shards_queue.push(ShardsQueueItem {
                                index: i,
                                value: peeked_value.clone(),
                                len: shard.len(),
                            });
                            break;
                        }

                        result.push(shard.pop().unwrap());
                        if result.len() >= count {
                            return result;
                        }
                        // We keep the shard lock and check the next item for a
                        // fast path
                    }
                } else {
                    // No other shards
                    for _ in result.len()..count {
                        if let Some(item) = shard.pop() {
                            result.push(item);
                        } else {
                            break;
                        }
                    }
                    return result;
                }
            }
        }
    }
}
