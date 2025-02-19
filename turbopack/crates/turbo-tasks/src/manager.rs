use std::{
    any::Any,
    borrow::Cow,
    future::Future,
    hash::BuildHasherDefault,
    mem::take,
    panic::AssertUnwindSafe,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex, RwLock, Weak,
    },
    thread,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoMap;
use futures::FutureExt;
use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};
use tokio::{runtime::Handle, select, task_local};
use tokio_util::task::TaskTracker;
use tracing::{info_span, instrument, trace_span, Instrument, Level, Span};
use turbo_tasks_malloc::TurboMalloc;

use crate::{
    backend::{
        Backend, CachedTaskType, CellContent, TaskCollectiblesMap, TaskExecutionSpec,
        TransientTaskType, TypedCellContent,
    },
    capture_future::{self, CaptureFuture},
    event::{Event, EventListener},
    id::{BackendJobId, FunctionId, LocalTaskId, TraitTypeId, TRANSIENT_TASK_BIT},
    id_factory::IdFactoryWithReuse,
    magic_any::MagicAny,
    raw_vc::{CellId, RawVc},
    registry,
    serialization_invalidation::SerializationInvalidator,
    task::local_task::{LocalTask, LocalTaskType},
    task_statistics::TaskStatisticsApi,
    trace::TraceRawVcs,
    trait_helpers::get_trait_method,
    util::StaticOrArc,
    vc::ReadVcFuture,
    Completion, InvalidationReason, InvalidationReasonSet, ReadCellOptions, ResolvedVc,
    SharedReference, TaskId, TaskIdSet, ValueTypeId, Vc, VcRead, VcValueTrait, VcValueType,
};

