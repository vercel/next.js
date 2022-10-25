use std::{
    borrow::Cow,
    collections::{BinaryHeap, HashSet},
    fmt::Debug,
    future::Future,
    mem::{replace, take},
    pin::Pin,
    sync::{
        atomic::{fence, AtomicU32, AtomicUsize, Ordering},
        Mutex, MutexGuard,
    },
    time::Duration,
};

use anyhow::{anyhow, Result};
use concurrent_queue::ConcurrentQueue;
use event_listener::{Event, EventListener};
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CellContent, CellMappings, PersistentTaskType, TaskExecutionSpec,
        TransientTaskType,
    },
    persisted_graph::{
        ActivateResult, DeactivateResult, PersistResult, PersistTaskState, PersistedGraph,
        PersistedGraphApi, ReadTaskState, TaskCell, TaskData,
    },
    util::{IdFactory, InfiniteVec, SharedError},
    RawVc, TaskId, TraitTypeId, TurboTasksBackendApi,
};

type RootTaskFn =
    Box<dyn Fn() -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> + Send + Sync>;

enum TaskType {
    Persistent(PersistentTaskType),
    Root(RootTaskFn),
    Once(Mutex<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>),
}

impl Debug for TaskType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Persistent(ty) => f.debug_tuple("Persistent").field(ty).finish(),
            Self::Root(_) => f.debug_tuple("Root").finish(),
            Self::Once(_) => f.debug_tuple("Once").finish(),
        }
    }
}

// dirty+active+scheduled -> clean+active+done -> dirty+active+done+scheduled

#[derive(PartialEq, Eq, Copy, Clone, Debug)]
enum TaskFreshness {
    NeverExecuted,
    Dirty,
    Done,
}

impl Default for TaskFreshness {
    fn default() -> Self {
        TaskFreshness::NeverExecuted
    }
}

#[derive(Default, Debug)]
struct MemoryTaskState {
    need_persist: bool,
    has_changes: bool,
    freshness: TaskFreshness,
    cells: Vec<(TaskCell, HashSet<TaskId>)>,
    cell_mappings: Option<CellMappings>,
    output: Option<Result<RawVc, SharedError>>,
    output_dependent: HashSet<TaskId>,
    dependencies: HashSet<RawVc>,
    children: HashSet<TaskId>,
    event: Event,
    event_cells: Event,
}

#[derive(Default, Debug)]
struct PersistedTaskState {
    clean: Option<bool>,
}

#[derive(Default, Debug)]
struct TaskState {
    memory: Option<MemoryTaskState>,
    persisted: Option<PersistedTaskState>,

    /// the memory version is considered as active
    active: bool,

    // cross activeness:
    /// There are active parents in memory graph
    /// that keep the persisted version active too
    mem_to_persisted_active: bool,

    /// There are active parents in persisted graph
    /// that keep the memory version active
    persisted_to_mem_active: bool,

    scheduled: bool,
}

struct Task {
    task_type: TaskType,
    task_state: Mutex<TaskState>,
    active_parents: AtomicU32,
}

enum BackgroundJob {
    DeactivateTasks(Vec<TaskId>),
    ActivatePersisted(TaskId),
    DeactivatePersisted(TaskId),
}

pub struct MemoryBackendWithPersistedGraph<P: PersistedGraph> {
    pub pg: P,
    tasks: InfiniteVec<Option<Task>>,
    cache: flurry::HashMap<PersistentTaskType, TaskId>,
    background_job_id_factory: IdFactory<BackendJobId>,
    background_jobs: InfiniteVec<Option<BackgroundJob>>,
    only_known_to_memory_tasks: flurry::HashSet<TaskId>,
    /// Tasks that were selected to persist
    persist_queue1: ConcurrentQueue<TaskId>,
    persist_queue1_queued: flurry::HashSet<TaskId>,
    need_persisting: flurry::HashSet<TaskId>,
    /// Task sorted by importance, sharded to avoid lock contention
    persist_queue_by_duration: [Mutex<BinaryHeap<(Duration, TaskId)>>; 64],
    persist_capacity: AtomicUsize,
    persist_job: BackendJobId,
    partial_lookups: flurry::HashMap<PersistentTaskType, bool>,
    #[cfg(feature = "unsafe_once_map")]
    partial_lookup: turbo_tasks::util::OnceConcurrentlyMap<PersistentTaskType, bool>,
    #[cfg(not(feature = "unsafe_once_map"))]
    partial_lookup: turbo_tasks::util::SafeOnceConcurrentlyMap<PersistentTaskType, bool>,

    #[cfg(feature = "log_running_tasks")]
    in_progress_tasks: Mutex<HashSet<TaskId>>,
}

impl<P: PersistedGraph> MemoryBackendWithPersistedGraph<P> {
    pub fn new(pg: P) -> Self {
        let background_job_id_factory = IdFactory::new();
        let persist_job = background_job_id_factory.get();
        Self {
            pg,
            tasks: InfiniteVec::new_allocate_initial(),
            cache: flurry::HashMap::new(),
            background_job_id_factory,
            background_jobs: InfiniteVec::new_allocate_initial(),
            only_known_to_memory_tasks: flurry::HashSet::new(),
            persist_queue1: ConcurrentQueue::unbounded(),
            persist_queue1_queued: flurry::HashSet::new(),
            need_persisting: flurry::HashSet::new(),
            persist_queue_by_duration: [(); 64].map(|_| Mutex::new(BinaryHeap::new())),
            persist_capacity: AtomicUsize::new(num_cpus::get()),
            persist_job,
            partial_lookups: flurry::HashMap::new(),
            #[cfg(feature = "unsafe_once_map")]
            partial_lookup: turbo_tasks::util::OnceConcurrentlyMap::new(),
            #[cfg(not(feature = "unsafe_once_map"))]
            partial_lookup: turbo_tasks::util::SafeOnceConcurrentlyMap::new(),
            #[cfg(feature = "log_running_tasks")]
            in_progress_tasks: Mutex::new(HashSet::new()),
        }
    }

