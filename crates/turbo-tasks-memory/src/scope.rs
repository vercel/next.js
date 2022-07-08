use std::{
    collections::{
        hash_map::{Entry, Keys},
        HashMap, HashSet,
    },
    fmt::{Debug, Display},
    hash::{BuildHasher, Hash, Hasher},
    ops::Deref,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
};

use event_listener::{Event, EventListener};
use turbo_tasks::TaskId;

use crate::MemoryBackend;

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

struct RawHasher(u64);
#[derive(Copy, Clone, Default)]
struct BuildRawHasher;

impl BuildHasher for BuildRawHasher {
    type Hasher = RawHasher;

    fn build_hasher(&self) -> Self::Hasher {
        RawHasher(0)
    }
}

impl Hasher for RawHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write_u64(&mut self, i: u64) {
        self.0 ^= i;
    }

    fn write_u32(&mut self, i: u32) {
        self.0 ^= i as u64;
    }

    fn write_usize(&mut self, i: usize) {
        self.0 ^= i as u64;
    }

    fn write(&mut self, _bytes: &[u8]) {
        panic!("RawHasher is only usable with u32 or u64")
    }
}

#[derive(Clone, Debug)]
pub enum TaskScopes {
    Root(TaskScopeId),
    Inner(TaskScopeList),
}

impl Default for TaskScopes {
    fn default() -> Self {
        TaskScopes::Inner(TaskScopeList::default())
    }
}

impl TaskScopes {
    pub fn iter<'a>(&'a self) -> TaskScopesIterator<'a> {
        match self {
            TaskScopes::Root(r) => TaskScopesIterator::Root(*r),
            TaskScopes::Inner(list) => TaskScopesIterator::Inner(list.map.keys()),
        }
    }

    pub fn is_root(&self) -> bool {
        matches!(self, TaskScopes::Root(_))
    }
}

pub enum TaskScopesIterator<'a> {
    Done,
    Root(TaskScopeId),
    Inner(Keys<'a, TaskScopeId, usize>),
}

impl<'a> Iterator for TaskScopesIterator<'a> {
    type Item = TaskScopeId;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            TaskScopesIterator::Done => None,
            &mut TaskScopesIterator::Root(id) => {
                *self = TaskScopesIterator::Done;
                Some(id)
            }
            TaskScopesIterator::Inner(it) => it.next().copied(),
        }
    }
}

#[derive(Clone, Default)]
pub struct TaskScopeList {
    map: HashMap<TaskScopeId, usize, BuildRawHasher>,
}

impl Debug for TaskScopeList {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_list().entries(self.map.keys()).finish()
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum SetRootResult {
    New,
    Existing,
    AlreadyOtherRoot,
}
pub enum RemoveResult {
    NoEntry,
    Decreased,
    Removed,
}

impl TaskScopeList {
    pub fn len(&self) -> usize {
        self.map.len()
    }
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
    pub fn add(&mut self, id: TaskScopeId) -> bool {
        match self.map.entry(id) {
            Entry::Occupied(mut e) => {
                *e.get_mut() += 1;
                false
            }
            Entry::Vacant(e) => {
                e.insert(1);
                true
            }
        }
    }
    pub fn remove(&mut self, id: TaskScopeId) -> RemoveResult {
        match self.map.entry(id) {
            Entry::Occupied(mut e) => {
                let value = e.get_mut();
                *value -= 1;
                if *value == 0 {
                    e.remove();
                    RemoveResult::Removed
                } else {
                    RemoveResult::Decreased
                }
            }
            Entry::Vacant(_) => RemoveResult::NoEntry,
        }
    }

    pub fn iter<'a>(&'a self) -> impl Iterator<Item = TaskScopeId> + 'a {
        self.map.keys().copied()
    }

    pub fn into_scopes(self) -> impl Iterator<Item = (TaskScopeId, usize)> {
        self.map.into_iter()
    }
}

pub struct TaskScope {
    /// Total number of tasks
    tasks: AtomicUsize,
    /// Number of tasks that are not Done
    unfinished_tasks: AtomicUsize,
    /// Event that will be notified when all unfinished tasks are done
    event: Event,
    /// last (max) generation when an update to unfinished_tasks happened
    last_task_finish_generation: AtomicUsize,
    /// State that requires locking
    pub state: Mutex<TaskScopeState>,
}

pub struct TaskScopeState {
    #[cfg(feature = "print_scope_updates")]
    id: TaskScopeId,
    /// Number of active parents or tasks. Non-zero value means the scope is
    /// active
    active: usize,
    /// When not active, this list contains all dirty tasks.
    /// When the scope becomes active, these need to be scheduled.
    dirty_tasks: HashSet<TaskId>,
    /// All child scopes, when the scope becomes active, child scopes need to
    /// become active too
    children: HashMap<TaskScopeId, usize>,
}

