//! The owner side of hashed keyed cell dependencies, indexed by cell and key.
//!
//! A task's cell can have very many keyed dependents (e.g. thousands of reader tasks each reading
//! thousands of keys of one map). Indexing them by key lets a cell update look up only the
//! dependents of the changed keys, instead of scanning all of them.
//!
//! The layout is optimized for memory in both extremes: a key with a single dependent (each reader
//! reads its own keys) costs one 16 byte map entry, the same as an entry of a flat
//! `(CellRef, CellKey)` set, and every additional dependent of a shared key costs one `TaskId` in
//! that key's set.
//!
//! Transient dependents are handled like the `filter_transient` fields of the task storage: they
//! are not persisted, and they are kept in memory when the persistent data is evicted.

use std::{
    hash::BuildHasherDefault,
    ops::{Deref, DerefMut},
};

use auto_hash_map::{AutoMap, AutoSet, map::Entry};
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use rustc_hash::FxHasher;
use turbo_tasks::{CellId, CellKey, ShrinkToFit, TaskId};

use crate::backend::storage_schema::{DropPartial, DropPartialOutcome, MergeRestore};

type FxBuildHasher = BuildHasherDefault<FxHasher>;

/// The dependents of one key: a single dependent inline, or an index into
/// [`CellKeyedDependents::sets`]. 8 bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KeyDependents {
    One(TaskId),
    Many(u32),
}

/// The keyed dependents of one cell, see the module docs.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CellKeyedDependents {
    keys: AutoMap<CellKey, KeyDependents, FxBuildHasher>,
    /// The dependents of keys with more than one dependent ([`KeyDependents::Many`]).
    sets: Vec<AutoSet<TaskId, FxBuildHasher>>,
    /// Unused entries of `sets` (kept empty), reused before `sets` grows.
    free: Vec<u32>,
}

impl CellKeyedDependents {
    /// Adds `task` as a dependent of `key`. Returns `false` if it already was one.
    pub fn insert(&mut self, key: CellKey, task: TaskId) -> bool {
        match self.keys.entry(key) {
            Entry::Vacant(entry) => {
                entry.insert(KeyDependents::One(task));
                true
            }
            Entry::Occupied(mut entry) => match *entry.get_mut() {
                KeyDependents::One(existing) => {
                    if existing == task {
                        return false;
                    }
                    let set = AutoSet::from_iter([existing, task]);
                    let index = match self.free.pop() {
                        Some(index) => {
                            self.sets[index as usize] = set;
                            index
                        }
                        None => {
                            self.sets.push(set);
                            u32::try_from(self.sets.len() - 1).unwrap()
                        }
                    };
                    *entry.get_mut() = KeyDependents::Many(index);
                    true
                }
                KeyDependents::Many(index) => self.sets[index as usize].insert(task),
            },
        }
    }

    /// Removes `task` as a dependent of `key`. Returns `false` if it wasn't one.
    pub fn remove(&mut self, key: CellKey, task: TaskId) -> bool {
        let Entry::Occupied(mut entry) = self.keys.entry(key) else {
            return false;
        };
        match *entry.get_mut() {
            KeyDependents::One(existing) => {
                if existing != task {
                    return false;
                }
                entry.remove();
                true
            }
            KeyDependents::Many(index) => {
                let set = &mut self.sets[index as usize];
                if !set.remove(&task) {
                    return false;
                }
                if set.len() == 1 {
                    let remaining = *set.iter().next().unwrap();
                    self.sets[index as usize] = AutoSet::default();
                    self.free.push(index);
                    *entry.get_mut() = KeyDependents::One(remaining);
                }
                true
            }
        }
    }

    pub fn contains(&self, key: CellKey, task: TaskId) -> bool {
        match self.keys.get(&key) {
            None => false,
            Some(KeyDependents::One(existing)) => *existing == task,
            Some(KeyDependents::Many(index)) => self.sets[*index as usize].contains(&task),
        }
    }

