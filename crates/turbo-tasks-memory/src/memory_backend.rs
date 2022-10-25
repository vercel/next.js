use std::{
    borrow::Cow,
    cell::RefCell,
    collections::HashSet,
    future::Future,
    pin::Pin,
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};

use anyhow::{bail, Result};
use event_listener::EventListener;
use flurry::HashMap as FHashMap;
use tokio::task::futures::TaskLocalFuture;
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CellContent, CellMappings, PersistentTaskType, TaskExecutionSpec,
        TransientTaskType,
    },
    util::{IdFactory, NoMoveVec},
    RawVc, TaskId, TraitTypeId, TurboTasksBackendApi,
};

use crate::{
    output::Output,
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
    task_cache: FHashMap<PersistentTaskType, TaskId>,
    scope_generation: AtomicUsize,
}

impl Default for MemoryBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl MemoryBackend {
    pub fn new() -> Self {
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
            task_cache: FHashMap::new(),
            scope_generation: AtomicUsize::new(0),
        }
    }

    fn connect_task_child(
        &self,
        parent: TaskId,
        child: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.with_task(parent, |parent| {
            parent.connect_child(child, self, turbo_tasks)
        });
    }

    pub(crate) fn create_backend_job(&self, job: Job) -> BackendJobId {
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
        turbo_tasks: &dyn TurboTasksBackendApi,
        func: F,
    ) -> Result<Result<T, EventListener>> {
        self.with_task(id, |task| {
            task.get_or_wait_output(strongly_consistent, func, self, turbo_tasks)
        })
    }

    pub fn with_all_cached_tasks(&self, mut func: impl FnMut(TaskId)) {
        for id in self.task_cache.pin().values() {
            func(*id);
        }
    }

    pub fn with_task<T>(&self, id: TaskId, func: impl FnOnce(&Task) -> T) -> T {
        func(self.memory_tasks.get(*id).unwrap())
    }

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

    fn increase_scope_active_queue(
        &self,
        mut queue: Vec<TaskScopeId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        while let Some(scope) = queue.pop() {
            if let Some(tasks) = self.with_scope(scope, |scope| {
                scope.state.lock().increment_active(&mut queue)
            }) {
                turbo_tasks.schedule_backend_foreground_job(
                    self.create_backend_job(Job::ScheduleWhenDirty(tasks)),
                );
            }
        }
    }

    pub(crate) fn increase_scope_active(
        &self,
        scope: TaskScopeId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.increase_scope_active_queue(vec![scope], turbo_tasks);
    }

    pub(crate) fn increase_scope_active_by(
        &self,
        scope: TaskScopeId,
        count: usize,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut queue = Vec::new();
        if let Some(tasks) = self.with_scope(scope, |scope| {
            scope.state.lock().increment_active_by(count, &mut queue)
        }) {
            for task in tasks.into_iter() {
                turbo_tasks.schedule(task);
            }
        }
        self.increase_scope_active_queue(queue, turbo_tasks);
    }

    pub(crate) fn decrease_scope_active(
        &self,
        scope: TaskScopeId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.decrease_scope_active_by(scope, 1, turbo_tasks);
    }

    pub(crate) fn decrease_scope_active_by(
        &self,
        scope: TaskScopeId,
        count: usize,
        _turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut queue = vec![scope];
        while let Some(scope) = queue.pop() {
            self.with_scope(scope, |scope| {
                scope.state.lock().decrement_active_by(count, &mut queue)
            });
        }
    }

    pub(crate) fn acquire_scope_generation(&self) -> usize {
        let mut generation = self.scope_generation.load(Ordering::Acquire);
        while generation & 1 == 1 {
            match self.scope_generation.compare_exchange_weak(
                generation,
                generation + 1,
                Ordering::Release,
                Ordering::Relaxed,
            ) {
                Ok(_) => return generation + 1,
                Err(result) => generation = result,
            }
        }
        generation
    }

    pub(crate) fn flag_scope_change(&self) -> usize {
        let prev = self.scope_generation.fetch_or(1, Ordering::AcqRel);
        prev | 1
    }
}

