use std::{
    collections::{hash_map::Entry, HashMap, HashSet},
    fmt::{Debug, Display},
    ops::Deref,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
};

use event_listener::{Event, EventListener};
use turbo_tasks::TaskId;

use crate::MemoryBackend;

const MAX_SCOPES: u8 = 10;

#[derive(Hash, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct TaskScopeId {
    id: usize,
}

impl Display for TaskScopeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "TaskScopeId {}", self.id)
    }
}

impl Debug for TaskScopeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "TaskScopeId {}", self.id)
    }
}

impl Deref for TaskScopeId {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.id
    }
}

impl From<usize> for TaskScopeId {
    fn from(id: usize) -> Self {
        Self { id }
    }
}

#[derive(Clone)]
pub struct TaskScopeList {
    pub root: Option<TaskScopeId>,
    length: u8,
    list: [(TaskScopeId, usize); MAX_SCOPES as usize],
}

#[derive(Debug, PartialEq, Eq)]
pub enum SetRootResult {
    New,
    Existing,
    AlreadyOtherRoot,
}
pub enum AddResult {
    Root,
    Existing,
    New,
    Full,
}
pub enum RemoveResult {
    Root,
    NoEntry,
    Decreased,
    Removed,
}
pub enum ContainsResult {
    Root,
    Entry,
    NoEntry,
}

impl TaskScopeList {
    pub fn len(&self) -> u8 {
        self.length
    }
    pub fn set_root(&mut self, id: TaskScopeId) -> SetRootResult {
        if let Some(existing) = self.root {
            if existing == id {
                SetRootResult::Existing
            } else {
                SetRootResult::AlreadyOtherRoot
            }
        } else {
            self.root = Some(id);
            SetRootResult::New
        }
    }
    pub fn try_add(&mut self, id: TaskScopeId) -> AddResult {
        if self.root == Some(id) {
            return AddResult::Root;
        }
        for i in 0..self.length {
            let item = &mut self.list[i as usize];
            if item.0 == id {
                item.1 += 1;
                return AddResult::Existing;
            }
        }
        if self.length == MAX_SCOPES {
            return AddResult::Full;
        }
        self.list[self.length as usize] = (id, 1);
        self.length += 1;
        AddResult::New
    }
    pub fn remove(&mut self, id: TaskScopeId) -> RemoveResult {
        if self.root == Some(id) {
            return RemoveResult::Root;
        }
        for i in 0..self.length {
            let (item_id, ref mut count) = self.list[i as usize];
            if item_id == id {
                *count -= 1;
                if *count == 0 {
                    if i != self.length - 1 {
                        self.list[i as usize] = self.list[(self.length - 1) as usize];
                    }
                    self.length -= 1;
                    return RemoveResult::Removed;
                } else {
                    return RemoveResult::Decreased;
                }
            }
        }
        RemoveResult::NoEntry
    }
    pub fn contains(&self, id: TaskScopeId) -> ContainsResult {
        if self.root == Some(id) {
            return ContainsResult::Root;
        }
        for i in 0..self.length {
            if self.list[i as usize].0 == id {
                return ContainsResult::Entry;
            }
        }
        ContainsResult::NoEntry
    }
    pub fn iter<'a>(&'a self) -> TaskScopeListIterator<'a> {
        TaskScopeListIterator {
            root: self.root,
            i: 0,
            count: self.length,
            list: &self.list,
        }
    }
    pub fn iter_non_root<'a>(&'a self) -> TaskScopeListIterator<'a> {
        TaskScopeListIterator {
            root: None,
            i: 0,
            count: self.length,
            list: &self.list,
        }
    }
}

impl Default for TaskScopeList {
    fn default() -> Self {
        Self {
            root: None,
            length: 0,
            list: [(TaskScopeId::from(0), 0); MAX_SCOPES as usize],
        }
    }
}

pub struct TaskScopeListIterator<'a> {
    root: Option<TaskScopeId>,
    i: u8,
    count: u8,
    list: &'a [(TaskScopeId, usize); MAX_SCOPES as usize],
}

impl<'a> Iterator for TaskScopeListIterator<'a> {
    type Item = TaskScopeId;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some(root) = self.root {
            self.root = None;
            return Some(root);
        }
        if self.i == self.count {
            return None;
        }
        let item = self.list[self.i as usize].0;
        self.i += 1;
        Some(item)
    }
}

pub struct TaskScope {
    /// Total number of tasks
    tasks: AtomicUsize,
    /// Number of tasks that are not Done
    unfinished_tasks: AtomicUsize,
    /// Event that will be notified when all unfinished tasks are done
    event: Event,
    /// State that requires locking
    pub state: Mutex<TaskScopeState>,
}

pub struct TaskScopeState {
    id: TaskScopeId,
    /// Number of active parents or tasks. Non-zero value means the scope is
    /// active
    active: usize,
    /// When not active, this list contains all dirty tasks.
    /// When the scope becomes active, these need to be scheduled.
    pub dirty_tasks: HashSet<TaskId>,
    /// All child scopes, when the scope becomes active, child scopes need to
    /// become active too
    pub children: HashMap<TaskScopeId, usize>,
}

