use std::{
    borrow::{Borrow, Cow},
    cell::RefCell,
    cmp::min,
    collections::VecDeque,
    future::Future,
    hash::{BuildHasher, BuildHasherDefault, Hash},
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use anyhow::{bail, Result};
use auto_hash_map::AutoSet;
use dashmap::{mapref::entry::Entry, DashMap};
use nohash_hasher::BuildNoHashHasher;
use rustc_hash::FxHasher;
use tokio::task::futures::TaskLocalFuture;
use tracing::{trace_span, Instrument};
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CellContent, PersistentTaskType, TaskExecutionSpec,
        TransientTaskType,
    },
    event::EventListener,
    util::{IdFactory, NoMoveVec},
    CellId, RawVc, TaskId, TraitTypeId, TurboTasksBackendApi, Unused, Vc,
};

use crate::{
    cell::RecomputingCell,
    gc::GcQueue,
    output::Output,
    priority_pair::PriorityPair,
    scope::{TaskScope, TaskScopeId},
    task::{
        run_add_to_scope_queue, run_remove_from_scope_queue, Task, TaskDependency,
        DEPENDENCIES_TO_TRACK,
    },
};

pub struct MemoryBackend {
    memory_tasks: NoMoveVec<Task, 13>,
    memory_task_scopes: NoMoveVec<TaskScope>,
    scope_id_factory: IdFactory<TaskScopeId>,
    pub(crate) initial_scope: TaskScopeId,
    backend_jobs: NoMoveVec<Job>,
    backend_job_id_factory: IdFactory<BackendJobId>,
    task_cache: DashMap<Arc<PersistentTaskType>, TaskId, BuildHasherDefault<FxHasher>>,
    memory_limit: usize,
    gc_queue: Option<GcQueue>,
    idle_gc_active: AtomicBool,
    scope_add_remove_priority: PriorityPair,
}

impl Default for MemoryBackend {
    fn default() -> Self {
        Self::new(usize::MAX)
    }
}

impl MemoryBackend {
    pub fn new(memory_limit: usize) -> Self {
        let memory_task_scopes = NoMoveVec::new();
        let scope_id_factory = IdFactory::new();
        let initial_scope: TaskScopeId = scope_id_factory.get();
        unsafe {
            memory_task_scopes.insert(*initial_scope, TaskScope::new_active(initial_scope, 0, 0));
        }
        Self {
            memory_tasks: NoMoveVec::new(),
            memory_task_scopes,
            scope_id_factory,
            initial_scope,
            backend_jobs: NoMoveVec::new(),
            backend_job_id_factory: IdFactory::new(),
            task_cache: DashMap::default(),
            memory_limit,
            gc_queue: (memory_limit != usize::MAX).then(GcQueue::new),
            idle_gc_active: AtomicBool::new(false),
            scope_add_remove_priority: PriorityPair::new(),
        }
    }

    fn connect_task_child(
        &self,
        parent: TaskId,
        child: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(parent, |parent| {
            parent.connect_child(child, self, turbo_tasks)
        });
    }

    pub(crate) fn create_backend_job(&self, job: Job) -> BackendJobId {
        job.before_schedule(self);
        let id = self.backend_job_id_factory.get();
        // SAFETY: This is a fresh id
        unsafe {
            self.backend_jobs.insert(*id, job);
        }
        id
    }

    fn try_get_output<T, F: FnOnce(&mut Output) -> Result<T>>(
        &self,
        id: TaskId,
        strongly_consistent: bool,
        note: impl Fn() -> String + Sync + Send + 'static,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
        func: F,
    ) -> Result<Result<T, EventListener>> {
        self.with_task(id, |task| {
            task.get_or_wait_output(strongly_consistent, func, note, self, turbo_tasks)
        })
    }

    pub fn with_all_cached_tasks(&self, mut func: impl FnMut(TaskId)) {
        for id in self.task_cache.clone().into_read_only().values() {
            func(*id);
        }
    }

    #[inline(always)]
    pub fn with_task<T>(&self, id: TaskId, func: impl FnOnce(&Task) -> T) -> T {
        func(self.memory_tasks.get(*id).unwrap())
    }

    #[inline(always)]
    pub fn with_scope<T>(&self, id: TaskScopeId, func: impl FnOnce(&TaskScope) -> T) -> T {
        func(self.memory_task_scopes.get(*id).unwrap())
    }

    pub fn create_new_scope(&self, tasks: usize) -> TaskScopeId {
        let id = self.scope_id_factory.get();
        unsafe {
            self.memory_task_scopes
                .insert(*id, TaskScope::new(id, tasks));
        }
        id
    }

