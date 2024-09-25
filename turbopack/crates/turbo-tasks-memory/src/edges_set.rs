use std::{hash::BuildHasherDefault, mem::replace};

use auto_hash_map::{map::Entry, AutoMap, AutoSet};
use either::Either;
use rustc_hash::FxHasher;
use smallvec::SmallVec;
use turbo_tasks::{CellId, TaskId, TraitTypeId, ValueTypeId};

#[derive(Hash, Copy, Clone, PartialEq, Eq)]
pub enum TaskEdge {
    Output(TaskId),
    Cell(TaskId, CellId),
    Collectibles(TaskId, TraitTypeId),
    Child(TaskId),
}

impl TaskEdge {
    fn task_and_edge_entry(self) -> (TaskId, EdgeEntry) {
        match self {
            TaskEdge::Output(task) => (task, EdgeEntry::Output),
            TaskEdge::Cell(task, cell_id) => (task, EdgeEntry::Cell(cell_id)),
            TaskEdge::Collectibles(task, trait_type_id) => {
                (task, EdgeEntry::Collectibles(trait_type_id))
            }
            TaskEdge::Child(task) => (task, EdgeEntry::Child),
        }
    }
}

#[derive(Hash, Copy, Clone, PartialEq, Eq, Debug)]
enum EdgeEntry {
    Output,
    Child,
    Cell(CellId),
    Collectibles(TraitTypeId),
}

impl EdgeEntry {
    fn into_dependency(self, task: TaskId) -> TaskEdge {
        match self {
            EdgeEntry::Output => TaskEdge::Output(task),
            EdgeEntry::Cell(cell_id) => TaskEdge::Cell(task, cell_id),
            EdgeEntry::Collectibles(trait_type_id) => TaskEdge::Collectibles(task, trait_type_id),
            EdgeEntry::Child => TaskEdge::Child(task),
        }
    }
}

type ComplexSet = AutoSet<EdgeEntry, BuildHasherDefault<FxHasher>, 9>;

/// Represents a set of [`EdgeEntry`]s for an individual task, where common
/// cases are stored using compact representations.
#[derive(Debug)]
enum EdgesDataEntry {
    Empty,
    Output,
    Child,
    ChildAndOutput,
    Cell0(ValueTypeId),
    ChildAndCell0(ValueTypeId),
    OutputAndCell0(ValueTypeId),
    ChildOutputAndCell0(ValueTypeId),
    Complex(Box<ComplexSet>),
}

impl EdgesDataEntry {
    fn from(entry: EdgeEntry) -> Self {
        match entry {
            EdgeEntry::Output => EdgesDataEntry::Output,
            EdgeEntry::Child => EdgesDataEntry::Child,
            EdgeEntry::Cell(CellId { type_id, index }) => {
                if index == 0 {
                    EdgesDataEntry::Cell0(type_id)
                } else {
                    let mut set = AutoSet::default();
                    set.insert(EdgeEntry::Cell(CellId { type_id, index }));
                    EdgesDataEntry::Complex(Box::new(set))
                }
            }
            EdgeEntry::Collectibles(trait_type_id) => {
                let mut set = AutoSet::default();
                set.insert(EdgeEntry::Collectibles(trait_type_id));
                EdgesDataEntry::Complex(Box::new(set))
            }
        }
    }

