use std::{
    collections::{HashMap, HashSet},
    fmt::{Debug, Display},
    hash::Hash,
    mem::take,
    ops::Deref,
    sync::atomic::{AtomicUsize, Ordering},
};

use event_listener::{Event, EventListener};
use nohash_hasher::BuildNoHashHasher;
use parking_lot::Mutex;
use turbo_tasks::{RawVc, TaskId, TraitTypeId};

use crate::{
    count_hash_set::{CountHashSet, CountHashSetIter},
    task::{Task, TaskDependency},
    MemoryBackend,
};

macro_rules! log_scope_update {
    ($($args:expr),+) => {
        #[cfg(feature = "print_scope_updates")]
        println!($($args),+);
    };
}

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

impl nohash_hasher::IsEnabled for TaskScopeId {}

#[derive(Clone, Debug)]
pub enum TaskScopes {
    Root(TaskScopeId),
    /// inner scopes and a counter for changes to start optimized when a
    /// threshold is reached
    Inner(
        CountHashSet<TaskScopeId, BuildNoHashHasher<TaskScopeId>>,
        usize,
    ),
}

impl Default for TaskScopes {
    fn default() -> Self {
        TaskScopes::Inner(CountHashSet::default(), 0)
    }
}

impl TaskScopes {
    pub fn iter(&self) -> TaskScopesIterator {
        match self {
            TaskScopes::Root(r) => TaskScopesIterator::Root(*r),
            TaskScopes::Inner(set, _) => TaskScopesIterator::Inner(set.iter()),
        }
    }

    pub fn is_root(&self) -> bool {
        matches!(self, TaskScopes::Root(_))
    }
}