pub trait TurboTasksCallApi: Sync + Send {
    /// Calls a native function with arguments. Resolves arguments when needed
    /// with a wrapper task.
    fn dynamic_call(
        &self,
        func: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc;
    /// Call a native function with arguments.
    /// All inputs must be resolved.
    fn native_call(
        &self,
        func: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc;
    /// Calls a trait method with arguments. First input is the `self` object.
    /// Uses a wrapper task to resolve
    fn trait_call(
        &self,
        trait_type: TraitTypeId,
        trait_fn_name: Cow<'static, str>,
        this: RawVc,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc;

    fn run_once(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId;
    fn run_once_with_reason(
        &self,
        reason: StaticOrArc<dyn InvalidationReason>,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId;
    fn run_once_process(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId;
}

pub trait TurboTasksApi: TurboTasksCallApi + Sync + Send {
    fn pin(&self) -> Arc<dyn TurboTasksApi>;

    fn invalidate(&self, task: TaskId);
    fn invalidate_with_reason(&self, task: TaskId, reason: StaticOrArc<dyn InvalidationReason>);

    fn invalidate_serialization(&self, task: TaskId);

    /// Eagerly notifies all tasks that were scheduled for notifications via
    /// `schedule_notify_tasks_set()`
    fn notify_scheduled_tasks(&self);

    fn try_read_task_output(
        &self,
        task: TaskId,
        consistency: ReadConsistency,
    ) -> Result<Result<RawVc, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        consistency: ReadConsistency,
    ) -> Result<Result<RawVc, EventListener>>;

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// This does not accept a consistency argument, as you cannot control consistency of a read of
    /// an operation owned by your own task. Strongly consistent reads are only allowed on
    /// `OperationVc`s, which should never be local tasks.
    fn try_read_local_output(
        &self,
        parent_task_id: TaskId,
        local_task_id: LocalTaskId,
    ) -> Result<Result<RawVc, EventListener>>;

    fn read_task_collectibles(&self, task: TaskId, trait_id: TraitTypeId) -> TaskCollectiblesMap;

    fn emit_collectible(&self, trait_type: TraitTypeId, collectible: RawVc);
    fn unemit_collectible(&self, trait_type: TraitTypeId, collectible: RawVc, count: u32);
    fn unemit_collectibles(&self, trait_type: TraitTypeId, collectibles: &TaskCollectiblesMap);

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<TypedCellContent>;

    fn read_own_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<TypedCellContent>;
    fn update_own_task_cell(&self, task: TaskId, index: CellId, content: CellContent);
    fn mark_own_task_as_finished(&self, task: TaskId);
    fn set_own_task_aggregation_number(&self, task: TaskId, aggregation_number: u32);
    fn mark_own_task_as_session_dependent(&self, task: TaskId);

    fn connect_task(&self, task: TaskId);

    /// Wraps the given future in the current task.
    ///
    /// Beware: this method is not safe to use in production code. It is only intended for use in
    /// tests and for debugging purposes.
    fn detached_for_testing(
        &self,
        f: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>;

    fn task_statistics(&self) -> &TaskStatisticsApi;

    fn stop_and_wait(&self) -> Pin<Box<dyn Future<Output = ()> + Send>>;
}

/// A wrapper around a value that is unused.
pub struct Unused<T> {
    inner: T,
}

impl<T> Unused<T> {
    /// Creates a new unused value.
    ///
    /// # Safety
    ///
    /// The wrapped value must not be used.
    pub unsafe fn new_unchecked(inner: T) -> Self {
        Self { inner }
    }

    /// Get the inner value, without consuming the `Unused` wrapper.
    ///
    /// # Safety
    ///
    /// The user need to make sure that the value stays unused.
    pub unsafe fn get_unchecked(&self) -> &T {
        &self.inner
    }

    /// Unwraps the value, consuming the `Unused` wrapper.
    pub fn into(self) -> T {
        self.inner
    }
}

pub trait TurboTasksBackendApi<B: Backend + 'static>: TurboTasksCallApi + Sync + Send {
    fn pin(&self) -> Arc<dyn TurboTasksBackendApi<B>>;

    fn get_fresh_persistent_task_id(&self) -> Unused<TaskId>;
    fn get_fresh_transient_task_id(&self) -> Unused<TaskId>;
    /// # Safety
    ///
    /// The caller must ensure that the task id is not used anymore.
    unsafe fn reuse_persistent_task_id(&self, id: Unused<TaskId>);
    /// # Safety
    ///
    /// The caller must ensure that the task id is not used anymore.
    unsafe fn reuse_transient_task_id(&self, id: Unused<TaskId>);

    fn schedule(&self, task: TaskId);
    fn schedule_backend_background_job(&self, id: BackendJobId);
    fn schedule_backend_foreground_job(&self, id: BackendJobId);

    fn try_foreground_done(&self) -> Result<(), EventListener>;
    fn wait_foreground_done_excluding_own<'a>(
        &'a self,
    ) -> Option<Pin<Box<dyn Future<Output = ()> + Send + 'a>>>;

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `invalidate_tasks()` on all tasks.
    fn schedule_notify_tasks(&self, tasks: &[TaskId]);

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `invalidate_tasks()` on all tasks.
    fn schedule_notify_tasks_set(&self, tasks: &TaskIdSet);

    /// Returns the duration from the start of the program to the given instant.
    fn program_duration_until(&self, instant: Instant) -> Duration;

    /// An untyped object-safe version of [`TurboTasksBackendApiExt::read_task_state`]. Callers
    /// should prefer the extension trait's version of this method.
    fn read_task_state_dyn(&self, func: &mut dyn FnMut(&B::TaskState));

    /// An untyped object-safe version of [`TurboTasksBackendApiExt::write_task_state`]. Callers
    /// should prefer the extension trait's version of this method.
    fn write_task_state_dyn(&self, func: &mut dyn FnMut(&mut B::TaskState));

    /// Returns true if the system is idle.
    fn is_idle(&self) -> bool;

    /// Returns a reference to the backend.
    fn backend(&self) -> &B;
}

/// An extension trait for methods of `TurboTasksBackendApi` that are not object-safe. This is
/// automatically implemented for all `TurboTasksBackendApi`s using a blanket impl.
pub trait TurboTasksBackendApiExt<B: Backend + 'static>: TurboTasksBackendApi<B> {
    /// Allows modification of the [`Backend::TaskState`].
    ///
    /// This function holds open a non-exclusive read lock that blocks writes, so `func` is expected
    /// to execute quickly in order to release the lock.
    fn read_task_state<T>(&self, func: impl FnOnce(&B::TaskState) -> T) -> T {
        let mut func = Some(func);
        let mut out = None;
        self.read_task_state_dyn(&mut |ts| out = Some((func.take().unwrap())(ts)));
        out.expect("read_task_state_dyn must call `func`")
    }

    /// Allows modification of the [`Backend::TaskState`].
    ///
    /// This function holds open a write lock, so `func` is expected to execute quickly in order to
    /// release the lock.
    fn write_task_state<T>(&self, func: impl FnOnce(&mut B::TaskState) -> T) -> T {
        let mut func = Some(func);
        let mut out = None;
        self.write_task_state_dyn(&mut |ts| out = Some((func.take().unwrap())(ts)));
        out.expect("write_task_state_dyn must call `func`")
    }
}

impl<TT, B> TurboTasksBackendApiExt<B> for TT
where
    TT: TurboTasksBackendApi<B> + ?Sized,
    B: Backend + 'static,
{
}

#[allow(clippy::manual_non_exhaustive)]
pub struct UpdateInfo {
    pub duration: Duration,
    pub tasks: usize,
    pub reasons: InvalidationReasonSet,
    #[allow(dead_code)]
    placeholder_for_future_fields: (),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TaskPersistence {
    /// Tasks that may be persisted across sessions using serialization.
    Persistent,

    /// Tasks that will be persisted in memory for the life of this session, but won't persist
    /// between sessions.
    ///
    /// This is used for [root tasks][TurboTasks::spawn_root_task] and tasks with an argument of
    /// type [`TransientValue`][crate::value::TransientValue] or
    /// [`TransientInstance`][crate::value::TransientInstance].
    Transient,

    /// Tasks that are persisted only for the lifetime of the nearest non-`Local` parent caller.
    ///
    /// This task does not have a unique task id, and is not shared with the backend. Instead it
    /// uses the parent task's id.
    ///
    /// This is useful for functions that have a low cache hit rate. Those functions could be
    /// converted to non-task functions, but that would break their function signature. This
    /// provides a mechanism for skipping caching without changing the function signature.
    Local,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadConsistency {
    /// The default behavior for most APIs. Reads are faster, but may return stale values, which
    /// may later trigger re-computation.
    Eventual,
    /// Ensures all dependencies are fully resolved before returning the cell or output data, at
    /// the cost of slower reads.
    ///
    /// Top-level code that returns data to the user should use strongly consistent reads.
    Strong,
}

pub struct TurboTasks<B: Backend + 'static> {
    this: Weak<Self>,
    backend: B,
    task_id_factory: IdFactoryWithReuse<TaskId>,
    transient_task_id_factory: IdFactoryWithReuse<TaskId>,
    stopped: AtomicBool,
    currently_scheduled_tasks: AtomicUsize,
    currently_scheduled_foreground_jobs: AtomicUsize,
    currently_scheduled_background_jobs: AtomicUsize,
    scheduled_tasks: AtomicUsize,
    start: Mutex<Option<Instant>>,
    aggregated_update: Mutex<(Option<(Duration, usize)>, InvalidationReasonSet)>,
    event: Event,
    event_start: Event,
    event_foreground: Event,
    event_background: Event,
    program_start: Instant,
}

/// Information about a non-local task. A non-local task can contain multiple "local" tasks, which
/// all share the same non-local task state.
///
/// A non-local task is one that:
///
/// - Has a unique task id.
/// - Is potentially cached.
/// - The backend is aware of.
struct CurrentTaskState {
    task_id: TaskId,

    /// Affected tasks, that are tracked during task execution. These tasks will
    /// be invalidated when the execution finishes or before reading a cell
    /// value.
    tasks_to_notify: Vec<TaskId>,

    /// True if the current task has state in cells
    stateful: bool,

    /// Tracks how many cells of each type has been allocated so far during this task execution.
    /// When a task is re-executed, the cell count may not match the existing cell vec length.
    ///
    /// This is taken (and becomes `None`) during teardown of a task.
    cell_counters: Option<AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>>,

    /// Local tasks created while this global task has been running. Indexed by `LocalTaskId`.
    local_tasks: Vec<LocalTask>,

    /// Tracks currently running local tasks, and defers cleanup of the global task until those
    /// complete. Also used by `detached_for_testing`.
    local_task_tracker: TaskTracker,

    backend_state: Box<dyn Any + Send + Sync>,
}

impl CurrentTaskState {
    fn new(task_id: TaskId, backend_state: Box<dyn Any + Send + Sync>) -> Self {
        Self {
            task_id,
            tasks_to_notify: Vec::new(),
            stateful: false,
            cell_counters: Some(AutoMap::default()),
            local_tasks: Vec::new(),
            local_task_tracker: TaskTracker::new(),
            backend_state,
        }
    }

    fn assert_task_id(&self, expected_task_id: TaskId) {
        if self.task_id != expected_task_id {
            unimplemented!(
                "Local tasks can currently only be scheduled/awaited within their parent task"
            );
        }
    }

    fn create_local_task(&mut self, local_task: LocalTask) -> LocalTaskId {
        self.local_tasks.push(local_task);
        // generate a one-indexed id
        if cfg!(debug_assertions) {
            LocalTaskId::from(u32::try_from(self.local_tasks.len()).unwrap())
        } else {
            unsafe { LocalTaskId::new_unchecked(self.local_tasks.len() as u32) }
        }
    }

    fn get_local_task(&self, local_task_id: LocalTaskId) -> &LocalTask {
        // local task ids are one-indexed (they use NonZeroU32)
        &self.local_tasks[(*local_task_id as usize) - 1]
    }

    fn get_mut_local_task(&mut self, local_task_id: LocalTaskId) -> &mut LocalTask {
        &mut self.local_tasks[(*local_task_id as usize) - 1]
    }
}

// TODO implement our own thread pool and make these thread locals instead
task_local! {
    /// The current TurboTasks instance
    static TURBO_TASKS: Arc<dyn TurboTasksApi>;

    static CURRENT_TASK_STATE: Arc<RwLock<CurrentTaskState>>;
}

impl<B: Backend + 'static> TurboTasks<B> {
    // TODO better lifetime management for turbo tasks
    // consider using unsafe for the task_local turbo tasks
    // that should be safe as long tasks can't outlife turbo task
    // so we probably want to make sure that all tasks are joined
    // when trying to drop turbo tasks
    pub fn new(backend: B) -> Arc<Self> {
        let task_id_factory = IdFactoryWithReuse::new(1, (TRANSIENT_TASK_BIT - 1) as u64);
        let transient_task_id_factory =
            IdFactoryWithReuse::new(TRANSIENT_TASK_BIT as u64, u32::MAX as u64);
        let this = Arc::new_cyclic(|this| Self {
            this: this.clone(),
            backend,
            task_id_factory,
            transient_task_id_factory,
            stopped: AtomicBool::new(false),
            currently_scheduled_tasks: AtomicUsize::new(0),
            currently_scheduled_background_jobs: AtomicUsize::new(0),
            currently_scheduled_foreground_jobs: AtomicUsize::new(0),
            scheduled_tasks: AtomicUsize::new(0),
            start: Default::default(),
            aggregated_update: Default::default(),
            event: Event::new(|| "TurboTasks::event".to_string()),
            event_start: Event::new(|| "TurboTasks::event_start".to_string()),
            event_foreground: Event::new(|| "TurboTasks::event_foreground".to_string()),
            event_background: Event::new(|| "TurboTasks::event_background".to_string()),
            program_start: Instant::now(),
        });
        this.backend.startup(&*this);
        this
    }

    pub fn pin(&self) -> Arc<Self> {
        self.this.upgrade().unwrap()
    }

    /// Creates a new root task
    pub fn spawn_root_task<T, F, Fut>(&self, functor: F) -> TaskId
    where
        T: ?Sized,
        F: Fn() -> Fut + Send + Sync + Clone + 'static,
        Fut: Future<Output = Result<Vc<T>>> + Send,
    {
        let id = self.backend.create_transient_task(
            TransientTaskType::Root(Box::new(move || {
                let functor = functor.clone();
                Box::pin(async move {
                    let raw_vc = functor().await?.node;
                    raw_vc.to_non_local().await
                })
            })),
            self,
        );
        self.schedule(id);
        id
    }

    pub fn dispose_root_task(&self, task_id: TaskId) {
        self.backend.dispose_root_task(task_id, self);
    }

    // TODO make sure that all dependencies settle before reading them
    /// Creates a new root task, that is only executed once.
    /// Dependencies will not invalidate the task.
    #[track_caller]
    pub fn spawn_once_task<T, Fut>(&self, future: Fut) -> TaskId
    where
        T: ?Sized,
        Fut: Future<Output = Result<Vc<T>>> + Send + 'static,
    {
        let id = self.backend.create_transient_task(
            TransientTaskType::Once(Box::pin(async move {
                let raw_vc = future.await?.node;
                raw_vc.to_non_local().await
            })),
            self,
        );
        self.schedule(id);
        id
    }

    pub async fn run_once<T: TraceRawVcs + Send + 'static>(
        &self,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let task_id = self.spawn_once_task(async move {
            let result = future.await?;
            tx.send(result)
                .map_err(|_| anyhow!("unable to send result"))?;
            Ok(Completion::new())
        });
        // INVALIDATION: A Once task will never invalidate, therefore we don't need to
        // track a dependency
        let raw_result =
            read_task_output_untracked(self, task_id, ReadConsistency::Eventual).await?;
        turbo_tasks_future_scope(
            self.pin(),
            ReadVcFuture::<Completion>::from(raw_result.into_read().untracked()),
        )
        .await?;

        Ok(rx.await?)
    }

    pub(crate) fn native_call(
        &self,
        fn_type: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        match persistence {
            TaskPersistence::Local => {
                let task_type = LocalTaskType::Native { fn_type, this, arg };
                self.schedule_local_task(task_type, persistence)
            }
            TaskPersistence::Transient => {
                let task_type = CachedTaskType { fn_type, this, arg };
                RawVc::TaskOutput(self.backend.get_or_create_transient_task(
                    task_type,
                    current_task("turbo_function calls"),
                    self,
                ))
            }
            TaskPersistence::Persistent => {
                let task_type = CachedTaskType { fn_type, this, arg };
                RawVc::TaskOutput(self.backend.get_or_create_persistent_task(
                    task_type,
                    current_task("turbo_function calls"),
                    self,
                ))
            }
        }
    }

    pub fn dynamic_call(
        &self,
        fn_type: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        if this.is_none_or(|this| this.is_resolved())
            && registry::get_function(fn_type).arg_meta.is_resolved(&*arg)
        {
            return self.native_call(fn_type, this, arg, persistence);
        }
        let task_type = LocalTaskType::ResolveNative { fn_type, this, arg };
        self.schedule_local_task(task_type, persistence)
    }

    pub fn trait_call(
        &self,
        trait_type: TraitTypeId,
        mut trait_fn_name: Cow<'static, str>,
        this: RawVc,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        // avoid creating a wrapper task if self is already resolved
        // for resolved cells we already know the value type so we can lookup the
        // function
        if let RawVc::TaskCell(_, CellId { type_id, .. }) = this {
            match get_trait_method(trait_type, type_id, trait_fn_name) {
                Ok(native_fn) => {
                    let arg = registry::get_function(native_fn).arg_meta.filter_owned(arg);
                    return self.dynamic_call(native_fn, Some(this), arg, persistence);
                }
                Err(name) => {
                    trait_fn_name = name;
                }
            }
        }

        // create a wrapper task to resolve all inputs
        let task_type = LocalTaskType::ResolveTrait {
            trait_type,
            method_name: trait_fn_name,
            this,
            arg,
        };

        self.schedule_local_task(task_type, persistence)
    }

    #[track_caller]
    pub(crate) fn schedule(&self, task_id: TaskId) {
        self.begin_primary_job();
        self.scheduled_tasks.fetch_add(1, Ordering::AcqRel);

        let this = self.pin();
        let future = async move {
            let mut schedule_again = true;
            while schedule_again {
                let backend_state = this.backend.new_task_state(task_id);
                let current_task_state = Arc::new(RwLock::new(CurrentTaskState::new(
                    task_id,
                    Box::new(backend_state),
                )));
                let single_execution_future = async {
                    if this.stopped.load(Ordering::Acquire) {
                        return false;
                    }

                    let Some(TaskExecutionSpec { future, span }) =
                        this.backend.try_start_task_execution(task_id, &*this)
                    else {
                        return false;
                    };

                    async {
                        let (result, duration, memory_usage) =
                            CaptureFuture::new(AssertUnwindSafe(future).catch_unwind()).await;

                        // wait for all spawned local tasks using `local` to finish
                        let ltt = CURRENT_TASK_STATE
                            .with(|ts| ts.read().unwrap().local_task_tracker.clone());
                        ltt.close();
                        ltt.wait().await;

                        let result = result.map_err(|any| match any.downcast::<String>() {
                            Ok(owned) => Some(Cow::Owned(*owned)),
                            Err(any) => match any.downcast::<&'static str>() {
                                Ok(str) => Some(Cow::Borrowed(*str)),
                                Err(_) => None,
                            },
                        });
                        this.backend.task_execution_result(task_id, result, &*this);
                        let stateful = this.finish_current_task_state();
                        let cell_counters = CURRENT_TASK_STATE
                            .with(|ts| ts.write().unwrap().cell_counters.take().unwrap());
                        let schedule_again = this.backend.task_execution_completed(
                            task_id,
                            duration,
                            memory_usage,
                            &cell_counters,
                            stateful,
                            &*this,
                        );
                        // task_execution_completed might need to notify tasks
                        this.notify_scheduled_tasks();
                        schedule_again
                    }
                    .instrument(span)
                    .await
                };
                schedule_again = CURRENT_TASK_STATE
                    .scope(current_task_state, single_execution_future)
                    .await;
            }
            this.finish_primary_job();
            anyhow::Ok(())
        };

        let future = TURBO_TASKS.scope(self.pin(), future).in_current_span();

        #[cfg(feature = "tokio_tracing")]
        {
            let description = self.backend.get_task_description(task_id);
            tokio::task::Builder::new()
                .name(&description)
                .spawn(future)
                .unwrap();
        }
        #[cfg(not(feature = "tokio_tracing"))]
        tokio::task::spawn(future);
    }

    fn schedule_local_task(
        &self,
        ty: LocalTaskType,
        // if this is a `LocalTaskType::Resolve*`, we may spawn another task with this persistence,
        // if this is a `LocalTaskType::Native`, persistence is unused (there's no caching).
        persistence: TaskPersistence,
    ) -> RawVc {
        use crate::OutputContent;

        let ty = Arc::new(ty);
        let (global_task_state, local_task_id, parent_task_id) = CURRENT_TASK_STATE.with(|gts| {
            let mut gts_write = gts.write().unwrap();
            let local_task_id = gts_write.create_local_task(LocalTask::Scheduled {
                done_event: Event::new({
                    let ty = Arc::clone(&ty);
                    move || format!("LocalTask({})::done_event", ty)
                }),
            });
            (Arc::clone(gts), local_task_id, gts_write.task_id)
        });

        #[cfg(feature = "tokio_tracing")]
        let description = format!(
            "[local] (parent: {}) {}",
            self.backend.get_task_description(parent_task_id),
            ty,
        );

        let this = self.pin();
        let future = async move {
            let TaskExecutionSpec { future, span } =
                crate::task::local_task::get_local_task_execution_spec(&*this, &ty, persistence);
            async move {
                let (result, _duration, _memory_usage) =
                    CaptureFuture::new(AssertUnwindSafe(future).catch_unwind()).await;

                let result = result.map_err(|any| match any.downcast::<String>() {
                    Ok(owned) => Some(Cow::Owned(*owned)),
                    Err(any) => match any.downcast::<&'static str>() {
                        Ok(str) => Some(Cow::Borrowed(*str)),
                        Err(_) => None,
                    },
                });
                let local_task = LocalTask::Done {
                    output: match result {
                        Ok(Ok(raw_vc)) => OutputContent::Link(raw_vc),
                        Ok(Err(err)) => OutputContent::Error(err.into()),
                        Err(panic_err) => OutputContent::Panic(panic_err.map(Box::new)),
                    },
                };

                let done_event = CURRENT_TASK_STATE.with(move |gts| {
                    let mut gts_write = gts.write().unwrap();
                    let scheduled_task =
                        std::mem::replace(gts_write.get_mut_local_task(local_task_id), local_task);
                    let LocalTask::Scheduled { done_event } = scheduled_task else {
                        panic!("local task finished, but was not in the scheduled state?");
                    };
                    done_event
                });
                done_event.notify(usize::MAX)
            }
            .instrument(span)
            .await
        };
        let future = global_task_state
            .read()
            .unwrap()
            .local_task_tracker
            .track_future(future);
        let future = CURRENT_TASK_STATE.scope(global_task_state, future);
        let future = TURBO_TASKS.scope(self.pin(), future).in_current_span();

        #[cfg(feature = "tokio_tracing")]
        tokio::task::Builder::new()
            .name(&description)
            .spawn(future)
            .unwrap();
        #[cfg(not(feature = "tokio_tracing"))]
        tokio::task::spawn(future);

        RawVc::LocalOutput(parent_task_id, local_task_id)
    }

