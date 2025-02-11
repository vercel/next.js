use std::{
    borrow::{Borrow, Cow},
    future::Future,
    hash::{BuildHasher, BuildHasherDefault, Hash},
    num::NonZeroU32,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};

use anyhow::{anyhow, bail, Result};
use auto_hash_map::AutoMap;
use dashmap::{mapref::entry::Entry, DashMap};
use rustc_hash::FxHasher;
use tracing::trace_span;
use turbo_prehash::{BuildHasherExt, PassThroughHash, PreHashed};
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CachedTaskType, CellContent, TaskCollectiblesMap, TaskExecutionSpec,
        TransientTaskType, TypedCellContent,
    },
    event::EventListener,
    task_statistics::TaskStatisticsApi,
    util::{IdFactoryWithReuse, NoMoveVec},
    CellId, FunctionId, RawVc, ReadCellOptions, ReadConsistency, TaskId, TaskIdSet, TraitTypeId,
    TurboTasksBackendApi, Unused, ValueTypeId, TRANSIENT_TASK_BIT,
};

use crate::{
    edges_set::{TaskEdge, TaskEdgesSet},
    gc::{
        GcQueue, MAX_GC_STEPS, PERCENTAGE_MAX_IDLE_TARGET_MEMORY, PERCENTAGE_MAX_TARGET_MEMORY,
        PERCENTAGE_MIN_IDLE_TARGET_MEMORY, PERCENTAGE_MIN_TARGET_MEMORY,
    },
    output::Output,
    task::{ReadCellError, Task, TaskType},
};

fn prehash_task_type(task_type: CachedTaskType) -> PreHashed<CachedTaskType> {
    BuildHasherDefault::<FxHasher>::prehash(&Default::default(), task_type)
}

pub struct TaskState {
    /// Cells/Outputs/Collectibles that are read during task execution. These will be stored as
    /// dependencies when the execution has finished.
    pub dependencies_to_track: TaskEdgesSet,
}

pub struct MemoryBackend {
    persistent_tasks: NoMoveVec<Task, 13>,
    transient_tasks: NoMoveVec<Task, 10>,
    backend_jobs: NoMoveVec<Job>,
    backend_job_id_factory: IdFactoryWithReuse<BackendJobId>,
    task_cache:
        DashMap<Arc<PreHashed<CachedTaskType>>, TaskId, BuildHasherDefault<PassThroughHash>>,
    transient_task_cache:
        DashMap<Arc<PreHashed<CachedTaskType>>, TaskId, BuildHasherDefault<PassThroughHash>>,
    memory_limit: AtomicUsize,
    gc_queue: Option<GcQueue>,
    idle_gc_active: AtomicBool,
    task_statistics: TaskStatisticsApi,
    pub(crate) print_task_invalidation: bool,
}

impl Default for MemoryBackend {
    fn default() -> Self {
        Self::new(usize::MAX)
    }
}

impl MemoryBackend {
    pub fn new(memory_limit_bytes: usize) -> Self {
        let shard_amount =
            (std::thread::available_parallelism().map_or(1, usize::from) * 32).next_power_of_two();
        Self {
            persistent_tasks: NoMoveVec::new(),
            transient_tasks: NoMoveVec::new(),
            backend_jobs: NoMoveVec::new(),
            backend_job_id_factory: IdFactoryWithReuse::new(1, u32::MAX as u64),
            task_cache: DashMap::with_hasher_and_shard_amount(Default::default(), shard_amount),
            transient_task_cache: DashMap::with_hasher_and_shard_amount(
                Default::default(),
                shard_amount,
            ),
            memory_limit: AtomicUsize::new(memory_limit_bytes),
            gc_queue: (memory_limit_bytes != usize::MAX).then(GcQueue::new),
            idle_gc_active: AtomicBool::new(false),
            task_statistics: TaskStatisticsApi::default(),
            print_task_invalidation: false,
        }
    }

