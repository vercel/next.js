use std::{
    collections::{hash_map::Entry, HashMap},
    hash::Hash,
    mem::transmute,
    sync::Arc,
};

use parking_lot::{Mutex, MutexGuard};

pub struct ExternalLocks<K: PartialEq + Eq + Hash> {
    locks: HashMap<K, Arc<Mutex<()>>>,
}

impl<K: Clone + PartialEq + Eq + Hash> ExternalLocks<K> {
    pub fn new() -> Self {
        Self {
            locks: HashMap::new(),
        }
    }

    pub fn lock(&mut self, key: K) -> ExternalLockGuard {
        let mutex = match self.locks.entry(key) {
            Entry::Occupied(e) => e.get().clone(),
            Entry::Vacant(e) => {
                let lock = Arc::new(Mutex::new(()));
                e.insert(lock.clone());
                if self.locks.len().is_power_of_two() {
                    let to_remove = self
                        .locks
                        .iter()
                        .filter_map(|(k, v)| {
                            if Arc::strong_count(v) == 1 {
                                Some(k.clone())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>();
                    to_remove.into_iter().for_each(|k| {
                        self.locks.remove(&k);
                    });
                    if self.locks.capacity() > self.locks.len() * 3 {
                        self.locks.shrink_to_fit();
                    }
                }
                lock
            }
        };
        let guard = mutex.lock();
        // Safety: We know that the guard is valid for the lifetime of the lock as we
        // keep the lock
        let guard = unsafe { transmute::<MutexGuard<'_, _>, MutexGuard<'static, _>>(guard) };
        ExternalLockGuard { lock: mutex, guard }
    }
}

pub struct ExternalLockGuard {
    // Safety: guard must be before lock as it is dropped first
    guard: MutexGuard<'static, ()>,
    lock: Arc<Mutex<()>>,
}
