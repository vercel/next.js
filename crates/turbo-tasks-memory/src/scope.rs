use std::{
    fmt::{Debug, Display},
    hash::Hash,
    mem::take,
    ops::Deref,
    sync::atomic::{AtomicIsize, AtomicUsize, Ordering},
};

use auto_hash_map::{map::Entry, AutoMap, AutoSet};
use nohash_hasher::BuildNoHashHasher;
use parking_lot::Mutex;
use turbo_tasks::{
    event::{Event, EventListener},
    RawVc, TaskId, TraitTypeId,
};

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

#[derive(Debug)]
pub struct TaskScope {
    #[cfg(feature = "print_scope_updates")]
    pub id: TaskScopeId,
    /// If true, this scope will propagate collectibles to parent scopes
    propagate_collectibles: bool,
    /// Total number of tasks
    tasks: AtomicUsize,
    /// Number of tasks that are not Done, unfinished child scopes also count as
    /// unfinished tasks. This value might temporarly become negative in race
    /// conditions.
    /// When this value crosses the 0 to 1 boundary, we need to look into
    /// potentially updating [TaskScopeState]::has_unfinished_tasks with a mutex
    /// lock. [TaskScopeState]::has_unfinished_tasks is the real truth, if a
    /// task scope has unfinished tasks.
    unfinished_tasks: AtomicIsize,
    /// State that requires locking
    pub state: Mutex<TaskScopeState>,
}

#[derive(Debug, Default)]
struct ScopeCollectiblesInfo {
    collectibles: CountHashSet<RawVc>,
    dependent_tasks: AutoSet<TaskId, BuildNoHashHasher<TaskId>>,
    read_collectibles_task: Option<TaskId>,
}

impl ScopeCollectiblesInfo {
    fn is_unset(&self) -> bool {
        self.collectibles.is_unset()
            && self.dependent_tasks.is_empty()
            && self.read_collectibles_task.is_none()
    }
}

#[derive(Debug)]
pub struct TaskScopeState {
    #[cfg(feature = "print_scope_updates")]
    pub id: TaskScopeId,
    /// Number of active parents or tasks. Non-zero value means the scope is
    /// active
    active: isize,
    /// When not active, this list contains all dirty tasks.
    /// When the scope becomes active, these need to be scheduled.
    dirty_tasks: AutoSet<TaskId, BuildNoHashHasher<TaskId>>,
    /// All child scopes, when the scope becomes active, child scopes need to
    /// become active too
    children: CountHashSet<TaskScopeId, BuildNoHashHasher<TaskScopeId>>,
    /// flag if this scope has unfinished tasks
    has_unfinished_tasks: bool,
    /// Event that will be notified when all unfinished tasks and children are
    /// done
    event: Event,
    /// All parent scopes
    pub parents: CountHashSet<TaskScopeId, BuildNoHashHasher<TaskScopeId>>,
    /// Tasks that have read children
    /// When they change these tasks are invalidated
    dependent_tasks: AutoSet<TaskId, BuildNoHashHasher<TaskId>>,
    /// Emitted collectibles with count and dependent_tasks by trait type
    collectibles: AutoMap<TraitTypeId, ScopeCollectiblesInfo, BuildNoHashHasher<TraitTypeId>>,
}

impl TaskScope {
    #[allow(unused_variables)]
    pub fn new(id: TaskScopeId, tasks: usize) -> Self {
        Self {
            #[cfg(feature = "print_scope_updates")]
            id,
            propagate_collectibles: true,
            tasks: AtomicUsize::new(tasks),
            unfinished_tasks: AtomicIsize::new(0),
            state: Mutex::new(TaskScopeState::new(
                #[cfg(feature = "print_scope_updates")]
                id,
                false,
            )),
        }
    }

    #[allow(unused_variables)]
    pub fn new_no_collectibles(id: TaskScopeId, tasks: usize) -> Self {
        Self {
            #[cfg(feature = "print_scope_updates")]
            id,
            propagate_collectibles: false,
            tasks: AtomicUsize::new(tasks),
            unfinished_tasks: AtomicIsize::new(tasks as isize),
            state: Mutex::new(TaskScopeState::new(
                #[cfg(feature = "print_scope_updates")]
                id,
                tasks > 0,
            )),
        }
    }

    #[allow(unused_variables)]
    pub fn new_active(id: TaskScopeId, tasks: usize, unfinished: usize) -> Self {
        Self {
            #[cfg(feature = "print_scope_updates")]
            id,
            propagate_collectibles: true,
            tasks: AtomicUsize::new(tasks),
            unfinished_tasks: AtomicIsize::new(unfinished as isize),
            state: Mutex::new(TaskScopeState::new_active(
                #[cfg(feature = "print_scope_updates")]
                id,
                tasks > 0,
            )),
        }
    }

