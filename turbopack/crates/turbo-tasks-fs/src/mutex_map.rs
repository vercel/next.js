use std::{collections::hash_map::Entry, hash::Hash};

use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use turbo_tasks::event::Event;

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
    pub async fn lock(&'a self, key: K) -> MutexMapGuard<'a, K> {
        let listener = {
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
        };
        if let Some(listener) = listener {
            listener.await;
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
