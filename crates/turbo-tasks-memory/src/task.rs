mod meta_state;
mod stats;

use std::{
    borrow::Cow,
    cell::RefCell,
    cmp::{max, Ordering, Reverse},
    collections::{HashMap, HashSet, VecDeque},
    fmt::{self, Debug, Display, Formatter, Write},
    future::Future,
    hash::Hash,
    mem::{replace, take},
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::Result;
use auto_hash_map::{AutoMap, AutoSet};
use nohash_hasher::BuildNoHashHasher;
use parking_lot::{Mutex, RwLock};
use stats::TaskStats;
use tokio::task_local;
use turbo_tasks::{
    backend::{PersistentTaskType, TaskExecutionSpec},
    event::{Event, EventListener},
    get_invalidator,
    primitives::{RawVcSet, RawVcSetVc},
    registry, CellId, Invalidator, RawVc, StatsType, TaskId, TraitTypeId, TryJoinIterExt,
    TurboTasksBackendApi, ValueTypeId,
};

use crate::{
    cell::Cell,
    count_hash_set::CountHashSet,
    gc::{to_exp_u8, GcPriority, GcStats, GcTaskState},
    memory_backend::Job,
    output::{Output, OutputContent},
    scope::{ScopeChildChangeEffect, TaskScopeId, TaskScopes},
    stats::{ReferenceType, StatsReferences, StatsTaskType},
    MemoryBackend,
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

macro_rules! log_scope_update {
    ($($args:expr),+) => {
        #[cfg(feature = "print_scope_updates")]
        println!($($args),+);
    };
}

#[derive(Hash, Copy, Clone, PartialEq, Eq)]
pub enum TaskDependency {
    TaskOutput(TaskId),
    TaskCell(TaskId, CellId),
    ScopeChildren(TaskScopeId),
    ScopeCollectibles(TaskScopeId, TraitTypeId),
}

task_local! {
    /// Vc/Scopes that are read during task execution
    /// These will be stored as dependencies when the execution has finished
    pub(crate) static DEPENDENCIES_TO_TRACK: RefCell<AutoSet<TaskDependency>>;
}

type OnceTaskFn = Mutex<Option<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>>;

struct ReadTaskCollectiblesTaskType {
    task: TaskId,
    trait_type: TraitTypeId,
}

struct ReadScopeCollectiblesTaskType {
    scope: TaskScopeId,
    trait_type: TraitTypeId,
}

/// Different Task types
enum TaskType {
    // Note: double boxed to reduce TaskType size
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    Root(Box<NativeTaskFn>),

    // Note: double boxed to reduce TaskType size
    /// A single root task execution. It won't track dependencies.
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
    Once(Box<OnceTaskFn>),

    /// A task that reads all collectibles of a certain trait from a
    /// [TaskScope]. It will do that by recursively calling
    /// ReadScopeCollectibles on child scopes, so that results by scope are
    /// cached.
    ReadScopeCollectibles(Box<ReadScopeCollectiblesTaskType>),

    /// A task that reads all collectibles of a certain trait from another task.
    /// It will do that by recursively calling ReadScopeCollectibles on child
    /// scopes, so that results by task are cached.
    ReadTaskCollectibles(Box<ReadTaskCollectiblesTaskType>),

    /// A normal persistent task
    Persistent(Arc<PersistentTaskType>),
}

enum TaskTypeForDescription {
    Root,
    Once,
    ReadTaskCollectibles(TraitTypeId),
    ReadScopeCollectibles(TraitTypeId),
    Persistent(Arc<PersistentTaskType>),
}

impl TaskTypeForDescription {
    fn from(task_type: &TaskType) -> Self {
        match task_type {
            TaskType::Root(..) => Self::Root,
            TaskType::Once(..) => Self::Once,
            TaskType::ReadTaskCollectibles(box ReadTaskCollectiblesTaskType {
                trait_type, ..
            }) => Self::ReadTaskCollectibles(*trait_type),
            TaskType::ReadScopeCollectibles(box ReadScopeCollectiblesTaskType {
                trait_type,
                ..
            }) => Self::ReadScopeCollectibles(*trait_type),
            TaskType::Persistent(ty) => Self::Persistent(ty.clone()),
        }
    }
}

impl Debug for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(..) => f.debug_tuple("Root").finish(),
            Self::Once(..) => f.debug_tuple("Once").finish(),
            Self::ReadScopeCollectibles(box ReadScopeCollectiblesTaskType {
                scope,
                trait_type,
            }) => f
                .debug_tuple("ReadScopeCollectibles")
                .field(scope)
                .field(&registry::get_trait(*trait_type).name)
                .finish(),
            Self::ReadTaskCollectibles(box ReadTaskCollectiblesTaskType { task, trait_type }) => f
                .debug_tuple("ReadTaskCollectibles")
                .field(task)
                .field(&registry::get_trait(*trait_type).name)
                .finish(),
            Self::Persistent(ty) => Debug::fmt(ty, f),
        }
    }
}

impl Display for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(..) => f.debug_tuple("Root").finish(),
            Self::Once(..) => f.debug_tuple("Once").finish(),
            Self::ReadTaskCollectibles(..) => f.debug_tuple("ReadTaskCollectibles").finish(),
            Self::ReadScopeCollectibles(..) => f.debug_tuple("ReadScopeCollectibles").finish(),
            Self::Persistent(ty) => Display::fmt(ty, f),
        }
    }
}

#[derive(Default)]
enum PrepareTaskType {
    #[default]
    None,
    Native(NativeTaskFn),
}

/// A Task is an instantiation of an Function with some arguments.
/// The same combinations of Function and arguments usually results in the same
/// Task instance.
pub struct Task {
    id: TaskId,
    /// The type of the task
    ty: TaskType,
    /// The mutable state of the task
    /// Unset state is equal to a Dirty task that has not been executed yet
    state: RwLock<TaskMetaState>,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut result = f.debug_struct("Task");
        result.field("id", &self.id);
        result.field("ty", &self.ty);
        if let Some(state) = self.try_state() {
            match state {
                TaskMetaStateReadGuard::Full(state) => {
                    result.field("state", &Task::state_string(&state));
                }
                TaskMetaStateReadGuard::Partial(_) => {
                    result.field("state", &"partial");
                }
                TaskMetaStateReadGuard::Unloaded(_) => {
                    result.field("state", &"unloaded");
                }
            }
        }
        result.finish()
    }
}

/// The full state of a [Task], it includes all information.
struct TaskState {
    scopes: TaskScopes,

    // TODO using a Atomic might be possible here
    /// More flags of task state, where not all combinations are possible.
    /// dirty, scheduled, in progress
    state_type: TaskStateType,

    /// true, when the task has state and that can't be dropped
    stateful: bool,

    /// Children are only modified from execution
    children: AutoSet<TaskId, BuildNoHashHasher<TaskId>>,

    /// Collectibles are only modified from execution
    collectibles: MaybeCollectibles,

    /// Preparations done for the task type with the bound arguments, e. g.
    /// argument validation
    prepared_type: PrepareTaskType,

    output: Output,
    cells: AutoMap<ValueTypeId, Vec<Cell>, BuildNoHashHasher<ValueTypeId>>,

    // GC state:
    gc: GcTaskState,

    // Stats:
    stats: TaskStats,
}

impl TaskState {
    fn new(
        description: impl Fn() -> String + Send + Sync + 'static,
        stats_type: StatsType,
    ) -> Self {
        Self {
            scopes: Default::default(),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(stats_type),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
        }
    }

    fn new_scheduled_in_scope(
        description: impl Fn() -> String + Send + Sync + 'static,
        scope: TaskScopeId,
        stats_type: StatsType,
    ) -> Self {
        Self {
            scopes: TaskScopes::Inner(CountHashSet::from([scope]), 0),
            state_type: Scheduled {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(stats_type),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
        }
    }

    fn new_root_scoped(
        description: impl Fn() -> String + Send + Sync + 'static,
        scope: TaskScopeId,
        stats_type: StatsType,
    ) -> Self {
        Self {
            scopes: TaskScopes::Root(scope),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(stats_type),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
        }
    }
}

/// The partial task state. It's equal to a full TaskState with state = Dirty
/// and all other fields empty. It looks like a dirty task that has not been
/// executed yet. The task might still be in some task scopes.
/// A Task can get into this state when it is unloaded by garbage collection,
/// but is still attached to scopes.
struct PartialTaskState {
    stats_type: StatsType,
    scopes: TaskScopes,
}

impl PartialTaskState {
    fn into_full(self, description: impl Fn() -> String + Send + Sync + 'static) -> TaskState {
        TaskState {
            scopes: self.scopes,
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            prepared_type: PrepareTaskType::None,
            output: Default::default(),
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(self.stats_type),
        }
    }
}

/// A fully unloaded task state. It's equal to a partial task state without
/// being attached to any scopes. This state is stored inlined instead of in a
/// [Box] to reduce the memory consumption. Make sure to not add more fields
/// than the size of a [Box].
struct UnloadedTaskState {
    stats_type: StatsType,
}

#[cfg(test)]
#[test]
fn test_unloaded_task_state_size() {
    assert!(std::mem::size_of::<UnloadedTaskState>() <= std::mem::size_of::<Box<()>>());
}

impl UnloadedTaskState {
    fn into_full(self, description: impl Fn() -> String + Send + Sync + 'static) -> TaskState {
        TaskState {
            scopes: Default::default(),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            prepared_type: PrepareTaskType::None,
            output: Default::default(),
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(self.stats_type),
        }
    }

    fn into_partial(self) -> PartialTaskState {
        PartialTaskState {
            scopes: TaskScopes::Inner(CountHashSet::new(), 0),
            stats_type: self.stats_type,
        }
    }
}

/// Keeps track of emitted and unemitted collectibles and the
/// read_collectibles tasks. Defaults to None to avoid allocating memory when no
/// collectibles are emitted or read.
#[derive(Default)]
struct MaybeCollectibles {
    inner: Option<Box<Collectibles>>,
}

/// The collectibles of a task.
#[derive(Default)]
struct Collectibles {
    emitted: AutoSet<(TraitTypeId, RawVc)>,
    unemitted: AutoSet<(TraitTypeId, RawVc)>,
    read_collectibles_tasks: AutoMap<TraitTypeId, TaskId>,
}

impl MaybeCollectibles {
    /// Consumes the collectibles (if any) and return them.
    fn take_collectibles(&mut self) -> Option<Collectibles> {
        if let Some(inner) = &mut self.inner {
            Some(Collectibles {
                emitted: take(&mut inner.emitted),
                unemitted: take(&mut inner.unemitted),
                read_collectibles_tasks: AutoMap::default(),
            })
        } else {
            None
        }
    }