    pub fn increment_tasks(&self) {
        self.tasks.fetch_add(1, Ordering::Relaxed);
    }

    pub fn decrement_tasks(&self) {
        self.tasks.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn increment_unfinished_tasks(&self, backend: &MemoryBackend) {
        if self.increment_unfinished_tasks_internal() {
            self.update_unfinished_state(backend);
        }
    }

    /// Returns true if the state requires an update
    #[must_use]
    fn increment_unfinished_tasks_internal(&self) -> bool {
        // crossing the 0 to 1 boundary requires an update
        // SAFETY: This need to sync with the unfinished_tasks load in
        // update_unfinished_state
        self.unfinished_tasks.fetch_add(1, Ordering::Release) == 0
    }

    pub fn decrement_unfinished_tasks(&self, backend: &MemoryBackend) {
        if self.decrement_unfinished_tasks_internal() {
            self.update_unfinished_state(backend);
        }
    }

    /// Returns true if the state requires an update
    #[must_use]
    fn decrement_unfinished_tasks_internal(&self) -> bool {
        // crossing the 0 to 1 boundary requires an update
        // SAFETY: This need to sync with the unfinished_tasks load in
        // update_unfinished_state
        self.unfinished_tasks.fetch_sub(1, Ordering::Release) == 1
    }

    pub fn add_parent(&self, parent: TaskScopeId, backend: &MemoryBackend) {
        {
            let mut state = self.state.lock();
            if !state.parents.add(parent) || !state.has_unfinished_tasks {
                return;
            }
        };
        // As we added a parent while having unfinished tasks we need to increment the
        // unfinished task count and potentially update the state
        backend.with_scope(parent, |parent| {
            let update = parent.increment_unfinished_tasks_internal();

            if update {
                parent.update_unfinished_state(backend);
            }
        });
    }

    /// Removes a parent from this scope, returns true if the scope parents are
    /// now empty and unset
    pub fn remove_parent(&self, parent: TaskScopeId, backend: &MemoryBackend) -> bool {
        let result = {
            let mut state = self.state.lock();
            if !state.parents.remove(parent) || !state.has_unfinished_tasks {
                return state.parents.is_unset();
            }
            state.parents.is_unset()
        };
        // As we removed a parent while having unfinished tasks we need to decrement the
        // unfinished task count and potentially update the state
        backend.with_scope(parent, |parent| {
            let update = parent.decrement_unfinished_tasks_internal();

            if update {
                parent.update_unfinished_state(backend);
            }
        });
        result
    }

    fn update_unfinished_state(&self, backend: &MemoryBackend) {
        let mut state = self.state.lock();
        // we need to load the atomic under the lock to ensure consistency
        let count = self.unfinished_tasks.load(Ordering::SeqCst);
        let has_unfinished_tasks = count > 0;
        let mut to_update = Vec::new();
        if state.has_unfinished_tasks != has_unfinished_tasks {
            state.has_unfinished_tasks = has_unfinished_tasks;
            if has_unfinished_tasks {
                to_update.extend(state.parents.iter().copied().filter(|parent| {
                    backend.with_scope(*parent, |scope| scope.increment_unfinished_tasks_internal())
                }));
            } else {
                state.event.notify(usize::MAX);
                to_update.extend(state.parents.iter().copied().filter(|parent| {
                    backend.with_scope(*parent, |scope| scope.decrement_unfinished_tasks_internal())
                }));
            }
        }
        drop(state);

        for scope in to_update {
            backend.with_scope(scope, |scope| scope.update_unfinished_state(backend));
        }
    }

    pub fn has_unfinished_tasks(&self) -> Option<EventListener> {
        let state = self.state.lock();
        if state.has_unfinished_tasks {
            Some(state.event.listen())
        } else {
            None
        }
    }

    pub fn read_collectibles_and_children(
        &self,
        self_id: TaskScopeId,
        trait_id: TraitTypeId,
        reader: TaskId,
    ) -> Result<(CountHashSet<RawVc>, Vec<TaskScopeId>), EventListener> {
        let mut state = self.state.lock();
        if state.has_unfinished_tasks {
            return Err(state.event.listen());
        }
        let children = state.children.iter().copied().collect::<Vec<_>>();
        state.dependent_tasks.insert(reader);
        Task::add_dependency_to_current(TaskDependency::ScopeChildren(self_id));

        let current = {
            let ScopeCollectiblesInfo {
                collectibles,
                dependent_tasks,
                ..
            } = state.collectibles.entry(trait_id).or_default();
            dependent_tasks.insert(reader);
            Task::add_dependency_to_current(TaskDependency::ScopeCollectibles(self_id, trait_id));
            collectibles.clone()
        };
        drop(state);

        Ok((current, children))
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
        if let Entry::Occupied(mut entry) = state.collectibles.entry(trait_type) {
            let info = entry.get_mut();
            info.dependent_tasks.remove(&reader);
            if info.is_unset() {
                entry.remove();
            }
        }
    }

    pub(crate) fn is_propagating_collectibles(&self) -> bool {
        self.propagate_collectibles
    }

    pub(crate) fn assert_unused(&self) {
        // This method checks if everything was cleaned up correctly
        // no more tasks should be attached to this scope in any way

        assert_eq!(
            self.tasks.load(Ordering::Acquire),
            0,
            "Scope tasks not correctly cleaned up"
        );
        assert_eq!(
            self.unfinished_tasks.load(Ordering::Acquire),
            0,
            "Scope unfinished tasks not correctly cleaned up"
        );
        let state = self.state.lock();
        assert!(
            state.dependent_tasks.is_empty(),
            "Scope dependent tasks not correctly cleaned up: {:?}",
            state.dependent_tasks
        );
        // TODO(WEB-615) read_collectibles_tasks need to be cleaned up
        // assert!(
        //     state.collectibles.is_empty(),
        //     "Scope collectibles not correctly cleaned up: {:?}",
        //     state.collectibles
        // );
        // assert!(
        // state.dirty_tasks.is_empty(),
        // "Scope dirty tasks not correctly cleaned up: {:?}",
        // state.dirty_tasks
        // );
        // TODO find the bug that causes dirty tasks to remain in the scope
        if !state.dirty_tasks.is_empty() {
            println!(
                "Scope dirty tasks not correctly cleaned up: {:?}",
                state.dirty_tasks
            );
        }
        assert!(
            state.children.is_empty(),
            "Scope children not correctly cleaned up: {:?}",
            state.children
        );
        assert!(
            state.parents.is_empty(),
            "Scope parents not correctly cleaned up: {:?}",
            state.parents
        );
        assert!(
            !state.has_unfinished_tasks,
            "Scope has unfinished tasks not correctly cleaned up"
        );
        assert_eq!(
            state.active, 0,
            "Scope active not correctly cleaned up: {}",
            state.active
        );
    }
}

pub struct ScopeChildChangeEffect {
    pub notify: AutoSet<TaskId, BuildNoHashHasher<TaskId>>,
    pub active: bool,
    /// `true` when the child to parent relationship needs to be updated
    pub parent: bool,
}

pub struct ScopeCollectibleChangeEffect {
    pub notify: AutoSet<TaskId, BuildNoHashHasher<TaskId>>,
}

impl TaskScopeState {
    /// creates a state that is not active
    fn new(
        #[cfg(feature = "print_scope_updates")] id: TaskScopeId,
        has_unfinished_tasks: bool,
    ) -> Self {
        Self {
            #[cfg(feature = "print_scope_updates")]
            id,
            active: 0,
            dirty_tasks: AutoSet::default(),
            children: CountHashSet::new(),
            collectibles: AutoMap::default(),
            dependent_tasks: AutoSet::default(),
            event: Event::new(move || {
                #[cfg(feature = "print_scope_updates")]
                return format!("TaskScope({id})::event");
                #[cfg(not(feature = "print_scope_updates"))]
                return "TaskScope::event".to_owned();
            }),
            has_unfinished_tasks,
            parents: CountHashSet::new(),
        }
    }

