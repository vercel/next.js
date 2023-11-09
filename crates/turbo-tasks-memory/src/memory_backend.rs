use std::{
    borrow::{Borrow, Cow},
    cell::RefCell,
    cmp::min,
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
use auto_hash_map::AutoMap;
use dashmap::{mapref::entry::Entry, DashMap};
use rustc_hash::FxHasher;
use tokio::task::futures::TaskLocalFuture;
use tracing::trace_span;
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CellContent, PersistentTaskType, TaskExecutionSpec,
        TransientTaskType,
    },
    event::EventListener,
    util::{IdFactory, NoMoveVec},
    CellId, RawVc, TaskId, TaskIdSet, TraitTypeId, TurboTasksBackendApi, Unused,
};

use crate::{
    cell::RecomputingCell,
    gc::GcQueue,
    output::Output,
    task::{Task, TaskDependency, TaskDependencySet, DEPENDENCIES_TO_TRACK},
};

pub struct MemoryBackend {
    memory_tasks: NoMoveVec<Task, 13>,
    backend_jobs: NoMoveVec<Job>,
    backend_job_id_factory: IdFactory<BackendJobId>,
    task_cache: DashMap<Arc<PersistentTaskType>, TaskId, BuildHasherDefault<FxHasher>>,
    memory_limit: usize,
    gc_queue: Option<GcQueue>,
    idle_gc_active: AtomicBool,
}

impl Default for MemoryBackend {
    fn default() -> Self {
        Self::new(usize::MAX)
    }
}

impl MemoryBackend {
    pub fn new(memory_limit: usize) -> Self {
        Self {
            memory_tasks: NoMoveVec::new(),
            backend_jobs: NoMoveVec::new(),
            backend_job_id_factory: IdFactory::new(),
            task_cache: DashMap::with_hasher_and_shard_amount(
                Default::default(),
                (std::thread::available_parallelism().map_or(1, usize::from) * 32)
                    .next_power_of_two(),
            ),
            memory_limit,
            gc_queue: (memory_limit != usize::MAX).then(GcQueue::new),
            idle_gc_active: AtomicBool::new(false),
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
    pub fn task(&self, id: TaskId) -> &Task {
        self.memory_tasks.get(*id).unwrap()
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

    fn insert_and_connect_fresh_task<K: Eq + Hash, H: BuildHasher + Clone>(
        &self,
        parent_task: TaskId,
        task_cache: &DashMap<K, TaskId, H>,
        key: K,
        new_id: Unused<TaskId>,
        task: Task,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        let new_id = new_id.into();
        // Safety: We have a fresh task id that nobody knows about yet
        unsafe { self.memory_tasks.insert(*new_id, task) };
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

    pub(crate) fn schedule_when_dirty_from_aggregation(
        &self,
        set: TaskIdSet,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        for task in set {
            self.with_task(task, |task| {
                task.schedule_when_dirty_from_aggregation(self, turbo_tasks)
            });
        }
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
        tasks: &[TaskId],
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        for &task in tasks {
            self.with_task(task, |task| {
                task.invalidate(self, turbo_tasks);
            });
        }
    }

    fn invalidate_tasks_set(
        &self,
        tasks: &TaskIdSet,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        for &task in tasks {
            self.with_task(task, |task| {
                task.invalidate(self, turbo_tasks);
            });
        }
    }

    fn get_task_description(&self, task: TaskId) -> String {
        self.with_task(task, |task| task.get_description())
    }

    type ExecutionScopeFuture<T: Future<Output = Result<()>> + Send + 'static> =
        TaskLocalFuture<RefCell<TaskDependencySet>, T>;
    fn execution_scope<T: Future<Output = Result<()>> + Send + 'static>(
        &self,
        _task: TaskId,
        future: T,
    ) -> Self::ExecutionScopeFuture<T> {
        DEPENDENCIES_TO_TRACK.scope(RefCell::new(TaskDependencySet::with_hasher()), future)
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
        task_id: TaskId,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(task_id, |task| {
            #[cfg(debug_assertions)]
            if let Ok(Ok(RawVc::TaskOutput(result))) = result.as_ref() {
                if *result == task_id {
                    panic!("Task {} returned itself as output", task.get_description());
                }
            }
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
                Task::add_dependency_to_current(TaskDependency::Output(task));
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
            Task::add_dependency_to_current(TaskDependency::Cell(task_id, index));
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
    ) -> AutoMap<RawVc, i32> {
        Task::read_collectibles(id, trait_id, reader, self, turbo_tasks)
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
        count: u32,
        id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(id, |task| {
            task.unemit_collectible(trait_type, collectible, count, self, turbo_tasks);
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
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(task, |task| task.mark_as_finished(self, turbo_tasks))
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        let id = turbo_tasks.get_fresh_task_id();
        let stats_type = turbo_tasks.stats_type();
        let id = id.into();
        match task_type {
            TransientTaskType::Root(f) => {
                let task = Task::new_root(id, move || f() as _, stats_type);
                // SAFETY: We have a fresh task id where nobody knows about yet
                unsafe { self.memory_tasks.insert(*id, task) };
                Task::set_root(id, self, turbo_tasks);
            }
            TransientTaskType::Once(f) => {
                let task = Task::new_once(id, f, stats_type);
                // SAFETY: We have a fresh task id where nobody knows about yet
                unsafe { self.memory_tasks.insert(*id, task) };
                Task::set_once(id, self, turbo_tasks);
            }
        };
        id
    }

    fn dispose_root_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        Task::unset_root(task, self, turbo_tasks);
    }
}

pub(crate) enum Job {
    GarbageCollection,
}

impl Job {
    // TODO remove this method
    fn before_schedule(&self, _backend: &MemoryBackend) {}

    async fn run(
        self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        match self {
            Job::GarbageCollection => {
                let _guard = trace_span!("Job::GarbageCollection").entered();
                backend.run_gc(true, turbo_tasks);
            }
        }
    }
}