    fn into_iter(self) -> impl Iterator<Item = EdgeEntry> {
        match self {
            EdgesDataEntry::Empty => unreachable!(),
            EdgesDataEntry::Output => Either::Left(Either::Left([EdgeEntry::Output].into_iter())),
            EdgesDataEntry::Child => Either::Left(Either::Left([EdgeEntry::Child].into_iter())),
            EdgesDataEntry::Cell0(type_id) => Either::Left(Either::Left(
                [EdgeEntry::Cell(CellId { type_id, index: 0 })].into_iter(),
            )),
            EdgesDataEntry::ChildAndOutput => Either::Left(Either::Right(
                [EdgeEntry::Child, EdgeEntry::Output].into_iter(),
            )),
            EdgesDataEntry::ChildAndCell0(type_id) => Either::Left(Either::Right(
                [
                    EdgeEntry::Child,
                    EdgeEntry::Cell(CellId { type_id, index: 0 }),
                ]
                .into_iter(),
            )),
            EdgesDataEntry::OutputAndCell0(type_id) => Either::Left(Either::Right(
                [
                    EdgeEntry::Output,
                    EdgeEntry::Cell(CellId { type_id, index: 0 }),
                ]
                .into_iter(),
            )),
            EdgesDataEntry::ChildOutputAndCell0(type_id) => Either::Right(Either::Left(
                [
                    EdgeEntry::Child,
                    EdgeEntry::Output,
                    EdgeEntry::Cell(CellId { type_id, index: 0 }),
                ]
                .into_iter(),
            )),
            EdgesDataEntry::Complex(set) => Either::Right(Either::Right(set.into_iter())),
        }
    }