    pub fn create_new_no_collectibles_scope(&self, tasks: usize) -> TaskScopeId {
        let id = self.scope_id_factory.get();
        unsafe {
            self.memory_task_scopes
                .insert(*id, TaskScope::new_no_collectibles(id, tasks));
        }
        id
    }

    fn increase_scope_active_queue(
        &self,
        mut queue: Vec<TaskScopeId>,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        while let Some(scope) = queue.pop() {
            if let Some(tasks) = self.with_scope(scope, |scope| {
                scope.state.lock().increment_active(&mut queue)
            }) {
                turbo_tasks.schedule_backend_foreground_job(
                    self.create_backend_job(Job::ScheduleWhenDirtyFromScope(tasks)),
                );
            }
        }
    }

    pub(crate) fn increase_scope_active(
        &self,
        scope: TaskScopeId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.increase_scope_active_queue(vec![scope], turbo_tasks);
    }

    pub(crate) fn increase_scope_active_by(
        &self,
        scope: TaskScopeId,
        count: usize,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut queue = Vec::new();
        if let Some(tasks) = self.with_scope(scope, |scope| {
            scope.state.lock().increment_active_by(count, &mut queue)
        }) {
            turbo_tasks.schedule_backend_foreground_job(
                self.create_backend_job(Job::ScheduleWhenDirtyFromScope(tasks)),
            );
        }
        self.increase_scope_active_queue(queue, turbo_tasks);
    }

    pub(crate) fn decrease_scope_active(
        &self,
        scope: TaskScopeId,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.decrease_scope_active_by(scope, task_id, 1, turbo_tasks);
    }

    pub(crate) fn decrease_scope_active_by(
        &self,
        scope_id: TaskScopeId,
        task_id: TaskId,
        count: usize,
        _turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut queue = Vec::new();
        self.with_scope(scope_id, |scope| {
            if scope.state.lock().decrement_active_by(count, &mut queue) {
                if let Some(gc_queue) = &self.gc_queue {
                    gc_queue.task_might_become_inactive(task_id);
                }
            }
        });
        while let Some(scope) = queue.pop() {
            self.with_scope(scope, |scope| {
                scope.state.lock().decrement_active_by(count, &mut queue)
            });
        }
    }

    pub fn on_task_might_become_inactive(&self, task: TaskId) {
        if let Some(gc_queue) = &self.gc_queue {
            gc_queue.task_might_become_inactive(task);
        }
    }

    pub fn on_task_flagged_inactive(&self, task: TaskId, compute_duration: Duration) {
        if let Some(gc_queue) = &self.gc_queue {
            gc_queue.task_flagged_inactive(task, compute_duration);
        }
    }

    pub fn run_gc(&self, idle: bool, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        if let Some(gc_queue) = &self.gc_queue {
            const MAX_COLLECT_FACTOR: u8 = u8::MAX / 8;

            let mem_limit = self.memory_limit;

            let usage = turbo_tasks_malloc::TurboMalloc::memory_usage();
            let target = if idle {
                mem_limit * 3 / 4
            } else {
                mem_limit * 7 / 8
            };
            if usage < target {
                if idle {
                    // Always run propagation when idle
                    gc_queue.run_gc(0, self, turbo_tasks);
                }
                return;
            }

            let collect_factor = min(
                MAX_COLLECT_FACTOR as usize,
                (usage - target) * u8::MAX as usize / (mem_limit - target),
            ) as u8;

            let collected = gc_queue.run_gc(collect_factor, self, turbo_tasks);

            if idle {
                if let Some((_collected, _count, _stats)) = collected {
                    let job = self.create_backend_job(Job::GarbageCollection);
                    turbo_tasks.schedule_backend_background_job(job);
                } else {
                    self.idle_gc_active.store(false, Ordering::Release);
                }
            }
        }
    }

    pub(crate) fn get_or_create_read_task_collectibles_task(
        &self,
        task_id: TaskId,
        trait_type: TraitTypeId,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        self.with_task(task_id, |task| {
            let id = task.get_read_collectibles_task(trait_type, || {
                let scope = self.create_new_no_collectibles_scope(1);

                let id = turbo_tasks.get_fresh_task_id().into();
                let task = Task::new_read_task_collectibles(
                    // Safety: That task will hold the value, but we are still in
                    // control of the task
                    id,
                    scope,
                    task_id,
                    trait_type,
                    turbo_tasks.stats_type(),
                );
                // Safety: We have a fresh task id that nobody knows about yet
                unsafe { self.memory_tasks.insert(*id, task) };
                self.with_scope(scope, |scope| {
                    scope.state.lock().add_dirty_task(id);
                });
                id
            });
            self.connect_task_child(parent_task, id, turbo_tasks);
            id
        })
    }