    fn begin_primary_job(&self) {
        if self
            .currently_scheduled_tasks
            .fetch_add(1, Ordering::AcqRel)
            == 0
        {
            *self.start.lock().unwrap() = Some(Instant::now());
            self.event_start.notify(usize::MAX);
            self.backend.idle_end(self);
        }
    }

    fn begin_foreground_job(&self) {
        self.begin_primary_job();
        self.currently_scheduled_foreground_jobs
            .fetch_add(1, Ordering::AcqRel);
    }

    fn finish_primary_job(&self) {
        if self
            .currently_scheduled_tasks
            .fetch_sub(1, Ordering::AcqRel)
            == 1
        {
            self.backend.idle_start(self);
            // That's not super race-condition-safe, but it's only for
            // statistical reasons
            let total = self.scheduled_tasks.load(Ordering::Acquire);
            self.scheduled_tasks.store(0, Ordering::Release);
            if let Some(start) = *self.start.lock().unwrap() {
                let (update, _) = &mut *self.aggregated_update.lock().unwrap();
                if let Some(update) = update.as_mut() {
                    update.0 += start.elapsed();
                    update.1 += total;
                } else {
                    *update = Some((start.elapsed(), total));
                }
            }
            self.event.notify(usize::MAX);
        }
    }

    fn finish_foreground_job(&self) {
        if self
            .currently_scheduled_foreground_jobs
            .fetch_sub(1, Ordering::AcqRel)
            == 1
        {
            self.event_foreground.notify(usize::MAX);
        }
        self.finish_primary_job();
    }