    fn state_mut(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> (MutexGuard<'_, TaskState>, &Task) {
        let task_info = self.tasks.get(*task).as_ref().unwrap();
        let mut state = task_info.task_state.lock().unwrap();
        self.ensure_task_initialized(task, task_info, &mut state, turbo_tasks);
        (state, task_info)
    }

    fn mem_state_mut(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> (MutexGuard<'_, TaskState>, &Task) {
        let task_info = self.tasks.get(*task).as_ref().unwrap();
        loop {
            let mut delayed_activate = Vec::new();
            let mut state = task_info.task_state.lock().unwrap();
            self.ensure_task_in_memory(task, &mut state, &mut delayed_activate, turbo_tasks);
            if delayed_activate.is_empty() {
                return (state, task_info);
            }
            drop(state);
            loop {
                for task in take(&mut delayed_activate) {
                    let (state, task_info) = self.state_mut(task, turbo_tasks);
                    self.activate_task_inner(
                        task,
                        state,
                        task_info,
                        &mut delayed_activate,
                        turbo_tasks,
                    );
                }
                if delayed_activate.is_empty() {
                    break;
                }
            }
        }
    }

    fn ensure_task_initialized(
        &self,
        task: TaskId,
        task_info: &Task,
        task_state: &mut TaskState,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        if task_state.memory.is_none() && task_state.persisted.is_none() {
            if let TaskType::Persistent(_) = &task_info.task_type {
                if self.pg_is_persisted(task, turbo_tasks) {
                    task_state.persisted = Some(PersistedTaskState { clean: None });
                } else {
                    task_state.memory = Some(MemoryTaskState::default());
                }
            } else {
                // We must never have not initizalized transient task in the cache
                // This is ensured by initializing the task when creating it
                unreachable!();
            }
        }
    }

    fn ensure_task_in_memory(
        &self,
        task: TaskId,
        task_state: &mut TaskState,
        delayed_activate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        if task_state.memory.is_none() {
            if let Some((data, state)) = self.pg_read(task, turbo_tasks) {
                task_state.persisted = Some(PersistedTaskState {
                    clean: Some(state.clean),
                });
                let mem_state = MemoryTaskState {
                    freshness: if state.clean {
                        TaskFreshness::Done
                    } else {
                        TaskFreshness::Dirty
                    },
                    cells: data
                        .cells
                        .into_iter()
                        .map(|s| (s, HashSet::new()))
                        .collect(),
                    cell_mappings: data.cell_mappings,
                    output: Some(Ok(data.output)),
                    output_dependent: HashSet::new(),
                    dependencies: data.dependencies.into_iter().collect(),
                    children: data.children.into_iter().collect(),
                    ..Default::default()
                };
                if task_state.active {
                    for &child in mem_state.children.iter() {
                        self.try_increment_active_parents(
                            child,
                            false,
                            1,
                            delayed_activate,
                            turbo_tasks,
                        );
                    }
                }
                if !task_state.persisted_to_mem_active && state.keeps_external_active {
                    delayed_activate.push(task);
                }
                task_state.persisted_to_mem_active = state.keeps_external_active;
                task_state.memory = Some(mem_state);
                if !state.clean && task_state.active && !task_state.scheduled {
                    task_state.scheduled = true;
                    #[cfg(feature = "log_scheduled_tasks")]
                    println!("schedule({task}) in ensure_task_in_memory");
                    turbo_tasks.schedule(task);
                }
            } else {
                task_state.memory = Some(MemoryTaskState::default());
            }
        }
    }

    fn lookup(
        &self,
        cache: &flurry::HashMapRef<'_, PersistentTaskType, TaskId>,
        task_type: &PersistentTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<TaskId> {
        for i in 0..task_type.len() {
            let partial = task_type.partial(i);
            let complete_cached = self.partial_lookups.pin().get(&partial).copied();
            let complete = complete_cached.unwrap_or_else(|| {
                self.partial_lookup.action(&partial, || {
                    let complete = self.pg_lookup(&partial, turbo_tasks);
                    self.partial_lookups.pin().insert(partial.clone(), complete);
                    complete
                })
            });
            if complete {
                return cache.get(task_type).copied();
            }
        }
        self.pg_lookup_one(task_type, turbo_tasks)
    }

    fn connect(&self, parent_task: TaskId, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        // connect() will never be called concurrently for the same parent_task
        // therefore it's safe to add the task into children before incrementing
        // active_parents.
        // An active_parents underflow can't happen because of that.

        let (mut state, _) = self.mem_state_mut(parent_task, turbo_tasks);
        let mem_state = state.memory.as_mut().unwrap();
        if !mem_state.children.insert(task) {
            return;
        }
        let memory_active = state.active;
        drop(state);

        #[cfg(feature = "log_connect_tasks")]
        println!("connect({parent_task} -> {task}) (memory_active={memory_active})");
        if memory_active {
            self.increment_active_parents(task, 1, turbo_tasks);
        }
    }

    fn connect_already_counted(
        &self,
        parent_task: TaskId,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        // The active_parents count was already initialized with 1
        // When this was incorrect, we need to revert that.
        let (mut state, _) = self.mem_state_mut(parent_task, turbo_tasks);
        let mem_state = state.memory.as_mut().unwrap();
        if !mem_state.children.insert(task) {
            // revert already increased count as it has already been added a child before
            drop(state);
            self.decrement_active_parents(task, 1, turbo_tasks);
            return;
        }
        #[cfg(feature = "log_connect_tasks")]
        println!(
            "connect_already_counted({parent_task} -> {task}) (memory_active={})",
            state.active
        );
        if !state.active {
            // revert already increased count as the parent task is not active
            drop(state);
            self.decrement_active_parents(task, 1, turbo_tasks);
        }
    }

    fn schedule_background_job(&self, job: BackgroundJob, turbo_tasks: &dyn TurboTasksBackendApi) {
        let id = self.background_job_id_factory.get();
        // SAFETY: It's a fresh id
        unsafe {
            self.background_jobs.set(*id, Some(job));
        }
        turbo_tasks.schedule_backend_background_job(id);
    }

    fn activate_persisted(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        if let Some(ActivateResult {
            keeps_external_active,
            external,
            dirty,
            more_tasks_to_activate,
        }) = self.pg_activate_when_needed(task, turbo_tasks)
        {
            for task in more_tasks_to_activate {
                self.schedule_background_job(BackgroundJob::ActivatePersisted(task), turbo_tasks);
            }
            let (mut state, task_info) = self.state_mut(task, turbo_tasks);
            if dirty && state.memory.is_none() && !state.scheduled {
                state.scheduled = true;
                #[cfg(feature = "log_scheduled_tasks")]
                println!("schedule({task}) in activate_persisted");
                turbo_tasks.schedule(task);
            }
            if (external || state.memory.is_some())
                && state.persisted_to_mem_active != keeps_external_active
            {
                state.persisted_to_mem_active = keeps_external_active;
                if keeps_external_active {
                    self.activate_task(task, state, task_info, turbo_tasks)
                } else {
                    self.deactivate_task(task, state, task_info, turbo_tasks)
                }
            }
        }
    }

    fn deactivate_persisted(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        if let Some(DeactivateResult {
            more_tasks_to_deactivate,
        }) = self.pg_deactivate_when_needed(task, turbo_tasks)
        {
            for task in more_tasks_to_deactivate {
                self.schedule_background_job(BackgroundJob::DeactivatePersisted(task), turbo_tasks);
            }
            let (mut state, task_info) = self.state_mut(task, turbo_tasks);
            if state.persisted_to_mem_active {
                state.persisted_to_mem_active = false;
                self.deactivate_task(task, state, task_info, turbo_tasks);
            }
        }
    }

    fn increment_active_parents(
        &self,
        task: TaskId,
        by: u32,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut delayed_activate = Vec::new();
        self.try_increment_active_parents(task, true, by, &mut delayed_activate, turbo_tasks);
        while !delayed_activate.is_empty() {
            for task in take(&mut delayed_activate) {
                let (state, task_info) = self.state_mut(task, turbo_tasks);
                self.activate_task_inner(
                    task,
                    state,
                    task_info,
                    &mut delayed_activate,
                    turbo_tasks,
                );
            }
        }
    }

    fn try_increment_active_parents(
        &self,
        task: TaskId,
        force: bool,
        by: u32,
        delayed_activate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let task_info = self.tasks.get(*task).as_ref().unwrap();
        let prev = task_info.active_parents.fetch_add(by, Ordering::Relaxed);
        if prev == 0 {
            // only the connect() call that increases from 0 is responsible for activating
            let mut state = if force {
                task_info.task_state.lock().unwrap()
            } else {
                match task_info.task_state.try_lock() {
                    Ok(state) => state,
                    Err(_) => {
                        delayed_activate.push(task);
                        return;
                    }
                }
            };
            self.ensure_task_initialized(task, task_info, &mut state, turbo_tasks);
            self.activate_task_inner(task, state, task_info, delayed_activate, turbo_tasks);
        }
    }

    fn activate_task(
        &self,
        task: TaskId,
        state: MutexGuard<TaskState>,
        task_info: &Task,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut delayed_activate = Vec::new();
        self.activate_task_inner(task, state, task_info, &mut delayed_activate, turbo_tasks);
        while !delayed_activate.is_empty() {
            for task in take(&mut delayed_activate) {
                let (state, task_info) = self.state_mut(task, turbo_tasks);
                self.activate_task_inner(
                    task,
                    state,
                    task_info,
                    &mut delayed_activate,
                    turbo_tasks,
                );
            }
        }
    }

    fn activate_task_inner(
        &self,
        task: TaskId,
        mut state: MutexGuard<TaskState>,
        task_info: &Task,
        delayed_activate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let TaskState {
            ref mut active,
            ref persisted_to_mem_active,
            ref persisted,
            ref mut mem_to_persisted_active,
            ref mut scheduled,
            ref memory,
            ..
        } = *state;
        let mut activate_persisted = false;
        let mut deactivate_persisted = false;
        let has_active_parents = task_info.active_parents.load(Ordering::Acquire) > 0;
        if persisted.is_some() && !*mem_to_persisted_active && has_active_parents {
            *mem_to_persisted_active = true;
            if self.pg_set_externally_active(task, turbo_tasks) {
                activate_persisted = true;
            }
        }
        if *mem_to_persisted_active && !has_active_parents {
            *mem_to_persisted_active = false;
            if self.pg_unset_externally_active(task, turbo_tasks) {
                deactivate_persisted = true;
            }
        }
        if !*active && (has_active_parents || *persisted_to_mem_active) {
            *active = true;
            #[cfg(feature = "log_activate_tasks")]
            println!("activate {task}");
            if let Some(MemoryTaskState {
                freshness,
                children,
                ..
            }) = memory
            {
                if !*scheduled && *freshness != TaskFreshness::Done {
                    *scheduled = true;
                    #[cfg(feature = "log_scheduled_tasks")]
                    println!("schedule({task}) in activate_task_inner");
                    turbo_tasks.schedule(task);
                }
                for child in children.iter() {
                    self.try_increment_active_parents(
                        *child,
                        false,
                        1,
                        delayed_activate,
                        turbo_tasks,
                    );
                }
            }
        }
        drop(state);
        if activate_persisted {
            self.activate_persisted(task, turbo_tasks);
        }
        if deactivate_persisted {
            self.deactivate_persisted(task, turbo_tasks);
        }
    }

    fn decrement_active_parents(
        &self,
        task: TaskId,
        by: u32,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.decrement_active_parents_limited(&[(task, by)], 0, turbo_tasks);
    }

    fn decrement_active_parents_limited(
        &self,
        tasks: &[(TaskId, u32)],
        remaining_depth: u8,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut delayed_deactivate = Vec::new();
        for (task, by) in tasks {
            self.try_decrement_active_parents(
                *task,
                *by,
                remaining_depth,
                &mut delayed_deactivate,
                turbo_tasks,
            );
        }
        if !delayed_deactivate.is_empty() {
            self.schedule_background_job(
                BackgroundJob::DeactivateTasks(delayed_deactivate),
                turbo_tasks,
            );
        }
    }

    fn try_decrement_active_parents(
        &self,
        task: TaskId,
        by: u32,
        remaining_depth: u8,
        delayed_deactivate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let task_info = self.tasks.get(*task).as_ref().unwrap();
        let prev = task_info.active_parents.fetch_sub(by, Ordering::Relaxed);
        if prev == by {
            // count reached zero
            let mut state = if remaining_depth > 0 {
                match task_info.task_state.try_lock() {
                    Ok(state) => state,
                    Err(_) => {
                        delayed_deactivate.push(task);
                        return;
                    }
                }
            } else {
                delayed_deactivate.push(task);
                return;
            };
            self.ensure_task_initialized(task, task_info, &mut state, turbo_tasks);
            self.deactivate_task_inner(
                task,
                state,
                task_info,
                remaining_depth - 1,
                delayed_deactivate,
                turbo_tasks,
            );
        }
    }

    fn deactivate_task(
        &self,
        task: TaskId,
        state: MutexGuard<TaskState>,
        task_info: &Task,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut delayed_deactivate = Vec::new();
        self.deactivate_task_inner(
            task,
            state,
            task_info,
            2,
            &mut delayed_deactivate,
            turbo_tasks,
        );
        if !delayed_deactivate.is_empty() {
            self.schedule_background_job(
                BackgroundJob::DeactivateTasks(delayed_deactivate),
                turbo_tasks,
            );
        }
    }

    fn deactivate_tasks(&self, tasks: &[TaskId], turbo_tasks: &dyn TurboTasksBackendApi) {
        let mut delayed_deactivate = Vec::new();
        for task in tasks {
            let (state, task_info) = self.state_mut(*task, turbo_tasks);
            self.deactivate_task_inner(
                *task,
                state,
                task_info,
                2,
                &mut delayed_deactivate,
                turbo_tasks,
            );
        }
        if !delayed_deactivate.is_empty() {
            self.schedule_background_job(
                BackgroundJob::DeactivateTasks(delayed_deactivate),
                turbo_tasks,
            );
        }
    }

    fn deactivate_task_inner(
        &self,
        task: TaskId,
        mut state: MutexGuard<TaskState>,
        task_info: &Task,
        remaining_depth: u8,
        delayed_deactivate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut deactivate_persisted = false;
        let TaskState {
            ref mut active,
            ref mut mem_to_persisted_active,
            ref memory,
            ..
        } = *state;
        if *active && task_info.active_parents.load(Ordering::Acquire) == 0 {
            *active = false;
            if *mem_to_persisted_active {
                *mem_to_persisted_active = false;
                if self.pg_unset_externally_active(task, turbo_tasks) {
                    deactivate_persisted = true;
                }
            }
            if let Some(MemoryTaskState { ref children, .. }) = memory {
                for child in children.iter() {
                    self.try_decrement_active_parents(
                        *child,
                        1,
                        remaining_depth,
                        delayed_deactivate,
                        turbo_tasks,
                    );
                }
            }
        }
        drop(state);
        if deactivate_persisted {
            self.deactivate_persisted(task, turbo_tasks);
        }
    }

    fn persist(&self, turbo_tasks: &dyn TurboTasksBackendApi) -> bool {
        let persist_queue1_queued = self.persist_queue1_queued.pin();
        loop {
            if let Ok(mut task) = self.persist_queue1.pop() {
                persist_queue1_queued.remove(&task);
                let need_persisting = self.need_persisting.pin();
                'outer: loop {
                    need_persisting.remove(&task);
                    let (mut state, task_info) = self.state_mut(task, turbo_tasks);
                    if let TaskState {
                        ref mut persisted,
                        ref mut mem_to_persisted_active,
                        memory:
                            Some(MemoryTaskState {
                                freshness: TaskFreshness::Done,
                                ref mut need_persist,
                                ref output,
                                ref mut has_changes,
                                ref children,
                                ref dependencies,
                                ref cells,
                                ref cell_mappings,
                                ..
                            }),
                        ..
                    } = *state
                    {
                        if *need_persist || persisted.is_none() {
                            *need_persist = false;
                            if let TaskType::Persistent(_task_type) = &task_info.task_type {
                                if let &Some(Ok(output)) = &output {
                                    if *has_changes || persisted.is_none() {
                                        for higher_prio_task in dependencies
                                            .iter()
                                            .map(|vc| vc.get_task_id())
                                            .chain(children.iter().copied())
                                        {
                                            if need_persisting.contains(&higher_prio_task) {
                                                if persist_queue1_queued.insert(task) {
                                                    self.persist_queue1.push(task).unwrap();
                                                }
                                                task = higher_prio_task;
                                                continue 'outer;
                                            }
                                        }
                                        if !dependencies.is_empty() {
                                            let only_known_to_memory_tasks =
                                                self.only_known_to_memory_tasks.pin();
                                            for dep in dependencies.iter() {
                                                let task = dep.get_task_id();
                                                only_known_to_memory_tasks.remove(&task);
                                            }
                                        }
                                        let data = TaskData {
                                            children: children.iter().cloned().collect(),
                                            dependencies: dependencies.iter().cloned().collect(),
                                            cells: cells.iter().map(|(s, _)| s.clone()).collect(),
                                            cell_mappings: cell_mappings.clone(),
                                            output: *output,
                                        };
                                        let externally_active =
                                            task_info.active_parents.load(Ordering::Acquire) > 0;
                                        let task_state =
                                            turbo_tasks::persisted_graph::PersistTaskState {
                                                externally_active,
                                            };
                                        if let Some(PersistResult {
                                            tasks_to_activate,
                                            tasks_to_deactivate,
                                        }) = self.pg_persist(task, data, task_state, turbo_tasks)
                                        {
                                            *persisted =
                                                Some(PersistedTaskState { clean: Some(true) });
                                            *has_changes = false;
                                            *mem_to_persisted_active = externally_active;
                                            drop(state);
                                            for task in tasks_to_activate {
                                                self.activate_persisted(task, turbo_tasks);
                                            }
                                            for task in tasks_to_deactivate {
                                                self.schedule_background_job(
                                                    BackgroundJob::DeactivatePersisted(task),
                                                    turbo_tasks,
                                                )
                                            }
                                            return true;
                                        } else {
                                            println!(
                                                "task {task} failed to persist: {:?}",
                                                task_info.task_type
                                            );
                                        }
                                    } else {
                                        self.pg_make_clean(task, turbo_tasks);
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                    break;
                }
                continue;
            }

            let mut did_something = false;
            for queue in self.persist_queue_by_duration.iter() {
                let mut queue = queue.lock().unwrap();
                if let Some((_dur, task)) = queue.pop() {
                    let (state, _) = self.state_mut(task, turbo_tasks);
                    if let Some(MemoryTaskState {
                        dependencies: _, ..
                    }) = &state.memory
                    {
                        // let dependencies = dependencies
                        //     .iter()
                        //     .map(|d| d.get_task_id())
                        //     .collect::<HashSet<_>>();
                        // for dep in dependencies {
                        //     if persist_queue1_queued.insert(dep) {
                        //         self.persist_queue1.push(dep).unwrap();
                        //         did_something = true;
                        //     }
                        // }
                        if persist_queue1_queued.insert(task) {
                            self.persist_queue1.push(task).unwrap();
                            did_something = true;
                        }
                    }
                }
            }

            return did_something;
        }
    }

    fn has_persist_work(&self) -> bool {
        !self.persist_queue1.is_empty()
            || self
                .persist_queue_by_duration
                .iter()
                .any(|q| !q.lock().unwrap().is_empty())
    }

    fn increase_persist_workers(&self, n: usize, turbo_tasks: &dyn TurboTasksBackendApi) {
        loop {
            let capacity = self.persist_capacity.load(Ordering::Acquire);
            if capacity == 0 {
                break;
            }
            let can_start = std::cmp::min(capacity, n);
            if self
                .persist_capacity
                .compare_exchange(
                    capacity,
                    capacity - can_start,
                    Ordering::Release,
                    Ordering::Relaxed,
                )
                .is_ok()
            {
                for _ in 0..can_start {
                    turbo_tasks.schedule_backend_background_job(self.persist_job);
                }
            }
        }
    }
}

impl<P: PersistedGraph> Backend for MemoryBackendWithPersistedGraph<P> {
    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi) {
        let (tasks_to_activate, tasks_to_deactivate) =
            self.pg_get_pending_active_update(turbo_tasks);
        let tasks = self.pg_get_active_external_tasks(turbo_tasks);
        let dirty_tasks = self.pg_get_dirty_active_tasks(turbo_tasks);

        for task in tasks.iter() {
            #[allow(unused_variables)]
            let (mut state, task_info) = self.state_mut(*task, turbo_tasks);
            state.persisted_to_mem_active = true;
            state.memory = Some(MemoryTaskState::default());
            #[cfg(feature = "log_running_tasks")]
            {
                println!(
                    "restored external active task {} {:?}",
                    task, task_info.task_type
                );
            }
        }
        for task in dirty_tasks.iter() {
            #[allow(unused_variables)]
            let (mut state, task_info) = self.state_mut(*task, turbo_tasks);
            state.persisted_to_mem_active = true;
            state.persisted = Some(PersistedTaskState { clean: Some(false) });
            #[cfg(feature = "log_running_tasks")]
            {
                println!(
                    "restored dirty active task {} {:?}",
                    task, task_info.task_type
                );
            }

            // On startup this is never scheduled yet
            state.scheduled = true;
        }
        for task in tasks.into_iter() {
            let (state, task_info) = self.state_mut(task, turbo_tasks);
            self.activate_task(task, state, task_info, turbo_tasks);
        }

        for task in dirty_tasks.into_iter() {
            let (state, task_info) = self.state_mut(task, turbo_tasks);
            self.activate_task(task, state, task_info, turbo_tasks);
            // Activate would not schedule it since it's not in memory
            turbo_tasks.schedule(task);
        }
        for task in tasks_to_activate {
            #[cfg(feature = "log_running_tasks")]
            {
                let (state, task_info) = self.state_mut(task, turbo_tasks);
                println!(
                    "continue pending activate {} {:?}",
                    task, task_info.task_type
                );
            }
            self.activate_persisted(task, turbo_tasks);
        }
        for task in tasks_to_deactivate {
            #[cfg(feature = "log_running_tasks")]
            {
                let (state, task_info) = self.state_mut(task, turbo_tasks);
                println!(
                    "continue pending deactivate {} {:?}",
                    task, task_info.task_type
                );
            }
            self.schedule_background_job(BackgroundJob::DeactivatePersisted(task), turbo_tasks);
        }
    }

    fn stop(&self, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.pg_stop(turbo_tasks);
    }

    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        let (mut state, _) = self.state_mut(task, turbo_tasks);

        if let Some(MemoryTaskState { freshness, .. }) = &mut state.memory {
            if *freshness != TaskFreshness::Dirty {
                *freshness = TaskFreshness::Dirty;
                if state.active && !state.scheduled {
                    state.scheduled = true;
                    turbo_tasks.schedule(task);
                }
            }
        }
        if let Some(PersistedTaskState { clean, .. }) = &mut state.persisted {
            if *clean != Some(false) && self.pg_make_dirty(task, turbo_tasks) {
                *clean = Some(false);
                if !state.scheduled {
                    state.scheduled = true;
                    turbo_tasks.schedule(task);
                }
            }
        }
    }

    fn invalidate_tasks(&self, tasks: Vec<TaskId>, turbo_tasks: &dyn TurboTasksBackendApi) {
        for task in tasks {
            self.invalidate_task(task, turbo_tasks);
        }
    }

    fn get_task_description(&self, task: TaskId) -> String {
        let task_info = self.tasks.get(*task).as_ref().unwrap();
        format!("{:?}", task_info.task_type)
    }

    type ExecutionScopeFuture<T: Future<Output = Result<()>> + Send + 'static> = T;
    fn execution_scope<T: Future<Output = Result<()>> + Send + 'static>(
        &self,
        _task: TaskId,
        future: T,
    ) -> Self::ExecutionScopeFuture<T> {
        future
    }

    fn try_start_task_execution(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<TaskExecutionSpec> {
        let (mut state, task_info) = self.mem_state_mut(task, turbo_tasks);
        let mem_state = state.memory.as_mut().unwrap();
        if mem_state.freshness == TaskFreshness::Done {
            state.scheduled = false;
            return None;
        }
        #[cfg(feature = "log_running_tasks")]
        {
            let mut t = self.in_progress_tasks.lock().unwrap();
            t.insert(task);
            println!("start {} {:?}", task, task_info.task_type);
        }
        mem_state.freshness = TaskFreshness::NeverExecuted;
        let deps = take(&mut mem_state.dependencies);
        let children = take(&mut mem_state.children);
        let mut cell_mappings = mem_state.cell_mappings.take().unwrap_or_default();
        cell_mappings.reset();
        drop(state);
        for dep in deps {
            let (mut state, _) = self.mem_state_mut(dep.get_task_id(), turbo_tasks);
            let mem_state = state.memory.as_mut().unwrap();
            match dep {
                RawVc::TaskOutput(_) => {
                    mem_state.output_dependent.remove(&task);
                }
                RawVc::TaskCell(_, i) => {
                    if let Some((_, dependent)) = mem_state.cells.get_mut(i) {
                        dependent.remove(&task);
                    }
                }
            }
        }
        for child in children {
            self.decrement_active_parents(child, 1, turbo_tasks);
        }
        let future = match &task_info.task_type {
            TaskType::Persistent(t) => t.clone().run(turbo_tasks.pin()),
            TaskType::Root(root) => root(),
            TaskType::Once(once) => {
                let mut m = once.lock().unwrap();
                replace(
                    &mut *m,
                    Box::pin(async { Err(anyhow::anyhow!("Once task can only be executed once")) }),
                )
            }
        };
        Some(TaskExecutionSpec {
            future,
            cell_mappings: Some(cell_mappings),
        })
    }

    fn task_execution_result(
        &self,
        task: TaskId,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let (mut state, _task_info) = self.mem_state_mut(task, turbo_tasks);
        let TaskState { ref mut memory, .. } = *state;
        let mem_state = memory.as_mut().unwrap();
        let result = result.unwrap_or_else(|panic| match panic {
            Some(message) => Err(anyhow!("A task panicked: {message}")),
            None => Err(anyhow!("A task panicked")),
        });
        let output_change = if let (Some(Ok(old)), Ok(new)) = (&mem_state.output, &result) {
            old != new
        } else {
            true
        };
        let dependent = if output_change {
            mem_state.has_changes = true;
            mem_state.output = Some(result.map_err(SharedError::new));
            take(&mut mem_state.output_dependent)
        } else {
            HashSet::new()
        };

        drop(state);

        if !dependent.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&dependent);
        }
    }

    fn task_execution_completed(
        &self,
        task: TaskId,
        cell_mappings: Option<CellMappings>,
        duration: Duration,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        #[cfg(feature = "log_running_tasks")]
        {
            println!("done {}", task);
            let mut t = self.in_progress_tasks.lock().unwrap();
            t.remove(&task);
            println!("running {:?}", t.iter().take(10).collect::<Vec<_>>());
        }
        let (mut state, task_info) = self.mem_state_mut(task, turbo_tasks);
        let TaskState {
            ref mut scheduled,
            ref mut memory,
            ref mut persisted,
            ..
        } = *state;
        let mem_state = memory.as_mut().unwrap();
        mem_state.cell_mappings = cell_mappings;
        if mem_state.freshness == TaskFreshness::Dirty {
            return true;
        }
        mem_state.freshness = TaskFreshness::Done;
        *scheduled = false;
        mem_state.event.notify(usize::MAX);
        mem_state.event_cells.notify(usize::MAX);
        mem_state.need_persist = true;
        let has_changes = mem_state.has_changes;
        let is_persisted = persisted.is_some();
        let is_dirty_persisted = persisted
            .as_ref()
            .map(|p| p.clean != Some(true))
            .unwrap_or_default();
        drop(state);

        if let TaskType::Persistent(_) = task_info.task_type {
            if has_changes
                && (is_persisted || !self.only_known_to_memory_tasks.pin().contains(&task))
            {
                for task in self.pg_make_dependent_dirty(RawVc::TaskOutput(task), turbo_tasks) {
                    let (mut state, _) = self.state_mut(task, turbo_tasks);
                    if !state.scheduled {
                        state.scheduled = true;
                        #[cfg(feature = "log_scheduled_tasks")]
                        println!("schedule({task}) in task_execution_completed");
                        turbo_tasks.schedule(task);
                    }
                }
            }
            if has_changes || is_dirty_persisted {
                self.need_persisting.pin().insert(task);
                self.persist_queue_by_duration[*task % self.persist_queue_by_duration.len()]
                    .lock()
                    .unwrap()
                    .push((duration, task));
                self.increase_persist_workers(1, turbo_tasks);
            }
        }

        false
    }

    fn run_backend_job<'a>(
        &'a self,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        if id == self.persist_job {
            return Box::pin(async {
                if self.persist(turbo_tasks) {
                    turbo_tasks.schedule_backend_background_job(self.persist_job);
                } else {
                    self.persist_capacity.fetch_add(1, Ordering::Relaxed);
                    if self.has_persist_work() {
                        // Might be a race condition, work was just added before
                        // we reduced persist_capacity. To avoid a stall we will
                        // increase the workers again in this situation.
                        self.increase_persist_workers(1, turbo_tasks)
                    }
                }
            });
        }
        // SAFETY: We are the only owner of this id
        let job = unsafe { self.background_jobs.get_mut(*id) }.take();
        fence(Ordering::Release);
        unsafe {
            self.background_job_id_factory.reuse(id);
        }
        if let Some(job) = job {
            match job {
                BackgroundJob::DeactivateTasks(tasks) => Box::pin(async move {
                    for chunk in tasks.chunks(10) {
                        self.deactivate_tasks(chunk, turbo_tasks)
                    }
                }),
                BackgroundJob::ActivatePersisted(task) => {
                    Box::pin(async move { self.activate_persisted(task, turbo_tasks) })
                }
                BackgroundJob::DeactivatePersisted(task) => {
                    Box::pin(async move { self.deactivate_persisted(task, turbo_tasks) })
                }
            }
        } else {
            Box::pin(async {})
        }
    }

    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        _strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, EventListener>> {
        let (mut state, _task_info) = self.mem_state_mut(task, turbo_tasks);
        let TaskState {
            ref mut scheduled,
            ref mut memory,
            ..
        } = *state;
        let mem_state = memory.as_mut().unwrap();
        if mem_state.freshness != TaskFreshness::Done {
            let listener = mem_state.event.listen();
            if !*scheduled {
                *scheduled = true;
                #[cfg(feature = "log_scheduled_tasks")]
                println!(
                    "schedule({task}) in try_read_task_output[{:?}]",
                    mem_state.freshness
                );
                turbo_tasks.schedule(task);
            }
            #[cfg(feature = "log_running_tasks")]
            println!("waiting {} waits on {}: {:?}", reader, task, state);
            return Ok(Err(listener));
        }
        let need_dependency = mem_state.output_dependent.insert(reader);
        let result = Ok(Ok(mem_state.output.as_ref().unwrap().clone()?));
        drop(state);
        if need_dependency {
            let (mut state, _) = self.mem_state_mut(reader, turbo_tasks);
            let mem_state = state.memory.as_mut().unwrap();
            mem_state.dependencies.insert(RawVc::TaskOutput(task));
        }
        result
    }

    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        _strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, EventListener>> {
        let (state, task_info) = self.mem_state_mut(task, turbo_tasks);
        let mem_state = state.memory.as_ref().unwrap();
        if mem_state.freshness != TaskFreshness::Done {
            let listener = mem_state.event.listen();
            if !state.active {
                self.activate_task(task, state, task_info, turbo_tasks);
            }
            #[cfg(feature = "log_running_tasks")]
            println!("waiting ?? waits on {}", task);
            return Ok(Err(listener));
        }
        Ok(Ok(mem_state.output.as_ref().unwrap().clone()?))
    }

    fn track_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let (mut state, _) = self.mem_state_mut(task, turbo_tasks);
        let mem_state = state.memory.as_mut().unwrap();
        let need_dependency = mem_state.output_dependent.insert(reader);
        drop(state);
        if need_dependency {
            let (mut state, _) = self.mem_state_mut(reader, turbo_tasks);
            let mem_state = state.memory.as_mut().unwrap();
            mem_state.dependencies.insert(RawVc::TaskOutput(task));
        }
    }

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<CellContent, EventListener>> {
        let (mut state, _task_info) = self.mem_state_mut(task, turbo_tasks);
        let TaskState {
            ref mut scheduled,
            ref mut memory,
            ..
        } = *state;
        let mem_state = memory.as_mut().unwrap();
        if mem_state.freshness == TaskFreshness::NeverExecuted {
            if !*scheduled {
                *scheduled = true;
                #[cfg(feature = "log_scheduled_tasks")]
                println!("schedule({task}) in try_read_task_cell[NeverExecuted]");
                turbo_tasks.schedule(task);
            }
            #[cfg(feature = "log_running_tasks")]
            println!("waiting (fresh task) {} waits on {}", reader, task);
            return Ok(Err(mem_state.event_cells.listen()));
        }
        if let Some((cell, dependent)) = mem_state.cells.get_mut(index) {
            match cell {
                TaskCell::Content(content) => {
                    let content = content.clone();
                    let need_dependency = dependent.insert(reader);
                    drop(state);
                    if need_dependency {
                        let (mut state, _) = self.mem_state_mut(reader, turbo_tasks);
                        let mem_state = state.memory.as_mut().unwrap();
                        mem_state.dependencies.insert(RawVc::TaskCell(task, index));
                    }
                    Ok(Ok(content))
                }
                TaskCell::NeedComputation => {
                    if mem_state.freshness != TaskFreshness::Dirty {
                        mem_state.freshness = TaskFreshness::Dirty;
                        if !*scheduled {
                            *scheduled = true;
                            #[cfg(feature = "log_scheduled_tasks")]
                            println!("schedule({task}) in try_read_task_cell[NeedComputation]");
                            turbo_tasks.schedule(task);
                        }
                    }
                    #[cfg(feature = "log_running_tasks")]
                    println!("waiting (need computation) {} waits on {}", reader, task);
                    Ok(Err(mem_state.event.listen()))
                }
            }
        } else {
            if !*scheduled {
                *scheduled = true;
                #[cfg(feature = "log_scheduled_tasks")]
                println!("schedule({task}) in try_read_task_cell[Cell missing]");
                turbo_tasks.schedule(task);
            }
            #[cfg(feature = "log_running_tasks")]
            println!("waiting (incomplete task) {} waits on {}", reader, task);
            Ok(Err(mem_state.event_cells.listen()))
        }
    }

    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: usize,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<CellContent, EventListener>> {
        let (mut state, _) = self.mem_state_mut(task, turbo_tasks);
        let TaskState {
            ref mut scheduled,
            ref mut memory,
            ..
        } = *state;
        let mem_state = memory.as_mut().unwrap();
        let (cell, _) = mem_state
            .cells
            .get(index)
            .ok_or_else(|| anyhow!("Cannot read non-existing cell"))?;
        match cell {
            TaskCell::Content(content) => {
                let content = content.clone();
                drop(state);
                Ok(Ok(content))
            }
            TaskCell::NeedComputation => {
                if mem_state.freshness != TaskFreshness::Dirty {
                    mem_state.freshness = TaskFreshness::Dirty;
                    if !*scheduled {
                        *scheduled = true;
                        #[cfg(feature = "log_scheduled_tasks")]
                        println!("schedule({task}) in try_read_task_cell_untracked");
                        turbo_tasks.schedule(task);
                    }
                }
                Ok(Err(mem_state.event.listen()))
            }
        }
    }