impl TaskScope {
    pub fn new(id: TaskScopeId) -> Self {
        Self {
            tasks: AtomicUsize::new(0),
            unfinished_tasks: AtomicUsize::new(0),
            event: Event::new(),
            state: Mutex::new(TaskScopeState {
                id,
                active: 0,
                dirty_tasks: HashSet::new(),
                children: HashMap::new(),
            }),
        }
    }

    pub fn new_active(id: TaskScopeId) -> Self {
        Self {
            tasks: AtomicUsize::new(0),
            unfinished_tasks: AtomicUsize::new(0),
            event: Event::new(),
            state: Mutex::new(TaskScopeState {
                id,
                active: 1,
                dirty_tasks: HashSet::new(),
                children: HashMap::new(),
            }),
        }
    }

    pub fn increment_tasks(&self) {
        self.tasks.fetch_add(1, Ordering::Relaxed);
    }

    pub fn decrement_tasks(&self) {
        self.tasks.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_unfinished_tasks(&self) {
        self.unfinished_tasks.fetch_add(1, Ordering::Relaxed);
    }

    pub fn decrement_unfinished_tasks(&self) {
        if self.unfinished_tasks.fetch_sub(1, Ordering::Relaxed) == 1 {
            self.event.notify(usize::MAX);
        }
    }

    pub fn has_unfinished_tasks(
        &self,
        self_id: TaskScopeId,
        backend: &MemoryBackend,
    ) -> Option<EventListener> {
        // TODO currently this has a race condition since we check scopes in a certain
        // order. e. g. we check A before B, without locking both at the same
        // time. but it can happen that a change propagates from B to A in the
        // meantime, which means we would miss the unfinished work. In this case
        // we would not get the strongly consistent guarantee. To counter that
        // we introduce a global generation counter, which is incremented before
        // checking. Any change to unfinished_tasks must also update the local
        // generation counter to the global one. This means we can detect if any
        // scope has changed during our checking process and we can reset the process.
        // Note that a change can propagate into any direction: from parent to child,
        // from child to parent and from siblings. Also through multiple layers.
        let mut checked_scopes = HashSet::new();
        if self.unfinished_tasks.load(Ordering::Relaxed) != 0 {
            let listener = self.event.listen();
            if self.unfinished_tasks.load(Ordering::Acquire) != 0 {
                return Some(listener);
            }
        }
        checked_scopes.insert(self_id);
        let mut queue = self
            .state
            .lock()
            .unwrap()
            .children
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        while let Some(id) = queue.pop() {
            if let Some(listener) = backend.with_scope(id, |scope| {
                if self.unfinished_tasks.load(Ordering::Relaxed) != 0 {
                    let listener = scope.event.listen();
                    if self.unfinished_tasks.load(Ordering::Acquire) != 0 {
                        return Some(listener);
                    }
                }
                checked_scopes.insert(id);
                let scope = scope.state.lock().unwrap();
                queue.extend(
                    scope
                        .children
                        .keys()
                        .cloned()
                        .filter(|i| !checked_scopes.contains(i)),
                );
                None
            }) {
                return Some(listener);
            }
        }
        None
    }
}

impl TaskScopeState {
    pub fn is_active(&self) -> bool {
        self.active > 0
    }
    /// increments the active counter, returns list of tasks that need to be
    /// scheduled and list of child scope that need to be incremented after
    /// releasing the scope lock
    #[must_use]
    pub fn increment_active(&mut self, more_jobs: &mut Vec<TaskScopeId>) -> Option<Vec<TaskId>> {
        self.increment_active_by(1, more_jobs)
    }
    /// increments the active counter, returns list of tasks that need to be
    /// scheduled and list of child scope that need to be incremented after
    /// releasing the scope lock
    #[must_use]
    pub fn increment_active_by(
        &mut self,
        count: usize,
        more_jobs: &mut Vec<TaskScopeId>,
    ) -> Option<Vec<TaskId>> {
        let was_zero = self.active == 0;
        self.active += count;
        if was_zero {
            more_jobs.extend(self.children.keys().cloned());
            Some(self.dirty_tasks.iter().copied().collect())
        } else {
            None
        }
    }
    /// decrement the active counter, returns list of child scopes that need to
    /// be decremented after releasing the scope lock
    #[must_use]
    pub fn decrement_active(&mut self, more_jobs: &mut Vec<TaskScopeId>) {
        self.active -= 1;
        if self.active == 0 {
            more_jobs.extend(self.children.keys().cloned());
        }
    }

    /// Add a child scope. Returns true, when the child scope need to have it's
    /// active counter increased.
    #[must_use]
    pub fn add_child(&mut self, child: TaskScopeId) -> bool {
        match self.children.entry(child) {
            Entry::Occupied(mut e) => {
                *e.get_mut() += 1;
                false
            }
            Entry::Vacant(e) => {
                println!("add_child {} -> {}", *self.id, *child);
                e.insert(1);
                self.active > 0
            }
        }
    }

    /// Removes a child scope. Returns true, when the child scope need to have
    /// it's active counter decreased.
    #[must_use]
    pub fn remove_child(&mut self, child: TaskScopeId) -> bool {
        match self.children.entry(child) {
            Entry::Occupied(mut e) => {
                let value = e.get_mut();
                *value -= 1;
                if *value == 0 {
                    println!("remove_child {} -> {}", *self.id, *child);
                }
                *value == 0 && self.active > 0
            }
            Entry::Vacant(_) => {
                panic!("A child scope was removed that was never added")
            }
        }
    }
}
