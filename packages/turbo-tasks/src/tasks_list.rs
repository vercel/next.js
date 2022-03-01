use std::{
    collections::{
        hash_map::{Drain, Entry, IntoKeys, Keys},
        HashMap,
    },
    fmt::Debug,
    hash::{Hash, Hasher},
    iter::Map,
    sync::{Arc, Weak},
};

use weak_table::{
    traits::{WeakElement, WeakKey},
    WeakKeyHashMap,
};

use crate::Task;

#[derive(Clone)]
pub struct StrongListEntry {
    task: Arc<Task>,
}

impl StrongListEntry {
    fn pair_to_item(entry: (Self, u8)) -> Arc<Task> {
        entry.0.task
    }

    fn to_item(entry: Self) -> Arc<Task> {
        entry.task
    }

    fn get_item(entry: &Self) -> &Arc<Task> {
        &entry.task
    }

    fn new(task: Arc<Task>) -> Self {
        Self { task }
    }
}

impl PartialEq for StrongListEntry {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.task, &other.task)
    }
}

impl Hash for StrongListEntry {
    fn hash<H: Hasher>(&self, state: &mut H) {
        Hash::hash(&(&*self.task as *const Task), state);
    }
}

impl Eq for StrongListEntry {}

// #[derive(Clone)]
// pub struct WeakListEntry {
//     task: Weak<Task>,
// }

// impl PartialEq for WeakListEntry {
//     fn eq(&self, other: &Self) -> bool {
//         Weak::ptr_eq(&self.task, &other.task)
//     }
// }

// impl Hash for WeakListEntry {
//     fn hash<H: Hasher>(&self, state: &mut H) {
//         Hash::hash(&(&*self.task as *const Task), state);
//     }
// }

// impl Eq for WeakListEntry {}

#[derive(Default, Clone)]
pub struct TasksList {
    map: HashMap<StrongListEntry, u8>,
}

impl TasksList {
    pub fn add(&mut self, task: Arc<Task>) {
        match self.map.entry(StrongListEntry::new(task)) {
            Entry::Occupied(mut e) => {
                *e.get_mut() += 1;
            }
            Entry::Vacant(e) => {
                e.insert(1);
            }
        }
    }

    // pub fn remove(&mut self, task: Arc<Task>) {
    //     match self.map.entry(StrongListEntry::new(task)) {
    //         Entry::Occupied(mut e) => {
    //             let value = e.get_mut();
    //             *value -= 1;
    //             if *value == 0 {
    //                 e.remove();
    //             }
    //         }
    //         Entry::Vacant(e) => {}
    //     }
    // }

    // pub fn is_empty(&self) -> bool {
    //     self.map.is_empty()
    // }

    pub fn drain(
        &mut self,
    ) -> Map<Drain<'_, StrongListEntry, u8>, fn((StrongListEntry, u8)) -> Arc<Task>> {
        self.map.drain().map(StrongListEntry::pair_to_item)
    }

    pub fn iter(&self) -> Map<Keys<StrongListEntry, u8>, fn(&StrongListEntry) -> &Arc<Task>> {
        self.map.keys().map(StrongListEntry::get_item)
    }
}

impl IntoIterator for TasksList {
    type Item = Arc<Task>;

    type IntoIter = Map<IntoKeys<StrongListEntry, u8>, fn(StrongListEntry) -> Arc<Task>>;

    fn into_iter(self) -> Self::IntoIter {
        self.map.into_keys().map(StrongListEntry::to_item)
    }
}

pub struct WeakListEntry {
    task: Weak<Task>,
}

impl WeakKey for WeakListEntry {
    type Key = StrongListEntry;

    fn with_key<F, R>(view: &Self::Strong, f: F) -> R
    where
        F: FnOnce(&Self::Key) -> R,
    {
        f(view)
    }
}

impl WeakElement for WeakListEntry {
    type Strong = StrongListEntry;

    fn new(view: &Self::Strong) -> Self {
        Self {
            task: Arc::downgrade(&view.task),
        }
    }

    fn view(&self) -> Option<Self::Strong> {
        self.task.upgrade().map(|task| StrongListEntry { task })
    }

    fn clone(view: &Self::Strong) -> Self::Strong {
        view.clone()
    }
}

#[derive(Default)]
pub struct WeakTasksList {
    map: WeakKeyHashMap<WeakListEntry, u8>,
}

impl WeakTasksList {
    pub fn add(&mut self, task: Arc<Task>) {
        match self.map.entry(StrongListEntry::new(task)) {
            weak_table::weak_key_hash_map::Entry::Occupied(mut e) => {
                *e.get_mut() += 1;
            }
            weak_table::weak_key_hash_map::Entry::Vacant(e) => {
                e.insert(1);
            }
        }
    }

    pub fn remove(&mut self, task: Arc<Task>) {
        match self.map.entry(StrongListEntry::new(task)) {
            weak_table::weak_key_hash_map::Entry::Occupied(mut e) => {
                let value = e.get_mut();
                *value -= 1;
                if *value == 0 {
                    e.remove();
                }
            }
            weak_table::weak_key_hash_map::Entry::Vacant(_) => {}
        }
    }

    pub fn remove_all(&mut self, task: Arc<Task>) {
        self.map.remove(&StrongListEntry::new(task));
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    pub fn drain(
        &mut self,
    ) -> Map<
        weak_table::weak_key_hash_map::Drain<'_, WeakListEntry, u8>,
        fn((StrongListEntry, u8)) -> Arc<Task>,
    > {
        self.map.drain().map(StrongListEntry::pair_to_item)
    }

    pub fn iter(
        &self,
    ) -> Map<weak_table::weak_key_hash_map::Keys<WeakListEntry, u8>, fn(StrongListEntry) -> Arc<Task>>
    {
        self.map.keys().map(StrongListEntry::to_item)
    }
}

impl<'a> IntoIterator for &'a mut WeakTasksList {
    type Item = Arc<Task>;

    type IntoIter = Map<
        weak_table::weak_key_hash_map::Drain<'a, WeakListEntry, u8>,
        fn((StrongListEntry, u8)) -> Arc<Task>,
    >;

    fn into_iter(self) -> Self::IntoIter {
        self.map.drain().map(StrongListEntry::pair_to_item)
    }
}

impl Debug for WeakTasksList {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WeakTasksList")
            .field("tasks", &self.map.len())
            .finish()
    }
}