    fn try_read_own_task_cell_untracked(
        &self,
        task: TaskId,
        index: usize,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<CellContent> {
        let (state, _) = self.mem_state_mut(task, turbo_tasks);
        let mem_state = state.memory.as_ref().unwrap();
        if let Some((cell, _)) = mem_state.cells.get(index) {
            match cell {
                TaskCell::Content(content) => Ok(content.clone()),
                TaskCell::NeedComputation => Ok(CellContent(None)),
            }
        } else {
            Ok(CellContent(None))
        }
    }

    fn track_read_task_cell(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let (mut state, _) = self.mem_state_mut(task, turbo_tasks);
        let mem_state = state.memory.as_mut().unwrap();
        if let Some((_, dependent)) = mem_state.cells.get_mut(index) {
            let need_dependency = dependent.insert(reader);
            drop(state);
            if need_dependency {
                let (mut state, _) = self.mem_state_mut(reader, turbo_tasks);
                let mem_state = state.memory.as_mut().unwrap();
                mem_state.dependencies.insert(RawVc::TaskCell(task, index));
            }
        }
    }

    fn try_read_task_collectibles(
        &self,
        _task: TaskId,
        _trait_id: TraitTypeId,
        _reader: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<HashSet<RawVc>, EventListener>> {
        todo!()
    }

    fn emit_collectible(
        &self,
        _trait_id: TraitTypeId,
        _collectible: RawVc,
        _task: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        todo!()
    }

    fn unemit_collectible(
        &self,
        _trait_id: TraitTypeId,
        _collectible: RawVc,
        _task: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        todo!()
    }

    fn get_fresh_cell(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) -> usize {
        let (mut state, task_info) = self.mem_state_mut(task, turbo_tasks);
        if let TaskType::Persistent(_) = task_info.task_type {
            let mem_state = state.memory.as_mut().unwrap();
            let index = mem_state.cells.len();
            mem_state
                .cells
                .push((TaskCell::Content(CellContent(None)), HashSet::new()));
            index
        } else {
            panic!("Only Persistent Tasks can store data")
        }
    }

    fn update_task_cell(
        &self,
        task: TaskId,
        index: usize,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let (mut state, task_info) = self.mem_state_mut(task, turbo_tasks);
        let TaskState {
            ref mut memory,
            ref mut persisted,
            ..
        } = *state;
        let mem_state = memory.as_mut().unwrap();
        mem_state.has_changes = true;
        let (cell, dependent) = mem_state
            .cells
            .get_mut(index)
            .ok_or_else(|| anyhow!("Cannot update non-existing cell"))
            .unwrap();
        *cell = TaskCell::Content(content);
        mem_state.event_cells.notify(usize::MAX);
        let is_persisted = persisted.is_some();
        if !dependent.is_empty() {
            let dependent = take(dependent);
            drop(state);
            turbo_tasks.schedule_notify_tasks_set(&dependent);
        } else {
            drop(state);
        }
        if let TaskType::Persistent(_) = task_info.task_type {
            if is_persisted || !self.only_known_to_memory_tasks.pin().contains(&task) {
                for task in self.pg_make_dependent_dirty(RawVc::TaskCell(task, index), turbo_tasks)
                {
                    let (mut state, _) = self.state_mut(task, turbo_tasks);
                    if !state.scheduled {
                        state.scheduled = true;
                        #[cfg(feature = "log_scheduled_tasks")]
                        println!("schedule({task}) in update_task_cell");
                        turbo_tasks.schedule(task);
                    }
                }
            }
        }
    }

    fn get_or_create_persistent_task(
        &self,
        task_type: PersistentTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId {
        let cache = self.cache.pin();
        if let Some(task) = cache.get(&task_type) {
            self.connect(parent_task, *task, turbo_tasks);
            return *task;
        }
        if let Some(task) = self.lookup(&cache, &task_type, turbo_tasks) {
            // a return value from lookup was already added to the cache by the id mapping
            self.connect(parent_task, task, turbo_tasks);
            return task;
        }

        let new_task = Task {
            active_parents: AtomicU32::new(1),
            task_state: Mutex::new(TaskState {
                scheduled: true,
                memory: Some(MemoryTaskState {
                    freshness: TaskFreshness::NeverExecuted,
                    ..Default::default()
                }),
                persisted: None,
                active: true,
                ..Default::default()
            }),
            task_type: TaskType::Persistent(task_type.clone()),
        };
        let task = turbo_tasks.get_fresh_task_id();
        // SAFETY: It's a fresh task id
        unsafe {
            self.tasks.set(*task, Some(new_task));
        }
        match cache.try_insert(task_type, task) {
            Ok(_) => {
                self.only_known_to_memory_tasks.pin().insert(task);
                #[cfg(feature = "log_scheduled_tasks")]
                println!("schedule({task}) in get_or_create_persistent_task");
                turbo_tasks.schedule(task);
                self.connect_already_counted(parent_task, task, turbo_tasks);
                task
            }
            Err(e) => {
                // SAFETY: We are still the only owner of this task and id
                unsafe {
                    self.tasks.set(*task, None);
                    turbo_tasks.reuse_task_id(task);
                }
                let task = *e.current;
                self.connect(parent_task, task, turbo_tasks);
                task
            }
        }
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId {
        let new_task = Task {
            active_parents: AtomicU32::new(1),
            task_state: Mutex::new(TaskState {
                scheduled: true,
                memory: Some(MemoryTaskState {
                    freshness: TaskFreshness::NeverExecuted,
                    ..Default::default()
                }),
                persisted: None,
                active: true,
                ..Default::default()
            }),
            task_type: match task_type {
                TransientTaskType::Root(r) => TaskType::Root(r),
                TransientTaskType::Once(o) => TaskType::Once(Mutex::new(o)),
            },
        };
        let task = turbo_tasks.get_fresh_task_id();
        // SAFETY: It's a fresh task id
        unsafe {
            self.tasks.set(*task, Some(new_task));
        }
        self.only_known_to_memory_tasks.pin().insert(task);
        task
    }
}

struct MemoryBackendPersistedGraphApi<'a, P: PersistedGraph> {
    backend: &'a MemoryBackendWithPersistedGraph<P>,
    turbo_tasks: &'a dyn TurboTasksBackendApi,
}

impl<'a, P: PersistedGraph> PersistedGraphApi for MemoryBackendPersistedGraphApi<'a, P> {
    fn get_or_create_task_type(&self, task_type: PersistentTaskType) -> TaskId {
        let cache = self.backend.cache.pin();
        // We could try a cache.get first to avoid insert and remove
        // but it seems very unlikely that we actually already know the task type
        let new_task = Task {
            active_parents: AtomicU32::new(0),
            task_state: Mutex::new(Default::default()),
            task_type: TaskType::Persistent(task_type.clone()),
        };
        let task = self.turbo_tasks.get_fresh_task_id();
        // SAFETY: It's a fresh task id
        unsafe {
            self.backend.tasks.set(*task, Some(new_task));
        }
        match cache.try_insert(task_type, task) {
            Ok(_) => task,
            Err(e) => {
                unsafe {
                    self.turbo_tasks.reuse_task_id(task);
                }
                *e.current
            }
        }
    }

    fn lookup_task_type(&self, id: TaskId) -> &PersistentTaskType {
        let task = self.backend.tasks.get(*id).as_ref().unwrap();
        match &task.task_type {
            TaskType::Persistent(ty) => ty,
            _ => panic!("lookup_task_type should only be used for PersistentTaskType"),
        }
    }
}

impl<P: PersistedGraph> MemoryBackendWithPersistedGraph<P> {
    fn pg_read(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<(TaskData, ReadTaskState)> {
        self.pg
            .read(
                task,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    fn pg_lookup_one(
        &self,
        task_type: &PersistentTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<TaskId> {
        self.pg
            .lookup_one(
                task_type,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    fn pg_lookup(
        &self,
        partial_task_type: &PersistentTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        self.pg
            .lookup(
                partial_task_type,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    fn pg_is_persisted(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) -> bool {
        self.pg
            .is_persisted(
                task,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    fn pg_persist(
        &self,
        task: TaskId,
        data: TaskData,
        state: PersistTaskState,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<PersistResult> {
        self.pg
            .persist(
                task,
                data,
                state,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    #[must_use]
    fn pg_activate_when_needed(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<ActivateResult> {
        self.pg
            .activate_when_needed(
                task,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    #[must_use]
    fn pg_deactivate_when_needed(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<DeactivateResult> {
        self.pg
            .deactivate_when_needed(
                task,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    #[must_use]
    fn pg_set_externally_active(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        self.pg
            .set_externally_active(
                task,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    #[must_use]
    fn pg_unset_externally_active(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        self.pg
            .unset_externally_active(
                task,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    #[must_use]
    fn pg_make_dirty(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) -> bool {
        self.pg
            .make_dirty(
                task,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    #[must_use]
    fn pg_make_dependent_dirty(
        &self,
        vc: RawVc,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Vec<TaskId> {
        self.pg
            .make_dependent_dirty(
                vc,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    fn pg_make_clean(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.pg
            .make_clean(
                task,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    // FIXME
    #[allow(dead_code)]
    #[must_use]
    fn pg_remove_outdated_externally_active(
        &self,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Vec<TaskId> {
        self.pg
            .remove_outdated_externally_active(&MemoryBackendPersistedGraphApi {
                backend: self,
                turbo_tasks,
            })
            .unwrap()
    }

    #[must_use]
    fn pg_get_active_external_tasks(&self, turbo_tasks: &dyn TurboTasksBackendApi) -> Vec<TaskId> {
        self.pg
            .get_active_external_tasks(&MemoryBackendPersistedGraphApi {
                backend: self,
                turbo_tasks,
            })
            .unwrap()
    }

    #[must_use]
    fn pg_get_dirty_active_tasks(&self, turbo_tasks: &dyn TurboTasksBackendApi) -> Vec<TaskId> {
        self.pg
            .get_dirty_active_tasks(&MemoryBackendPersistedGraphApi {
                backend: self,
                turbo_tasks,
            })
            .unwrap()
    }

    #[must_use]
    fn pg_get_pending_active_update(
        &self,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> (Vec<TaskId>, Vec<TaskId>) {
        self.pg
            .get_pending_active_update(&MemoryBackendPersistedGraphApi {
                backend: self,
                turbo_tasks,
            })
            .unwrap()
    }

    fn pg_stop(&self, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.pg
            .stop(&MemoryBackendPersistedGraphApi {
                backend: self,
                turbo_tasks,
            })
            .unwrap()
    }
}