    pub async fn wait_foreground_done(&self) {
        if self
            .currently_scheduled_foreground_jobs
            .load(Ordering::Acquire)
            == 0
        {
            return;
        }
        let listener = self.event_foreground.listen();
        if self
            .currently_scheduled_foreground_jobs
            .load(Ordering::Acquire)
            == 0
        {
            return;
        }
        listener
            .instrument(trace_span!("wait_foreground_done"))
            .await;
    }

    pub fn get_in_progress_count(&self) -> usize {
        self.currently_scheduled_tasks.load(Ordering::Acquire)
    }

    /// Waits for the given task to finish executing. This works by performing an untracked read,
    /// and discarding the value of the task output.
    ///
    /// [`ReadConsistency::Weak`] means that this will return after the task executes, but before
    /// all dependencies have completely settled.
    ///
    /// [`ReadConsistency::Strong`] means that this will also wait for the task and all dependencies
    /// to fully settle before returning.
    ///
    /// As this function is typically called in top-level code that waits for results to be ready
    /// for the user to access, most callers should use [`ReadConsistency::Strong`].
    pub async fn wait_task_completion(
        &self,
        id: TaskId,
        consistency: ReadConsistency,
    ) -> Result<()> {
        // INVALIDATION: This doesn't return a value, only waits for it to be ready.
        read_task_output_untracked(self, id, consistency).await?;
        Ok(())
    }

    #[deprecated(note = "Use get_or_wait_aggregated_update_info instead")]
    pub async fn get_or_wait_update_info(&self, aggregation: Duration) -> (Duration, usize) {
        let UpdateInfo {
            duration, tasks, ..
        } = self.get_or_wait_aggregated_update_info(aggregation).await;
        (duration, tasks)
    }

    #[deprecated(note = "Use aggregated_update_info instead")]
    pub async fn update_info(
        &self,
        aggregation: Duration,
        timeout: Duration,
    ) -> Option<(Duration, usize)> {
        self.aggregated_update_info(aggregation, timeout).await.map(
            |UpdateInfo {
                 duration, tasks, ..
             }| (duration, tasks),
        )
    }

    /// Returns [UpdateInfo] with all updates aggregated over a given duration
    /// (`aggregation`). Will wait until an update happens.
    pub async fn get_or_wait_aggregated_update_info(&self, aggregation: Duration) -> UpdateInfo {
        self.aggregated_update_info(aggregation, Duration::MAX)
            .await
            .unwrap()
    }