    /// The dependents of `key`.
    pub fn dependents(&self, key: CellKey) -> impl Iterator<Item = TaskId> + '_ {
        self.keys
            .get(&key)
            .into_iter()
            .flat_map(|dependents| self.dependents_of(dependents))
    }

    /// All `(key, dependent)` pairs.
    pub fn iter(&self) -> impl Iterator<Item = (CellKey, TaskId)> + '_ {
        self.keys.iter().flat_map(|(&key, dependents)| {
            self.dependents_of(dependents).map(move |task| (key, task))
        })
    }

    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }

    fn dependents_of<'a>(
        &'a self,
        dependents: &'a KeyDependents,
    ) -> impl Iterator<Item = TaskId> + 'a {
        let (one, many) = match *dependents {
            KeyDependents::One(task) => (Some(task), None),
            KeyDependents::Many(index) => (None, Some(self.sets[index as usize].iter().copied())),
        };
        one.into_iter().chain(many.into_iter().flatten())
    }

    /// Only keeps the dependents for which `f` returns `true`.
    fn retain(&mut self, mut f: impl FnMut(TaskId) -> bool) {
        let old = std::mem::take(self);
        for (key, task) in old.iter() {
            if f(task) {
                self.insert(key, task);
            }
        }
    }
}

impl ShrinkToFit for CellKeyedDependents {
    fn shrink_to_fit(&mut self) {
        if !self.free.is_empty() {
            // Compact the sets (renumbers them).
            self.retain(|_| true);
        }
        self.keys.shrink_to_fit();
        self.sets.shrink_to_fit();
        for set in &mut self.sets {
            set.shrink_to_fit();
        }
        self.free.shrink_to_fit();
    }
}

/// Only persistent dependents are encoded, see the module docs.
impl Encode for CellKeyedDependents {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        let persistent = |task: &TaskId| !task.is_transient();
        let count = self.iter().filter(|(_, task)| persistent(task)).count();
        count.encode(encoder)?;
        for (key, task) in self.iter().filter(|(_, task)| persistent(task)) {
            key.encode(encoder)?;
            task.encode(encoder)?;
        }
        Ok(())
    }
}

impl<Context> Decode<Context> for CellKeyedDependents {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let count = usize::decode(decoder)?;
        let mut dependents = Self::default();
        for _ in 0..count {
            let key = CellKey::decode(decoder)?;
            let task = TaskId::decode(decoder)?;
            dependents.insert(key, task);
        }
        Ok(dependents)
    }
}

bincode::impl_borrow_decode!(CellKeyedDependents);

type InnerMap = AutoMap<CellId, CellKeyedDependents, FxBuildHasher>;

/// The owner side of hashed keyed cell dependencies of a task, per cell. See the module docs.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct KeyedDependentsIndex(InnerMap);

impl Deref for KeyedDependentsIndex {
    type Target = InnerMap;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for KeyedDependentsIndex {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl IntoIterator for KeyedDependentsIndex {
    type Item = (CellId, CellKeyedDependents);
    type IntoIter = <InnerMap as IntoIterator>::IntoIter;
    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl ShrinkToFit for KeyedDependentsIndex {
    fn shrink_to_fit(&mut self) {
        self.0.shrink_to_fit();
        for dependents in self.0.values_mut() {
            dependents.shrink_to_fit();
        }
    }
}

impl KeyedDependentsIndex {
    pub fn insert(&mut self, cell: CellId, key: CellKey, task: TaskId) -> bool {
        self.0.entry(cell).or_default().insert(key, task)
    }

    pub fn remove(&mut self, cell: CellId, key: CellKey, task: TaskId) -> bool {
        let Entry::Occupied(mut entry) = self.0.entry(cell) else {
            return false;
        };
        let removed = entry.get_mut().remove(key, task);
        if entry.get_mut().is_empty() {
            entry.remove();
        }
        removed
    }

    pub fn contains(&self, cell: CellId, key: CellKey, task: TaskId) -> bool {
        self.0
            .get(&cell)
            .is_some_and(|dependents| dependents.contains(key, task))
    }

    /// All `(cell, key, dependent)` triples.
    pub fn iter_all(&self) -> impl Iterator<Item = (CellId, CellKey, TaskId)> + '_ {
        self.0.iter().flat_map(|(&cell, dependents)| {
            dependents.iter().map(move |(key, task)| (cell, key, task))
        })
    }
}

impl MergeRestore for KeyedDependentsIndex {
    type Item = (CellId, CellKeyedDependents);
    /// Adds the restored (persistent) dependents to the in-memory ones (the transient dependents
    /// kept by `drop_partial`).
    fn merge_restore(&mut self, items: impl IntoIterator<Item = Self::Item>) {
        for (cell, restored) in items {
            match self.0.entry(cell) {
                Entry::Vacant(entry) => {
                    entry.insert(restored);
                }
                Entry::Occupied(mut entry) => {
                    let dependents = entry.get_mut();
                    for (key, task) in restored.iter() {
                        dependents.insert(key, task);
                    }
                }
            }
        }
    }
}

impl DropPartial for KeyedDependentsIndex {
    /// Keeps the transient dependents (they are not persisted, so they can't be restored).
    fn drop_partial(&mut self) -> DropPartialOutcome {
        self.0.retain(|_, dependents| {
            dependents.retain(|task| task.is_transient());
            !dependents.is_empty()
        });
        if self.0.is_empty() {
            return DropPartialOutcome::Empty;
        }
        self.shrink_to_fit();
        DropPartialOutcome::HasResidue
    }
}

impl Encode for KeyedDependentsIndex {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        let has_persistent = |dependents: &CellKeyedDependents| {
            dependents.iter().any(|(_, task)| !task.is_transient())
        };
        let count = self.0.values().filter(|d| has_persistent(d)).count();
        count.encode(encoder)?;
        for (cell, dependents) in self.0.iter() {
            if has_persistent(dependents) {
                cell.encode(encoder)?;
                dependents.encode(encoder)?;
            }
        }
        Ok(())
    }
}

impl<Context> Decode<Context> for KeyedDependentsIndex {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let count = usize::decode(decoder)?;
        let mut map = InnerMap::default();
        for _ in 0..count {
            let cell = CellId::decode(decoder)?;
            let dependents = CellKeyedDependents::decode(decoder)?;
            map.insert(cell, dependents);
        }
        Ok(Self(map))
    }
}

