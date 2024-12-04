use std::hash::{BuildHasher, BuildHasherDefault, Hash};

use parking_lot::{Mutex, MutexGuard};
use rustc_hash::FxHasher;

pub struct Sharded<T, H = BuildHasherDefault<FxHasher>> {
    data: Box<[Mutex<T>]>,
    hasher: H,
    bitmask: u16,
}

impl<T, H> Sharded<T, H> {
    pub fn new(mut shard_amount: usize) -> Self
    where
        T: Default,
        H: Default,
    {
        assert!(shard_amount.is_power_of_two());
        shard_amount = shard_amount.min(u16::MAX as usize + 1);
        let data = (0..shard_amount)
            .map(|_| Mutex::new(T::default()))
            .collect::<Vec<_>>()
            .into_boxed_slice();
        Self {
            data,
            hasher: H::default(),
            bitmask: (shard_amount - 1) as u16,
        }
    }

    pub fn lock<K>(&self, key: K) -> MutexGuard<'_, T>
    where
        K: Hash,
        H: BuildHasher,
    {
        let hash = self.hasher.hash_one(key);
        let shard = hash as u16 & self.bitmask;
        self.data[shard as usize].lock()
    }

    pub fn take<R>(&self, map: impl Fn(T) -> R) -> Vec<R>
    where
        T: Default,
    {
        let locked = self.data.iter().map(|m| m.lock()).collect::<Vec<_>>();
        locked
            .into_iter()
            .map(|mut m| map(std::mem::take(&mut *m)))
            .collect()
    }
}
