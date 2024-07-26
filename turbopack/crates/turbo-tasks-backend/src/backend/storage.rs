use auto_hash_map::AutoMap;
use dashmap::DashMap;
use turbo_tasks::Keyed;

enum PersistanceState {
    /// We know that all state of the object is only in the cache and nothing is
    /// stored in the persistent cache.
    CacheOnly,
    /// We know that some state of the object is stored in the persistent cache.
    Persisted,
    /// We have never checked the persistent cache for the state of the object.
    Unknown,
}

struct InnerStorage<T: Keyed> {
    map: AutoMap<T::Key, T::Value>,
    persistance_state: PersistanceState,
}

pub struct Storage<K, T: Keyed> {
    map: DashMap<K, InnerStorage<T>>,
}

impl<K, T: Keyed> Storage<K, T>
where
    K: Eq + std::hash::Hash + Clone,
    T: Keyed,
{
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
        }
    }
}