    fn iter(&self) -> impl Iterator<Item = EdgeEntry> + '_ {
        match self {
            EdgesDataEntry::Empty => unreachable!(),
            EdgesDataEntry::Output => Either::Left(Either::Left([EdgeEntry::Output].into_iter())),
            EdgesDataEntry::Child => Either::Left(Either::Left([EdgeEntry::Child].into_iter())),
            EdgesDataEntry::Cell0(type_id) => Either::Left(Either::Left(
                [EdgeEntry::Cell(CellId {
                    type_id: *type_id,
                    index: 0,
                })]
                .into_iter(),
            )),
            EdgesDataEntry::ChildAndOutput => Either::Left(Either::Right(
                [EdgeEntry::Child, EdgeEntry::Output].into_iter(),
            )),
            EdgesDataEntry::ChildAndCell0(type_id) => Either::Left(Either::Right(
                [
                    EdgeEntry::Child,
                    EdgeEntry::Cell(CellId {
                        type_id: *type_id,
                        index: 0,
                    }),
                ]
                .into_iter(),
            )),
            EdgesDataEntry::OutputAndCell0(type_id) => Either::Left(Either::Right(
                [
                    EdgeEntry::Output,
                    EdgeEntry::Cell(CellId {
                        type_id: *type_id,
                        index: 0,
                    }),
                ]
                .into_iter(),
            )),
            EdgesDataEntry::ChildOutputAndCell0(type_id) => Either::Right(Either::Left(
                [
                    EdgeEntry::Child,
                    EdgeEntry::Output,
                    EdgeEntry::Cell(CellId {
                        type_id: *type_id,
                        index: 0,
                    }),
                ]
                .into_iter(),
            )),
            EdgesDataEntry::Complex(set) => Either::Right(Either::Right(set.iter().copied())),
        }
    }

    fn has(&self, entry: EdgeEntry) -> bool {
        match (entry, self) {
            (
                EdgeEntry::Output,
                EdgesDataEntry::Output
                | EdgesDataEntry::OutputAndCell0(_)
                | EdgesDataEntry::ChildAndOutput
                | EdgesDataEntry::ChildOutputAndCell0(_),
            ) => true,
            (
                EdgeEntry::Child,
                EdgesDataEntry::Child
                | EdgesDataEntry::ChildAndOutput
                | EdgesDataEntry::ChildAndCell0(_)
                | EdgesDataEntry::ChildOutputAndCell0(_),
            ) => true,
            (
                EdgeEntry::Cell(cell_id),
                EdgesDataEntry::Cell0(type_id)
                | EdgesDataEntry::OutputAndCell0(type_id)
                | EdgesDataEntry::ChildAndCell0(type_id)
                | EdgesDataEntry::ChildOutputAndCell0(type_id),
            ) => cell_id.index == 0 && *type_id == cell_id.type_id,
            (entry, EdgesDataEntry::Complex(set)) => set.contains(&entry),
            _ => false,
        }
    }

    fn as_complex(&mut self) -> &mut ComplexSet {
        match self {
            EdgesDataEntry::Complex(set) => set,
            _ => {
                let items = replace(self, EdgesDataEntry::Output).into_iter().collect();
                *self = EdgesDataEntry::Complex(Box::new(items));
                let EdgesDataEntry::Complex(set) = self else {
                    unreachable!();
                };
                set
            }
        }
    }

    fn try_insert_without_complex(&mut self, entry: EdgeEntry) -> Result<bool, ()> {
        if self.has(entry) {
            return Ok(false);
        }
        match entry {
            EdgeEntry::Output => match self {
                EdgesDataEntry::Child => {
                    *self = EdgesDataEntry::ChildAndOutput;
                    return Ok(true);
                }
                EdgesDataEntry::Cell0(type_id) => {
                    *self = EdgesDataEntry::OutputAndCell0(*type_id);
                    return Ok(true);
                }
                EdgesDataEntry::ChildAndCell0(type_id) => {
                    *self = EdgesDataEntry::ChildOutputAndCell0(*type_id);
                    return Ok(true);
                }
                _ => {}
            },
            EdgeEntry::Child => match self {
                EdgesDataEntry::Output => {
                    *self = EdgesDataEntry::ChildAndOutput;
                    return Ok(true);
                }
                EdgesDataEntry::Cell0(type_id) => {
                    *self = EdgesDataEntry::ChildAndCell0(*type_id);
                    return Ok(true);
                }
                EdgesDataEntry::OutputAndCell0(type_id) => {
                    *self = EdgesDataEntry::ChildOutputAndCell0(*type_id);
                    return Ok(true);
                }
                _ => {}
            },
            EdgeEntry::Cell(type_id) => {
                let CellId { type_id, index } = type_id;
                if index == 0 {
                    match self {
                        EdgesDataEntry::Output => {
                            *self = EdgesDataEntry::OutputAndCell0(type_id);
                            return Ok(true);
                        }
                        EdgesDataEntry::Child => {
                            *self = EdgesDataEntry::ChildAndCell0(type_id);
                            return Ok(true);
                        }
                        EdgesDataEntry::ChildAndOutput => {
                            *self = EdgesDataEntry::ChildOutputAndCell0(type_id);
                            return Ok(true);
                        }
                        _ => {}
                    }
                }
            }
            EdgeEntry::Collectibles(_) => {}
        }
        Err(())
    }

    fn insert(&mut self, entry: EdgeEntry) -> bool {
        match self.try_insert_without_complex(entry) {
            Ok(true) => true,
            Ok(false) => false,
            Err(()) => self.as_complex().insert(entry),
        }
    }

    /// Removes the entry from the set, returning `true` if the entry was
    /// present. When the entry was removed, `self` might become `Empty` and
    /// must be removed.
    fn remove(&mut self, entry: EdgeEntry) -> bool {
        if !self.has(entry) {
            return false;
        }
        // We verified that the entry is present, so any non-complex case is easier to
        // handle
        match entry {
            EdgeEntry::Output => match self {
                EdgesDataEntry::Output => {
                    *self = EdgesDataEntry::Empty;
                    return true;
                }
                EdgesDataEntry::ChildAndOutput => {
                    *self = EdgesDataEntry::Child;
                    return true;
                }
                EdgesDataEntry::OutputAndCell0(type_id) => {
                    *self = EdgesDataEntry::Cell0(*type_id);
                    return true;
                }
                EdgesDataEntry::ChildOutputAndCell0(type_id) => {
                    *self = EdgesDataEntry::ChildAndCell0(*type_id);
                    return true;
                }
                _ => {}
            },
            EdgeEntry::Child => match self {
                EdgesDataEntry::Child => {
                    *self = EdgesDataEntry::Empty;
                    return true;
                }
                EdgesDataEntry::ChildAndOutput => {
                    *self = EdgesDataEntry::Output;
                    return true;
                }
                EdgesDataEntry::ChildAndCell0(type_id) => {
                    *self = EdgesDataEntry::Cell0(*type_id);
                    return true;
                }
                EdgesDataEntry::ChildOutputAndCell0(type_id) => {
                    *self = EdgesDataEntry::OutputAndCell0(*type_id);
                    return true;
                }
                _ => {}
            },
            EdgeEntry::Cell(cell_id) if cell_id.index == 0 => match self {
                EdgesDataEntry::Cell0(value_ty) if cell_id.type_id == *value_ty => {
                    *self = EdgesDataEntry::Empty;
                    return true;
                }
                EdgesDataEntry::OutputAndCell0(value_ty) if cell_id.type_id == *value_ty => {
                    *self = EdgesDataEntry::Output;
                    return true;
                }
                EdgesDataEntry::ChildAndCell0(value_ty) if cell_id.type_id == *value_ty => {
                    *self = EdgesDataEntry::Child;
                    return true;
                }
                EdgesDataEntry::ChildOutputAndCell0(value_ty) if cell_id.type_id == *value_ty => {
                    *self = EdgesDataEntry::ChildAndOutput;
                    return true;
                }
                _ => {}
            },
            EdgeEntry::Cell(_) | EdgeEntry::Collectibles(_) => {}
        }
        if let EdgesDataEntry::Complex(set) = self {
            if set.remove(&entry) {
                self.simplify();
                return true;
            }
        }
        false
    }

    fn shrink_to_fit(&mut self) {
        if let EdgesDataEntry::Complex(set) = self {
            set.shrink_to_fit();
        }
    }

    /// Simplifies the set by converting it to a more compact representation.
    /// When `self` becomes `Empty`, it must be removed.
    fn simplify(&mut self) {
        if let EdgesDataEntry::Complex(set) = self {
            match set.len() {
                0 => {
                    *self = EdgesDataEntry::Empty;
                }
                1..=3 => {
                    let mut iter = set.iter();
                    let first = iter.next().unwrap();
                    if matches!(
                        first,
                        EdgeEntry::Output
                            | EdgeEntry::Child
                            | EdgeEntry::Cell(CellId { index: 0, .. })
                    ) {
                        let mut new = EdgesDataEntry::from(*first);
                        for entry in iter {
                            if new.try_insert_without_complex(*entry).is_err() {
                                return;
                            }
                        }
                        *self = new;
                    }
                }
                _ => (),
            }
        }
    }
}