    /// Returns [UpdateInfo] with all updates aggregated over a given duration
    /// (`aggregation`). Will only return None when the timeout is reached while
    /// waiting for the first update.
    pub async fn aggregated_update_info(
        &self,
        aggregation: Duration,
        timeout: Duration,
    ) -> Option<UpdateInfo> {
        let listener = self
            .event
            .listen_with_note(|| "wait for update info".to_string());
        let wait_for_finish = {
            let (update, reason_set) = &mut *self.aggregated_update.lock().unwrap();
            if aggregation.is_zero() {
                if let Some((duration, tasks)) = update.take() {
                    return Some(UpdateInfo {
                        duration,
                        tasks,
                        reasons: take(reason_set),
                        placeholder_for_future_fields: (),
                    });
                } else {
                    true
                }
            } else {
                update.is_none()
            }
        };
        if wait_for_finish {
            if timeout == Duration::MAX {
                // wait for finish
                listener.await;
            } else {
                // wait for start, then wait for finish or timeout
                let start_listener = self
                    .event_start
                    .listen_with_note(|| "wait for update info".to_string());
                if self.currently_scheduled_tasks.load(Ordering::Acquire) == 0 {
                    start_listener.await;
                } else {
                    drop(start_listener);
                }
                if timeout.is_zero() || tokio::time::timeout(timeout, listener).await.is_err() {
                    // Timeout
                    return None;
                }
            }
        }
        if !aggregation.is_zero() {
            loop {
                select! {
                    () = tokio::time::sleep(aggregation) => {
                        break;
                    }
                    () = self.event.listen_with_note(|| "wait for update info".to_string()) => {
                        // Resets the sleep
                    }
                }
            }
        }
        let (update, reason_set) = &mut *self.aggregated_update.lock().unwrap();
        if let Some((duration, tasks)) = update.take() {
            Some(UpdateInfo {
                duration,
                tasks,
                reasons: take(reason_set),
                placeholder_for_future_fields: (),
            })
        } else {
            panic!("aggregated_update_info must not called concurrently")
        }
    }

    pub async fn wait_background_done(&self) {
        let listener = self.event_background.listen();
        if self
            .currently_scheduled_background_jobs
            .load(Ordering::Acquire)
            != 0
        {
            listener.await;
        }
    }

    pub async fn stop_and_wait(&self) {
        self.backend.stopping(self);
        self.stopped.store(true, Ordering::Release);
        {
            let listener = self.event.listen_with_note(|| "wait for stop".to_string());
            if self.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
                listener.await;
            }
        }
        {
            let listener = self.event_background.listen();
            if self
                .currently_scheduled_background_jobs
                .load(Ordering::Acquire)
                != 0
            {
                listener.await;
            }
        }
        self.backend.stop(self);
    }

    #[track_caller]
    pub(crate) fn schedule_background_job<
        T: FnOnce(Arc<TurboTasks<B>>) -> F + Send + 'static,
        F: Future<Output = ()> + Send + 'static,
    >(
        &self,
        func: T,
    ) {
        let this = self.pin();
        self.currently_scheduled_background_jobs
            .fetch_add(1, Ordering::AcqRel);
        tokio::spawn(
            TURBO_TASKS
                .scope(this.clone(), async move {
                    while this.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
                        let listener = this.event.listen_with_note(|| {
                            "background job waiting for execution".to_string()
                        });
                        if this.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
                            listener.await;
                        }
                    }
                    let this2 = this.clone();
                    if !this.stopped.load(Ordering::Acquire) {
                        func(this).await;
                    }
                    if this2
                        .currently_scheduled_background_jobs
                        .fetch_sub(1, Ordering::AcqRel)
                        == 1
                    {
                        this2.event_background.notify(usize::MAX);
                    }
                })
                .in_current_span(),
        );
    }

    #[track_caller]
    pub(crate) fn schedule_foreground_job<
        T: FnOnce(Arc<TurboTasks<B>>) -> F + Send + 'static,
        F: Future<Output = ()> + Send + 'static,
    >(
        &self,
        func: T,
    ) {
        let this = self.pin();
        this.begin_foreground_job();
        tokio::spawn(
            TURBO_TASKS
                .scope(this.clone(), async move {
                    if !this.stopped.load(Ordering::Acquire) {
                        func(this.clone()).await;
                    }
                    this.finish_foreground_job();
                })
                .in_current_span(),
        );
    }

    fn finish_current_task_state(&self) -> bool {
        let (stateful, tasks) = CURRENT_TASK_STATE.with(|cell| {
            let CurrentTaskState {
                tasks_to_notify,
                stateful,
                ..
            } = &mut *cell.write().unwrap();
            (*stateful, take(tasks_to_notify))
        });

        if !tasks.is_empty() {
            self.backend.invalidate_tasks(&tasks, self);
        }
        stateful
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }
}

impl<B: Backend + 'static> TurboTasksCallApi for TurboTasks<B> {
    fn dynamic_call(
        &self,
        func: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.dynamic_call(func, this, arg, persistence)
    }
    fn native_call(
        &self,
        func: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.native_call(func, this, arg, persistence)
    }
    fn trait_call(
        &self,
        trait_type: TraitTypeId,
        trait_fn_name: Cow<'static, str>,
        this: RawVc,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.trait_call(trait_type, trait_fn_name, this, arg, persistence)
    }

    #[track_caller]
    fn run_once(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId {
        self.spawn_once_task(async move {
            future.await?;
            Ok(Completion::new())
        })
    }

    #[track_caller]
    fn run_once_with_reason(
        &self,
        reason: StaticOrArc<dyn InvalidationReason>,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId {
        {
            let (_, reason_set) = &mut *self.aggregated_update.lock().unwrap();
            reason_set.insert(reason);
        }
        self.spawn_once_task(async move {
            future.await?;
            Ok(Completion::new())
        })
    }

    #[track_caller]
    fn run_once_process(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId {
        let this = self.pin();
        self.spawn_once_task(async move {
            this.finish_primary_job();
            future.await?;
            this.begin_primary_job();
            Ok(Completion::new())
        })
    }
}

impl<B: Backend + 'static> TurboTasksApi for TurboTasks<B> {
    fn pin(&self) -> Arc<dyn TurboTasksApi> {
        self.pin()
    }

    #[instrument(level = Level::INFO, skip_all, name = "invalidate")]
    fn invalidate(&self, task: TaskId) {
        self.backend.invalidate_task(task, self);
    }

    #[instrument(level = Level::INFO, skip_all, name = "invalidate", fields(name = display(&reason)))]
    fn invalidate_with_reason(&self, task: TaskId, reason: StaticOrArc<dyn InvalidationReason>) {
        {
            let (_, reason_set) = &mut *self.aggregated_update.lock().unwrap();
            reason_set.insert(reason);
        }
        self.backend.invalidate_task(task, self);
    }

    fn invalidate_serialization(&self, task: TaskId) {
        self.backend.invalidate_serialization(task, self);
    }

    fn notify_scheduled_tasks(&self) {
        let _ = CURRENT_TASK_STATE.try_with(|cell| {
            let tasks = {
                let CurrentTaskState {
                    tasks_to_notify, ..
                } = &mut *cell.write().unwrap();
                take(tasks_to_notify)
            };
            if tasks.is_empty() {
                return;
            }
            self.backend.invalidate_tasks(&tasks, self);
        });
    }

    fn try_read_task_output(
        &self,
        task: TaskId,
        consistency: ReadConsistency,
    ) -> Result<Result<RawVc, EventListener>> {
        self.backend
            .try_read_task_output(task, current_task("reading Vcs"), consistency, self)
    }

    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        consistency: ReadConsistency,
    ) -> Result<Result<RawVc, EventListener>> {
        self.backend
            .try_read_task_output_untracked(task, consistency, self)
    }

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.backend
            .try_read_task_cell(task, index, current_task("reading Vcs"), options, self)
    }

    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.backend
            .try_read_task_cell_untracked(task, index, options, self)
    }

    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<TypedCellContent> {
        self.backend
            .try_read_own_task_cell_untracked(current_task, index, options, self)
    }

    fn try_read_local_output(
        &self,
        parent_task_id: TaskId,
        local_task_id: LocalTaskId,
    ) -> Result<Result<RawVc, EventListener>> {
        CURRENT_TASK_STATE.with(|gts| {
            let gts_read = gts.read().unwrap();

            // Local Vcs are local to their parent task, and do not exist outside of it. This is
            // weakly enforced at compile time using the `NonLocalValue` marker trait. This
            // assertion exists to handle any potential escapes that the compile-time checks cannot
            // capture.
            gts_read.assert_task_id(parent_task_id);

            match gts_read.get_local_task(local_task_id) {
                LocalTask::Scheduled { done_event } => Ok(Err(done_event.listen())),
                LocalTask::Done { output } => Ok(Ok(output.as_read_result()?)),
            }
        })
    }

    fn read_task_collectibles(&self, task: TaskId, trait_id: TraitTypeId) -> TaskCollectiblesMap {
        self.backend.read_task_collectibles(
            task,
            trait_id,
            current_task("reading collectibles"),
            self,
        )
    }

    fn emit_collectible(&self, trait_type: TraitTypeId, collectible: RawVc) {
        self.backend.emit_collectible(
            trait_type,
            collectible,
            current_task("emitting collectible"),
            self,
        );
    }

    fn unemit_collectible(&self, trait_type: TraitTypeId, collectible: RawVc, count: u32) {
        self.backend.unemit_collectible(
            trait_type,
            collectible,
            count,
            current_task("emitting collectible"),
            self,
        );
    }

    fn unemit_collectibles(&self, trait_type: TraitTypeId, collectibles: &TaskCollectiblesMap) {
        for (&collectible, &count) in collectibles {
            if count > 0 {
                self.backend.unemit_collectible(
                    trait_type,
                    collectible,
                    count as u32,
                    current_task("emitting collectible"),
                    self,
                );
            }
        }
    }

    fn read_own_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<TypedCellContent> {
        // INVALIDATION: don't need to track a dependency to itself
        self.try_read_own_task_cell_untracked(task, index, options)
    }

    fn update_own_task_cell(&self, task: TaskId, index: CellId, content: CellContent) {
        self.backend.update_task_cell(task, index, content, self);
    }

    fn connect_task(&self, task: TaskId) {
        self.backend
            .connect_task(task, current_task("connecting task"), self);
    }

    fn mark_own_task_as_finished(&self, task: TaskId) {
        self.backend.mark_own_task_as_finished(task, self);
    }

    fn set_own_task_aggregation_number(&self, task: TaskId, aggregation_number: u32) {
        self.backend
            .set_own_task_aggregation_number(task, aggregation_number, self);
    }

    fn mark_own_task_as_session_dependent(&self, task: TaskId) {
        self.backend.mark_own_task_as_session_dependent(task, self);
    }

    /// Creates a future that inherits the current task id and task state. The current global task
    /// will wait for this future to be dropped before exiting.
    fn detached_for_testing(
        &self,
        fut: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>> {
        // this is similar to what happens for a local task, except that we keep the local task's
        // state as well.
        let global_task_state = CURRENT_TASK_STATE.with(|ts| ts.clone());
        let tracked_fut = {
            let ts = global_task_state.read().unwrap();
            ts.local_task_tracker.track_future(fut)
        };
        Box::pin(TURBO_TASKS.scope(
            turbo_tasks(),
            CURRENT_TASK_STATE.scope(global_task_state, tracked_fut),
        ))
    }

    fn task_statistics(&self) -> &TaskStatisticsApi {
        self.backend.task_statistics()
    }

    fn stop_and_wait(&self) -> Pin<Box<dyn Future<Output = ()> + Send + 'static>> {
        let this = self.pin();
        Box::pin(async move {
            this.stop_and_wait().await;
        })
    }
}