bincode::impl_borrow_decode!(KeyedDependentsIndex);

#[cfg(test)]
mod tests {
    use turbo_tasks::ValueTypeId;

    use super::*;

    /// `turbo_tasks::TRANSIENT_TASK_BIT`
    const TRANSIENT: u32 = 0x4000_0000;

    fn task(id: u32) -> TaskId {
        TaskId::new(id).unwrap()
    }

    fn cell(index: u32) -> CellId {
        CellId::new(ValueTypeId::new(1).unwrap(), index)
    }

    fn sorted_dependents(index: &KeyedDependentsIndex, c: u32, key: u64) -> Vec<u32> {
        let mut tasks: Vec<u32> = index
            .get(&cell(c))
            .into_iter()
            .flat_map(|d| d.dependents(CellKey::hash(key)))
            .map(|t| *t)
            .collect();
        tasks.sort_unstable();
        tasks
    }

    fn roundtrip(index: &KeyedDependentsIndex) -> KeyedDependentsIndex {
        let config = bincode::config::standard();
        let bytes = bincode::encode_to_vec(index, config).unwrap();
        bincode::decode_from_slice(&bytes, config).unwrap().0
    }

    #[test]
    fn key_dependents_is_8_bytes() {
        assert_eq!(size_of::<KeyDependents>(), 8);
        assert_eq!(size_of::<(CellKey, KeyDependents)>(), 16);
    }

    #[test]
    fn promote_demote_and_reuse() {
        let mut d = CellKeyedDependents::default();
        let key = CellKey::hash(1);
        assert!(d.insert(key, task(1)));
        assert!(!d.insert(key, task(1)));
        assert_eq!(d.keys.get(&key), Some(&KeyDependents::One(task(1))));
        // Promoted to a set on the second dependent.
        assert!(d.insert(key, task(2)));
        assert!(d.insert(key, task(3)));
        assert_eq!(d.keys.get(&key), Some(&KeyDependents::Many(0)));
        assert!(d.contains(key, task(2)));
        assert!(!d.contains(key, task(4)));
        // Demoted when one dependent remains.
        assert!(d.remove(key, task(1)));
        assert!(!d.remove(key, task(1)));
        assert!(d.remove(key, task(3)));
        assert_eq!(d.keys.get(&key), Some(&KeyDependents::One(task(2))));
        assert_eq!(d.free, vec![0]);
        // The freed set is reused.
        let other = CellKey::hash(2);
        assert!(d.insert(other, task(5)));
        assert!(d.insert(other, task(6)));
        assert_eq!(d.keys.get(&other), Some(&KeyDependents::Many(0)));
        assert!(d.free.is_empty());
        assert_eq!(d.sets.len(), 1);
        // Removed with the last dependent.
        assert!(d.remove(key, task(2)));
        assert!(!d.keys.contains_key(&key));
        let mut all: Vec<_> = d.iter().map(|(k, t)| (k, *t)).collect();
        all.sort_unstable_by_key(|&(_, t)| t);
        assert_eq!(all, vec![(other, 5), (other, 6)]);
    }