    pub(crate) fn get_or_create_read_scope_collectibles_task(
        &self,
        scope_id: TaskScopeId,
        trait_type: TraitTypeId,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        self.with_scope(scope_id, |scope| {
            let mut state = scope.state.lock();
            let task_id = state.get_read_collectibles_task(trait_type, || {
                let id = turbo_tasks.get_fresh_task_id().into();
                let task = Task::new_read_scope_collectibles(
                    // Safety: That task will hold the value, but we are still in
                    // control of the task
                    id,
                    scope_id,
                    trait_type,
                    turbo_tasks.stats_type(),
                );
                // Safety: We have a fresh task id that nobody knows about yet
                unsafe { self.memory_tasks.insert(*id, task) };
                id
            });
            self.connect_task_child(parent_task, task_id, turbo_tasks);
            task_id
        })
    }

    fn insert_and_connect_fresh_task<K: Eq + Hash, H: BuildHasher + Clone>(
        &self,
        parent_task: TaskId,
        task_cache: &DashMap<K, TaskId, H>,
        key: K,
        new_id: Unused<TaskId>,
        task: Task,
        root_scoped: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        let new_id = new_id.into();
        // Safety: We have a fresh task id that nobody knows about yet
        let task = unsafe { self.memory_tasks.insert(*new_id, task) };
        if root_scoped {
            task.make_root_scoped(self, turbo_tasks);
        }
        let result_task = match task_cache.entry(key) {
            Entry::Vacant(entry) => {
                // This is the most likely case
                entry.insert(new_id);
                new_id
            }
            Entry::Occupied(entry) => {
                // Safety: We have a fresh task id that nobody knows about yet
                unsafe {
                    self.memory_tasks.remove(*new_id);
                    let new_id = Unused::new_unchecked(new_id);
                    turbo_tasks.reuse_task_id(new_id);
                }
                *entry.get()
            }
        };
        self.connect_task_child(parent_task, result_task, turbo_tasks);
        result_task
    }

    fn lookup_and_connect_task<K: Hash + Eq, Q, H: BuildHasher + Clone>(
        &self,
        parent_task: TaskId,
        task_cache: &DashMap<K, TaskId, H>,
        key: &Q,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<TaskId>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        task_cache.get(key).map(|task| {
            self.connect_task_child(parent_task, *task, turbo_tasks);

            *task
        })
    }
}