    /// A debug feature that prints detailed task invalidation information to stdout if enabled.
    ///
    /// To enable this in next.js, use the `NEXT_TURBOPACK_PRINT_TASK_INVALIDATION` environment
    /// variable.
    pub fn print_task_invalidation(&mut self, value: bool) {
        self.print_task_invalidation = value;
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
        consistency: ReadConsistency,
        note: impl Fn() -> String + Sync + Send + 'static,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
        func: F,
    ) -> Result<Result<T, EventListener>> {
        self.with_task(id, |task| {
            task.get_or_wait_output(consistency, func, note, self, turbo_tasks)
        })
    }

    pub fn with_all_cached_tasks(&self, mut func: impl FnMut(TaskId)) {
        for id in self.task_cache.clone().into_read_only().values() {
            func(*id);
        }
        for id in self.transient_task_cache.clone().into_read_only().values() {
            func(*id);
        }
    }

    #[inline(always)]
    pub fn with_task<T>(&self, id: TaskId, func: impl FnOnce(&Task) -> T) -> T {
        let value = *id;
        let index = (value & !TRANSIENT_TASK_BIT) as usize;
        let item = if value & TRANSIENT_TASK_BIT == 0 {
            self.persistent_tasks.get(index)
        } else {
            self.transient_tasks.get(index)
        };
        func(item.unwrap())
    }