impl TaskScope {
    pub fn new(id: TaskScopeId) -> Self {
        Self {
            tasks: AtomicUsize::new(0),
            unfinished_tasks: AtomicUsize::new(0),
            event: Event::new(),
            last_task_finish_generation: AtomicUsize::new(0),
            state: Mutex::new(TaskScopeState {
                #[cfg(feature = "print_scope_updates")]
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
            last_task_finish_generation: AtomicUsize::new(0),
            state: Mutex::new(TaskScopeState {
                #[cfg(feature = "print_scope_updates")]
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

    pub fn decrement_unfinished_tasks(&self, backend: &MemoryBackend) {
        let value = backend.flag_scope_change();
        let _ = self.last_task_finish_generation.fetch_update(
            Ordering::Relaxed,
            Ordering::Relaxed,
            |v| {
                if v < value {
                    Some(value)
                } else {
                    None
                }
            },
        );
        if self.unfinished_tasks.fetch_sub(1, Ordering::Release) == 1 {
            self.event.notify(usize::MAX);
        }
    }

    pub fn has_unfinished_tasks(
        &self,
        self_id: TaskScopeId,
        backend: &MemoryBackend,
    ) -> Option<EventListener> {
        'restart: loop {
            // There would be a race condition when we check scopes in a certain
            // order. e. g. we check A before B, without locking both at the same
            // time. But it can happen that a change propagates from B to A in the
            // meantime, which means we would miss the unfinished work. In this case
            // we would not get the strongly consistent guarantee. To counter that
            // we introduce a global generation counter, which is incremented before
            // checking. When a task finishes (resp. unfinished_tasks is decreased) we must
            // also update the local generation counter to the global one. When
            // all tasks are finished the scope can no longer influence the unfinished work
            // of other scopes. By ensuring that all work has been finished before the start
            // of checking the whole tree, we ensure that all scopes are either done, or
            // contain unfinished work.
            // Note that a change can propagate into any direction: from parent to child,
            // from child to parent and from siblings. Also through multiple
            // layers.
            let start_generation = backend.acquire_scope_generation();
            let mut checked_scopes = HashSet::new();
            if self.unfinished_tasks.load(Ordering::Acquire) != 0 {
                let listener = self.event.listen();
                if self.unfinished_tasks.load(Ordering::Relaxed) != 0 {
                    return Some(listener);
                }
            }
            if self.last_task_finish_generation.load(Ordering::Relaxed) > start_generation {
                continue 'restart;
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
                match backend.with_scope(id, |scope| {
                    if self.unfinished_tasks.load(Ordering::Acquire) != 0 {
                        let listener = scope.event.listen();
                        if self.unfinished_tasks.load(Ordering::Relaxed) != 0 {
                            return Ok(Some(listener));
                        }
                    }
                    if self.last_task_finish_generation.load(Ordering::Relaxed) > start_generation {
                        return Err(());
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
                    Ok(None)
                }) {
                    Ok(Some(listener)) => {
                        return Some(listener);
                    }
                    Ok(None) => {}
                    Err(()) => continue 'restart,
                }
            }
            return None;
        }
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
                #[cfg(feature = "print_scope_updates")]
                println!("add_child {} -> {}", *self.id, *child);
                e.insert(1);
                self.active > 0
            }
        }
    }

    /// Add a child scope. Returns true, when the child scope need to have it's
    /// active counter increased.
    #[must_use]
    pub fn add_child_count(&mut self, child: TaskScopeId, count: usize) -> bool {
        match self.children.entry(child) {
            Entry::Occupied(mut e) => {
                *e.get_mut() += count;
                false
            }
            Entry::Vacant(e) => {
                #[cfg(feature = "print_scope_updates")]
                println!("add_child {} -> {}", *self.id, *child);
                e.insert(count);
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
                    e.remove();
                    #[cfg(feature = "print_scope_updates")]
                    println!("remove_child {} -> {}", *self.id, *child);
                    self.active > 0
                } else {
                    false
                }
            }
            Entry::Vacant(_) => {
                panic!("A child scope was removed that was never added")
            }
        }
    }

    pub fn add_dirty_task(&mut self, id: TaskId) {
        self.dirty_tasks.insert(id);
    }

    pub fn remove_dirty_task(&mut self, id: TaskId) {
        self.dirty_tasks.remove(&id);
    }
}
