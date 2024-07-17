use std::{
    borrow::{Borrow, Cow},
    cell::RefCell,
    future::Future,
    hash::{BuildHasher, BuildHasherDefault, Hash},
    num::NonZeroU32,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use anyhow::{bail, Result};
use dashmap::{mapref::entry::Entry, DashMap};
use rustc_hash::FxHasher;
use tokio::task::futures::TaskLocalFuture;
use tracing::trace_span;
use turbo_prehash::{BuildHasherExt, PassThroughHash, PreHashed};
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CellContent, PersistentTaskType, TaskCollectiblesMap,
        TaskExecutionSpec, TransientTaskType,
    },
    event::EventListener,
    util::{IdFactoryWithReuse, NoMoveVec},
    CellId, RawVc, TaskId, TaskIdSet, TraitTypeId, TurboTasksBackendApi, Unused,
};

use crate::{
    cell::RecomputingCell,
    edges_set::{TaskEdge, TaskEdgesSet},
    gc::{GcQueue, PERCENTAGE_IDLE_TARGET_MEMORY, PERCENTAGE_TARGET_MEMORY},
    output::Output,
    task::{Task, DEPENDENCIES_TO_TRACK},
    task_statistics::TaskStatisticsApi,
};

fn prehash_task_type(task_type: PersistentTaskType) -> PreHashed<PersistentTaskType> {
    BuildHasherDefault::<FxHasher>::prehash(&Default::default(), task_type)
}