impl<B: Backend + 'static> TurboTasksBackendApi<B> for TurboTasks<B> {
    fn pin(&self) -> Arc<dyn TurboTasksBackendApi<B>> {
        self.pin()
    }
    fn backend(&self) -> &B {
        &self.backend
    }

    #[track_caller]
    fn schedule_backend_background_job(&self, id: BackendJobId) {
        self.schedule_background_job(move |this| async move {
            this.backend.run_backend_job(id, &*this).await;
        })
    }

    #[track_caller]
    fn schedule_backend_foreground_job(&self, id: BackendJobId) {
        self.schedule_foreground_job(move |this| async move {
            this.backend.run_backend_job(id, &*this).await;
        })
    }

    fn try_foreground_done(&self) -> Result<(), EventListener> {
        if self
            .currently_scheduled_foreground_jobs
            .load(Ordering::Acquire)
            == 0
        {
            return Ok(());
        }
        let listener = self.event_foreground.listen();
        if self
            .currently_scheduled_foreground_jobs
            .load(Ordering::Acquire)
            == 0
        {
            return Ok(());
        }
        Err(listener)
    }

    fn wait_foreground_done_excluding_own<'a>(
        &'a self,
    ) -> Option<Pin<Box<dyn Future<Output = ()> + Send + 'a>>> {
        if self
            .currently_scheduled_foreground_jobs
            .load(Ordering::Acquire)
            == 0
        {
            return None;
        }
        Some(Box::pin(async {
            self.finish_foreground_job();
            self.wait_foreground_done().await;
            self.begin_foreground_job();
        }))
    }

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `dependent_cell_updated()` on all tasks.
    fn schedule_notify_tasks(&self, tasks: &[TaskId]) {
        let result = CURRENT_TASK_STATE.try_with(|cell| {
            let CurrentTaskState {
                tasks_to_notify, ..
            } = &mut *cell.write().unwrap();
            tasks_to_notify.extend(tasks.iter());
        });
        if result.is_err() {
            let _guard = trace_span!("schedule_notify_tasks", count = tasks.len()).entered();
            self.backend.invalidate_tasks(tasks, self);
        }
    }

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `dependent_cell_updated()` on all tasks.
    fn schedule_notify_tasks_set(&self, tasks: &TaskIdSet) {
        let result = CURRENT_TASK_STATE.try_with(|cell| {
            let CurrentTaskState {
                tasks_to_notify, ..
            } = &mut *cell.write().unwrap();
            tasks_to_notify.extend(tasks.iter());
        });
        if result.is_err() {
            let _guard = trace_span!("schedule_notify_tasks_set", count = tasks.len()).entered();
            self.backend.invalidate_tasks_set(tasks, self);
        };
    }

    #[track_caller]
    fn schedule(&self, task: TaskId) {
        self.schedule(task)
    }

    fn program_duration_until(&self, instant: Instant) -> Duration {
        instant - self.program_start
    }

    fn get_fresh_persistent_task_id(&self) -> Unused<TaskId> {
        // SAFETY: This is a fresh id from the factory
        unsafe { Unused::new_unchecked(self.task_id_factory.get()) }
    }

    fn get_fresh_transient_task_id(&self) -> Unused<TaskId> {
        // SAFETY: This is a fresh id from the factory
        unsafe { Unused::new_unchecked(self.transient_task_id_factory.get()) }
    }

    unsafe fn reuse_persistent_task_id(&self, id: Unused<TaskId>) {
        unsafe { self.task_id_factory.reuse(id.into()) }
    }

    unsafe fn reuse_transient_task_id(&self, id: Unused<TaskId>) {
        unsafe { self.transient_task_id_factory.reuse(id.into()) }
    }

    fn read_task_state_dyn(&self, func: &mut dyn FnMut(&B::TaskState)) {
        CURRENT_TASK_STATE
            .with(move |ts| func(ts.read().unwrap().backend_state.downcast_ref().unwrap()))
    }

    fn write_task_state_dyn(&self, func: &mut dyn FnMut(&mut B::TaskState)) {
        CURRENT_TASK_STATE
            .with(move |ts| func(ts.write().unwrap().backend_state.downcast_mut().unwrap()))
    }

    fn is_idle(&self) -> bool {
        self.currently_scheduled_tasks.load(Ordering::Acquire) == 0
    }
}