impl Backend for MemoryBackend {
    fn idle_start(&self, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        if self
            .idle_gc_active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            let job = self.create_backend_job(Job::GarbageCollection);
            turbo_tasks.schedule_backend_background_job(job);
        }
    }

    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        self.with_task(task, |task| task.invalidate(self, turbo_tasks));
    }

    fn invalidate_tasks(
        &self,
        tasks: Vec<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        for task in tasks.into_iter() {
            self.with_task(task, |task| {
                task.invalidate(self, turbo_tasks);
            });
        }
    }

    fn get_task_description(&self, task: TaskId) -> String {
        self.with_task(task, |task| task.get_description())
    }

    type ExecutionScopeFuture<T: Future<Output = Result<()>> + Send + 'static> =
        TaskLocalFuture<RefCell<AutoSet<TaskDependency>>, T>;
    fn execution_scope<T: Future<Output = Result<()>> + Send + 'static>(
        &self,
        _task: TaskId,
        future: T,
    ) -> Self::ExecutionScopeFuture<T> {
        DEPENDENCIES_TO_TRACK.scope(Default::default(), future)
    }

    fn try_start_task_execution(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<TaskExecutionSpec> {
        self.with_task(task, |task| task.execute(self, turbo_tasks))
    }

    fn task_execution_result(
        &self,
        task: TaskId,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(task, |task| {
            task.execution_result(result, self, turbo_tasks);
        })
    }

    fn task_execution_completed(
        &self,
        task_id: TaskId,
        duration: Duration,
        instant: Instant,
        stateful: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let reexecute = self.with_task(task_id, |task| {
            task.execution_completed(duration, instant, stateful, self, turbo_tasks)
        });
        if !reexecute {
            self.run_gc(false, turbo_tasks);
            if let Some(gc_queue) = &self.gc_queue {
                gc_queue.task_executed(task_id, duration);
            }
        }
        reexecute
    }

    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<RawVc, EventListener>> {
        if task == reader {
            bail!("reading it's own output is not possible");
        }
        self.try_get_output(
            task,
            strongly_consistent,
            move || format!("reading task output from {reader}"),
            turbo_tasks,
            |output| {
                Task::add_dependency_to_current(TaskDependency::TaskOutput(task));
                output.read(reader)
            },
        )
    }

    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<RawVc, EventListener>> {
        self.try_get_output(
            task,
            strongly_consistent,
            || "reading task output untracked".to_string(),
            turbo_tasks,
            |output| output.read_untracked(),
        )
    }

    fn try_read_task_cell(
        &self,
        task_id: TaskId,
        index: CellId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<CellContent, EventListener>> {
        if task_id == reader {
            Ok(Ok(self.with_task(task_id, |task| {
                task.with_cell(index, |cell| cell.read_own_content_untracked())
            })))
        } else {
            Task::add_dependency_to_current(TaskDependency::TaskCell(task_id, index));
            self.with_task(task_id, |task| {
                match task.with_cell_mut(index, |cell| {
                    cell.read_content(
                        reader,
                        move || format!("{task_id} {index}"),
                        move || format!("reading {} {} from {}", task_id, index, reader),
                    )
                }) {
                    Ok(content) => Ok(Ok(content)),
                    Err(RecomputingCell { listener, schedule }) => {
                        if schedule {
                            task.recompute(self, turbo_tasks);
                        }
                        Ok(Err(listener))
                    }
                }
            })
        }
    }

    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
        _turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<CellContent> {
        Ok(self.with_task(current_task, |task| {
            task.with_cell(index, |cell| cell.read_own_content_untracked())
        }))
    }

    fn try_read_task_cell_untracked(
        &self,
        task_id: TaskId,
        index: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<CellContent, EventListener>> {
        self.with_task(task_id, |task| {
            match task.with_cell_mut(index, |cell| {
                cell.read_content_untracked(
                    move || format!("{task_id}"),
                    move || format!("reading {} {} untracked", task_id, index),
                )
            }) {
                Ok(content) => Ok(Ok(content)),
                Err(RecomputingCell { listener, schedule }) => {
                    if schedule {
                        task.recompute(self, turbo_tasks);
                    }
                    Ok(Err(listener))
                }
            }
        })
    }

    fn read_task_collectibles(
        &self,
        id: TaskId,
        trait_id: TraitTypeId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Vc<AutoSet<RawVc>> {
        self.with_task(id, |task| {
            task.read_task_collectibles(reader, trait_id, self, turbo_tasks)
        })
    }

    fn emit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(id, |task| {
            task.emit_collectible(trait_type, collectible, self, turbo_tasks)
        });
    }

    fn unemit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(id, |task| {
            task.unemit_collectible(trait_type, collectible, self, turbo_tasks)
        });
    }

    fn update_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(task, |task| {
            task.with_cell_mut(index, |cell| cell.assign(content, turbo_tasks))
        })
    }

    /// SAFETY: Must only called once with the same id
    fn run_backend_job<'a>(
        &'a self,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        // SAFETY: id will not be reused until with job is done
        if let Some(job) = unsafe { self.backend_jobs.take(*id) } {
            Box::pin(async move {
                job.run(self, turbo_tasks).await;
                // SAFETY: This id will no longer be used
                unsafe {
                    self.backend_job_id_factory.reuse(id);
                }
            })
        } else {
            Box::pin(async {})
        }
    }

    fn get_or_create_persistent_task(
        &self,
        mut task_type: PersistentTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        if let Some(task) =
            self.lookup_and_connect_task(parent_task, &self.task_cache, &task_type, turbo_tasks)
        {
            // fast pass without creating a new task
            task
        } else {
            // It's important to avoid overallocating memory as this will go into the task
            // cache and stay there forever. We can to be as small as possible.
            task_type.shrink_to_fit();
            let task_type = Arc::new(task_type);
            // slow pass with key lock
            let id = turbo_tasks.get_fresh_task_id();
            let task = Task::new_persistent(
                // Safety: That task will hold the value, but we are still in
                // control of the task
                *unsafe { id.get_unchecked() },
                task_type.clone(),
                turbo_tasks.stats_type(),
            );
            self.insert_and_connect_fresh_task(
                parent_task,
                &self.task_cache,
                task_type,
                id,
                task,
                false,
                turbo_tasks,
            )
        }
    }

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.connect_task_child(parent_task, task, turbo_tasks);
    }

    fn mark_own_task_as_finished(
        &self,
        task: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(task, |task| task.mark_as_finished(self))
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        let id = turbo_tasks.get_fresh_task_id();
        // use INITIAL_SCOPE
        let scope = self.initial_scope;
        self.with_scope(scope, |scope| {
            scope.increment_tasks();
            scope.increment_unfinished_tasks(self);
        });
        let stats_type = turbo_tasks.stats_type();
        let id = id.into();
        let task = match task_type {
            TransientTaskType::Root(f) => Task::new_root(id, scope, move || f() as _, stats_type),
            TransientTaskType::Once(f) => Task::new_once(id, scope, f, stats_type),
        };
        // SAFETY: We have a fresh task id where nobody knows about yet
        #[allow(unused_variables)]
        let task = unsafe { self.memory_tasks.insert(*id, task) };
        #[cfg(feature = "print_scope_updates")]
        println!("new {scope} for {task}");
        id
    }
}