pub struct MemoryBackend {
    memory_tasks: NoMoveVec<Task, 13>,
    backend_jobs: NoMoveVec<Job>,
    backend_job_id_factory: IdFactoryWithReuse<BackendJobId>,
    task_cache:
        DashMap<Arc<PreHashed<PersistentTaskType>>, TaskId, BuildHasherDefault<PassThroughHash>>,
    memory_limit: usize,
    gc_queue: Option<GcQueue>,
    idle_gc_active: AtomicBool,
    task_statistics: TaskStatisticsApi,
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
            backend_job_id_factory: IdFactoryWithReuse::new(),
            task_cache: DashMap::with_hasher_and_shard_amount(
                Default::default(),
                (std::thread::available_parallelism().map_or(1, usize::from) * 32)
                    .next_power_of_two(),
            ),
            memory_limit,
            gc_queue: (memory_limit != usize::MAX).then(GcQueue::new),
            idle_gc_active: AtomicBool::new(false),
            task_statistics: TaskStatisticsApi::default(),
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
            self.backend_jobs.insert(*id as usize, job);
        }
        id
    }

    pub(crate) fn has_gc(&self) -> bool {
        self.gc_queue.is_some()
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
        func(self.memory_tasks.get(*id as usize).unwrap())
    }

    #[inline(always)]
    pub fn task(&self, id: TaskId) -> &Task {
        self.memory_tasks.get(*id as usize).unwrap()
    }

    /// Runs the garbage collection until reaching the target memory. An `idle`
    /// garbage collection has a lower target memory. Returns true, when
    /// memory was collected.
    pub fn run_gc(
        &self,
        idle: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        if let Some(gc_queue) = &self.gc_queue {
            let mut did_something = false;
            loop {
                let mem_limit = self.memory_limit;

                let usage = turbo_tasks_malloc::TurboMalloc::memory_usage();
                let target = if idle {
                    mem_limit * PERCENTAGE_IDLE_TARGET_MEMORY / 100
                } else {
                    mem_limit * PERCENTAGE_TARGET_MEMORY / 100
                };
                if usage < target {
                    return did_something;
                }

                let collected = gc_queue.run_gc(self, turbo_tasks);

                // Collecting less than 100 tasks is not worth it
                if !collected.map_or(false, |(_, count)| count > 100) {
                    return true;
                }

                did_something = true;
            }
        }
        false
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
        unsafe { self.memory_tasks.insert(*new_id as usize, task) };
        let result_task = match task_cache.entry(key) {
            Entry::Vacant(entry) => {
                // This is the most likely case
                entry.insert(new_id);
                new_id
            }
            Entry::Occupied(entry) => {
                // Safety: We have a fresh task id that nobody knows about yet
                let task_id = *entry.get();
                drop(entry);
                unsafe {
                    self.memory_tasks.remove(*new_id as usize);
                    let new_id = Unused::new_unchecked(new_id);
                    turbo_tasks.reuse_task_id(new_id);
                }
                task_id
            }
        };
        self.connect_task_child(parent_task, result_task, turbo_tasks);
        result_task
    }

    fn lookup_and_connect_task<K, Q, H: BuildHasher + Clone>(
        &self,
        parent_task: TaskId,
        task_cache: &DashMap<K, TaskId, H>,
        key: &Q,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<TaskId>
    where
        K: Borrow<Q> + Hash + Eq,
        Q: Hash + Eq + ?Sized,
    {
        task_cache
            .get(key)
            // Avoid holding the lock for too long
            .map(|task_ref| *task_ref)
            .map(|task_id| {
                self.connect_task_child(parent_task, task_id, turbo_tasks);

                task_id
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

    pub fn task_statistics(&self) -> &TaskStatisticsApi {
        &self.task_statistics
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
        TaskLocalFuture<RefCell<TaskEdgesSet>, T>;
    fn execution_scope<T: Future<Output = Result<()>> + Send + 'static>(
        &self,
        _task: TaskId,
        future: T,
    ) -> Self::ExecutionScopeFuture<T> {
        DEPENDENCIES_TO_TRACK.scope(RefCell::new(TaskEdgesSet::new()), future)
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
        memory_usage: usize,
        stateful: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let generation = if let Some(gc_queue) = &self.gc_queue {
            gc_queue.generation()
        } else {
            // SAFETY: 1 is not zero
            unsafe { NonZeroU32::new_unchecked(1) }
        };
        let (reexecute, once_task) = self.with_task(task_id, |task| {
            (
                task.execution_completed(
                    duration,
                    memory_usage,
                    generation,
                    stateful,
                    self,
                    turbo_tasks,
                ),
                task.is_once(),
            )
        });
        if !reexecute {
            if let Some(gc_queue) = &self.gc_queue {
                let _ = gc_queue.task_executed(task_id);
                if once_task {
                    gc_queue.task_potentially_no_longer_active(task_id);
                }
                self.run_gc(false, turbo_tasks);
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
                Task::add_dependency_to_current(TaskEdge::Output(task));
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
            Task::add_dependency_to_current(TaskEdge::Cell(task_id, index));
            self.with_task(task_id, |task| {
                match task.with_cell_mut(index, self.gc_queue.as_ref(), |cell, _| {
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
            match task.with_cell_mut(index, self.gc_queue.as_ref(), |cell, _| {
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
    ) -> TaskCollectiblesMap {
        Task::add_dependency_to_current(TaskEdge::Collectibles(id, trait_id));
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
            task.with_cell_mut(index, self.gc_queue.as_ref(), |cell, clean| {
                cell.assign(content, clean, turbo_tasks)
            })
        })
    }

    /// SAFETY: Must only called once with the same id
    fn run_backend_job<'a>(
        &'a self,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        // SAFETY: id will not be reused until with job is done
        if let Some(job) = unsafe { self.backend_jobs.take(*id as usize) } {
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
        task_type: PersistentTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        let task_type = prehash_task_type(task_type);
        if let Some(task) =
            self.lookup_and_connect_task(parent_task, &self.task_cache, &task_type, turbo_tasks)
        {
            // fast pass without creating a new task
            self.task_statistics().map(|stats| match &*task_type {
                PersistentTaskType::ResolveNative {
                    fn_type: function_id,
                    this: _,
                    args: _,
                }
                | PersistentTaskType::Native {
                    fn_type: function_id,
                    this: _,
                    args: _,
                } => {
                    stats.increment_cache_hit(*function_id);
                }
                PersistentTaskType::ResolveTrait {
                    trait_type,
                    method_name: name,
                    this,
                    args: _,
                } => {
                    // HACK: Resolve the this argument (`self`) in order to attribute the cache hit
                    // to the concrete trait implementation, rather than the dynamic trait method.
                    // This ensures cache hits and misses are both attributed to the same thing.
                    //
                    // Because this task already resolved, in most cases `self` should either be
                    // resolved, or already in the process of being resolved.
                    //
                    // However, `self` could become unloaded due to cache eviction, and this might
                    // trigger an otherwise unnecessary re-evalutation.
                    //
                    // This is a potentially okay trade-off as long as we don't log statistics by
                    // default. The alternative would be to store function ids on completed
                    // ResolveTrait tasks.
                    let trait_type = *trait_type;
                    let name = name.clone();
                    let this = *this;
                    let stats = Arc::clone(stats);
                    turbo_tasks.run_once(Box::pin(async move {
                        let function_id =
                            PersistentTaskType::resolve_trait_method(trait_type, name, this)
                                .await?;
                        stats.increment_cache_hit(function_id);
                        Ok(())
                    }));
                }
            });
            task
        } else {
            self.task_statistics().map(|stats| match &*task_type {
                PersistentTaskType::Native {
                    fn_type: function_id,
                    this: _,
                    args: _,
                } => {
                    stats.increment_cache_miss(*function_id);
                }
                PersistentTaskType::ResolveTrait { .. }
                | PersistentTaskType::ResolveNative { .. } => {
                    // these types re-execute themselves as `Native` after
                    // resolving their arguments, skip counting their
                    // executions here to avoid double-counting
                }
            });
            // It's important to avoid overallocating memory as this will go into the task
            // cache and stay there forever. We can to be as small as possible.
            let (task_type_hash, mut task_type) = PreHashed::into_parts(task_type);
            task_type.shrink_to_fit();
            let task_type = Arc::new(PreHashed::new(task_type_hash, task_type));
            // slow pass with key lock
            let id = turbo_tasks.get_fresh_task_id();
            let task = Task::new_persistent(
                // Safety: That task will hold the value, but we are still in
                // control of the task
                *unsafe { id.get_unchecked() },
                task_type.clone(),
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
        let id = id.into();
        match task_type {
            TransientTaskType::Root(f) => {
                let task = Task::new_root(id, move || f() as _);
                // SAFETY: We have a fresh task id where nobody knows about yet
                unsafe { self.memory_tasks.insert(*id as usize, task) };
                Task::set_root(id, self, turbo_tasks);
            }
            TransientTaskType::Once(f) => {
                let task = Task::new_once(id, f);
                // SAFETY: We have a fresh task id where nobody knows about yet
                unsafe { self.memory_tasks.insert(*id as usize, task) };
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
                if backend.run_gc(true, turbo_tasks) {
                    let job = backend.create_backend_job(Job::GarbageCollection);
                    turbo_tasks.schedule_backend_background_job(job);
                } else {
                    backend.idle_gc_active.store(false, Ordering::Release);
                }
            }
        }
    }
}