#[derive(Default, Debug)]
pub struct TaskEdgesSet {
    edges: AutoMap<TaskId, EdgesDataEntry, BuildHasherDefault<FxHasher>>,
}

impl TaskEdgesSet {
    pub fn new() -> Self {
        Self {
            edges: Default::default(),
        }
    }

    pub fn insert(&mut self, edge: TaskEdge) -> bool {
        let (task, edge) = edge.task_and_edge_entry();
        match self.edges.entry(task) {
            Entry::Occupied(mut entry) => {
                let entry = entry.get_mut();
                entry.insert(edge)
            }
            Entry::Vacant(entry) => {
                entry.insert(EdgesDataEntry::from(edge));
                true
            }
        }
    }

    pub fn shrink_to_fit(&mut self) {
        for entry in self.edges.values_mut() {
            entry.shrink_to_fit();
        }
        self.edges.shrink_to_fit();
    }

    pub fn is_empty(&self) -> bool {
        self.edges.is_empty()
    }

    pub fn into_list(self) -> TaskEdgesList {
        let mut edges = Vec::with_capacity(self.edges.len());
        self.edges.into_iter().for_each(|edge| edges.push(edge));
        TaskEdgesList {
            edges: edges.into_boxed_slice(),
        }
    }

    pub(crate) fn drain_children(&mut self) -> SmallVec<[TaskId; 6]> {
        let mut children = SmallVec::new();
        self.edges.retain(|&task, entry| match entry {
            EdgesDataEntry::Child => {
                children.push(task);
                false
            }
            EdgesDataEntry::ChildAndOutput => {
                children.push(task);
                *entry = EdgesDataEntry::Output;
                true
            }
            EdgesDataEntry::ChildAndCell0(type_id) => {
                children.push(task);
                *entry = EdgesDataEntry::Cell0(*type_id);
                true
            }
            EdgesDataEntry::ChildOutputAndCell0(type_id) => {
                children.push(task);
                *entry = EdgesDataEntry::OutputAndCell0(*type_id);
                true
            }
            EdgesDataEntry::Complex(set) => {
                if set.remove(&EdgeEntry::Child) {
                    children.push(task);
                    entry.simplify();
                    !matches!(entry, EdgesDataEntry::Empty)
                } else {
                    true
                }
            }
            _ => true,
        });
        children
    }