pub enum TaskScopesIterator<'a> {
    Done,
    Root(TaskScopeId),
    Inner(CountHashSetIter<'a, TaskScopeId>),
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

pub struct TaskScope {
    #[cfg(feature = "print_scope_updates")]
    pub id: TaskScopeId,
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
    pub id: TaskScopeId,
    /// Number of active parents or tasks. Non-zero value means the scope is
    /// active
    active: isize,
    /// When not active, this list contains all dirty tasks.
    /// When the scope becomes active, these need to be scheduled.
    dirty_tasks: HashSet<TaskId>,
    /// All child scopes, when the scope becomes active, child scopes need to
    /// become active too
    children: CountHashSet<TaskScopeId, BuildNoHashHasher<TaskScopeId>>,
    /// Tasks that have read children
    /// When they change these tasks are invalidated
    dependent_tasks: HashSet<TaskId>,
    /// Emitted collectibles with count and dependent_tasks by trait type
    collectibles: HashMap<TraitTypeId, (CountHashSet<RawVc>, HashSet<TaskId>)>,
}

impl TaskScope {
    #[allow(unused_variables)]
    pub fn new(id: TaskScopeId, tasks: usize) -> Self {
        Self {
            #[cfg(feature = "print_scope_updates")]
            id,
            tasks: AtomicUsize::new(tasks),
            unfinished_tasks: AtomicUsize::new(0),
            event: Event::new(),
            last_task_finish_generation: AtomicUsize::new(0),
            state: Mutex::new(TaskScopeState {
                #[cfg(feature = "print_scope_updates")]
                id,
                active: 0,
                dirty_tasks: HashSet::new(),
                children: CountHashSet::new(),
                collectibles: HashMap::new(),
                dependent_tasks: HashSet::new(),
            }),
        }
    }

    #[allow(unused_variables)]
    pub fn new_active(id: TaskScopeId, tasks: usize, unfinished: usize) -> Self {
        Self {
            #[cfg(feature = "print_scope_updates")]
            id,
            tasks: AtomicUsize::new(tasks),
            unfinished_tasks: AtomicUsize::new(unfinished),
            event: Event::new(),
            last_task_finish_generation: AtomicUsize::new(0),
            state: Mutex::new(TaskScopeState {
                #[cfg(feature = "print_scope_updates")]
                id,
                active: 1,
                dirty_tasks: HashSet::new(),
                children: CountHashSet::new(),
                collectibles: HashMap::new(),
                dependent_tasks: HashSet::new(),
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
        self.unfinished_tasks.fetch_add(1, Ordering::AcqRel);
    }

    pub fn decrement_unfinished_tasks(&self, backend: &MemoryBackend) {
        let old_count = self.unfinished_tasks.fetch_sub(1, Ordering::AcqRel);
        debug_assert!(old_count > 0);
        if old_count == 1 {
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
                .children
                .iter()
                .copied()
                .inspect(|i| {
                    checked_scopes.insert(*i);
                })
                .collect::<Vec<_>>();
            log_scope_update!("has_unfinished_tasks {} -> {:?}", *self.id, queue);
            while let Some(id) = queue.pop() {
                match backend.with_scope(id, |scope| {
                    if scope.unfinished_tasks.load(Ordering::Acquire) != 0 {
                        let listener = scope.event.listen();
                        if scope.unfinished_tasks.load(Ordering::Relaxed) != 0 {
                            return Ok(Some(listener));
                        }
                    }
                    if scope.last_task_finish_generation.load(Ordering::Relaxed) > start_generation
                    {
                        return Err(());
                    }
                    let scope = scope.state.lock();
                    queue.extend(
                        scope
                            .children
                            .iter()
                            .copied()
                            .filter(|i| checked_scopes.insert(*i)),
                    );
                    log_scope_update!(
                        "has_unfinished_tasks {} -> {:?}",
                        *scope.id,
                        scope
                            .children
                            .iter()
                            .copied()
                            .filter(|i| !checked_scopes.contains(i))
                            .collect::<Vec<_>>()
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
            log_scope_update!("has_unfinished_tasks done {}", *self.id);
            return None;
        }
    }

    pub fn read_collectibles(
        &self,
        self_id: TaskScopeId,
        trait_id: TraitTypeId,
        reader: TaskId,
        backend: &MemoryBackend,
    ) -> HashSet<RawVc> {
        let collectibles = self.read_collectibles_recursive(
            self_id,
            trait_id,
            reader,
            backend,
            &mut HashMap::with_hasher(BuildNoHashHasher::default()),
        );
        HashSet::from_iter(collectibles.iter().copied())
    }

    fn read_collectibles_recursive(
        &self,
        self_id: TaskScopeId,
        trait_id: TraitTypeId,
        reader: TaskId,
        backend: &MemoryBackend,
        cache: &mut HashMap<TaskScopeId, CountHashSet<RawVc>, BuildNoHashHasher<TaskScopeId>>,
    ) -> CountHashSet<RawVc> {
        // TODO add reverse edges from task to scopes and (scope, trait_id)
        let mut state = self.state.lock();
        let children = state.children.iter().copied().collect::<Vec<_>>();
        state.dependent_tasks.insert(reader);
        Task::add_dependency_to_current(TaskDependency::ScopeChildren(self_id));

        let mut current = {
            let (c, dependent_tasks) = state.collectibles.entry(trait_id).or_default();
            dependent_tasks.insert(reader);
            Task::add_dependency_to_current(TaskDependency::ScopeCollectibles(self_id, trait_id));
            c.clone()
        };
        drop(state);

        for id in children {
            backend.with_scope(id, |scope| {
                let child = if let Some(cached) = cache.get(&id) {
                    cached
                } else {
                    let child =
                        scope.read_collectibles_recursive(id, trait_id, reader, backend, cache);
                    cache.entry(id).or_insert(child)
                };
                for v in child.iter() {
                    current.add(*v);
                }
            })
        }

        current
    }

    pub(crate) fn remove_dependent_task(&self, reader: TaskId) {
        let mut state = self.state.lock();
        state.dependent_tasks.remove(&reader);
    }

    pub(crate) fn remove_collectible_dependent_task(
        &self,
        trait_type: TraitTypeId,
        reader: TaskId,
    ) {
        let mut state = self.state.lock();
        if let Some((_, dependent_tasks)) = state.collectibles.get_mut(&trait_type) {
            dependent_tasks.remove(&reader);
        }
    }
}

pub struct ScopeChildChangeEffect {
    pub notify: HashSet<TaskId>,
    pub active: bool,
}

pub struct ScopeCollectibleChangeEffect {
    pub notify: HashSet<TaskId>,
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
        let was_zero = self.active <= 0;
        self.active += count as isize;
        if self.active > 0 && was_zero {
            more_jobs.extend(self.children.iter().copied());
            Some(self.dirty_tasks.iter().copied().collect())
        } else {
            None
        }
    }
    /// decrement the active counter, returns list of child scopes that need to
    /// be decremented after releasing the scope lock
    pub fn decrement_active(&mut self, more_jobs: &mut Vec<TaskScopeId>) {
        self.decrement_active_by(1, more_jobs);
    }
    /// decrement the active counter, returns list of child scopes that need to
    /// be decremented after releasing the scope lock
    pub fn decrement_active_by(&mut self, count: usize, more_jobs: &mut Vec<TaskScopeId>) {
        let was_positive = self.active > 0;
        self.active -= count as isize;
        if self.active <= 0 && was_positive {
            more_jobs.extend(self.children.iter().copied());
        }
    }

    /// Add a child scope. Returns true, when the child scope need to have it's
    /// active counter increased.
    #[must_use]
    pub fn add_child(&mut self, child: TaskScopeId) -> Option<ScopeChildChangeEffect> {
        self.add_child_count(child, 1)
    }

    /// Add a child scope. Returns true, when the child scope need to have it's
    /// active counter increased.
    #[must_use]
    pub fn add_child_count(
        &mut self,
        child: TaskScopeId,
        count: usize,
    ) -> Option<ScopeChildChangeEffect> {
        if self.children.add_count(child, count) {
            log_scope_update!("add_child {} -> {}", *self.id, *child);
            Some(ScopeChildChangeEffect {
                notify: self.take_dependent_tasks(),
                active: self.active > 0,
            })
        } else {
            None
        }
    }

    /// Removes a child scope. Returns true, when the child scope need to have
    /// it's active counter decreased.
    #[must_use]
    pub fn remove_child(&mut self, child: TaskScopeId) -> Option<ScopeChildChangeEffect> {
        self.remove_child_count(child, 1)
    }

    /// Removes a child scope. Returns true, when the child scope need to have
    /// it's active counter decreased.
    #[must_use]
    pub fn remove_child_count(
        &mut self,
        child: TaskScopeId,
        count: usize,
    ) -> Option<ScopeChildChangeEffect> {
        if self.children.remove_count(child, count) {
            log_scope_update!("remove_child {} -> {}", *self.id, *child);
            Some(ScopeChildChangeEffect {
                notify: self.take_dependent_tasks(),
                active: self.active > 0,
            })
        } else {
            None
        }
    }

    pub fn add_dirty_task(&mut self, id: TaskId) {
        self.dirty_tasks.insert(id);
        log_scope_update!("add_dirty_task {} -> {}", *self.id, *id);
    }

    pub fn remove_dirty_task(&mut self, id: TaskId) {
        self.dirty_tasks.remove(&id);
        log_scope_update!("remove_dirty_task {} -> {}", *self.id, *id);
    }

    /// Adds a colletible to the scope.
    /// Returns true when it was initially added and dependent_tasks should be
    /// notified.
    #[must_use]
    pub fn add_collectible(
        &mut self,

        trait_id: TraitTypeId,
        collectible: RawVc,
    ) -> Option<ScopeCollectibleChangeEffect> {
        self.add_collectible_count(trait_id, collectible, 1)
    }

    /// Adds a colletible to the scope.
    /// Returns true when it was initially added and dependent_tasks should be
    /// notified.
    #[must_use]
    pub fn add_collectible_count(
        &mut self,
        trait_id: TraitTypeId,
        collectible: RawVc,
        count: usize,
    ) -> Option<ScopeCollectibleChangeEffect> {
        let (collectibles, dependent_tasks) = self.collectibles.entry(trait_id).or_default();
        if collectibles.add_count(collectible, count) {
            log_scope_update!("add_collectible {} -> {}", *self.id, collectible);
            Some(ScopeCollectibleChangeEffect {
                notify: take(dependent_tasks),
            })
        } else {
            None
        }
    }

    /// Removes a colletible from the scope.
    /// Returns true when is was fully removed and dependent_tasks should be
    /// notified.
    #[must_use]
    pub fn remove_collectible(
        &mut self,
        trait_id: TraitTypeId,
        collectible: RawVc,
    ) -> Option<ScopeCollectibleChangeEffect> {
        self.remove_collectible_count(trait_id, collectible, 1)
    }

    /// Removes a colletible from the scope.
    /// Returns true when is was fully removed and dependent_tasks should be
    /// notified.
    #[must_use]
    pub fn remove_collectible_count(
        &mut self,
        trait_id: TraitTypeId,
        collectible: RawVc,
        count: usize,
    ) -> Option<ScopeCollectibleChangeEffect> {
        let (collectibles, dependent_tasks) = self.collectibles.entry(trait_id).or_default();
        if collectibles.remove_count(collectible, count) {
            log_scope_update!("remove_collectible {} -> {}", *self.id, collectible);
            Some(ScopeCollectibleChangeEffect {
                notify: take(dependent_tasks),
            })
        } else {
            None
        }
    }

    pub fn take_dependent_tasks(&mut self) -> HashSet<TaskId> {
        take(&mut self.dependent_tasks)
    }
}
