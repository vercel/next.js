use std::{collections::hash_map::Entry, hash::Hash};

use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use turbo_tasks::event::{Event, EventListener};

pub struct MutexMap<K> {
    map: Mutex<FxHashMap<K, Option<(Event, usize)>>>,
}

impl<K> Default for MutexMap<K> {
    fn default() -> Self {
        Self {
            map: Mutex::new(FxHashMap::default()),
        }
    }
}

impl<'a, K: Eq + Hash + Clone> MutexMap<K> {
    /// Takes the per-key lock if it is free, or registers interest in it: returns
    /// `None` when the key is now held by us, or `Some(listener)` to wait on before
    /// retaking. Shared prelude of the dual-mode `lock` implementations.
    fn acquire_or_listen(&self, key: &K) -> Option<EventListener> {
        let mut map = self.map.lock();
        match map.entry(key.clone()) {
            Entry::Occupied(mut e) => {
                let state = e.get_mut();
                Some(match state {
                    Some((event, count)) => {
                        *count += 1;
                        event.listen()
                    }
                    None => {
                        let event = Event::new(|| || "MutexMap".to_string());
                        let listener = event.listen();
                        *state = Some((event, 0));
                        listener
                    }
                })
            }
            Entry::Vacant(e) => {
                e.insert(None);
                None
            }
        }
    }

    #[cfg(not(feature = "sync"))]
    pub async fn lock(&'a self, key: K) -> MutexMapGuard<'a, K> {
        if let Some(listener) = self.acquire_or_listen(&key) {
            // Wait for the current holder to release.
            listener.await;
        }
        MutexMapGuard {
            map: self,
            key: Some(key),
        }
    }

    /// Blocking counterpart for the no-async `sync` build. Uncontended in practice
    /// (task-level cache dedup already serializes same-path work); when contended,
    /// block the worker — holders always progress.
    #[cfg(feature = "sync")]
    pub fn lock(&'a self, key: K) -> MutexMapGuard<'a, K> {
        if let Some(listener) = self.acquire_or_listen(&key) {
            listener.wait();
        }
        MutexMapGuard {
            map: self,
            key: Some(key),
        }
    }
}

pub struct MutexMapGuard<'a, K: Eq + Hash> {
    map: &'a MutexMap<K>,
    key: Option<K>,
}

impl<K: Eq + Hash> Drop for MutexMapGuard<'_, K> {
    fn drop(&mut self) {
        if let Some(key) = self.key.take() {
            let mut map = self.map.map.lock();
            if let Entry::Occupied(mut e) = map.entry(key) {
                let value = e.get_mut();
                match value {
                    Some((event, count)) => {
                        event.notify(1);
                        if *count == 0 {
                            *value = None;
                        } else {
                            *count -= 1;
                        }
                    }
                    None => {
                        e.remove();
                    }
                }
            }
        }
    }
}