    /// Consumes the collectibles (if any) and return them.
    fn into_inner(self) -> Option<Box<Collectibles>> {
        self.inner
    }

    /// Returns a reference to the collectibles (if any).
    fn as_ref(&self) -> Option<&Collectibles> {
        if let Some(inner) = &self.inner {
            Some(&**inner)
        } else {
            None
        }
    }

    /// Emits a collectible.
    fn emit(&mut self, trait_type: TraitTypeId, value: RawVc) -> bool {
        self.inner
            .get_or_insert_default()
            .emitted
            .insert((trait_type, value))
    }

    /// Unemits a collectible.
    fn unemit(&mut self, trait_type: TraitTypeId, value: RawVc) -> bool {
        self.inner
            .get_or_insert_default()
            .unemitted
            .insert((trait_type, value))
    }

    pub fn get_read_collectibles_task(
        &mut self,
        trait_id: TraitTypeId,
        create_new: impl FnOnce() -> TaskId,
    ) -> TaskId {
        *self
            .inner
            .get_or_insert_default()
            .read_collectibles_tasks
            .entry(trait_id)
            .or_insert_with(create_new)
    }
}

enum TaskStateType {
    /// Ready
    ///
    /// on invalidation this will move to Dirty or Scheduled depending on active
    /// flag
    Done {
        /// Cells/Scopes that the task has read during execution.
        /// The Task will keep these tasks alive as invalidations that happen
        /// there might affect this task.
        ///
        /// This back-edge is [Cell] `dependent_tasks`, which is a weak edge.
        dependencies: AutoSet<TaskDependency>,
    },

    /// Execution is invalid, but not yet scheduled
    ///
    /// on activation this will move to Scheduled
    Dirty { event: Event },

    /// Execution is invalid and scheduled
    ///
    /// on start this will move to InProgress or Dirty depending on active flag
    Scheduled { event: Event },

    /// Execution is happening
    ///
    /// on finish this will move to Done
    ///
    /// on invalidation this will move to InProgressDirty
    InProgress {
        event: Event,
        count_as_finished: bool,
    },