pub(crate) fn current_task(from: &str) -> TaskId {
    match CURRENT_TASK_STATE.try_with(|ts| ts.read().unwrap().task_id) {
        Ok(id) => id,
        Err(_) => panic!(
            "{} can only be used in the context of turbo_tasks task execution",
            from
        ),
    }
}

pub async fn run_once<T: Send + 'static>(
    tt: Arc<dyn TurboTasksApi>,
    future: impl Future<Output = Result<T>> + Send + 'static,
) -> Result<T> {
    let (tx, rx) = tokio::sync::oneshot::channel();

    let task_id = tt.run_once(Box::pin(async move {
        let result = future.await?;
        tx.send(result)
            .map_err(|_| anyhow!("unable to send result"))?;
        Ok(())
    }));

    // INVALIDATION: A Once task will never invalidate, therefore we don't need to
    // track a dependency
    let raw_result = read_task_output_untracked(&*tt, task_id, ReadConsistency::Eventual).await?;
    let raw_future = raw_result.into_read().untracked();
    turbo_tasks_future_scope(tt, ReadVcFuture::<Completion>::from(raw_future)).await?;

    Ok(rx.await?)
}

pub async fn run_once_with_reason<T: Send + 'static>(
    tt: Arc<dyn TurboTasksApi>,
    reason: impl InvalidationReason,
    future: impl Future<Output = Result<T>> + Send + 'static,
) -> Result<T> {
    let (tx, rx) = tokio::sync::oneshot::channel();

    let task_id = tt.run_once_with_reason(
        (Arc::new(reason) as Arc<dyn InvalidationReason>).into(),
        Box::pin(async move {
            let result = future.await?;
            tx.send(result)
                .map_err(|_| anyhow!("unable to send result"))?;
            Ok(())
        }),
    );

    // INVALIDATION: A Once task will never invalidate, therefore we don't need to
    // track a dependency
    let raw_result = read_task_output_untracked(&*tt, task_id, ReadConsistency::Eventual).await?;
    let raw_future = raw_result.into_read().untracked();
    turbo_tasks_future_scope(tt, ReadVcFuture::<Completion>::from(raw_future)).await?;

    Ok(rx.await?)
}

/// Calls [`TurboTasks::dynamic_call`] for the current turbo tasks instance.
pub fn dynamic_call(
    func: FunctionId,
    this: Option<RawVc>,
    arg: Box<dyn MagicAny>,
    persistence: TaskPersistence,
) -> RawVc {
    with_turbo_tasks(|tt| tt.dynamic_call(func, this, arg, persistence))
}

/// Calls [`TurboTasks::trait_call`] for the current turbo tasks instance.
pub fn trait_call(
    trait_type: TraitTypeId,
    trait_fn_name: Cow<'static, str>,
    this: RawVc,
    arg: Box<dyn MagicAny>,
    persistence: TaskPersistence,
) -> RawVc {
    with_turbo_tasks(|tt| tt.trait_call(trait_type, trait_fn_name, this, arg, persistence))
}

pub fn turbo_tasks() -> Arc<dyn TurboTasksApi> {
    TURBO_TASKS.with(|arc| arc.clone())
}

pub fn with_turbo_tasks<T>(func: impl FnOnce(&Arc<dyn TurboTasksApi>) -> T) -> T {
    TURBO_TASKS.with(|arc| func(arc))
}

pub fn turbo_tasks_scope<T>(tt: Arc<dyn TurboTasksApi>, f: impl FnOnce() -> T) -> T {
    TURBO_TASKS.sync_scope(tt, f)
}

pub fn turbo_tasks_future_scope<T>(
    tt: Arc<dyn TurboTasksApi>,
    f: impl Future<Output = T>,
) -> impl Future<Output = T> {
    TURBO_TASKS.scope(tt, f)
}

pub fn with_turbo_tasks_for_testing<T>(
    tt: Arc<dyn TurboTasksApi>,
    current_task: TaskId,
    f: impl Future<Output = T>,
) -> impl Future<Output = T> {
    TURBO_TASKS.scope(
        tt,
        CURRENT_TASK_STATE.scope(
            Arc::new(RwLock::new(CurrentTaskState::new(
                current_task,
                Box::new(()),
            ))),
            f,
        ),
    )
}

/// Spawns the given future within the context of the current task.
///
/// Beware: this method is not safe to use in production code. It is only
/// intended for use in tests and for debugging purposes.
pub fn spawn_detached_for_testing(f: impl Future<Output = Result<()>> + Send + 'static) {
    tokio::spawn(turbo_tasks().detached_for_testing(Box::pin(f.in_current_span())));
}

pub fn current_task_for_testing() -> TaskId {
    CURRENT_TASK_STATE.with(|ts| ts.read().unwrap().task_id)
}

/// Marks the current task as dirty when restored from persistent cache.
pub fn mark_session_dependent() {
    with_turbo_tasks(|tt| {
        tt.mark_own_task_as_session_dependent(current_task("turbo_tasks::mark_session_dependent()"))
    });
}

/// Marks the current task as finished. This excludes it from waiting for
/// strongly consistency.
pub fn mark_root() {
    with_turbo_tasks(|tt| {
        tt.set_own_task_aggregation_number(current_task("turbo_tasks::mark_root()"), u32::MAX)
    });
}

/// Marks the current task as finished. This excludes it from waiting for
/// strongly consistency.
pub fn mark_finished() {
    with_turbo_tasks(|tt| {
        tt.mark_own_task_as_finished(current_task("turbo_tasks::mark_finished()"))
    });
}

/// Marks the current task as stateful. This prevents the tasks from being
/// dropped without persisting the state.
///
/// Returns a [`SerializationInvalidator`] that can be used to invalidate the
/// serialization of the current task cells
pub fn mark_stateful() -> SerializationInvalidator {
    CURRENT_TASK_STATE.with(|cell| {
        let CurrentTaskState {
            stateful, task_id, ..
        } = &mut *cell.write().unwrap();
        *stateful = true;
        SerializationInvalidator::new(*task_id)
    })
}

pub fn prevent_gc() {
    // There is a hack in UpdateCellOperation that need to be updated when this is changed.
    mark_stateful();
}

/// Notifies scheduled tasks for execution.
pub fn notify_scheduled_tasks() {
    with_turbo_tasks(|tt| tt.notify_scheduled_tasks())
}

pub fn emit<T: VcValueTrait + ?Sized>(collectible: ResolvedVc<T>) {
    with_turbo_tasks(|tt| {
        let raw_vc = collectible.node.node;
        tt.emit_collectible(T::get_trait_type_id(), raw_vc)
    })
}

pub async fn spawn_blocking<T: Send + 'static>(func: impl FnOnce() -> T + Send + 'static) -> T {
    let turbo_tasks = turbo_tasks();
    let span = Span::current();
    let (result, duration, alloc_info) = tokio::task::spawn_blocking(|| {
        let _guard = span.entered();
        let start = Instant::now();
        let start_allocations = TurboMalloc::allocation_counters();
        let r = turbo_tasks_scope(turbo_tasks, func);
        (r, start.elapsed(), start_allocations.until_now())
    })
    .await
    .unwrap();
    capture_future::add_duration(duration);
    capture_future::add_allocation_info(alloc_info);
    result
}

pub fn spawn_thread(func: impl FnOnce() + Send + 'static) {
    let handle = Handle::current();
    let span = info_span!("thread").or_current();
    thread::spawn(move || {
        let span = span.entered();
        let guard = handle.enter();
        func();
        drop(guard);
        drop(span);
    });
}

