use std::{
    collections::{BinaryHeap, HashSet},
    fmt::Debug,
    future::Future,
    mem::{replace, take},
    pin::Pin,
    sync::{
        atomic::{fence, AtomicU32, AtomicUsize, Ordering},
        Mutex, MutexGuard,
    },
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use concurrent_queue::ConcurrentQueue;
use event_listener::{Event, EventListener};
use turbo_tasks::{
    backend::{Backend, PersistentTaskType, TransientTaskType},
    backend::{BackgroundJobId, SlotContent, SlotMappings, TaskExecutionSpec},
    persisted_graph::{
        ActivateResult, DeactivateResult, PersistTaskState, PersistedGraph, PersistedGraphApi,
        ReadTaskState, TaskData, TaskSlot,
    },
    util::{IdFactory, InfiniteVec, SharedError},
    RawVc, TaskId, TurboTasksBackendApi,
};

enum TaskType {
    Persistent(PersistentTaskType),
    Root(Box<dyn Fn() -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> + Send + Sync>),
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
struct TaskState {
    in_memory: bool,
    persisted: bool,

    // shared state:
    scheduled: bool,

    // the following are only for in memory tasks:
    active: bool,
    need_persist: bool,
    has_changes: bool,
    freshness: TaskFreshness,
    slots: Vec<(TaskSlot, HashSet<TaskId>)>,
    slot_mappings: Option<SlotMappings>,
    output: Option<Result<RawVc, SharedError>>,
    output_dependent: HashSet<TaskId>,
    dependencies: HashSet<RawVc>,
    children: HashSet<TaskId>,
    event: Event,

    start: Option<Instant>,
}

const IN_MEMORY: u32 = 1;
const PERSISTED: u32 = 2;
const ACTIVE_PARENTS_MASK: u32 = !3;
const ACTIVE_PARENTS_SHIFT: u32 = 2;

struct Task {
    task_type: TaskType,
    task_state: Mutex<TaskState>,
    /// bit 1: in_memory
    /// bit 2: persisted
    /// renmaining bits: active_parents count for in_memory
    call_graph_state: AtomicU32,
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
    background_job_id_factory: IdFactory<BackgroundJobId>,
    background_jobs: InfiniteVec<Option<BackgroundJob>>,
    /// Tasks that were selected to persist
    persist_queue1: ConcurrentQueue<TaskId>,
    /// Task sorted by importance, shared to avoid lock contention
    persist_queue2: [Mutex<BinaryHeap<(Duration, TaskId)>>; 64],
    persist_capacity: AtomicUsize,
    persist_job: BackgroundJobId,
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
            persist_queue1: ConcurrentQueue::unbounded(),
            persist_queue2: [(); 64].map(|_| Mutex::new(BinaryHeap::new())),
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
        self.ensure_task_initialized(task, &task_info, &mut *state, turbo_tasks);
        (state, task_info)
    }
    fn mem_state_mut(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> (MutexGuard<'_, TaskState>, &Task) {
        let task_info = self.tasks.get(*task).as_ref().unwrap();
        let mut state = task_info.task_state.lock().unwrap();
        self.ensure_task_in_memory(task, &task_info, &mut *state, turbo_tasks);
        (state, task_info)
    }

    fn ensure_task_initialized(
        &self,
        task: TaskId,
        task_info: &Task,
        task_state: &mut TaskState,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        if !task_state.in_memory && !task_state.persisted {
            if let TaskType::Persistent(_) = &task_info.task_type {
                if self.pg_is_persisted(task, turbo_tasks) {
                    task_state.persisted = true;
                } else {
                    task_state.in_memory = true;
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
        task_info: &Task,
        task_state: &mut TaskState,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        if !task_state.in_memory {
            if let Some((data, state)) = self.pg_read(task, turbo_tasks) {
                task_state.in_memory = true;
                task_state.persisted = true;
                task_state.freshness = if state.clean {
                    TaskFreshness::Done
                } else {
                    TaskFreshness::Dirty
                };
                let active_parents = (task_info.call_graph_state.fetch_add(
                    state.external_incoming << ACTIVE_PARENTS_SHIFT | IN_MEMORY,
                    Ordering::AcqRel,
                ) & ACTIVE_PARENTS_MASK)
                    >> ACTIVE_PARENTS_SHIFT;
                task_state.active = active_parents + state.external_incoming > 0;
                task_state.slots = data
                    .slots
                    .into_iter()
                    .map(|s| (s, HashSet::new()))
                    .collect();
                task_state.slot_mappings = data.slot_mappings;
                task_state.output = Some(Ok(data.output));
                task_state.output_dependent = HashSet::new();
                task_state.dependencies = data.dependencies.into_iter().collect();
                task_state.children = data.children.into_iter().collect();
                if task_state.freshness != TaskFreshness::Done
                    && task_state.active
                    && !task_state.scheduled
                {
                    task_state.scheduled = true;
                    #[cfg(feature = "log_scheduled_tasks")]
                    println!("schedule({task}) in ensure_task_in_memory");
                    turbo_tasks.schedule(task);
                }
            } else {
                task_state.in_memory = true;
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
            let complete_cached = self.partial_lookups.pin().get(&partial).map(|v| *v);
            let complete = complete_cached.unwrap_or_else(|| {
                self.partial_lookup
                    .action(&partial, || self.pg_lookup(&partial, turbo_tasks))
            });
            if complete {
                return cache.get(&task_type).map(|v| *v);
            }
        }
        self.pg_lookup_one(&task_type, turbo_tasks)
    }

    fn connect(&self, parent_task: TaskId, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        // connect() will never be called concurrently for the same parent_task
        // therefore it's safe to add the task into children before incrementing
        // active_parents.
        // An active_parents underflow can't happen because of that.

        let (mut state, _) = self.mem_state_mut(parent_task, turbo_tasks);
        if !state.children.insert(task) {
            return;
        }
        let memory_active = state.active;
        let memory_only = state.in_memory && !state.persisted;
        drop(state);

        if memory_active {
            self.increment_active_parents(task, 1, memory_only, turbo_tasks);
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
        let memory_only = state.in_memory && !state.persisted;
        if !state.children.insert(task) || !state.active {
            drop(state);
            self.decrement_active_parents(task, 1, false, turbo_tasks);
        }
        if memory_only {
            if self.pg_add_external_incoming(task, 1, turbo_tasks) {
                self.activate_persisted(task, turbo_tasks)
            }
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
            increased_external_outgoing,
            more_tasks_to_activate,
            dirty,
        }) = self.pg_activate_when_needed(task, turbo_tasks)
        {
            for (task, by) in increased_external_outgoing {
                self.increment_active_parents(task, by, false, turbo_tasks);
            }
            for task in more_tasks_to_activate {
                self.schedule_background_job(BackgroundJob::ActivatePersisted(task), turbo_tasks);
            }
            if dirty {
                let (mut state, _) = self.state_mut(task, turbo_tasks);
                if !state.scheduled {
                    state.scheduled = true;
                    #[cfg(feature = "log_scheduled_tasks")]
                    println!("schedule({task}) in activate_persisted");
                    turbo_tasks.schedule(task);
                }
            }
        }
    }

    fn deactivate_persisted(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        if let Some(DeactivateResult {
            decreased_external_outgoing,
            more_tasks_to_deactivate,
        }) = self.pg_deactivate_when_needed(task, turbo_tasks)
        {
            for (task, by) in decreased_external_outgoing {
                self.decrement_active_parents(task, by, false, turbo_tasks);
            }
            for task in more_tasks_to_deactivate {
                self.schedule_background_job(BackgroundJob::DeactivatePersisted(task), turbo_tasks);
            }
        }
    }

    fn increment_active_parents(
        &self,
        task: TaskId,
        by: u32,
        from_memory_only: bool,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut delayed_activate = Vec::new();
        self.try_increment_active_parents(
            task,
            true,
            by,
            from_memory_only,
            &mut delayed_activate,
            turbo_tasks,
        );
        while !delayed_activate.is_empty() {
            for task in take(&mut delayed_activate) {
                let (state, _) = self.state_mut(task, turbo_tasks);
                self.activate_task_inner(task, state, &mut delayed_activate, turbo_tasks);
            }
        }
    }

    fn try_increment_active_parents(
        &self,
        task: TaskId,
        force: bool,
        by: u32,
        from_memory_only: bool,
        delayed_activate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let child = self.tasks.get(*task).as_ref().unwrap();
        // This might temporary incorrect increases active_parents for non-memory tasks
        let call_graph_state = child
            .call_graph_state
            .fetch_add(by << ACTIVE_PARENTS_SHIFT, Ordering::Relaxed);
        if from_memory_only && call_graph_state & PERSISTED != 0 {
            if self.pg_add_external_incoming(task, by, turbo_tasks) {
                self.activate_persisted(task, turbo_tasks);
            }
        }
        if call_graph_state & IN_MEMORY != 0 && call_graph_state | ACTIVE_PARENTS_MASK == 0 {
            // only the connect() call that increases from 0 is responsible for activating
            let state = if force {
                child.task_state.lock().unwrap()
            } else {
                match child.task_state.try_lock() {
                    Ok(state) => state,
                    Err(_) => {
                        delayed_activate.push(task);
                        return;
                    }
                }
            };
            self.activate_task_inner(task, state, delayed_activate, turbo_tasks);
        }
    }

    fn activate_task(
        &self,
        task: TaskId,
        state: MutexGuard<TaskState>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut delayed_activate = Vec::new();
        self.activate_task_inner(task, state, &mut delayed_activate, turbo_tasks);
        while !delayed_activate.is_empty() {
            for task in take(&mut delayed_activate) {
                let (state, _) = self.state_mut(task, turbo_tasks);
                self.activate_task_inner(task, state, &mut delayed_activate, turbo_tasks);
            }
        }
    }

    fn activate_task_inner(
        &self,
        task: TaskId,
        mut state: MutexGuard<TaskState>,
        delayed_activate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        if state.in_memory && !state.active {
            // It's (still) in memory
            state.active = true;
            if state.freshness != TaskFreshness::Done {
                if !state.scheduled {
                    state.scheduled = true;
                    #[cfg(feature = "log_scheduled_tasks")]
                    println!("schedule({task}) in activate_task_inner");
                    turbo_tasks.schedule(task);
                }
            }
            let memory_only = state.in_memory && !state.persisted;
            for child in state.children.iter() {
                self.try_increment_active_parents(
                    *child,
                    false,
                    1,
                    memory_only,
                    delayed_activate,
                    turbo_tasks,
                );
            }
        }
    }

    fn decrement_active_parents(
        &self,
        task: TaskId,
        by: u32,
        from_memory_only: bool,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.decrement_active_parents_limited(&[(task, by)], from_memory_only, 0, turbo_tasks);
    }

    fn decrement_active_parents_limited(
        &self,
        tasks: &[(TaskId, u32)],
        from_memory_only: bool,
        remaining_depth: u8,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut delayed_deactivate = Vec::new();
        for (task, by) in tasks {
            self.try_decrement_active_parents(
                *task,
                *by,
                from_memory_only,
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
        from_memory_only: bool,
        remaining_depth: u8,
        delayed_deactivate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let child = self.tasks.get(*task).as_ref().unwrap();
        let mut call_graph_state = child.call_graph_state.load(Ordering::Acquire);
        loop {
            let mut new_call_graph_state = call_graph_state;
            if call_graph_state & IN_MEMORY != 0 {
                new_call_graph_state -= by << ACTIVE_PARENTS_SHIFT;
            }
            // We need to use compare_exchange here instead of fetch_sub to avoid running
            // below 0
            match child.call_graph_state.compare_exchange(
                call_graph_state,
                new_call_graph_state,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    call_graph_state = new_call_graph_state;
                    break;
                }
                Err(v) => {
                    call_graph_state = v;
                }
            }
        }
        if from_memory_only && call_graph_state & PERSISTED != 0 {
            if self.pg_remove_external_incoming(task, by, turbo_tasks) {
                self.schedule_background_job(BackgroundJob::DeactivatePersisted(task), turbo_tasks);
            }
        }
        if call_graph_state & IN_MEMORY != 0 && call_graph_state & ACTIVE_PARENTS_MASK == 0 {
            // count reached zero
            let state = if remaining_depth > 0 {
                match child.task_state.try_lock() {
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
            self.deactivate_task(
                task,
                state,
                child,
                remaining_depth - 1,
                delayed_deactivate,
                turbo_tasks,
            );
        }
    }

    fn deactivate_tasks(&self, tasks: &[TaskId], turbo_tasks: &dyn TurboTasksBackendApi) {
        let mut delayed_deactivate = Vec::new();
        for task in tasks {
            let (state, task_info) = self.state_mut(*task, turbo_tasks);
            self.deactivate_task(
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

    fn deactivate_task(
        &self,
        task: TaskId,
        mut state: MutexGuard<TaskState>,
        task_info: &Task,
        remaining_depth: u8,
        delayed_deactivate: &mut Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        if state.in_memory {
            // It's still in memory
            if state.active
                && task_info.call_graph_state.load(Ordering::Acquire) & ACTIVE_PARENTS_MASK == 0
            {
                state.active = false;
                let memory_only = state.in_memory && !state.persisted;
                for child in state.children.iter() {
                    self.try_decrement_active_parents(
                        *child,
                        1,
                        memory_only,
                        remaining_depth,
                        delayed_deactivate,
                        turbo_tasks,
                    );
                }
            }
        }
    }

    fn persist(&self, turbo_tasks: &dyn TurboTasksBackendApi) -> bool {
        loop {
            if let Ok(task) = self.persist_queue1.pop() {
                let (mut state, task_info) = self.state_mut(task, turbo_tasks);
                if state.in_memory && (state.need_persist || !state.persisted) {
                    if let TaskType::Persistent(_task_type) = &task_info.task_type {
                        if let &Some(Ok(output)) = &state.output {
                            if state.has_changes || !state.persisted {
                                let data = TaskData {
                                    children: state.children.iter().cloned().collect(),
                                    dependencies: state.dependencies.iter().cloned().collect(),
                                    slots: state.slots.iter().map(|(s, _)| s.clone()).collect(),
                                    slot_mappings: state.slot_mappings.clone(),
                                    output,
                                };
                                let call_graph_state =
                                    task_info.call_graph_state.load(Ordering::Acquire);
                                let active_parents = (call_graph_state & ACTIVE_PARENTS_MASK)
                                    >> ACTIVE_PARENTS_SHIFT;
                                let task_state = turbo_tasks::persisted_graph::PersistTaskState {
                                    clean: state.freshness != TaskFreshness::Dirty,
                                    external_active_parents: active_parents,
                                };
                                if self.pg_persist(task, data, task_state, turbo_tasks) {
                                    state.persisted = true;
                                    let real_call_graph_state = task_info
                                        .call_graph_state
                                        .fetch_or(PERSISTED, Ordering::AcqRel);
                                    let real_active_parents = (real_call_graph_state
                                        & ACTIVE_PARENTS_MASK)
                                        >> ACTIVE_PARENTS_SHIFT;
                                    let diff = real_active_parents as i32 - active_parents as i32;
                                    if diff > 0 {
                                        // fixup missing updates
                                        if self.pg_add_external_incoming(
                                            task,
                                            diff as u32,
                                            turbo_tasks,
                                        ) {
                                            self.activate_persisted(task, turbo_tasks);
                                        }
                                    } else if diff < 0 {
                                        if self.pg_remove_external_incoming(
                                            task,
                                            (-diff) as u32,
                                            turbo_tasks,
                                        ) {
                                            self.schedule_background_job(
                                                BackgroundJob::DeactivatePersisted(task),
                                                turbo_tasks,
                                            );
                                        }
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
                continue;
            }
            for queue in self.persist_queue2.iter() {
                let mut queue = queue.lock().unwrap();
                if let Some((_, task)) = queue.pop() {
                    let (state, _) = self.state_mut(task, turbo_tasks);
                    let dependencies = state
                        .dependencies
                        .iter()
                        .map(|d| d.get_task_id())
                        .collect::<HashSet<_>>();
                    for dep in dependencies {
                        self.persist_queue1.push(dep).unwrap();
                    }
                    self.persist_queue1.push(task).unwrap();
                }
            }

            return false;
        }
    }

    fn has_persist_work(&self) -> bool {
        !self.persist_queue1.is_empty()
            || self
                .persist_queue2
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
    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        let (mut state, task_info) = self.state_mut(task, turbo_tasks);
        println!("invalidate_task({task}) type = {:?}", task_info.task_type);

        if state.in_memory {
            if state.freshness != TaskFreshness::Dirty {
                state.freshness = TaskFreshness::Dirty;
                if state.active {
                    if !state.scheduled {
                        state.scheduled = true;
                        turbo_tasks.schedule(task);
                    }
                }
            }
        }
        if state.persisted {
            if self.pg_make_dirty(task, turbo_tasks) {
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

    fn try_start_task_execution(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<TaskExecutionSpec> {
        let (mut state, task_info) = self.mem_state_mut(task, turbo_tasks);
        if state.freshness == TaskFreshness::Done {
            state.scheduled = false;
            return None;
        }
        // if !state.active && (!state.persisted || self.pg_is_active(task,
        // turbo_tasks)) {     state.scheduled = false;
        //     return None;
        // }
        #[cfg(feature = "log_running_tasks")]
        {
            let mut t = self.in_progress_tasks.lock().unwrap();
            t.insert(task);
            println!("start {} {:?}", task, task_info.task_type);
        }
        state.freshness = TaskFreshness::NeverExecuted;
        let deps = take(&mut state.dependencies);
        let children = take(&mut state.children);
        let mut slot_mappings = state.slot_mappings.take().unwrap_or_default();
        slot_mappings.reset();
        let memory_only = !state.persisted;
        state.start = Some(Instant::now());
        drop(state);
        for dep in deps {
            let (mut state, _) = self.mem_state_mut(dep.get_task_id(), turbo_tasks);
            match dep {
                RawVc::TaskOutput(_) => {
                    state.output_dependent.remove(&task);
                }
                RawVc::TaskSlot(_, i) => {
                    if let Some((_, dependent)) = state.slots.get_mut(i) {
                        dependent.remove(&task);
                    }
                }
            }
        }
        for child in children {
            self.decrement_active_parents(child, 1, memory_only, turbo_tasks);
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
            slot_mappings: Some(slot_mappings),
        })
    }

    fn task_execution_completed(
        &self,
        task: TaskId,
        slot_mappings: Option<SlotMappings>,
        result: Result<RawVc>,
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
        state.slot_mappings = slot_mappings;
        if state.freshness == TaskFreshness::Dirty {
            return true;
        }
        state.freshness = TaskFreshness::Done;
        state.scheduled = false;
        state.event.notify(usize::MAX);
        let output_change = if let (Some(Ok(old)), Ok(new)) = (&state.output, &result) {
            old != new
        } else {
            true
        };
        let dependent = if output_change {
            state.has_changes = true;
            state.output = Some(result.map_err(|err| SharedError::new(err)));
            take(&mut state.output_dependent)
        } else {
            HashSet::new()
        };
        let duration = if let Some(start) = state.start {
            start.elapsed()
        } else {
            Duration::from_secs(1)
        };
        state.need_persist = true;
        drop(state);

        if !dependent.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&dependent);
        }

        if output_change {
            if let TaskType::Persistent(_) = task_info.task_type {
                for task in self.pg_make_dependent_dirty(RawVc::TaskOutput(task), turbo_tasks) {
                    let (mut state, _) = self.state_mut(task, turbo_tasks);
                    if !state.scheduled {
                        state.scheduled = true;
                        #[cfg(feature = "log_scheduled_tasks")]
                        println!("schedule({task}) in task_execution_completed");
                        turbo_tasks.schedule(task);
                    }
                }
                self.persist_queue2[*task % self.persist_queue2.len()]
                    .lock()
                    .unwrap()
                    .push((duration, task));
                self.increase_persist_workers(1, turbo_tasks);
            }
        }

        false
    }

    fn run_background_job<'a>(
        &'a self,
        id: BackgroundJobId,
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
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, EventListener>> {
        let (mut state, _) = self.mem_state_mut(task, turbo_tasks);
        if state.freshness != TaskFreshness::Done {
            let listener = state.event.listen();
            if !state.active {
                self.activate_task(task, state, turbo_tasks);
            } else {
                drop(state);
            }
            #[cfg(feature = "log_running_tasks")]
            {
                let (state, _) = self.state_mut(task, turbo_tasks);
                println!("waiting {} waits on {}: {:?}", reader, task, state);
            }
            return Ok(Err(listener));
        }
        let need_dependency = state.output_dependent.insert(reader);
        let result = Ok(Ok(state.output.as_ref().unwrap().clone()?));
        drop(state);
        if need_dependency {
            let (mut state, _) = self.mem_state_mut(reader, turbo_tasks);
            state.dependencies.insert(RawVc::TaskOutput(task));
        }
        result
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, EventListener>> {
        let (state, _) = self.mem_state_mut(task, turbo_tasks);
        if state.freshness != TaskFreshness::Done {
            let listener = state.event.listen();
            if !state.active {
                self.activate_task(task, state, turbo_tasks);
            }
            #[cfg(feature = "log_running_tasks")]
            println!("waiting ?? waits on {}", task);
            return Ok(Err(listener));
        }
        Ok(Ok(state.output.as_ref().unwrap().clone()?))
    }

    fn track_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let (mut state, _) = self.mem_state_mut(task, turbo_tasks);
        let need_dependency = state.output_dependent.insert(reader);
        drop(state);
        if need_dependency {
            let (mut state, _) = self.mem_state_mut(reader, turbo_tasks);
            state.dependencies.insert(RawVc::TaskOutput(task));
        }
    }

    fn try_read_task_slot(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<SlotContent, EventListener>> {
        let (mut state, task_info) = self.mem_state_mut(task, turbo_tasks);
        if state.freshness == TaskFreshness::NeverExecuted {
            if !state.scheduled {
                state.scheduled = true;
                #[cfg(feature = "log_scheduled_tasks")]
                println!("schedule({task}) in try_read_task_slot[NeverExecuted]");
                turbo_tasks.schedule(task);
            }
            #[cfg(feature = "log_running_tasks")]
            println!("waiting (fresh task) {} waits on {}", reader, task);
            return Ok(Err(state.event.listen()));
        }
        let (slot, dependent) = state.slots.get_mut(index).ok_or_else(|| {
            anyhow!(
                "Cannot read non-existing slot {index} from {task} {:?} (reader: {:?})\nPG: {:?} \
                 {}",
                task_info.task_type,
                self.tasks.get(*reader).as_ref().map(|t| &t.task_type),
                self.pg_read(task, turbo_tasks).is_some(),
                if let TaskType::Persistent(ty) = &task_info.task_type {
                    self.pg_lookup_one(ty, turbo_tasks).is_some()
                } else {
                    false
                }
            )
        })?;
        match slot {
            TaskSlot::Content(content) => {
                let content = content.clone();
                let need_dependency = dependent.insert(reader);
                drop(state);
                if need_dependency {
                    let (mut state, _) = self.mem_state_mut(reader, turbo_tasks);
                    state.dependencies.insert(RawVc::TaskSlot(task, index));
                }
                Ok(Ok(content))
            }
            TaskSlot::NeedComputation => {
                if state.freshness != TaskFreshness::Dirty {
                    state.freshness = TaskFreshness::Dirty;
                    if !state.scheduled {
                        state.scheduled = true;
                        #[cfg(feature = "log_scheduled_tasks")]
                        println!("schedule({task}) in try_read_task_slot[NeedComputation]");
                        turbo_tasks.schedule(task);
                    }
                }
                #[cfg(feature = "log_running_tasks")]
                println!("waiting (need computation) {} waits on {}", reader, task);
                return Ok(Err(state.event.listen()));
            }
        }
    }

    unsafe fn try_read_task_slot_untracked(
        &self,
        task: TaskId,
        index: usize,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<SlotContent, EventListener>> {
        let (mut state, _) = self.mem_state_mut(task, turbo_tasks);
        let (slot, _) = state.slots.get(index).ok_or_else(|| {
            ();
            anyhow!("Cannot read non-existing slot")
        })?;
        match slot {
            TaskSlot::Content(content) => {
                let content = content.clone();
                drop(state);
                Ok(Ok(content))
            }
            TaskSlot::NeedComputation => {
                if state.freshness != TaskFreshness::Dirty {
                    state.freshness = TaskFreshness::Dirty;
                    if !state.scheduled {
                        state.scheduled = true;
                        #[cfg(feature = "log_scheduled_tasks")]
                        println!("schedule({task}) in try_read_task_slot_untracked");
                        turbo_tasks.schedule(task);
                    }
                }
                return Ok(Err(state.event.listen()));
            }
        }
    }

    unsafe fn try_read_own_task_slot(
        &self,
        task: TaskId,
        index: usize,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<SlotContent> {
        let (state, _) = self.mem_state_mut(task, turbo_tasks);
        if let Some((slot, _)) = state.slots.get(index) {
            match slot {
                TaskSlot::Content(content) => Ok(content.clone()),
                TaskSlot::NeedComputation => Ok(SlotContent(None)),
            }
        } else {
            Ok(SlotContent(None))
        }
    }

    fn track_read_task_slot(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let (mut state, _) = self.mem_state_mut(task, turbo_tasks);
        if let Some((_, dependent)) = state.slots.get_mut(index) {
            let need_dependency = dependent.insert(reader);
            drop(state);
            if need_dependency {
                let (mut state, _) = self.mem_state_mut(reader, turbo_tasks);
                state.dependencies.insert(RawVc::TaskSlot(task, index));
            }
        }
    }

    fn get_fresh_slot(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) -> usize {
        let (mut state, _) = self.mem_state_mut(task, turbo_tasks);
        let index = state.slots.len();
        state
            .slots
            .push((TaskSlot::Content(SlotContent(None)), HashSet::new()));
        index
    }

    fn update_task_slot(
        &self,
        task: TaskId,
        index: usize,
        content: SlotContent,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let (mut state, task_info) = self.mem_state_mut(task, turbo_tasks);
        state.has_changes = true;
        let (slot, dependent) = state
            .slots
            .get_mut(index)
            .ok_or_else(|| anyhow!("Cannot update non-existing slot"))
            .unwrap();
        *slot = TaskSlot::Content(content);
        if !dependent.is_empty() {
            let dependent = take(dependent);
            drop(state);
            turbo_tasks.schedule_notify_tasks_set(&dependent);
        } else {
            drop(state);
        }
        if let TaskType::Persistent(_) = task_info.task_type {
            for task in self.pg_make_dependent_dirty(RawVc::TaskSlot(task, index), turbo_tasks) {
                let (mut state, _) = self.state_mut(task, turbo_tasks);
                if !state.scheduled {
                    state.scheduled = true;
                    #[cfg(feature = "log_scheduled_tasks")]
                    println!("schedule({task}) in update_task_slot");
                    turbo_tasks.schedule(task);
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
            call_graph_state: AtomicU32::new(IN_MEMORY | (1 << ACTIVE_PARENTS_SHIFT)),
            task_state: Mutex::new(TaskState {
                scheduled: true,
                in_memory: true,
                persisted: false,
                freshness: TaskFreshness::NeverExecuted,
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
            call_graph_state: AtomicU32::new(IN_MEMORY | (1 << ACTIVE_PARENTS_SHIFT)),
            task_state: Mutex::new(TaskState {
                scheduled: true,
                in_memory: true,
                persisted: false,
                freshness: TaskFreshness::NeverExecuted,
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
            call_graph_state: AtomicU32::new(0),
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
    ) -> bool {
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
    fn pg_add_external_incoming(
        &self,
        task: TaskId,
        by: u32,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        self.pg
            .add_external_incoming(
                task,
                by,
                &MemoryBackendPersistedGraphApi {
                    backend: self,
                    turbo_tasks,
                },
            )
            .unwrap()
    }

    #[must_use]
    fn pg_remove_external_incoming(
        &self,
        task: TaskId,
        by: u32,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        self.pg
            .remove_external_incoming(
                task,
                by,
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

    #[must_use]
    fn pg_remove_outdated_external_incoming(
        &self,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Vec<TaskId> {
        self.pg
            .remove_outdated_external_incoming(&MemoryBackendPersistedGraphApi {
                backend: self,
                turbo_tasks,
            })
            .unwrap()
    }

    #[must_use]
    fn pg_get_external_outgoing(
        &self,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Vec<(TaskId, usize)> {
        self.pg
            .get_external_outgoing(&MemoryBackendPersistedGraphApi {
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
}