pub(crate) enum Job {
    RemoveFromScopes(AutoSet<TaskId, BuildNoHashHasher<TaskId>>, Vec<TaskScopeId>),
    RemoveFromScope(AutoSet<TaskId, BuildNoHashHasher<TaskId>>, TaskScopeId),
    ScheduleWhenDirtyFromScope(AutoSet<TaskId, BuildNoHashHasher<TaskId>>),
    /// Add tasks from a scope. Scheduled by `run_add_from_scope_queue` to
    /// split off work.
    AddToScopeQueue {
        queue: VecDeque<TaskId>,
        scope: TaskScopeId,
        /// Number of scopes that are currently being merged into this scope.
        /// This information is only used for optimization.
        merging_scopes: usize,
    },
    /// Remove tasks from a scope. Scheduled by `run_remove_from_scope_queue` to
    /// split off work.
    RemoveFromScopeQueue(VecDeque<TaskId>, TaskScopeId),
    /// Unloads a previously used root scope after all other foreground tasks
    /// are done.
    UnloadRootScope(TaskScopeId),
    GarbageCollection,
}

impl Job {
    fn before_schedule(&self, backend: &MemoryBackend) {
        match self {
            Job::RemoveFromScopes(..)
            | Job::RemoveFromScope(..)
            | Job::RemoveFromScopeQueue(..) => {
                backend.scope_add_remove_priority.start_high();
            }
            _ => {}
        }
    }

    async fn run(
        self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        match self {
            Job::RemoveFromScopes(tasks, scopes) => {
                let _guard = trace_span!("Job::RemoveFromScopes").entered();
                for task in tasks {
                    backend.with_task(task, |task| {
                        task.remove_from_scopes(scopes.iter().copied(), backend, turbo_tasks)
                    });
                }
                backend.scope_add_remove_priority.finish_high();
            }
            Job::RemoveFromScope(tasks, scope) => {
                let _guard = trace_span!("Job::RemoveFromScope").entered();
                for task in tasks {
                    backend.with_task(task, |task| {
                        task.remove_from_scope(scope, backend, turbo_tasks)
                    });
                }
                backend.scope_add_remove_priority.finish_high();
            }
            Job::ScheduleWhenDirtyFromScope(tasks) => {
                let _guard = trace_span!("Job::ScheduleWhenDirtyFromScope").entered();
                for task in tasks.into_iter() {
                    backend.with_task(task, |task| {
                        task.schedule_when_dirty_from_scope(backend, turbo_tasks);
                    })
                }
            }
            Job::AddToScopeQueue {
                queue,
                scope,
                merging_scopes,
            } => {
                backend
                    .scope_add_remove_priority
                    .run_low(async {
                        run_add_to_scope_queue(queue, scope, merging_scopes, backend, turbo_tasks);
                    })
                    .instrument(trace_span!("Job::AddToScopeQueue"))
                    .await;
            }
            Job::RemoveFromScopeQueue(queue, id) => {
                let _guard = trace_span!("Job::AddToScopeQueue").entered();
                run_remove_from_scope_queue(queue, id, backend, turbo_tasks);
                backend.scope_add_remove_priority.finish_high();
            }
            Job::UnloadRootScope(id) => {
                let span = trace_span!("Job::UnloadRootScope");
                if let Some(future) = turbo_tasks.wait_foreground_done_excluding_own() {
                    future.instrument(span.clone()).await;
                }
                let _guard = span.entered();
                backend.with_scope(id, |scope| {
                    scope.assert_unused();
                });
                unsafe {
                    backend.scope_id_factory.reuse(id);
                }
            }
            Job::GarbageCollection => {
                let _guard = trace_span!("Job::GarbageCollection").entered();
                backend.run_gc(true, turbo_tasks);
            }
        }
    }
}