pub(crate) async fn read_task_output(
    this: &dyn TurboTasksApi,
    id: TaskId,
    consistency: ReadConsistency,
) -> Result<RawVc> {
    loop {
        match this.try_read_task_output(id, consistency)? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

/// INVALIDATION: Be careful with this, it will not track dependencies, so
/// using it could break cache invalidation.
pub(crate) async fn read_task_output_untracked(
    this: &dyn TurboTasksApi,
    id: TaskId,
    consistency: ReadConsistency,
) -> Result<RawVc> {
    loop {
        match this.try_read_task_output_untracked(id, consistency)? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

pub(crate) async fn read_task_cell(
    this: &dyn TurboTasksApi,
    id: TaskId,
    index: CellId,
    options: ReadCellOptions,
) -> Result<TypedCellContent> {
    loop {
        match this.try_read_task_cell(id, index, options)? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

/// A reference to a task's cell with methods that allow updating the contents
/// of the cell.
///
/// Mutations should not outside of the task that that owns this cell. Doing so
/// is a logic error, and may lead to incorrect caching behavior.
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct CurrentCellRef {
    current_task: TaskId,
    index: CellId,
}

type VcReadRepr<T> = <<T as VcValueType>::Read as VcRead<T>>::Repr;

impl CurrentCellRef {
    /// Updates the cell if the given `functor` returns a value.
    pub fn conditional_update<T>(&self, functor: impl FnOnce(Option<&T>) -> Option<T>)
    where
        T: VcValueType,
    {
        self.conditional_update_with_shared_reference(|old_shared_reference| {
            let old_ref = old_shared_reference
                .and_then(|sr| sr.0.downcast_ref::<VcReadRepr<T>>())
                .map(|content| <T::Read as VcRead<T>>::repr_to_value_ref(content));
            let new_value = functor(old_ref)?;
            Some(SharedReference::new(triomphe::Arc::new(
                <T::Read as VcRead<T>>::value_to_repr(new_value),
            )))
        })
    }

    /// Updates the cell if the given `functor` returns a `SharedReference`.
    pub fn conditional_update_with_shared_reference(
        &self,
        functor: impl FnOnce(Option<&SharedReference>) -> Option<SharedReference>,
    ) {
        let tt = turbo_tasks();
        let cell_content = tt
            .read_own_task_cell(self.current_task, self.index, ReadCellOptions::default())
            .ok();
        let update = functor(cell_content.as_ref().and_then(|cc| cc.1 .0.as_ref()));
        if let Some(update) = update {
            tt.update_own_task_cell(self.current_task, self.index, CellContent(Some(update)))
        }
    }

    /// Replace the current cell's content with `new_value` if the current
    /// content is not equal by value with the existing content.
    ///
    /// The comparison happens using the value itself, not the
    /// [`VcRead::Target`] of that value.
    ///
    /// Take this example of a custom equality implementation on a transparent
    /// wrapper type:
    ///
    /// ```
    /// #[turbo_tasks::value(transparent, eq = "manual")]
    /// struct Wrapper(Vec<u32>);
    ///
    /// impl PartialEq for Wrapper {
    ///     fn eq(&self, other: Wrapper) {
    ///         // Example: order doesn't matter for equality
    ///         let (mut this, mut other) = (self.clone(), other.clone());
    ///         this.sort_unstable();
    ///         other.sort_unstable();
    ///         this == other
    ///     }
    /// }
    ///
    /// impl Eq for Wrapper {}
    /// ```
    ///
    /// Comparisons of `Vc<Wrapper>` used when updating the cell will use
    /// `Wrapper`'s custom equality implementation, rather than the one
    /// provided by the target (`Vec<u32>`) type.
    ///
    /// However, in most cases, the default derived implementation of
    /// `PartialEq` is used which just forwards to the inner value's
    /// `PartialEq`.
    ///
    /// If you already have a `SharedReference`, consider calling
    /// [`compare_and_update_with_shared_reference`] which can re-use the
    /// `SharedReference` object.
    pub fn compare_and_update<T>(&self, new_value: T)
    where
        T: PartialEq + VcValueType,
    {
        self.conditional_update(|old_value| {
            if let Some(old_value) = old_value {
                if old_value == &new_value {
                    return None;
                }
            }
            Some(new_value)
        });
    }

    /// Replace the current cell's content with `new_shared_reference` if the
    /// current content is not equal by value with the existing content.
    ///
    /// If you already have a `SharedReference`, this is a faster version of
    /// [`CurrentCellRef::compare_and_update`].
    ///
    /// The [`SharedReference`] is expected to use the `<T::Read as
    /// VcRead<T>>::Repr` type for its representation of the value.
    pub fn compare_and_update_with_shared_reference<T>(&self, new_shared_reference: SharedReference)
    where
        T: VcValueType + PartialEq,
    {
        fn extract_sr_value<T: VcValueType>(sr: &SharedReference) -> &T {
            <T::Read as VcRead<T>>::repr_to_value_ref(
                sr.0.downcast_ref::<VcReadRepr<T>>()
                    .expect("cannot update SharedReference of different type"),
            )
        }
        self.conditional_update_with_shared_reference(|old_sr| {
            if let Some(old_sr) = old_sr {
                let old_value: &T = extract_sr_value(old_sr);
                let new_value = extract_sr_value(&new_shared_reference);
                if old_value == new_value {
                    return None;
                }
            }
            Some(new_shared_reference)
        });
    }

    /// Unconditionally updates the content of the cell.
    pub fn update<T>(&self, new_value: T)
    where
        T: VcValueType,
    {
        let tt = turbo_tasks();
        tt.update_own_task_cell(
            self.current_task,
            self.index,
            CellContent(Some(SharedReference::new(triomphe::Arc::new(
                <T::Read as VcRead<T>>::value_to_repr(new_value),
            )))),
        )
    }

    /// A faster version of [`Self::update`] if you already have a
    /// [`SharedReference`].
    ///
    /// If the passed-in [`SharedReference`] is the same as the existing cell's
    /// by identity, no update is performed.
    ///
    /// The [`SharedReference`] is expected to use the `<T::Read as
    /// VcRead<T>>::Repr` type for its representation of the value.
    pub fn update_with_shared_reference(&self, shared_ref: SharedReference) {
        let tt = turbo_tasks();
        let content = tt
            .read_own_task_cell(self.current_task, self.index, ReadCellOptions::default())
            .ok();
        let update = if let Some(TypedCellContent(_, CellContent(Some(shared_ref_exp)))) = content {
            // pointer equality (not value equality)
            shared_ref_exp != shared_ref
        } else {
            true
        };
        if update {
            tt.update_own_task_cell(self.current_task, self.index, CellContent(Some(shared_ref)))
        }
    }
}

impl From<CurrentCellRef> for RawVc {
    fn from(cell: CurrentCellRef) -> Self {
        RawVc::TaskCell(cell.current_task, cell.index)
    }
}

pub fn find_cell_by_type(ty: ValueTypeId) -> CurrentCellRef {
    CURRENT_TASK_STATE.with(|ts| {
        let current_task = current_task("celling turbo_tasks values");
        let mut ts = ts.write().unwrap();
        let map = ts.cell_counters.as_mut().unwrap();
        let current_index = map.entry(ty).or_default();
        let index = *current_index;
        *current_index += 1;
        CurrentCellRef {
            current_task,
            index: CellId { type_id: ty, index },
        }
    })
}

pub(crate) async fn read_local_output(
    this: &dyn TurboTasksApi,
    parent_task_id: TaskId,
    local_task_id: LocalTaskId,
) -> Result<RawVc> {
    loop {
        match this.try_read_local_output(parent_task_id, local_task_id)? {
            Ok(raw_vc) => return Ok(raw_vc),
            Err(event_listener) => event_listener.await,
        }
    }
}