    /// creates a state that is active
    fn new_active(
        #[cfg(feature = "print_scope_updates")] id: TaskScopeId,
        has_unfinished_tasks: bool,
    ) -> Self {
        Self {
            #[cfg(feature = "print_scope_updates")]
            id,
            active: 1,
            dirty_tasks: AutoSet::default(),
            children: CountHashSet::new(),
            collectibles: AutoMap::default(),
            dependent_tasks: AutoSet::default(),
            event: Event::new(move || {
                #[cfg(feature = "print_scope_updates")]
                return format!("TaskScope({id})::event");
                #[cfg(not(feature = "print_scope_updates"))]
                return "TaskScope::event".to_owned();
            }),
            has_unfinished_tasks,
            parents: CountHashSet::new(),
        }
    }

    /// returns true if the scope is active
    pub fn is_active(&self) -> bool {
        self.active > 0
    }

    /// increments the active counter, returns list of tasks that need to be
    /// scheduled and list of child scope that need to be incremented after
    /// releasing the scope lock
    #[must_use]
    pub fn increment_active(
        &mut self,
        more_jobs: &mut Vec<TaskScopeId>,
    ) -> Option<AutoSet<TaskId, BuildNoHashHasher<TaskId>>> {
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
    ) -> Option<AutoSet<TaskId, BuildNoHashHasher<TaskId>>> {
        let was_zero = self.active <= 0;
        self.active += count as isize;
        if self.active > 0 && was_zero {
            more_jobs.extend(self.children.iter().copied());
            Some(take(&mut self.dirty_tasks))
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
    /// be decremented after releasing the scope lock. Returns `true` when the
    /// scope has become inactive.
    pub fn decrement_active_by(&mut self, count: usize, more_jobs: &mut Vec<TaskScopeId>) -> bool {
        let was_positive = self.active > 0;
        self.active -= count as isize;
        if self.active <= 0 && was_positive {
            more_jobs.extend(self.children.iter().copied());
            true
        } else {
            false
        }
    }

    /// Add a child scope. Returns a [ScopeChildChangeEffect] when the child
    /// scope need to have its active counter increased.
    #[must_use]
    pub fn add_child(&mut self, child: TaskScopeId) -> Option<ScopeChildChangeEffect> {
        self.add_child_count(child, 1)
    }

    /// Add a child scope. Returns a [ScopeChildChangeEffect] when the child
    /// scope need to have its active counter increased.
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
                parent: true,
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
                parent: true,
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

    /// Takes all children or collectibles dependent tasks and returns them for
    /// notification.
    pub fn take_all_dependent_tasks(&mut self) -> AutoSet<TaskId, BuildNoHashHasher<TaskId>> {
        let mut set = self.take_dependent_tasks();
        self.collectibles = take(&mut self.collectibles)
            .into_iter()
            .map(|(key, mut info)| {
                set.extend(take(&mut info.dependent_tasks));
                (key, info)
            })
            .filter(|(_, info)| !info.is_unset())
            .collect();
        set
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
        match self.collectibles.entry(trait_id) {
            Entry::Occupied(mut entry) => {
                let info = entry.get_mut();
                if info.collectibles.add_count(collectible, count) {
                    log_scope_update!("add_collectible {} -> {}", *self.id, collectible);
                    Some(ScopeCollectibleChangeEffect {
                        notify: take(&mut info.dependent_tasks),
                    })
                } else {
                    if info.is_unset() {
                        entry.remove();
                    }
                    None
                }
            }
            Entry::Vacant(entry) => {
                let result = entry
                    .insert(Default::default())
                    .collectibles
                    .add_count(collectible, count);
                debug_assert!(result, "this must be always a new entry");
                log_scope_update!("add_collectible {} -> {}", *self.id, collectible);
                Some(ScopeCollectibleChangeEffect {
                    notify: AutoSet::default(),
                })
            }
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
        match self.collectibles.entry(trait_id) {
            Entry::Occupied(mut entry) => {
                let info = entry.get_mut();
                let old_value = info.collectibles.get(&collectible);
                let new_value = old_value - count as isize;
                // NOTE: The read_collectibles need to be invalidated when negative count
                // changes. Each negative count will eliminate one child scope emitted
                // collectible. So changing from -1 to -2 might affect the visible collectibles.
                if info.collectibles.remove_count(collectible, count) || new_value < 0 {
                    let notify = take(&mut info.dependent_tasks);
                    if info.is_unset() {
                        entry.remove();
                    }
                    log_scope_update!(
                        "remove_collectible {} -> {} ({old_value} -> {new_value})",
                        *self.id,
                        collectible
                    );
                    Some(ScopeCollectibleChangeEffect { notify })
                } else {
                    None
                }
            }
            Entry::Vacant(e) => {
                let result = e
                    .insert(Default::default())
                    .collectibles
                    .remove_count(collectible, count);

                debug_assert!(!result, "this must never be visible from outside");
                None
            }
        }
    }

    pub fn take_dependent_tasks(&mut self) -> AutoSet<TaskId, BuildNoHashHasher<TaskId>> {
        take(&mut self.dependent_tasks)
    }

    pub fn get_read_collectibles_task(
        &mut self,
        trait_id: TraitTypeId,
        create_new: impl FnOnce() -> TaskId,
    ) -> TaskId {
        let task_id = &mut self
            .collectibles
            .entry(trait_id)
            .or_default()
            .read_collectibles_task;
        if let Some(task_id) = *task_id {
            task_id
        } else {
            let new_task_id = create_new();
            *task_id = Some(new_task_id);
            new_task_id
        }
    }
}