    /// Invalid execution is happening
    ///
    /// on finish this will move to Dirty or Scheduled depending on active flag
    InProgressDirty { event: Event },
}

use TaskStateType::*;

use self::meta_state::{
    FullTaskWriteGuard, TaskMetaState, TaskMetaStateReadGuard, TaskMetaStateWriteGuard,
};

/// Heuristic when a task should switch to root scoped.
///
/// The `optimization_counter` is a number how often a scope has been added to
/// this task (and therefore to all child tasks as well). We can assume that all
/// scopes might eventually be removed again. We assume that more scopes per
/// task have higher cost, so we want to avoid that. We assume that adding and
/// removing scopes again and again is not great. But having too many root
/// scopes is also not great as it hurts strongly consistent reads and read
/// collectibles.
///
/// The current implementation uses a heuristic that says that the cost is
/// linear to the number of added scoped and linear to the number of children.
fn should_optimize_to_root_scoped(optimization_counter: usize, children_count: usize) -> bool {
    const SCOPE_OPTIMIZATION_THRESHOLD: usize = 255;
    optimization_counter * children_count > SCOPE_OPTIMIZATION_THRESHOLD
}

impl Task {
    pub(crate) fn new_persistent(
        id: TaskId,
        task_type: Arc<PersistentTaskType>,
        stats_type: StatsType,
    ) -> Self {
        let ty = TaskType::Persistent(task_type);
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new(
                description,
                stats_type,
            )))),
        }
    }

    pub(crate) fn new_root(
        id: TaskId,
        scope: TaskScopeId,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
        stats_type: StatsType,
    ) -> Self {
        let ty = TaskType::Root(Box::new(Box::new(functor)));
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(
                TaskState::new_scheduled_in_scope(description, scope, stats_type),
            ))),
        }
    }

    pub(crate) fn new_once(
        id: TaskId,
        scope: TaskScopeId,
        functor: impl Future<Output = Result<RawVc>> + Send + 'static,
        stats_type: StatsType,
    ) -> Self {
        let ty = TaskType::Once(Box::new(Mutex::new(Some(Box::pin(functor)))));
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(
                TaskState::new_scheduled_in_scope(description, scope, stats_type),
            ))),
        }
    }

    pub(crate) fn new_read_scope_collectibles(
        id: TaskId,
        target_scope: TaskScopeId,
        trait_type_id: TraitTypeId,
        stats_type: StatsType,
    ) -> Self {
        let ty = TaskType::ReadScopeCollectibles(Box::new(ReadScopeCollectiblesTaskType {
            scope: target_scope,
            trait_type: trait_type_id,
        }));
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new(
                description,
                stats_type,
            )))),
        }
    }

    pub(crate) fn new_read_task_collectibles(
        id: TaskId,
        scope: TaskScopeId,
        target_task: TaskId,
        trait_type_id: TraitTypeId,
        stats_type: StatsType,
    ) -> Self {
        let ty = TaskType::ReadTaskCollectibles(Box::new(ReadTaskCollectiblesTaskType {
            task: target_task,
            trait_type: trait_type_id,
        }));
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new_root_scoped(
                description,
                scope,
                stats_type,
            )))),
        }
    }

    pub(crate) fn is_pure(&self) -> bool {
        match &self.ty {
            TaskType::Persistent(_) => true,
            TaskType::ReadTaskCollectibles(..) => true,
            TaskType::ReadScopeCollectibles(..) => true,
            TaskType::Root(_) => false,
            TaskType::Once(_) => false,
        }
    }

    pub(crate) fn get_function_name(&self) -> Option<&'static str> {
        if let TaskType::Persistent(ty) = &self.ty {
            match &**ty {
                PersistentTaskType::Native(native_fn, _)
                | PersistentTaskType::ResolveNative(native_fn, _) => {
                    return Some(&registry::get_function(*native_fn).name);
                }
                _ => {}
            }
        }
        None
    }

    pub(crate) fn get_description(&self) -> String {
        Self::format_description(&TaskTypeForDescription::from(&self.ty), self.id)
    }

    fn format_description(ty: &TaskTypeForDescription, id: TaskId) -> String {
        match ty {
            TaskTypeForDescription::Root => format!("[{}] root", id),
            TaskTypeForDescription::Once => format!("[{}] once", id),
            TaskTypeForDescription::ReadTaskCollectibles(trait_type_id) => format!(
                "[{}] read task collectibles({})",
                id,
                registry::get_trait(*trait_type_id).name
            ),
            TaskTypeForDescription::ReadScopeCollectibles(trait_type_id) => format!(
                "[{}] read scope collectibles({})",
                id,
                registry::get_trait(*trait_type_id).name
            ),
            TaskTypeForDescription::Persistent(ty) => match &**ty {
                PersistentTaskType::Native(native_fn, _) => {
                    format!("[{}] {}", id, registry::get_function(*native_fn).name)
                }
                PersistentTaskType::ResolveNative(native_fn, _) => {
                    format!(
                        "[{}] [resolve] {}",
                        id,
                        registry::get_function(*native_fn).name
                    )
                }
                PersistentTaskType::ResolveTrait(trait_type, fn_name, _) => {
                    format!(
                        "[{}] [resolve trait] {} in trait {}",
                        id,
                        fn_name,
                        registry::get_trait(*trait_type).name
                    )
                }
            },
        }
    }

    fn get_event_description_static(
        id: TaskId,
        ty: &TaskType,
    ) -> impl Fn() -> String + Send + Sync {
        let ty = TaskTypeForDescription::from(ty);
        move || Self::format_description(&ty, id)
    }

    fn get_event_description(&self) -> impl Fn() -> String + Send + Sync {
        Self::get_event_description_static(self.id, &self.ty)
    }

    pub(crate) fn remove_dependency(dep: TaskDependency, reader: TaskId, backend: &MemoryBackend) {
        match dep {
            TaskDependency::TaskOutput(task) => {
                backend.with_task(task, |task| {
                    task.with_output_mut_if_available(|output| {
                        output.dependent_tasks.remove(&reader);
                    });
                });
            }
            TaskDependency::TaskCell(task, index) => {
                backend.with_task(task, |task| {
                    task.with_cell_mut_if_available(index, |cell| {
                        cell.remove_dependent_task(reader);
                    });
                });
            }
            TaskDependency::ScopeChildren(scope) => backend.with_scope(scope, |scope| {
                scope.remove_dependent_task(reader);
            }),
            TaskDependency::ScopeCollectibles(scope, trait_type) => {
                backend.with_scope(scope, |scope| {
                    scope.remove_collectible_dependent_task(trait_type, reader);
                })
            }
        }
    }

    #[cfg(not(feature = "report_expensive"))]
    fn clear_dependencies(&self, dependencies: AutoSet<TaskDependency>, backend: &MemoryBackend) {
        for dep in dependencies.into_iter() {
            Task::remove_dependency(dep, self.id, backend);
        }
    }

    #[cfg(feature = "report_expensive")]
    fn clear_dependencies(&self, dependencies: AutoSet<TaskDependency>, backend: &MemoryBackend) {
        use std::time::Instant;

        use turbo_tasks::util::FormatDuration;
        let start = Instant::now();

        let count = dependencies.len();

        for dep in dependencies.into_iter() {
            Task::remove_dependency(dep, self.id, backend);
        }
        let elapsed = start.elapsed();
        if elapsed.as_millis() >= 10 || count > 10000 {
            println!(
                "clear_dependencies({}) took {}: {:?}",
                count,
                FormatDuration(elapsed),
                self
            );
        }
    }

    fn state(&self) -> TaskMetaStateReadGuard<'_> {
        self.state.read().into()
    }

    fn try_state(&self) -> Option<TaskMetaStateReadGuard<'_>> {
        self.state.try_read().map(|guard| guard.into())
    }

    fn state_mut(&self) -> TaskMetaStateWriteGuard<'_> {
        self.state.write().into()
    }

    fn full_state_mut(&self) -> FullTaskWriteGuard<'_> {
        TaskMetaStateWriteGuard::full_from(self.state.write(), self)
    }

    #[allow(dead_code, reason = "We need this in future")]
    fn partial_state_mut(&self) -> TaskMetaStateWriteGuard<'_> {
        TaskMetaStateWriteGuard::partial_from(self.state.write())
    }

    pub(crate) fn execute(
        self: &Task,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<TaskExecutionSpec> {
        let mut state = self.full_state_mut();
        if !self.try_start_execution(&mut state, turbo_tasks, backend) {
            return None;
        }
        let future = self.make_execution_future(state, backend, turbo_tasks);
        Some(TaskExecutionSpec { future })
    }

    /// Tries to change the state to InProgress and returns true if it was
    /// possible.
    fn try_start_execution(
        &self,
        state: &mut TaskState,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
        backend: &MemoryBackend,
    ) -> bool {
        match state.state_type {
            Done { .. } | InProgress { .. } | InProgressDirty { .. } => {
                // should not start in this state
                return false;
            }
            Scheduled { ref mut event } => {
                state.state_type = InProgress {
                    event: event.take(),
                    count_as_finished: false,
                };
                state.stats.increment_executions();
                // TODO we need to reconsider the approach of doing scope changes in background
                // since they affect collectibles and need to be computed eagerly to allow
                // strongly_consistent to work properly.
                // We could move this operation to the point when the task execution is
                // finished.
                if !state.children.is_empty() {
                    let set = take(&mut state.children);
                    remove_from_scopes(set, &state.scopes, backend, turbo_tasks);
                }
                if let Some(collectibles) = state.collectibles.take_collectibles() {
                    remove_collectible_from_scopes(
                        collectibles.emitted,
                        collectibles.unemitted,
                        &state.scopes,
                        backend,
                        turbo_tasks,
                    );
                }
            }
            Dirty { .. } => {
                let state_type = Task::state_string(&*state);
                panic!(
                    "{:?} execution started in unexpected state {}",
                    self, state_type
                )
            }
        };
        true
    }

    /// Prepares task execution and returns a future that will execute the task.
    fn make_execution_future(
        self: &Task,
        mut state: FullTaskWriteGuard<'_>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> {
        match &self.ty {
            TaskType::Root(bound_fn) => {
                drop(state);
                bound_fn()
            }
            TaskType::Once(mutex) => {
                drop(state);
                mutex.lock().take().expect("Task can only be executed once")
            }
            &TaskType::ReadTaskCollectibles(box ReadTaskCollectiblesTaskType {
                task: task_id,
                trait_type,
            }) => {
                // Connect the task to the current task. This makes strongly consistent behaving
                // as expected and we can look up the collectibles in the current scope.
                self.connect_child_internal(state, task_id, backend, turbo_tasks);
                // state was dropped by previous method
                Box::pin(Self::execute_read_task_collectibles(
                    self.id,
                    task_id,
                    trait_type,
                    turbo_tasks.pin(),
                ))
            }
            &TaskType::ReadScopeCollectibles(box ReadScopeCollectiblesTaskType {
                scope,
                trait_type,
            }) => {
                drop(state);
                Box::pin(Self::execute_read_scope_collectibles(
                    self.id,
                    scope,
                    trait_type,
                    turbo_tasks.pin(),
                ))
            }
            TaskType::Persistent(ty) => match &**ty {
                PersistentTaskType::Native(native_fn, inputs) => {
                    let future = if let PrepareTaskType::Native(bound_fn) = &state.prepared_type {
                        bound_fn()
                    } else {
                        let bound_fn = registry::get_function(*native_fn).bind(inputs);
                        let future = bound_fn();
                        state.prepared_type = PrepareTaskType::Native(bound_fn);
                        future
                    };
                    drop(state);
                    future
                }
                PersistentTaskType::ResolveNative(ref native_fn, inputs) => {
                    drop(state);
                    let native_fn = *native_fn;
                    let inputs = inputs.clone();
                    let turbo_tasks = turbo_tasks.pin();
                    Box::pin(PersistentTaskType::run_resolve_native(
                        native_fn,
                        inputs,
                        turbo_tasks,
                    ))
                }
                PersistentTaskType::ResolveTrait(trait_type, name, inputs) => {
                    drop(state);
                    let trait_type = *trait_type;
                    let name = name.clone();
                    let inputs = inputs.clone();
                    let turbo_tasks = turbo_tasks.pin();
                    Box::pin(PersistentTaskType::run_resolve_trait(
                        trait_type,
                        name,
                        inputs,
                        turbo_tasks,
                    ))
                }
            },
        }
    }

    pub(crate) fn mark_as_finished(&self, backend: &MemoryBackend) {
        let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() else {
            return;
        };
        let TaskStateType::InProgress { ref mut count_as_finished, .. } = state.state_type else {
            return;
        };
        if *count_as_finished {
            return;
        }
        *count_as_finished = true;
        for scope in state.scopes.iter() {
            backend.with_scope(scope, |scope| {
                scope.decrement_unfinished_tasks(backend);
            })
        }
    }

    pub(crate) fn execution_result(
        &self,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut state = self.full_state_mut();
        match state.state_type {
            InProgress { .. } => match result {
                Ok(Ok(result)) => {
                    if state.output != result {
                        if cfg!(feature = "print_task_invalidation")
                            && !matches!(state.output.content, OutputContent::Empty)
                        {
                            println!(
                                "Task {{ id: {}, name: {} }} invalidates:",
                                *self.id, self.ty
                            );
                            for dep in state.output.dependent_tasks.iter() {
                                backend.with_task(*dep, |task| {
                                    println!("\tTask {{ id: {}, name: {} }}", *task.id, task.ty);
                                });
                            }
                        }
                        state.output.link(result, turbo_tasks)
                    }
                }
                Ok(Err(mut err)) => {
                    if let Some(name) = self.get_function_name() {
                        err = err.context(format!("Execution of {} failed", name));
                    }
                    state.output.error(err, turbo_tasks)
                }
                Err(message) => state.output.panic(message, turbo_tasks),
            },
            InProgressDirty { .. } => {
                // We don't want to assign the output cell here
                // as we want to avoid unnecessary updates
                // TODO maybe this should be controlled by a heuristic
            }
            Dirty { .. } | Scheduled { .. } | Done { .. } => {
                panic!(
                    "Task execution completed in unexpected state {}",
                    Task::state_string(&state)
                )
            }
        };
    }

    #[must_use]
    pub(crate) fn execution_completed(
        &self,
        duration: Duration,
        instant: Instant,
        stateful: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut schedule_task = false;
        let mut dependencies = DEPENDENCIES_TO_TRACK.with(|deps| deps.take());
        {
            let mut state = self.full_state_mut();

            state
                .stats
                .register_execution(duration, turbo_tasks.program_duration_until(instant));
            match state.state_type {
                InProgress {
                    ref mut event,
                    count_as_finished,
                } => {
                    let event = event.take();
                    let mut dependencies = take(&mut dependencies);
                    // This will stay here for longer, so make sure to not consume too much memory
                    dependencies.shrink_to_fit();
                    for cells in state.cells.values_mut() {
                        cells.shrink_to_fit();
                    }
                    state.cells.shrink_to_fit();
                    state.stateful = stateful;
                    state.state_type = Done { dependencies };
                    if !count_as_finished {
                        for scope in state.scopes.iter() {
                            backend.with_scope(scope, |scope| {
                                scope.decrement_unfinished_tasks(backend);
                            })
                        }
                    }
                    event.notify(usize::MAX);
                }
                InProgressDirty { ref mut event } => {
                    let event = event.take();
                    state.state_type = Scheduled { event };
                    schedule_task = true;
                }
                Dirty { .. } | Scheduled { .. } | Done { .. } => {
                    panic!(
                        "Task execution completed in unexpected state {}",
                        Task::state_string(&state)
                    )
                }
            };
        }
        if !dependencies.is_empty() {
            self.clear_dependencies(dependencies, backend);
        }

        if let TaskType::Once(_) = self.ty {
            self.remove_root_or_initial_scope(backend, turbo_tasks);
        }

        schedule_task
    }

    /// When any scope is active it returns true. When no scope is active it
    /// returns false and adds the tasks to all scopes as dirty task.
    /// When `increment_unfinished` is true it will also increment the
    /// unfinished tasks for all scopes, independent of activeness.
    fn scopes_dirty_or_active(
        &self,
        increment_unfinished: bool,
        scopes: &TaskScopes,
        backend: &MemoryBackend,
    ) -> bool {
        if increment_unfinished {
            // We need to walk all scopes at least once to increment unfinished tasks.
            // While doing that we check if any scope is active.
            let mut active = false;
            for scope in scopes.iter() {
                backend.with_scope(scope, |scope| {
                    scope.increment_unfinished_tasks(backend);
                    active = active || scope.state.lock().is_active();
                })
            }
            if active {
                return true;
            }
        } else {
            // Without the need to increment unfinished for all scopes we can exit early
            if scopes
                .iter()
                .any(|scope| backend.with_scope(scope, |scope| scope.state.lock().is_active()))
            {
                return true;
            }
        }
        for (i, scope) in scopes.iter().enumerate() {
            let any_scope_was_active = backend.with_scope(scope, |scope| {
                let mut state = scope.state.lock();
                let is_active = state.is_active();
                if !is_active {
                    state.add_dirty_task(self.id);
                }
                is_active
            });
            if any_scope_was_active {
                // A scope is active, revert dirty task changes and return true
                for scope in scopes.iter().take(i) {
                    backend.with_scope(scope, |scope| {
                        let mut state = scope.state.lock();
                        state.remove_dirty_task(self.id);
                    })
                }
                return true;
            }
        }
        // No scope is active. Task has been added as dirty task to all scopes
        false
    }

    fn make_dirty(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.make_dirty_internal(false, backend, turbo_tasks);
    }

    fn make_dirty_internal(
        &self,
        force_schedule: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        if let TaskType::Once(_) = self.ty {
            // once task won't become dirty
            return;
        }

        let state = if force_schedule {
            TaskMetaStateWriteGuard::Full(self.full_state_mut())
        } else {
            self.state_mut()
        };
        if let TaskMetaStateWriteGuard::Full(mut state) = state {
            let mut clear_dependencies = AutoSet::default();

            match state.state_type {
                Scheduled { .. } | InProgressDirty { .. } => {
                    // already dirty
                    drop(state);
                }
                Dirty { .. } => {
                    if force_schedule {
                        let description = self.get_event_description();
                        state.state_type = Scheduled {
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                        };
                        drop(state);
                        turbo_tasks.schedule(self.id);
                    } else {
                        // already dirty
                        drop(state);
                    }
                }
                Done {
                    ref mut dependencies,
                } => {
                    clear_dependencies = take(dependencies);
                    // add to dirty lists and potentially schedule
                    let description = self.get_event_description();
                    let active =
                        force_schedule || self.scopes_dirty_or_active(true, &state.scopes, backend);
                    if active {
                        state.state_type = Scheduled {
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                        };
                        drop(state);

                        if cfg!(feature = "print_task_invalidation") {
                            println!("invalidated Task {{ id: {}, name: {} }}", *self.id, self.ty);
                        }
                        turbo_tasks.schedule(self.id);
                    } else {
                        state.state_type = Dirty {
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                        };
                        drop(state);
                    }
                }
                InProgress {
                    ref mut event,
                    count_as_finished,
                } => {
                    let event = event.take();
                    if count_as_finished {
                        for scope in state.scopes.iter() {
                            backend.with_scope(scope, |scope| {
                                scope.increment_unfinished_tasks(backend);
                            })
                        }
                    }
                    state.state_type = InProgressDirty { event };
                    drop(state);
                }
            }

            if !clear_dependencies.is_empty() {
                self.clear_dependencies(clear_dependencies, backend);
            }
        }
    }

    pub(crate) fn schedule_when_dirty_from_scope(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut state = self.full_state_mut();
        if let TaskStateType::Dirty { ref mut event } = state.state_type {
            state.state_type = Scheduled {
                event: event.take(),
            };
            for scope in state.scopes.iter() {
                backend.with_scope(scope, |scope| {
                    scope.state.lock().remove_dirty_task(self.id);
                })
            }
            drop(state);
            turbo_tasks.schedule(self.id);
        }
    }

    pub(crate) fn add_to_scope_internal_shallow(
        &self,
        id: TaskScopeId,
        merging_scopes: usize,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
        queue: &mut VecDeque<TaskId>,
    ) {
        let mut state = self.full_state_mut();
        let TaskState {
            ref mut scopes,
            ref children,
            ..
        } = *state;
        match *scopes {
            TaskScopes::Root(root) => {
                if root == id {
                    // The task is already in the root scope we're trying to add it to.
                    return;
                }

                if let Some(ScopeChildChangeEffect {
                    notify,
                    active,
                    parent,
                }) = backend.with_scope(id, |scope| scope.state.lock().add_child(root))
                {
                    drop(state);
                    if !notify.is_empty() {
                        turbo_tasks.schedule_notify_tasks_set(&notify);
                    }
                    if active {
                        backend.increase_scope_active(root, turbo_tasks);
                    }
                    if parent {
                        backend.with_scope(root, |child| {
                            child.add_parent(id, backend);
                        })
                    }
                }
            }
            TaskScopes::Inner(ref mut list, ref mut optimization_counter) => {
                if !list.add(id) {
                    // The task is already in the scope we're trying to add it to.
                    return;
                }

                *optimization_counter += 1;
                if merging_scopes > 0 {
                    *optimization_counter = optimization_counter.saturating_sub(merging_scopes);
                } else if should_optimize_to_root_scoped(*optimization_counter, children.len()) {
                    list.remove(id);
                    drop(self.make_root_scoped_internal(state, backend, turbo_tasks));
                    return self.add_to_scope_internal_shallow(
                        id,
                        merging_scopes,
                        backend,
                        turbo_tasks,
                        queue,
                    );
                }

                if queue.capacity() == 0 {
                    queue.reserve(max(children.len(), SPLIT_OFF_QUEUE_AT * 2));
                }
                queue.extend(children.iter().copied());

                // add to dirty list of the scope (potentially schedule)
                let schedule_self =
                    self.add_self_to_new_scope(&mut state, id, backend, turbo_tasks);
                drop(state);

                if schedule_self {
                    turbo_tasks.schedule(self.id);
                }
            }
        }
    }

    pub(crate) fn add_to_scope_internal(
        &self,
        id: TaskScopeId,
        merging_scopes: usize,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        // VecDeque::new() would allocate with 7 items capacity. We don't want that.
        let mut queue = VecDeque::with_capacity(0);
        self.add_to_scope_internal_shallow(id, merging_scopes, backend, turbo_tasks, &mut queue);

        run_add_to_scope_queue(queue, id, merging_scopes, backend, turbo_tasks);
    }

    fn add_self_to_new_scope(
        &self,
        state: &mut FullTaskWriteGuard<'_>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut schedule_self = false;
        backend.with_scope(id, |scope| {
            scope.increment_tasks();
            if !matches!(state.state_type, TaskStateType::Done { .. }) {
                if !matches!(
                    state.state_type,
                    TaskStateType::InProgress {
                        count_as_finished: true,
                        ..
                    }
                ) {
                    scope.increment_unfinished_tasks(backend);
                }
                log_scope_update!("add unfinished task (added): {} -> {}", *scope.id, *self.id);
                if let TaskStateType::Dirty { ref mut event } = state.state_type {
                    let mut scope = scope.state.lock();
                    if scope.is_active() {
                        state.state_type = Scheduled {
                            event: event.take(),
                        };
                        schedule_self = true;
                    } else {
                        scope.add_dirty_task(self.id);
                    }
                }
            }

            if let Some(collectibles) = state.collectibles.as_ref() {
                let mut tasks = AutoSet::default();
                {
                    let mut scope_state = scope.state.lock();
                    collectibles
                        .emitted
                        .iter()
                        .filter_map(|(trait_id, collectible)| {
                            scope_state.add_collectible(*trait_id, *collectible)
                        })
                        .for_each(|e| tasks.extend(e.notify));
                    collectibles
                        .unemitted
                        .iter()
                        .filter_map(|(trait_id, collectible)| {
                            scope_state.remove_collectible(*trait_id, *collectible)
                        })
                        .for_each(|e| tasks.extend(e.notify));
                };
                turbo_tasks.schedule_notify_tasks_set(&tasks);
            }
        });
        schedule_self
    }

    fn remove_self_from_scope(
        &self,
        state: &mut TaskMetaStateWriteGuard<'_>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        match state {
            TaskMetaStateWriteGuard::Full(state) => {
                self.remove_self_from_scope_full(state, id, backend, turbo_tasks);
            }
            TaskMetaStateWriteGuard::Partial(_) => backend.with_scope(id, |scope| {
                scope.decrement_tasks();
                scope.decrement_unfinished_tasks(backend);
                let mut scope = scope.state.lock();
                scope.remove_dirty_task(self.id);
            }),
            TaskMetaStateWriteGuard::Unloaded(_) => {
                unreachable!("remove_self_from_scope must be called with at least a partial state");
            }
        }
    }

    fn remove_self_from_scope_full(
        &self,
        state: &mut FullTaskWriteGuard<'_>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        backend.with_scope(id, |scope| {
            match state.state_type {
                Done { .. } => {}
                Dirty { .. } => {
                    scope.decrement_unfinished_tasks(backend);
                    let mut scope = scope.state.lock();
                    scope.remove_dirty_task(self.id);
                }
                InProgress {
                    count_as_finished: true,
                    ..
                } => {
                    // no need to decrement unfinished tasks
                }
                _ => {
                    scope.decrement_unfinished_tasks(backend);
                }
            }
            scope.decrement_tasks();

            if let Some(collectibles) = state.collectibles.as_ref() {
                let mut tasks = AutoSet::default();
                {
                    let mut scope_state = scope.state.lock();
                    collectibles
                        .emitted
                        .iter()
                        .filter_map(|(trait_id, collectible)| {
                            scope_state.remove_collectible(*trait_id, *collectible)
                        })
                        .for_each(|e| tasks.extend(e.notify));
                    collectibles
                        .unemitted
                        .iter()
                        .filter_map(|(trait_id, collectible)| {
                            scope_state.add_collectible(*trait_id, *collectible)
                        })
                        .for_each(|e| tasks.extend(e.notify));
                };
                turbo_tasks.schedule_notify_tasks_set(&tasks);
            }
        });
    }

    fn remove_from_scope_internal_shallow(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
        queue: &mut VecDeque<TaskId>,
    ) {
        let mut state = self.partial_state_mut();
        let partial = matches!(state, TaskMetaStateWriteGuard::Partial(_));
        let (scopes, children) = state.scopes_and_children();
        match scopes {
            &mut TaskScopes::Root(root) => {
                if root != id {
                    if let Some(ScopeChildChangeEffect {
                        notify,
                        active,
                        parent,
                    }) = backend.with_scope(id, |scope| scope.state.lock().remove_child(root))
                    {
                        if partial && parent {
                            // We might be able to drop the root scope now
                            // Check if this was the last parent that is removed
                            // (We operate under the task lock to ensure no other thread is adding a
                            // new parent)
                            backend.with_scope(root, |child| {
                                if child.remove_parent(id, backend) {
                                    let stats_type = match &state {
                                        TaskMetaStateWriteGuard::Full(s) => match s.stats {
                                            TaskStats::Essential(_) => StatsType::Essential,
                                            TaskStats::Full(_) => StatsType::Full,
                                        },
                                        TaskMetaStateWriteGuard::Partial(s) => s.stats_type,
                                        TaskMetaStateWriteGuard::Unloaded(s) => s.stats_type,
                                    };
                                    let TaskMetaState::Partial(state) = replace(
                                        &mut *state.into_inner(),
                                        TaskMetaState::Unloaded(UnloadedTaskState { stats_type }),
                                    ) else {
                                        unreachable!("partial is set so it must be Partial");
                                    };
                                    child.decrement_tasks();
                                    child.decrement_unfinished_tasks(backend);
                                    let notify = {
                                        // Partial tasks are always dirty
                                        let mut child = child.state.lock();
                                        child.remove_dirty_task(self.id);
                                        child.take_all_dependent_tasks()
                                    };
                                    drop(state);

                                    turbo_tasks.schedule_notify_tasks_set(&notify);

                                    // Now this root scope is eventually no longer referenced
                                    // and we can unload it, once all foreground jobs are done
                                    // since there might be ongoing add/remove scopes.
                                    let job =
                                        backend.create_backend_job(Job::UnloadRootScope(root));
                                    turbo_tasks.schedule_backend_foreground_job(job);
                                }
                            });
                        } else {
                            drop(state);
                        }
                        if !notify.is_empty() {
                            turbo_tasks.schedule_notify_tasks_set(&notify);
                        }
                        if active {
                            backend.decrease_scope_active(root, self.id, turbo_tasks);
                        }
                        if !partial && parent {
                            backend.with_scope(root, |child| {
                                child.remove_parent(id, backend);
                            });
                        }
                    }
                }
            }
            TaskScopes::Inner(set, _) => {
                if set.remove(id) {
                    if queue.capacity() == 0 {
                        queue.reserve(max(children.len(), SPLIT_OFF_QUEUE_AT * 2));
                    }
                    queue.extend(children.iter().copied());
                    let unset = set.is_unset();
                    self.remove_self_from_scope(&mut state, id, backend, turbo_tasks);
                    if unset {
                        if let TaskMetaStateWriteGuard::Partial(state) = state {
                            let stats_type = state.stats_type;
                            let mut state = state.into_inner();
                            *state = TaskMetaState::Unloaded(UnloadedTaskState { stats_type });
                        } else {
                            drop(state);
                        }
                    } else {
                        drop(state);
                    }
                }
            }
        }
    }

    fn remove_from_scope_internal(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        // VecDeque::new() would allocate with 7 items capacity. We don't want that.
        let mut queue = VecDeque::with_capacity(0);
        self.remove_from_scope_internal_shallow(id, backend, turbo_tasks, &mut queue);
        if !queue.is_empty() {
            run_remove_from_scope_queue(queue, id, backend, turbo_tasks);
        }
    }

    pub(crate) fn remove_from_scope(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.remove_from_scope_internal(id, backend, turbo_tasks)
    }

    pub(crate) fn remove_from_scopes(
        &self,
        scopes: impl Iterator<Item = TaskScopeId>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        for id in scopes {
            self.remove_from_scope_internal(id, backend, turbo_tasks)
        }
    }

    fn remove_root_or_initial_scope(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut state = self.full_state_mut();
        match state.scopes {
            TaskScopes::Root(root) => {
                log_scope_update!("removing root scope {root}");
                state.scopes = TaskScopes::default();

                turbo_tasks.schedule_backend_foreground_job(
                    backend.create_backend_job(Job::RemoveFromScope(state.children.clone(), root)),
                );
            }
            TaskScopes::Inner(ref mut set, _) => {
                log_scope_update!("removing initial scope");
                let initial = backend.initial_scope;
                if set.remove(initial) {
                    let children = state.children.iter().copied().collect::<VecDeque<_>>();
                    self.remove_self_from_scope(
                        &mut TaskMetaStateWriteGuard::Full(state),
                        initial,
                        backend,
                        turbo_tasks,
                    );
                    // state ends here, as it was passed into `remove_self_from_scope`

                    if !children.is_empty() {
                        run_remove_from_scope_queue(children, initial, backend, turbo_tasks);
                    }
                }
            }
        }
    }

    pub fn make_root_scoped(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let state = self.full_state_mut();
        self.make_root_scoped_internal(state, backend, turbo_tasks);
    }

    fn make_root_scoped_internal<'a>(
        &self,
        mut state: FullTaskWriteGuard<'a>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<FullTaskWriteGuard<'a>> {
        if matches!(state.scopes, TaskScopes::Root(_)) {
            return Some(state);
        }
        let root_scope = backend.create_new_scope(0);
        // Set the root scope of the current task
        if let TaskScopes::Inner(set, _) = replace(&mut state.scopes, TaskScopes::Root(root_scope))
        {
            let scopes = set.into_counts().collect::<Vec<_>>();
            log_scope_update!(
                "new {root_scope} for {:?} as internal root scope (replacing {scopes:?})",
                self.ty
            );
            let mut active_counter = 0isize;
            let mut tasks = AutoSet::default();
            let mut scopes_to_add_as_parent = Vec::new();
            let mut scopes_to_remove_as_parent = Vec::new();
            for (scope_id, count) in scopes.iter() {
                backend.with_scope(*scope_id, |scope| {
                    // add the new root scope as child of old scopes
                    let mut state = scope.state.lock();
                    match count.cmp(&0) {
                        Ordering::Greater => {
                            if let Some(ScopeChildChangeEffect {
                                notify,
                                active,
                                parent,
                            }) = state.add_child_count(root_scope, *count as usize)
                            {
                                tasks.extend(notify);
                                if active {
                                    active_counter += 1;
                                }
                                if parent {
                                    scopes_to_add_as_parent.push(*scope_id);
                                }
                            }
                        }
                        Ordering::Less => {
                            if let Some(ScopeChildChangeEffect {
                                notify,
                                active,
                                parent,
                            }) = state.remove_child_count(root_scope, (-*count) as usize)
                            {
                                tasks.extend(notify);
                                if active {
                                    active_counter -= 1;
                                }
                                if parent {
                                    scopes_to_remove_as_parent.push(*scope_id);
                                }
                            }
                        }
                        _ => {}
                    }
                });
            }
            if !tasks.is_empty() {
                turbo_tasks.schedule_notify_tasks_set(&tasks);
            }
            backend.with_scope(root_scope, |root_scope| {
                for parent in scopes_to_add_as_parent {
                    root_scope.add_parent(parent, backend);
                }
                for parent in scopes_to_remove_as_parent {
                    root_scope.remove_parent(parent, backend);
                }
            });

            // We collected how often the new root scope is considered as active by the old
            // scopes and increase the active counter by that.
            match active_counter.cmp(&0) {
                Ordering::Greater => {
                    backend.increase_scope_active_by(
                        root_scope,
                        active_counter as usize,
                        turbo_tasks,
                    );
                }
                Ordering::Less => {
                    backend.decrease_scope_active_by(
                        root_scope,
                        self.id,
                        (-active_counter) as usize,
                        turbo_tasks,
                    );
                }
                _ => {}
            }

            // add self to new root scope
            let schedule_self =
                self.add_self_to_new_scope(&mut state, root_scope, backend, turbo_tasks);

            let mut merging_scopes = Vec::with_capacity(scopes.len());
            // remove self from old scopes
            for (scope, count) in scopes.iter() {
                if *count > 0 {
                    merging_scopes.push(*scope);
                    self.remove_self_from_scope_full(&mut state, *scope, backend, turbo_tasks);
                }
            }

            if !state.children.is_empty() || schedule_self {
                let children = state.children.clone();

                drop(state);

                // Add children to new root scope
                for child in children.iter() {
                    backend.with_task(*child, |child| {
                        child.add_to_scope_internal(
                            root_scope,
                            merging_scopes.len(),
                            backend,
                            turbo_tasks,
                        );
                    })
                }

                // Potentially schedule itself, when root scope is active and task is dirty
                // I think that will never happen since it should already be scheduled by the
                // old scopes. Anyway let just do it to be safe:
                if schedule_self {
                    turbo_tasks.schedule(self.id);
                }

                // Remove children from old scopes
                #[cfg(feature = "inline_remove_from_scope")]
                for task in children {
                    backend.with_task(task, |task| {
                        task.remove_from_scopes(
                            merging_scopes.iter().copied(),
                            backend,
                            turbo_tasks,
                        )
                    });
                }
                #[cfg(not(feature = "inline_remove_from_scope"))]
                turbo_tasks.schedule_backend_foreground_job(
                    backend.create_backend_job(Job::RemoveFromScopes(children, merging_scopes)),
                );
                None
            } else {
                Some(state)
            }
        } else {
            unreachable!()
        }
    }

    pub(crate) fn add_dependency_to_current(dep: TaskDependency) {
        DEPENDENCIES_TO_TRACK.with(|list| {
            let mut list = list.borrow_mut();
            list.insert(dep);
        })
    }

    /// Get an [Invalidator] that can be used to invalidate the current [Task]
    /// based on external events.
    pub fn get_invalidator() -> Invalidator {
        get_invalidator()
    }

    /// Called by the [Invalidator]. Invalidate the [Task]. When the task is
    /// active it will be scheduled for execution.
    pub(crate) fn invalidate(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.make_dirty(backend, turbo_tasks)
    }

    /// Called when the task need to be recomputed because a gc'ed cell was
    /// read.
    pub(crate) fn recompute(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.make_dirty_internal(true, backend, turbo_tasks)
    }

    /// Access to the output cell.
    pub(crate) fn with_output_mut_if_available<T>(
        &self,
        func: impl FnOnce(&mut Output) -> T,
    ) -> Option<T> {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            Some(func(&mut state.output))
        } else {
            None
        }
    }

    /// Access to a cell.
    pub(crate) fn with_cell_mut<T>(&self, index: CellId, func: impl FnOnce(&mut Cell) -> T) -> T {
        let mut state = self.full_state_mut();
        let list = state.cells.entry(index.type_id).or_default();
        let i = index.index as usize;
        if list.len() <= i {
            list.resize_with(i + 1, Default::default);
        }
        func(&mut list[i])
    }

    /// Access to a cell.
    pub(crate) fn with_cell_mut_if_available<T>(
        &self,
        index: CellId,
        func: impl FnOnce(&mut Cell) -> T,
    ) -> Option<T> {
        self.state_mut()
            .as_full_mut()
            .and_then(|state| state.cells.get_mut(&index.type_id))
            .and_then(|list| list.get_mut(index.index as usize).map(func))
    }

    /// Access to a cell.
    pub(crate) fn with_cell<T>(&self, index: CellId, func: impl FnOnce(&Cell) -> T) -> T {
        if let Some(cell) = self
            .state()
            .as_full()
            .and_then(|state| state.cells.get(&index.type_id))
            .and_then(|list| list.get(index.index as usize))
        {
            func(cell)
        } else {
            func(&Default::default())
        }
    }

    /// For testing purposes
    pub fn reset_executions(&self) {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            state.stats.reset_executions()
        }
    }

    pub fn is_pending(&self) -> bool {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            !matches!(state.state_type, TaskStateType::Done { .. })
        } else {
            true
        }
    }

    pub fn reset_stats(&self) {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            state.stats.reset();
        }
    }

    pub fn get_stats_info(&self, backend: &MemoryBackend) -> TaskStatsInfo {
        match self.state() {
            TaskMetaStateReadGuard::Full(state) => {
                let (total_duration, last_duration, executions) = match &state.stats {
                    TaskStats::Essential(stats) => (None, stats.last_duration(), None),
                    TaskStats::Full(stats) => (
                        Some(stats.total_duration()),
                        stats.last_duration(),
                        Some(stats.executions()),
                    ),
                };

                TaskStatsInfo {
                    total_duration,
                    last_duration,
                    executions,
                    root_scoped: matches!(state.scopes, TaskScopes::Root(_)),
                    child_scopes: match state.scopes {
                        TaskScopes::Root(_) => 1,
                        TaskScopes::Inner(ref list, _) => list.len(),
                    },
                    active: state.scopes.iter().any(|scope| {
                        backend.with_scope(scope, |scope| scope.state.lock().is_active())
                    }),
                    unloaded: false,
                }
            }
            TaskMetaStateReadGuard::Partial(state) => TaskStatsInfo {
                total_duration: None,
                last_duration: Duration::ZERO,
                executions: None,
                root_scoped: false,
                child_scopes: if let TaskScopes::Inner(ref set, _) = state.scopes {
                    set.len()
                } else {
                    0
                },
                active: false,
                unloaded: true,
            },
            TaskMetaStateReadGuard::Unloaded(_) => TaskStatsInfo {
                total_duration: None,
                last_duration: Duration::ZERO,
                executions: None,
                root_scoped: false,
                child_scopes: 0,
                active: false,
                unloaded: true,
            },
        }
    }

    pub fn get_stats_type(self: &Task) -> StatsTaskType {
        match &self.ty {
            TaskType::Root(_) => StatsTaskType::Root(self.id),
            TaskType::Once(_) => StatsTaskType::Once(self.id),
            TaskType::ReadTaskCollectibles(box ReadTaskCollectiblesTaskType {
                trait_type, ..
            }) => StatsTaskType::ReadCollectibles(*trait_type),
            TaskType::ReadScopeCollectibles(box ReadScopeCollectiblesTaskType {
                trait_type,
                ..
            }) => StatsTaskType::ReadCollectibles(*trait_type),
            TaskType::Persistent(ty) => match &**ty {
                PersistentTaskType::Native(f, _) => StatsTaskType::Native(*f),
                PersistentTaskType::ResolveNative(f, _) => StatsTaskType::ResolveNative(*f),
                PersistentTaskType::ResolveTrait(t, n, _) => {
                    StatsTaskType::ResolveTrait(*t, n.to_string())
                }
            },
        }
    }

    pub fn get_stats_references(&self) -> StatsReferences {
        let mut refs = Vec::new();
        let mut scope_refs = Vec::new();
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            for child in state.children.iter() {
                refs.push((ReferenceType::Child, *child));
            }
            if let Done { ref dependencies } = state.state_type {
                for dep in dependencies.iter() {
                    match dep {
                        TaskDependency::TaskOutput(task) | TaskDependency::TaskCell(task, _) => {
                            refs.push((ReferenceType::Dependency, *task))
                        }
                        TaskDependency::ScopeChildren(scope)
                        | TaskDependency::ScopeCollectibles(scope, _) => {
                            scope_refs.push((ReferenceType::Dependency, *scope))
                        }
                    }
                }
            }
        }
        if let TaskType::Persistent(ty) = &self.ty {
            match &**ty {
                PersistentTaskType::Native(_, inputs)
                | PersistentTaskType::ResolveNative(_, inputs)
                | PersistentTaskType::ResolveTrait(_, _, inputs) => {
                    for input in inputs.iter() {
                        if let Some(task) = input.get_task_id() {
                            refs.push((ReferenceType::Input, task));
                        }
                    }
                }
            }
        }
        StatsReferences {
            tasks: refs,
            scopes: scope_refs,
        }
    }

    fn state_string(state: &TaskState) -> String {
        let mut state_str = match state.state_type {
            Scheduled { .. } => "scheduled".to_string(),
            InProgress { .. } => "in progress".to_string(),
            InProgressDirty { .. } => "in progress (dirty)".to_string(),
            Done { .. } => "done".to_string(),
            Dirty { .. } => "dirty".to_string(),
        };
        match state.scopes {
            TaskScopes::Root(root) => {
                write!(state_str, " (root scope {})", root).unwrap();
            }
            TaskScopes::Inner(ref list, change_counter) => {
                if !list.is_empty() || change_counter > 0 {
                    write!(state_str, " (scopes").unwrap();
                    for scope in list.iter() {
                        write!(state_str, " {}", *scope).unwrap();
                    }
                    if change_counter > 0 {
                        write!(state_str, " {change_counter} accumulated changes").unwrap();
                    }
                    write!(state_str, ")").unwrap();
                }
            }
        }
        state_str
    }

    pub(crate) fn connect_child(
        &self,
        child_id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let state = self.full_state_mut();
        self.connect_child_internal(state, child_id, backend, turbo_tasks);
    }

    fn connect_child_internal(
        &self,
        mut state: FullTaskWriteGuard<'_>,
        child_id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        if state.children.insert(child_id) {
            if let TaskScopes::Inner(_, optimization_counter) = &state.scopes {
                if should_optimize_to_root_scoped(*optimization_counter, state.children.len()) {
                    state.children.remove(&child_id);
                    drop(self.make_root_scoped_internal(state, backend, turbo_tasks));
                    return self.connect_child(child_id, backend, turbo_tasks);
                }
            }
            let scopes = state.scopes.clone();
            drop(state);

            backend.with_task(child_id, |child| {
                for scope in scopes.iter() {
                    #[cfg(not(feature = "report_expensive"))]
                    {
                        child.add_to_scope_internal(scope, 0, backend, turbo_tasks);
                    }
                    #[cfg(feature = "report_expensive")]
                    {
                        use std::time::Instant;

                        use turbo_tasks::util::FormatDuration;

                        let start = Instant::now();
                        child.add_to_scope_internal(scope, 0, backend, turbo_tasks);
                        let elapsed = start.elapsed();
                        if elapsed.as_millis() >= 10 {
                            println!(
                                "add_to_scope {scope} took {}: {:?}",
                                FormatDuration(elapsed),
                                child
                            );
                        }
                    }
                }
            });
        }
    }

    fn ensure_root_scoped<'a>(
        &'a self,
        mut state: FullTaskWriteGuard<'a>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> FullTaskWriteGuard<'a> {
        while !state.scopes.is_root() {
            #[cfg(not(feature = "report_expensive"))]
            let result = self.make_root_scoped_internal(state, backend, turbo_tasks);
            #[cfg(feature = "report_expensive")]
            let result = {
                use std::time::Instant;

                use turbo_tasks::util::FormatDuration;

                let start = Instant::now();
                let result = self.make_root_scoped_internal(state, backend, turbo_tasks);
                let elapsed = start.elapsed();
                if elapsed.as_millis() >= 10 {
                    println!(
                        "make_root_scoped took {}: {:?}",
                        FormatDuration(elapsed),
                        self
                    );
                }
                result
            };
            if let Some(s) = result {
                state = s;
                break;
            } else {
                // We need to acquire a new lock and everything might have changed in between
                state = self.full_state_mut();
                continue;
            }
        }
        state
    }

    pub(crate) fn get_or_wait_output<T, F: FnOnce(&mut Output) -> Result<T>>(
        &self,
        strongly_consistent: bool,
        func: F,
        note: impl Fn() -> String + Sync + Send + 'static,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<T, EventListener>> {
        let mut state = self.full_state_mut();
        if strongly_consistent {
            state = self.ensure_root_scoped(state, backend, turbo_tasks);
            // We need to wait for all foreground jobs to be finished as there could be
            // ongoing add_to_scope jobs that need to be finished before reading
            // from scopes
            if let Err(listener) = turbo_tasks.try_foreground_done() {
                return Ok(Err(listener));
            }
            if let TaskScopes::Root(root) = state.scopes {
                if let Some(listener) = backend.with_scope(root, |scope| {
                    if let Some(listener) = scope.has_unfinished_tasks() {
                        return Some(listener);
                    }
                    None
                }) {
                    return Ok(Err(listener));
                }
            } else {
                unreachable!()
            }
        }
        match state.state_type {
            Done { .. } => {
                let result = func(&mut state.output)?;
                drop(state);

                Ok(Ok(result))
            }
            Dirty { ref mut event } => {
                turbo_tasks.schedule(self.id);
                let event = event.take();
                let listener = event.listen_with_note(note);
                state.state_type = Scheduled { event };
                for scope in state.scopes.iter() {
                    backend.with_scope(scope, |scope| {
                        scope.state.lock().remove_dirty_task(self.id);
                    })
                }
                drop(state);
                Ok(Err(listener))
            }
            Scheduled { ref event }
            | InProgress { ref event, .. }
            | InProgressDirty { ref event } => {
                let listener = event.listen_with_note(note);
                drop(state);
                Ok(Err(listener))
            }
        }
    }

    async fn execute_read_task_collectibles(
        read_task_id: TaskId,
        task_id: TaskId,
        trait_type_id: TraitTypeId,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<MemoryBackend>>,
    ) -> Result<RawVc> {
        Self::execute_read_collectibles(
            read_task_id,
            |turbo_tasks| {
                let backend = turbo_tasks.backend();
                backend.with_task(task_id, |task| {
                    let state =
                        task.ensure_root_scoped(task.full_state_mut(), backend, turbo_tasks);
                    if let TaskScopes::Root(scope_id) = state.scopes {
                        backend.with_scope(scope_id, |scope| {
                            scope.read_collectibles_and_children(
                                scope_id,
                                trait_type_id,
                                read_task_id,
                            )
                        })
                    } else {
                        unreachable!();
                    }
                })
            },
            trait_type_id,
            turbo_tasks,
        )
        .await
    }

    async fn execute_read_scope_collectibles(
        read_task_id: TaskId,
        scope_id: TaskScopeId,
        trait_type_id: TraitTypeId,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<MemoryBackend>>,
    ) -> Result<RawVc> {
        Self::execute_read_collectibles(
            read_task_id,
            |turbo_tasks| {
                let backend = turbo_tasks.backend();
                backend.with_scope(scope_id, |scope| {
                    scope.read_collectibles_and_children(scope_id, trait_type_id, read_task_id)
                })
            },
            trait_type_id,
            turbo_tasks,
        )
        .await
    }

    async fn execute_read_collectibles(
        read_task_id: TaskId,
        read_collectibles_and_children: impl Fn(
            &dyn TurboTasksBackendApi<MemoryBackend>,
        ) -> Result<
            (CountHashSet<RawVc>, Vec<TaskScopeId>),
            EventListener,
        >,
        trait_type_id: TraitTypeId,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<MemoryBackend>>,
    ) -> Result<RawVc> {
        let (mut current, children) = loop {
            // For performance reasons we only want to read collectibles when there are no
            // unfinished tasks anymore.
            match read_collectibles_and_children(&*turbo_tasks) {
                Ok(r) => break r,
                Err(listener) => listener.await,
            }
        };
        let backend = turbo_tasks.backend();
        let children = children
            .into_iter()
            .filter_map(|child| {
                backend.with_scope(child, |scope| {
                    scope.is_propagating_collectibles().then(|| {
                        let task = backend.get_or_create_read_scope_collectibles_task(
                            child,
                            trait_type_id,
                            read_task_id,
                            &*turbo_tasks,
                        );
                        // Safety: RawVcSet is a transparent value
                        unsafe {
                            RawVc::TaskOutput(task)
                                .into_transparent_read::<RawVcSet, AutoSet<RawVc>>()
                        }
                    })
                })
            })
            .try_join()
            .await?;
        for child in children {
            for v in child.iter() {
                current.add(*v);
            }
        }
        Ok(RawVcSetVc::cell(current.iter().copied().collect()).into())
    }

    pub(crate) fn read_task_collectibles(
        &self,
        reader: TaskId,
        trait_id: TraitTypeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> RawVcSetVc {
        let task = backend.get_or_create_read_task_collectibles_task(
            self.id,
            trait_id,
            reader,
            turbo_tasks,
        );
        RawVc::TaskOutput(task).into()
    }

    pub(crate) fn emit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut state = self.full_state_mut();
        if state.collectibles.emit(trait_type, collectible) {
            let tasks = state
                .scopes
                .iter()
                .flat_map(|id| {
                    backend.with_scope(id, |scope| {
                        let mut state = scope.state.lock();
                        state.add_collectible(trait_type, collectible)
                    })
                })
                .flat_map(|e| e.notify)
                .collect::<AutoSet<_, _>>();
            drop(state);
            turbo_tasks.schedule_notify_tasks_set(&tasks);
        }
    }

    pub(crate) fn unemit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut state = self.full_state_mut();
        if state.collectibles.unemit(trait_type, collectible) {
            let mut tasks = AutoSet::default();
            state
                .scopes
                .iter()
                .flat_map(|id| {
                    backend.with_scope(id, |scope| {
                        let mut state = scope.state.lock();
                        state.remove_collectible(trait_type, collectible)
                    })
                })
                .for_each(|e| tasks.extend(e.notify));
            drop(state);
            turbo_tasks.schedule_notify_tasks_set(&tasks);
        }
    }

    pub(crate) fn gc_check_inactive(&self, backend: &MemoryBackend) {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            if state.gc.inactive {
                return;
            }
            state.gc.inactive = true;
            backend.on_task_flagged_inactive(self.id, state.stats.last_duration());
            for &child in state.children.iter() {
                backend.on_task_might_become_inactive(child);
            }
        }
    }

    pub(crate) fn run_gc(
        &self,
        now_relative_to_start: Duration,
        max_priority: GcPriority,
        task_duration_cache: &mut HashMap<TaskId, Duration, BuildNoHashHasher<TaskId>>,
        scope_active_cache: &mut HashMap<TaskScopeId, bool, BuildNoHashHasher<TaskScopeId>>,
        stats: &mut GcStats,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<GcPriority> {
        if !self.is_pure() {
            stats.no_gc_needed += 1;
            return None;
        }
        let mut cells_to_drop = Vec::new();
        // We don't want to access other tasks under this task lock, so we aggregate
        // missing information first, gather it and then retry.
        let mut missing_durations = Vec::new();
        loop {
            // This might be slightly inaccurate as we don't hold the lock for the whole
            // duration so it might be too large when concurrent modifications
            // happen, but that's fine.
            let mut dependent_tasks_compute_duration = Duration::ZERO;
            let mut included_tasks = HashSet::with_hasher(BuildNoHashHasher::<TaskId>::default());
            // Fill up missing durations
            for task_id in missing_durations.drain(..) {
                backend.with_task(task_id, |task| {
                    let duration = task.gc_compute_duration();
                    task_duration_cache.insert(task_id, duration);
                    dependent_tasks_compute_duration += duration;
                })
            }

            if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
                fn is_active(
                    state: &TaskState,
                    scope_active_cache: &mut HashMap<
                        TaskScopeId,
                        bool,
                        BuildNoHashHasher<TaskScopeId>,
                    >,
                    backend: &MemoryBackend,
                ) -> bool {
                    state.scopes.iter().any(|scope| {
                        *scope_active_cache.entry(scope).or_insert_with(|| {
                            backend.with_scope(scope, |scope| scope.state.lock().is_active())
                        })
                    })
                }
                if state.stateful {
                    stats.no_gc_possible += 1;
                    return None;
                }
                match &mut state.state_type {
                    TaskStateType::Done { dependencies } => {
                        dependencies.shrink_to_fit();
                    }
                    TaskStateType::Dirty { .. } => {}
                    _ => {
                        // GC can't run in this state. We will reschedule it when the execution
                        // completes.
                        stats.no_gc_needed += 1;
                        return None;
                    }
                }

                // Check if the task need to be activated again
                let active = if state.gc.inactive {
                    if is_active(&state, scope_active_cache, backend) {
                        state.gc.inactive = false;
                        true
                    } else {
                        false
                    }
                } else {
                    true
                };

                let last_duration = state.stats.last_duration();
                let compute_duration = last_duration.into();

                let age = to_exp_u8(
                    (now_relative_to_start
                        .saturating_sub(state.stats.last_execution_relative_to_start()))
                    .as_secs(),
                );

                let min_prio_that_needs_total_duration = if active {
                    GcPriority::EmptyCells {
                        total_compute_duration: to_exp_u8(last_duration.as_millis() as u64),
                        age: Reverse(age),
                    }
                } else {
                    GcPriority::InactiveUnload {
                        total_compute_duration: to_exp_u8(last_duration.as_millis() as u64),
                        age: Reverse(age),
                    }
                };

                let need_total_duration = max_priority >= min_prio_that_needs_total_duration;
                let has_unused_cells = state.cells.values().any(|cells| {
                    cells
                        .iter()
                        .any(|cell| cell.has_value() && !cell.has_dependent_tasks())
                });

                let empty_unused_priority = if active {
                    GcPriority::EmptyUnusedCells { compute_duration }
                } else {
                    GcPriority::InactiveEmptyUnusedCells { compute_duration }
                };

                if !need_total_duration {
                    // Fast mode, no need for total duration

                    if has_unused_cells {
                        if empty_unused_priority <= max_priority {
                            // Empty unused cells
                            for cells in state.cells.values_mut() {
                                cells.shrink_to_fit();
                                for cell in cells.iter_mut() {
                                    if !cell.has_dependent_tasks() {
                                        cells_to_drop.extend(cell.gc_content());
                                    }
                                    cell.shrink_to_fit();
                                }
                            }
                            stats.empty_unused_fast += 1;
                            return Some(GcPriority::EmptyCells {
                                total_compute_duration: to_exp_u8(
                                    Duration::from(compute_duration).as_millis() as u64,
                                ),
                                age: Reverse(age),
                            });
                        } else {
                            stats.priority_updated_fast += 1;
                            return Some(empty_unused_priority);
                        }
                    } else if active {
                        stats.priority_updated += 1;
                        return Some(GcPriority::EmptyCells {
                            total_compute_duration: to_exp_u8(
                                Duration::from(compute_duration).as_millis() as u64,
                            ),
                            age: Reverse(age),
                        });
                    } else {
                        stats.priority_updated += 1;
                        return Some(GcPriority::InactiveUnload {
                            total_compute_duration: to_exp_u8(
                                Duration::from(compute_duration).as_millis() as u64,
                            ),
                            age: Reverse(age),
                        });
                    }
                } else {
                    // Slow mode, need to compute total duration

                    let mut has_used_cells = false;
                    for cells in state.cells.values_mut() {
                        for cell in cells.iter_mut() {
                            if cell.has_value() && cell.has_dependent_tasks() {
                                has_used_cells = true;
                                for &task_id in cell.dependent_tasks() {
                                    if included_tasks.insert(task_id) {
                                        if let Some(duration) = task_duration_cache.get(&task_id) {
                                            dependent_tasks_compute_duration += *duration;
                                        } else {
                                            missing_durations.push(task_id);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !active {
                        for &task_id in state.output.dependent_tasks() {
                            if included_tasks.insert(task_id) {
                                if let Some(duration) = task_duration_cache.get(&task_id) {
                                    dependent_tasks_compute_duration += *duration;
                                } else {
                                    missing_durations.push(task_id);
                                }
                            }
                        }
                    }

                    let total_compute_duration =
                        max(last_duration, dependent_tasks_compute_duration);
                    let total_compute_duration_u8 =
                        to_exp_u8(total_compute_duration.as_millis() as u64);

                    // When we have all information available, we can either run the GC or return a
                    // new GC priority.
                    if missing_durations.is_empty() {
                        let mut new_priority = GcPriority::Placeholder;
                        // TODO We currently don't unload root scopes tasks, because of a bug in
                        // scope unloading. Fix that.
                        if !active && !state.scopes.is_root() {
                            new_priority = GcPriority::InactiveUnload {
                                age: Reverse(age),
                                total_compute_duration: total_compute_duration_u8,
                            };
                            if new_priority <= max_priority {
                                // Unload task
                                if self.unload(state, backend, turbo_tasks) {
                                    stats.unloaded += 1;
                                    return None;
                                } else {
                                    // unloading will fail if the task go active again
                                    return Some(GcPriority::EmptyCells {
                                        total_compute_duration: total_compute_duration_u8,
                                        age: Reverse(age),
                                    });
                                }
                            }
                        }

                        // always shrinking memory
                        state.output.dependent_tasks.shrink_to_fit();
                        if active && (has_unused_cells || has_used_cells) {
                            new_priority = GcPriority::EmptyCells {
                                total_compute_duration: total_compute_duration_u8,
                                age: Reverse(age),
                            };
                            if new_priority <= max_priority {
                                // Empty cells
                                let cells = take(&mut state.cells);
                                for cells in cells.into_values() {
                                    for mut cell in cells {
                                        if cell.has_value() {
                                            cells_to_drop.extend(cell.gc_content());
                                        }
                                    }
                                }
                                stats.empty_cells += 1;
                                return None;
                            }
                        }

                        // always shrinking memory
                        state.cells.shrink_to_fit();
                        if has_unused_cells && active {
                            new_priority = empty_unused_priority;
                            if new_priority <= max_priority {
                                // Empty unused cells
                                for cells in state.cells.values_mut() {
                                    cells.shrink_to_fit();
                                    for cell in cells.iter_mut() {
                                        if !cell.has_dependent_tasks() {
                                            cells_to_drop.extend(cell.gc_content());
                                        }
                                        cell.shrink_to_fit();
                                    }
                                }
                                stats.empty_unused += 1;
                                return Some(GcPriority::EmptyCells {
                                    total_compute_duration: total_compute_duration_u8,
                                    age: Reverse(age),
                                });
                            }
                        }

                        // Shrink memory
                        for cells in state.cells.values_mut() {
                            cells.shrink_to_fit();
                            for cell in cells.iter_mut() {
                                cell.shrink_to_fit();
                            }
                        }

                        // Return new gc priority if any
                        if new_priority != GcPriority::Placeholder {
                            stats.priority_updated += 1;

                            return Some(new_priority);
                        } else {
                            stats.no_gc_needed += 1;

                            return None;
                        }
                    }
                }
            } else {
                // Task is already unloaded, we are done with GC for it
                stats.no_gc_needed += 1;
                return None;
            }
        }
    }

    pub(crate) fn gc_compute_duration(&self) -> Duration {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            state.stats.last_duration()
        } else {
            Duration::ZERO
        }
    }

    fn unload(
        &self,
        mut full_state: FullTaskWriteGuard<'_>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut clear_dependencies = None;
        let TaskState {
            ref mut state_type,
            ref scopes,
            ..
        } = *full_state;
        match state_type {
            Done {
                ref mut dependencies,
            } => {
                for (i, scope) in scopes.iter().enumerate() {
                    let active = backend.with_scope(scope, |scope| {
                        scope.increment_unfinished_tasks(backend);
                        let mut scope_state = scope.state.lock();
                        if scope_state.is_active() {
                            drop(scope_state);
                            log_scope_update!(
                                "add unfinished task (unload): {} -> {}",
                                *scope.id,
                                *self.id
                            );
                            scope.decrement_unfinished_tasks(backend);
                            true
                        } else {
                            scope_state.add_dirty_task(self.id);
                            false
                        }
                    });
                    if active {
                        // Unloading is only possible for inactive tasks.
                        // We need to abort the unloading, so revert changes done so far.
                        for scope in scopes.iter().take(i) {
                            backend.with_scope(scope, |scope| {
                                scope.decrement_unfinished_tasks(backend);
                                log_scope_update!(
                                    "remove unfinished task (undo unload): {} -> {}",
                                    *scope.id,
                                    *self.id
                                );
                                let mut scope = scope.state.lock();
                                scope.remove_dirty_task(self.id);
                            });
                        }
                        return false;
                    }
                }
                clear_dependencies = Some(take(dependencies));
            }
            Dirty { ref event } => {
                // We want to get rid of this Event, so notify it to make sure it's empty.
                event.notify(usize::MAX);
            }
            _ => {
                // Any other state is not unloadable.
                return false;
            }
        }
        // Task is now dirty, so we can safely unload it

        let mut state = full_state.into_inner();
        let old_state = replace(
            &mut *state,
            // placeholder
            TaskMetaState::Unloaded(UnloadedTaskState {
                stats_type: StatsType::Essential,
            }),
        );
        let TaskState {
            children,
            cells,
            output,
            collectibles,
            scopes,
            stats,
            // can be dropped as it will be recomputed on next execution
            stateful: _,
            // can be dropped as it can be recomputed
            prepared_type: _,
            // can be dropped as always Dirty, event has been notified above
            state_type: _,
            // can be dropped as only gc meta info
            gc: _,
        } = old_state.into_full().unwrap();

        // Remove all children, as they will be added again when this task is executed
        // again
        if !children.is_empty() {
            remove_from_scopes(children, &scopes, backend, turbo_tasks);
        }

        // Remove all collectibles, as they will be added again when this task is
        // executed again.
        if let Some(collectibles) = collectibles.into_inner() {
            remove_collectible_from_scopes(
                collectibles.emitted,
                collectibles.unemitted,
                &scopes,
                backend,
                turbo_tasks,
            );
        }

        let unset = if let TaskScopes::Inner(ref scopes, _) = scopes {
            scopes.is_unset()
        } else {
            false
        };

        let stats_type = match stats {
            TaskStats::Essential(_) => StatsType::Essential,
            TaskStats::Full(_) => StatsType::Full,
        };
        if unset {
            *state = TaskMetaState::Unloaded(UnloadedTaskState { stats_type });
        } else {
            *state = TaskMetaState::Partial(Box::new(PartialTaskState { scopes, stats_type }));
        }
        drop(state);

        // Notify everyone that is listening on our output or cells.
        // This will mark everyone as dirty and will trigger a new execution when they
        // become active again.
        for cells in cells.into_values() {
            for cell in cells {
                cell.gc_drop(turbo_tasks);
            }
        }
        output.gc_drop(turbo_tasks);

        // We can clear the dependencies as we are already marked as dirty
        if let Some(dependencies) = clear_dependencies {
            self.clear_dependencies(dependencies, backend);
        }

        true
    }

    pub fn get_read_collectibles_task(
        &self,
        trait_id: TraitTypeId,
        create_new: impl FnOnce() -> TaskId,
    ) -> TaskId {
        let mut state = self.full_state_mut();
        state
            .collectibles
            .get_read_collectibles_task(trait_id, create_new)
    }
}

fn remove_collectible_from_scopes(
    emitted: AutoSet<(TraitTypeId, RawVc)>,
    unemitted: AutoSet<(TraitTypeId, RawVc)>,
    task_scopes: &TaskScopes,
    backend: &MemoryBackend,
    turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
) {
    task_scopes.iter().for_each(|id| {
        backend.with_scope(id, |scope| {
            let mut tasks = AutoSet::default();
            {
                let mut state = scope.state.lock();
                emitted
                    .iter()
                    .filter_map(|(trait_id, collectible)| {
                        state.remove_collectible(*trait_id, *collectible)
                    })
                    .for_each(|e| tasks.extend(e.notify));

                unemitted
                    .iter()
                    .filter_map(|(trait_id, collectible)| {
                        state.add_collectible(*trait_id, *collectible)
                    })
                    .for_each(|e| tasks.extend(e.notify));
            };
            turbo_tasks.schedule_notify_tasks_set(&tasks);
        })
    })
}

fn remove_from_scopes(
    tasks: AutoSet<TaskId, BuildNoHashHasher<TaskId>>,
    task_scopes: &TaskScopes,
    backend: &MemoryBackend,
    turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
) {
    match task_scopes {
        TaskScopes::Root(scope) => {
            turbo_tasks.schedule_backend_foreground_job(
                backend.create_backend_job(Job::RemoveFromScope(tasks, *scope)),
            );
        }
        TaskScopes::Inner(ref scopes, _) => {
            turbo_tasks.schedule_backend_foreground_job(backend.create_backend_job(
                Job::RemoveFromScopes(tasks, scopes.iter().copied().collect()),
            ));
        }
    }
}

/// Heuristic to decide when to split off work in `run_add_to_scope_queue` and
/// `run_remove_from_scope_queue`.
const SPLIT_OFF_QUEUE_AT: usize = 100;

/// Adds a list of tasks and their children to a scope, recursively.
pub fn run_add_to_scope_queue(
    mut queue: VecDeque<TaskId>,
    id: TaskScopeId,
    merging_scopes: usize,
    backend: &MemoryBackend,
    turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
) {
    while let Some(child) = queue.pop_front() {
        backend.with_task(child, |child| {
            child.add_to_scope_internal_shallow(
                id,
                merging_scopes,
                backend,
                turbo_tasks,
                &mut queue,
            );
        });
        #[cfg(not(feature = "inline_add_to_scope"))]
        while queue.len() > SPLIT_OFF_QUEUE_AT {
            let split_off_queue = queue.split_off(queue.len() - SPLIT_OFF_QUEUE_AT);
            turbo_tasks.schedule_backend_foreground_job(backend.create_backend_job(
                Job::AddToScopeQueue {
                    queue: split_off_queue,
                    scope: id,
                    merging_scopes,
                },
            ));
        }
    }
}

/// Removes a list of tasks and their children from a scope, recursively.
pub fn run_remove_from_scope_queue(
    mut queue: VecDeque<TaskId>,
    id: TaskScopeId,
    backend: &MemoryBackend,
    turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
) {
    while let Some(child) = queue.pop_front() {
        backend.with_task(child, |child| {
            child.remove_from_scope_internal_shallow(id, backend, turbo_tasks, &mut queue);
        });
        #[cfg(not(feature = "inline_remove_from_scope"))]
        while queue.len() > SPLIT_OFF_QUEUE_AT {
            let split_off_queue = queue.split_off(queue.len() - SPLIT_OFF_QUEUE_AT);

            turbo_tasks.schedule_backend_foreground_job(
                backend.create_backend_job(Job::RemoveFromScopeQueue(split_off_queue, id)),
            );
        }
    }
}

impl Display for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            write!(
                f,
                "Task({}, {})",
                self.get_description(),
                Task::state_string(&state)
            )
        } else {
            write!(f, "Task({}, unloaded)", self.get_description())
        }
    }
}

impl Hash for Task {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&(self as *const Task), state)
    }
}

impl PartialEq for Task {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}

impl Eq for Task {}

pub struct TaskStatsInfo {
    pub total_duration: Option<Duration>,
    pub last_duration: Duration,
    pub executions: Option<u32>,
    pub root_scoped: bool,
    pub child_scopes: usize,
    pub active: bool,
    pub unloaded: bool,
}
