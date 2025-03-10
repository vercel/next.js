use std::{borrow::Borrow, hash::Hash};

use dashmap::mapref::entry::Entry;
use turbo_tasks::FxDashMap;

/// A bidirectional [`FxDashMap`] that allows lookup by key or value.
///
/// As keys and values are stored twice, they should be small types, such as
/// [`Arc`][`std::sync::Arc`].
pub struct BiMap<K, V> {
    forward: FxDashMap<K, V>,
    reverse: FxDashMap<V, K>,
}

impl<K, V> BiMap<K, V>
where
    K: Eq + Hash + Clone,
    V: Eq + Hash + Clone,
{
    pub fn new() -> Self {
        Self {
            forward: FxDashMap::default(),
            reverse: FxDashMap::default(),
        }
    }

    pub fn lookup_forward<Q>(&self, key: &Q) -> Option<V>
    where
        K: Borrow<Q>,
        Q: Hash + Eq,
    {
        self.forward.get(key).map(|v| v.value().clone())
    }

    pub fn lookup_reverse<Q>(&self, key: &Q) -> Option<K>
    where
        V: Borrow<Q>,
        Q: Hash + Eq,
    {
        self.reverse.get(key).map(|v| v.value().clone())
    }

    pub fn try_insert(&self, key: K, value: V) -> Result<(), V> {
        match self.forward.entry(key) {
            Entry::Occupied(e) => Err(e.get().clone()),
            Entry::Vacant(e) => {
                let e = e.insert_entry(value.clone());
                let key = e.key().clone();
                self.reverse.insert(value, key);
                drop(e);
                Ok(())
            }
        }
    }
}