    #[test]
    fn shrink_to_fit_compacts_sets() {
        let mut d = CellKeyedDependents::default();
        for key in 0..4 {
            d.insert(CellKey::hash(key), task(1));
            d.insert(CellKey::hash(key), task(2));
        }
        d.remove(CellKey::hash(0), task(1));
        d.remove(CellKey::hash(1), task(1));
        assert_eq!(d.free.len(), 2);
        d.shrink_to_fit();
        assert!(d.free.is_empty());
        assert_eq!(d.sets.len(), 2);
        for key in 0..4 {
            assert!(d.contains(CellKey::hash(key), task(2)));
        }
        assert!(d.contains(CellKey::hash(2), task(1)));
        assert!(!d.contains(CellKey::hash(0), task(1)));
    }

    #[test]
    fn index_insert_remove() {
        let mut index = KeyedDependentsIndex::default();
        assert!(index.insert(cell(0), CellKey::hash(1), task(1)));
        assert!(index.insert(cell(1), CellKey::hash(1), task(1)));
        assert!(index.contains(cell(0), CellKey::hash(1), task(1)));
        assert!(!index.contains(cell(0), CellKey::hash(2), task(1)));
        assert!(index.remove(cell(0), CellKey::hash(1), task(1)));
        assert!(!index.contains_key(&cell(0)));
        assert_eq!(index.iter_all().count(), 1);
    }

    #[test]
    fn encode_skips_transient_dependents() {
        let mut index = KeyedDependentsIndex::default();
        index.insert(cell(0), CellKey::hash(1), task(5));
        index.insert(cell(0), CellKey::hash(1), task(TRANSIENT | 7));
        index.insert(cell(0), CellKey::hash(2), task(TRANSIENT | 8));
        index.insert(cell(1), CellKey::hash(3), task(TRANSIENT | 9));
        index.insert(cell(2), CellKey::hash(4), task(9));
        let decoded = roundtrip(&index);
        assert_eq!(sorted_dependents(&decoded, 0, 1), vec![5]);
        assert_eq!(sorted_dependents(&decoded, 0, 2), Vec::<u32>::new());
        // A cell with only transient dependents isn't encoded at all.
        assert!(!decoded.contains_key(&cell(1)));
        assert_eq!(sorted_dependents(&decoded, 2, 4), vec![9]);
    }

    #[test]
    fn drop_partial_keeps_transient_dependents_and_merge_restore_unions() {
        let mut index = KeyedDependentsIndex::default();
        index.insert(cell(0), CellKey::hash(1), task(5));
        index.insert(cell(0), CellKey::hash(1), task(TRANSIENT | 7));
        index.insert(cell(0), CellKey::hash(2), task(TRANSIENT | 8));
        index.insert(cell(2), CellKey::hash(4), task(9));
        let persisted = roundtrip(&index);

        assert!(matches!(
            index.drop_partial(),
            DropPartialOutcome::HasResidue
        ));
        assert_eq!(sorted_dependents(&index, 0, 1), vec![TRANSIENT | 7]);
        assert_eq!(sorted_dependents(&index, 0, 2), vec![TRANSIENT | 8]);
        assert!(!index.contains_key(&cell(2)));

        index.merge_restore(persisted);
        assert_eq!(sorted_dependents(&index, 0, 1), vec![5, TRANSIENT | 7]);
        assert_eq!(sorted_dependents(&index, 0, 2), vec![TRANSIENT | 8]);
        assert_eq!(sorted_dependents(&index, 2, 4), vec![9]);

        let mut only_persistent = KeyedDependentsIndex::default();
        only_persistent.insert(cell(0), CellKey::hash(1), task(5));
        assert!(matches!(
            only_persistent.drop_partial(),
            DropPartialOutcome::Empty
        ));
    }
}