impl Backend for MemoryBackend {
    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.with_task(task, |task| task.invalidate(self, turbo_tasks));
    }

    fn invalidate_tasks(&self, tasks: Vec<TaskId>, turbo_tasks: &dyn TurboTasksBackendApi) {
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
        TaskLocalFuture<RefCell<HashSet<TaskDependency>>, T>;
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
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<TaskExecutionSpec> {
        self.with_task(task, |task| {
            if task.execution_started(self, turbo_tasks) {
                let cell_mappings = task.take_cell_mappings();
                Some(TaskExecutionSpec {
                    cell_mappings: Some(cell_mappings),
                    future: task.execute(turbo_tasks),
                })
            } else {
                None
            }
        })
    }

    fn task_execution_result(
        &self,
        task: TaskId,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.with_task(task, |task| {
            task.execution_result(result, turbo_tasks);
        })
    }

    fn task_execution_completed(
        &self,
        task: TaskId,
        cell_mappings: Option<CellMappings>,
        duration: Duration,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        self.with_task(task, |task| {
            task.execution_completed(cell_mappings, duration, self, turbo_tasks)
        })
    }

    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, EventListener>> {
        if task == reader {
            bail!("reading it's own output is not possible");
        }
        self.try_get_output(task, strongly_consistent, turbo_tasks, |output| {
            Task::add_dependency_to_current(TaskDependency::TaskOutput(task));
            output.read(reader)
        })
    }

    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, EventListener>> {
        self.try_get_output(task, strongly_consistent, turbo_tasks, |output| {
            output.read_untracked()
        })
    }

    fn track_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        if task != reader {
            self.with_task(task, |t| {
                t.with_output_mut(|output| {
                    Task::add_dependency_to_current(TaskDependency::TaskOutput(task));
                    output.track_read(reader);
                })
            })
        }
    }

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<CellContent, EventListener>> {
        if task == reader {
            Ok(Ok(self.with_task(task, |task| {
                task.with_cell_mut(index, |cell| cell.read_content_untracked())
            })))
        } else {
            Task::add_dependency_to_current(TaskDependency::TaskCell(task, index));
            Ok(Ok(self.with_task(task, |task| {
                task.with_cell_mut(index, |cell| cell.read_content(reader))
            })))
        }
    }

    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: usize,
        _turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<CellContent, EventListener>> {
        Ok(Ok(self.with_task(task, |task| {
            task.with_cell(index, |cell| cell.read_content_untracked())
        })))
    }

    fn track_read_task_cell(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        if task != reader {
            Task::add_dependency_to_current(TaskDependency::TaskCell(task, index));
            self.with_task(task, |task| {
                task.with_cell_mut(index, |cell| cell.track_read(reader))
            });
        }
    }

    fn try_read_task_collectibles(
        &self,
        id: TaskId,
        trait_id: TraitTypeId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<HashSet<RawVc>, EventListener>> {
        self.with_task(id, |task| {
            task.try_read_task_collectibles(reader, trait_id, self, turbo_tasks)
        })
    }

    fn emit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
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
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.with_task(id, |task| {
            task.unemit_collectible(trait_type, collectible, self, turbo_tasks)
        });
    }

    fn get_fresh_cell(&self, task: TaskId, _turbo_tasks: &dyn TurboTasksBackendApi) -> usize {
        self.with_task(task, |task| task.get_fresh_cell())
    }

    fn update_task_cell(
        &self,
        task: TaskId,
        index: usize,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.with_task(task, |task| {
            task.with_cell_mut(index, |cell| cell.assign(content, turbo_tasks))
        })
    }

    /// SAFETY: Must only called once with the same id
    fn run_backend_job<'a>(
        &'a self,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi,
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
        task_type: PersistentTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId {
        let map = self.task_cache.pin();
        let result = if let Some(task) = map.get(&task_type).copied() {
            // fast pass without creating a new task
            self.connect_task_child(parent_task, task, turbo_tasks);

            // TODO maybe force (background) scheduling to avoid inactive tasks hanging in
            // "in progress" until they become active
            task
        } else {
            // slow pass with key lock
            let id = turbo_tasks.get_fresh_task_id();
            let task = match &task_type {
                PersistentTaskType::Native(fn_id, inputs) => {
                    // TODO inputs doesn't need to be cloned when are would be able to get a
                    // reference to the task type stored inside of the task
                    Task::new_native(id, inputs.clone(), *fn_id)
                }
                PersistentTaskType::ResolveNative(fn_id, inputs) => {
                    Task::new_resolve_native(id, inputs.clone(), *fn_id)
                }
                PersistentTaskType::ResolveTrait(trait_type, trait_fn_name, inputs) => {
                    Task::new_resolve_trait(id, *trait_type, trait_fn_name.clone(), inputs.clone())
                }
            };
            // SAFETY: We have a fresh task id where nobody knows about yet
            unsafe {
                self.memory_tasks.insert(*id, task);
            }
            let result_task = match map.try_insert(task_type, id) {
                Ok(_) => {
                    // This is the most likely case
                    id
                }
                Err(r) => {
                    // SAFETY: We have a fresh task id where nobody knows about yet
                    unsafe {
                        self.memory_tasks.remove(*id);
                        turbo_tasks.reuse_task_id(id);
                    }
                    *r.current
                }
            };
            self.connect_task_child(parent_task, result_task, turbo_tasks);
            result_task
        };
        // keep the guard alive over the whole function
        // to avoid load on GC
        drop(map);
        result
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId {
        let id = turbo_tasks.get_fresh_task_id();
        // use INITIAL_SCOPE
        let scope = self.initial_scope;
        self.with_scope(scope, |scope| {
            scope.increment_tasks();
            scope.increment_unfinished_tasks();
        });
        let task = match task_type {
            TransientTaskType::Root(f) => Task::new_root(id, scope, move || f() as _),
            TransientTaskType::Once(f) => Task::new_once(id, scope, f),
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
    RemoveFromScopes(HashSet<TaskId>, Vec<TaskScopeId>),
    RemoveFromScope(HashSet<TaskId>, TaskScopeId),
    ScheduleWhenDirty(Vec<TaskId>),
    AddToScopeQueue(Vec<(Vec<TaskId>, usize)>, usize, TaskScopeId, bool),
    RemoveFromScopeQueue(Vec<Vec<TaskId>>, usize, TaskScopeId),
}

impl Job {
    async fn run(self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksBackendApi) {
        match self {
            Job::RemoveFromScopes(tasks, scopes) => {
                for task in tasks {
                    backend.with_task(task, |task| {
                        task.remove_from_scopes(scopes.iter().cloned(), backend, turbo_tasks)
                    });
                }
            }
            Job::RemoveFromScope(tasks, scope) => {
                for task in tasks {
                    backend.with_task(task, |task| {
                        task.remove_from_scope(scope, backend, turbo_tasks)
                    });
                }
            }
            Job::ScheduleWhenDirty(tasks) => {
                for task in tasks.into_iter() {
                    backend.with_task(task, |task| {
                        task.schedule_when_dirty(turbo_tasks);
                    })
                }
            }
            Job::AddToScopeQueue(queue, queue_size, id, is_optimization_scope) => {
                run_add_to_scope_queue(
                    queue,
                    queue_size,
                    id,
                    is_optimization_scope,
                    backend,
                    turbo_tasks,
                );
            }
            Job::RemoveFromScopeQueue(queue, queue_size, id) => {
                run_remove_from_scope_queue(queue, queue_size, id, backend, turbo_tasks);
            }
        }
    }
}