    /// Removes all dependencies from the passed `dependencies` argument
    pub(crate) fn remove_all(&mut self, dependencies: &TaskEdgesSet) {
        self.edges.retain(|task, entry| {
            if let Some(other) = dependencies.edges.get(task) {
                for item in other.iter() {
                    entry.remove(item);
                }
                !matches!(entry, EdgesDataEntry::Empty)
            } else {
                true
            }
        });
    }

    pub(crate) fn remove(&mut self, child_id: TaskEdge) -> bool {
        let (task, edge) = child_id.task_and_edge_entry();
        let Entry::Occupied(mut entry) = self.edges.entry(task) else {
            return false;
        };
        let edge_entry = entry.get_mut();
        if edge_entry.remove(edge) {
            if matches!(edge_entry, EdgesDataEntry::Empty) {
                entry.remove();
            }
            true
        } else {
            false
        }
    }

    pub fn children(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.edges.iter().filter_map(|(task, entry)| match entry {
            EdgesDataEntry::Child => Some(*task),
            EdgesDataEntry::ChildAndOutput => Some(*task),
            EdgesDataEntry::ChildAndCell0(_) => Some(*task),
            EdgesDataEntry::ChildOutputAndCell0(_) => Some(*task),
            EdgesDataEntry::Complex(set) => {
                if set.contains(&EdgeEntry::Child) {
                    Some(*task)
                } else {
                    None
                }
            }
            _ => None,
        })
    }
}

impl IntoIterator for TaskEdgesSet {
    type Item = TaskEdge;
    type IntoIter = impl Iterator<Item = TaskEdge>;

    fn into_iter(self) -> Self::IntoIter {
        self.edges
            .into_iter()
            .flat_map(|(task, entry)| entry.into_iter().map(move |e| e.into_dependency(task)))
    }
}

#[derive(Default)]
pub struct TaskEdgesList {
    edges: Box<[(TaskId, EdgesDataEntry)]>,
}

impl TaskEdgesList {
    pub fn into_set(self) -> TaskEdgesSet {
        TaskEdgesSet {
            edges: self.edges.into_vec().into_iter().collect(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.edges.is_empty()
    }

    pub fn children(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.edges.iter().filter_map(|(task, entry)| match entry {
            EdgesDataEntry::Child => Some(*task),
            EdgesDataEntry::ChildAndOutput => Some(*task),
            EdgesDataEntry::ChildAndCell0(_) => Some(*task),
            EdgesDataEntry::ChildOutputAndCell0(_) => Some(*task),
            EdgesDataEntry::Complex(set) => {
                if set.contains(&EdgeEntry::Child) {
                    Some(*task)
                } else {
                    None
                }
            }
            _ => None,
        })
    }
}

impl IntoIterator for TaskEdgesList {
    type Item = TaskEdge;
    type IntoIter = impl Iterator<Item = TaskEdge>;

    fn into_iter(self) -> Self::IntoIter {
        self.edges
            .into_vec()
            .into_iter()
            .flat_map(|(task, entry)| entry.into_iter().map(move |e| e.into_dependency(task)))
    }
}
