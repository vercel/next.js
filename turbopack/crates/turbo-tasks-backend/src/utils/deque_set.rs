use std::{
    collections::{HashSet, VecDeque},
    fmt::Debug,
    hash::{BuildHasher, BuildHasherDefault, Hash},
};

use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};

// TODO This could be more efficent:
// - Not storing items twice
// - Not serializing items twice

#[derive(Clone, Serialize, Deserialize)]
#[serde(bound(
    deserialize = "T: Hash + Eq + Deserialize<'de>, B: BuildHasher + Default",
    serialize = "T: Hash + Eq + Serialize, B: BuildHasher + Default"
))]
pub struct DequeSet<T, B: BuildHasher = BuildHasherDefault<FxHasher>> {
    set: HashSet<T, B>,
    queue: VecDeque<T>,
}

impl<T: Debug, B: BuildHasher> Debug for DequeSet<T, B> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.queue.fmt(f)
    }
}

impl<T, B: BuildHasher + Default> Default for DequeSet<T, B> {
    fn default() -> Self {
        Self {
            set: Default::default(),
            queue: VecDeque::with_capacity(0),
        }
    }
}

impl<T, B: BuildHasher> DequeSet<T, B> {
    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.queue.len()
    }
}

impl<T: Hash + Eq + Clone, B: BuildHasher> DequeSet<T, B> {
    pub fn insert_back(&mut self, item: T) -> bool {
        if self.set.insert(item.clone()) {
            self.queue.push_back(item);
            true
        } else {
            false
        }
    }

    pub fn pop_front(&mut self) -> Option<T> {
        if let Some(item) = self.queue.pop_front() {
            self.set.remove(&item);
            Some(item)
        } else {
            None
        }
    }
}

impl<T: Hash + Eq + Clone, B: BuildHasher> Extend<T> for DequeSet<T, B> {
    fn extend<I: IntoIterator<Item = T>>(&mut self, iter: I) {
        self.queue.extend(
            iter.into_iter()
                .filter(|item| self.set.insert(item.clone())),
        );
    }
}
