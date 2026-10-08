use std::hash::Hash;

use dashmap::mapref::entry::Entry;
use turbo_tasks::{FxDashMap, event::Event};

pub struct MutexMap<K> {
    // Unrelated paths should not contend on a single filesystem-wide lock.
    map: FxDashMap<K, Option<(Event, usize)>>,
}

impl<K: Eq + Hash> Default for MutexMap<K> {
    fn default() -> Self {
        Self {
            map: FxDashMap::default(),
        }
    }
}

impl<'a, K: Eq + Hash + Clone> MutexMap<K> {
    pub async fn lock(&'a self, key: K) -> MutexMapGuard<'a, K> {
        let listener = {
            match self.map.entry(key.clone()) {
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
            if let Entry::Occupied(mut e) = self.map.map.entry(key) {
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

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use futures::FutureExt;

    use super::MutexMap;

    #[tokio::test]
    async fn distinct_paths_do_not_wait_on_each_other() {
        let map = MutexMap::default();
        let first = map.lock(1usize).await;
        let second = map.lock(2usize).now_or_never().unwrap();
        assert_eq!(map.map.len(), 2);
        drop(first);
        drop(second);
        assert!(map.map.is_empty());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn contended_path_remains_exclusive_and_is_removed() {
        let map = Arc::new(MutexMap::default());
        let active = Arc::new(AtomicUsize::new(0));
        let mut tasks = Vec::new();
        for _ in 0..64 {
            let map = map.clone();
            let active = active.clone();
            tasks.push(tokio::spawn(async move {
                let guard = map.lock(1usize).await;
                assert_eq!(active.fetch_add(1, Ordering::SeqCst), 0);
                tokio::task::yield_now().await;
                assert_eq!(active.fetch_sub(1, Ordering::SeqCst), 1);
                drop(guard);
            }));
        }
        for task in tasks {
            task.await.unwrap();
        }
        assert!(map.map.is_empty());
    }
}