    #[inline(always)]
    pub fn task(&self, id: TaskId) -> &Task {
        let value = *id;
        let index = (value & !TRANSIENT_TASK_BIT) as usize;
        let item = if value & TRANSIENT_TASK_BIT == 0 {
            self.persistent_tasks.get(index)
        } else {
            self.transient_tasks.get(index)
        };
        item.unwrap()
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
            let mut remaining_generations = 0;
            let mut mem_limit = self.memory_limit.load(Ordering::Relaxed);
            let mut span = None;
            'outer: loop {
                let mut collected_generations = 0;
                let (min, max) = if idle {
                    (
                        mem_limit * PERCENTAGE_MIN_IDLE_TARGET_MEMORY / 100,
                        mem_limit * PERCENTAGE_MAX_IDLE_TARGET_MEMORY / 100,
                    )
                } else {
                    (
                        mem_limit * PERCENTAGE_MIN_TARGET_MEMORY / 100,
                        mem_limit * PERCENTAGE_MAX_TARGET_MEMORY / 100,
                    )
                };
                let mut target = max;
                let mut counter = 0;
                loop {
                    let usage = turbo_tasks_malloc::TurboMalloc::memory_usage();
                    if usage < target {
                        return did_something;
                    }
                    target = min;
                    if span.is_none() {
                        span =
                            Some(tracing::trace_span!(parent: None, "garbage collection", usage));
                    }

                    let progress = gc_queue.run_gc(self, turbo_tasks);

                    if progress.is_some() {
                        did_something = true;
                    }

                    if let Some(g) = progress {
                        remaining_generations = g;
                        if g > 0 {
                            collected_generations += 1;
                        }
                    }

                    counter += 1;
                    if counter > MAX_GC_STEPS
                        || collected_generations > remaining_generations
                        || progress.is_none()
                    {
                        let new_mem_limit = mem_limit * 4 / 3;
                        if self
                            .memory_limit
                            .compare_exchange(
                                mem_limit,
                                new_mem_limit,
                                Ordering::Relaxed,
                                Ordering::Relaxed,
                            )
                            .is_ok()
                        {
                            println!(
                                "Ineffective GC, increasing memory limit {} MB -> {} MB",
                                mem_limit / 1024 / 1024,
                                new_mem_limit / 1024 / 1024
                            );
                            mem_limit = new_mem_limit;
                        } else {
                            mem_limit = self.memory_limit.load(Ordering::Relaxed);
                        }
                        continue 'outer;
                    }

                    did_something = true;
                }
            }
        }
        false
    }

    fn insert_and_connect_fresh_task<K: Eq + Hash, H: BuildHasher + Clone, const N: u32>(
        &self,
        parent_task: TaskId,
        task_cache: &DashMap<K, TaskId, H>,
        task_storage: &NoMoveVec<Task, N>,
        task_storage_offset: u32,
        key: K,
        new_id: Unused<TaskId>,
        task: Task,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        let new_id = new_id.into();
        let index = (*new_id - task_storage_offset) as usize;
        // Safety: We have a fresh task id that nobody knows about yet
        unsafe { task_storage.insert(index, task) };
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
                    task_storage.remove(index);
                    if new_id.is_transient() {
                        let new_id = Unused::new_unchecked(new_id);
                        turbo_tasks.reuse_transient_task_id(new_id);
                    } else {
                        let new_id = Unused::new_unchecked(new_id);
                        turbo_tasks.reuse_persistent_task_id(new_id);
                    }
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
            .inspect(|&task_id| {
                self.connect_task_child(parent_task, task_id, turbo_tasks);
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

    fn track_cache_hit(&self, task_type: &CachedTaskType) {
        self.task_statistics()
            .map(|stats| stats.increment_cache_hit(task_type.fn_type));
    }

    fn track_cache_miss(&self, task_type: &CachedTaskType) {
        self.task_statistics()
            .map(|stats| stats.increment_cache_miss(task_type.fn_type));
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

    type TaskState = TaskState;
    fn new_task_state(&self, _task: TaskId) -> Self::TaskState {
        TaskState {
            dependencies_to_track: TaskEdgesSet::new(),
        }
    }

    fn try_start_task_execution<'a>(
        &'a self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<TaskExecutionSpec<'a>> {
        let task = self.task(task);
        task.execute(self, turbo_tasks)
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
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
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
                    cell_counters,
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
        consistency: ReadConsistency,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<RawVc, EventListener>> {
        if task == reader {
            bail!("reading it's own output is not possible");
        }
        self.try_get_output(
            task,
            consistency,
            move || format!("reading task output from {reader}"),
            turbo_tasks,
            |output| {
                Task::add_dependency_to_current(TaskEdge::Output(task), turbo_tasks);
                output.read(reader)
            },
        )
    }

    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        consistency: ReadConsistency,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<RawVc, EventListener>> {
        self.try_get_output(
            task,
            consistency,
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
        _options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        if task_id == reader {
            Ok(Ok(self
                .with_task(task_id, |task| {
                    task.with_cell(index, |cell| cell.read_own_content_untracked())
                })
                .into_typed(index.type_id)))
        } else {
            Task::add_dependency_to_current(TaskEdge::Cell(task_id, index), turbo_tasks);
            self.with_task(task_id, |task| {
                match task.read_cell(
                    index,
                    self.gc_queue.as_ref(),
                    move || format!("reading {} {} from {}", task_id, index, reader),
                    Some(reader),
                    self,
                    turbo_tasks,
                ) {
                    Ok(content) => Ok(Ok(content.into_typed(index.type_id))),
                    Err(ReadCellError::Recomputing(listener)) => Ok(Err(listener)),
                    Err(ReadCellError::CellRemoved) => Err(anyhow!("Cell doesn't exist")),
                }
            })
        }
    }

    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
        _options: ReadCellOptions,
        _turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<TypedCellContent> {
        Ok(self.with_task(current_task, |task| {
            task.with_cell(index, |cell| cell.read_own_content_untracked())
                .into_typed(index.type_id)
        }))
    }

    fn try_read_task_cell_untracked(
        &self,
        task_id: TaskId,
        index: CellId,
        _options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.with_task(task_id, |task| {
            match task.read_cell(
                index,
                self.gc_queue.as_ref(),
                move || format!("reading {} {} untracked", task_id, index),
                None,
                self,
                turbo_tasks,
            ) {
                Ok(content) => Ok(Ok(content.into_typed(index.type_id))),
                Err(ReadCellError::Recomputing(listener)) => Ok(Err(listener)),
                Err(ReadCellError::CellRemoved) => Err(anyhow!("Cell doesn't exist")),
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
        Task::add_dependency_to_current(TaskEdge::Collectibles(id, trait_id), turbo_tasks);
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

    /// SAFETY: This function does not validate that the data in `content` is of
    /// the same type as in `index`. It is the caller's responsibility to ensure
    /// that the content is of the correct type.
    fn update_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.with_task(task, |task| {
            task.access_cell_for_write(index, |cell, clean| {
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
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskId {
        let task_type = prehash_task_type(task_type);
        if let Some(task) =
            self.lookup_and_connect_task(parent_task, &self.task_cache, &task_type, turbo_tasks)
        {
            // fast pass without creating a new task
            self.track_cache_hit(&task_type);
            task
        } else {
            self.track_cache_miss(&task_type);
            // It's important to avoid overallocating memory as this will go into the task
            // cache and stay there forever. We can to be as small as possible.
            let (task_type_hash, task_type) = PreHashed::into_parts(task_type);
            let task_type = Arc::new(PreHashed::new(task_type_hash, task_type));
            // slow pass with key lock
            let id = turbo_tasks.get_fresh_persistent_task_id();
            let task = Task::new_persistent(
                // Safety: That task will hold the value, but we are still in
                // control of the task
                *unsafe { id.get_unchecked() },
                task_type.clone(),
            );
            self.insert_and_connect_fresh_task(
                parent_task,
                &self.task_cache,
                &self.persistent_tasks,
                0,
                task_type,
                id,
                task,
                turbo_tasks,
            )
        }
    }

    fn get_or_create_transient_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId {
        let task_type = prehash_task_type(task_type);
        if let Some(task) = self.lookup_and_connect_task(
            parent_task,
            &self.transient_task_cache,
            &task_type,
            turbo_tasks,
        ) {
            // fast pass without creating a new task
            self.track_cache_hit(&task_type);
            task
        } else {
            self.track_cache_miss(&task_type);
            // It's important to avoid overallocating memory as this will go into the task
            // cache and stay there forever. We can to be as small as possible.
            let (task_type_hash, task_type) = PreHashed::into_parts(task_type);
            let task_type = Arc::new(PreHashed::new(task_type_hash, task_type));
            // slow pass with key lock
            let id = turbo_tasks.get_fresh_transient_task_id();
            let task = Task::new_transient(
                // Safety: That task will hold the value, but we are still in
                // control of the task
                *unsafe { id.get_unchecked() },
                task_type.clone(),
            );
            self.insert_and_connect_fresh_task(
                parent_task,
                &self.transient_task_cache,
                &self.transient_tasks,
                TRANSIENT_TASK_BIT,
                task_type,
                id,
                task,
                turbo_tasks,
            )
        }
    }

    fn try_get_function_id(&self, task_id: TaskId) -> Option<FunctionId> {
        self.with_task(task_id, |task| match &task.ty {
            TaskType::Persistent { ty } => Some(ty.fn_type),
            _ => None,
        })
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
        let id = turbo_tasks.get_fresh_transient_task_id();
        let id = id.into();
        let index = (*id - TRANSIENT_TASK_BIT) as usize;
        match task_type {
            TransientTaskType::Root(f) => {
                let task = Task::new_root(id, move || f() as _);
                // SAFETY: We have a fresh task id where nobody knows about yet
                unsafe { self.transient_tasks.insert(index, task) };
                Task::set_root(id, self, turbo_tasks);
            }
            TransientTaskType::Once(f) => {
                let task = Task::new_once(id, f);
                // SAFETY: We have a fresh task id where nobody knows about yet
                unsafe { self.transient_tasks.insert(index, task) };
                Task::set_once(id, self, turbo_tasks);
            }
        };
        id
    }

    fn dispose_root_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        Task::unset_root(task, self, turbo_tasks);
    }

    fn task_statistics(&self) -> &TaskStatisticsApi {
        &self.task_statistics
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
