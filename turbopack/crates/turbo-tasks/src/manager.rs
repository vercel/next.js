use std::{
    fmt::Display,
    future::Future,
    hash::BuildHasherDefault,
    mem::take,
    pin::Pin,
    sync::{
        Arc, Mutex, RwLock, Weak,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::{Result, anyhow};
use auto_hash_map::AutoMap;
use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};
use tokio::{select, sync::mpsc::Receiver, task_local};
use tokio_util::task::TaskTracker;
use tracing::{Instrument, instrument};

use crate::{
    Completion, InvalidationReason, InvalidationReasonSet, OutputContent, ReadCellOptions,
    ReadOutputOptions, ResolvedVc, SharedReference, TaskId, TraitMethod, ValueTypeId, Vc, VcRead,
    VcValueTrait, VcValueType,
    backend::{
        Backend, CachedTaskType, CellContent, TaskCollectiblesMap, TaskExecutionSpec,
        TransientTaskType, TurboTasksExecutionError, TypedCellContent,
    },
    capture_future::CaptureFuture,
    event::{Event, EventListener},
    id::{ExecutionId, LocalTaskId, TRANSIENT_TASK_BIT, TraitTypeId},
    id_factory::IdFactoryWithReuse,
    macro_helpers::NativeFunction,
    magic_any::MagicAny,
    message_queue::{CompilationEvent, CompilationEventQueue},
    raw_vc::{CellId, RawVc},
    registry,
    serialization_invalidation::SerializationInvalidator,
    task::local_task::{LocalTask, LocalTaskSpec, LocalTaskType},
    task_statistics::TaskStatisticsApi,
    trace::TraceRawVcs,
    util::{IdFactory, StaticOrArc},
};

/// Common base trait for [`TurboTasksApi`] and [`TurboTasksBackendApi`]. Provides APIs for creating
/// tasks from function calls.
pub trait TurboTasksCallApi: Sync + Send {
    /// Calls a native function with arguments. Resolves arguments when needed
    /// with a wrapper task.
    fn dynamic_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc;
    /// Call a native function with arguments.
    /// All inputs must be resolved.
    fn native_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc;
    /// Calls a trait method with arguments. First input is the `self` object.
    /// Uses a wrapper task to resolve
    fn trait_call(
        &self,
        trait_method: &'static TraitMethod,
        this: RawVc,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc;

    fn run(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<(), TurboTasksExecutionError>> + Send>>;
    fn run_once(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>;
    fn run_once_with_reason(
        &self,
        reason: StaticOrArc<dyn InvalidationReason>,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>;
    fn start_once_process(&self, future: Pin<Box<dyn Future<Output = ()> + Send + 'static>>);
}

/// A type-erased subset of [`TurboTasks`] stored inside a thread local when we're in a turbo task
/// context. Returned by the [`turbo_tasks`] helper function.
///
/// This trait is needed because thread locals cannot contain an unresolved [`Backend`] type
/// parameter.
pub trait TurboTasksApi: TurboTasksCallApi + Sync + Send {
    fn invalidate(&self, task: TaskId);
    fn invalidate_with_reason(&self, task: TaskId, reason: StaticOrArc<dyn InvalidationReason>);

    fn invalidate_serialization(&self, task: TaskId);

    fn try_read_task_output(
        &self,
        task: TaskId,
        options: ReadOutputOptions,
    ) -> Result<Result<RawVc, EventListener>>;

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// Reads a [`RawVc::LocalOutput`]. If the task has completed, returns the [`RawVc`] the local
    /// task points to.
    ///
    /// The returned [`RawVc`] may also be a [`RawVc::LocalOutput`], so this may need to be called
    /// recursively or in a loop.
    ///
    /// This does not accept a consistency argument, as you cannot control consistency of a read of
    /// an operation owned by your own task. Strongly consistent reads are only allowed on
    /// [`OperationVc`]s, which should never be local tasks.
    ///
    /// No dependency tracking will happen as a result of this function call, as it's a no-op for a
    /// task to depend on itself.
    ///
    /// [`OperationVc`]: crate::OperationVc
    fn try_read_local_output(
        &self,
        execution_id: ExecutionId,
        local_task_id: LocalTaskId,
    ) -> Result<Result<RawVc, EventListener>>;

    fn read_task_collectibles(&self, task: TaskId, trait_id: TraitTypeId) -> TaskCollectiblesMap;

    fn emit_collectible(&self, trait_type: TraitTypeId, collectible: RawVc);
    fn unemit_collectible(&self, trait_type: TraitTypeId, collectible: RawVc, count: u32);
    fn unemit_collectibles(&self, trait_type: TraitTypeId, collectibles: &TaskCollectiblesMap);

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell(
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

    fn subscribe_to_compilation_events(
        &self,
        event_types: Option<Vec<String>>,
    ) -> Receiver<Arc<dyn CompilationEvent>>;
    fn send_compilation_event(&self, event: Arc<dyn CompilationEvent>);

    // Returns true if TurboTasks is configured to track dependencies.
    fn is_tracking_dependencies(&self) -> bool;
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

/// A subset of the [`TurboTasks`] API that's exposed to [`Backend`] implementations.
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

    /// Schedule a task for execution.
    fn schedule(&self, task: TaskId);

    /// Schedule a foreground backend job for execution.
    fn schedule_backend_foreground_job(&self, job: B::BackendJob);

    /// Schedule a background backend job for execution.
    ///
    /// Background jobs are not counted towards activeness of the system. The system is considered
    /// idle even with active background jobs.
    fn schedule_backend_background_job(&self, job: B::BackendJob);

    /// Returns the duration from the start of the program to the given instant.
    fn program_duration_until(&self, instant: Instant) -> Duration;

    /// Returns true if the system is idle.
    fn is_idle(&self) -> bool;

    /// Returns a reference to the backend.
    fn backend(&self) -> &B;
}

#[allow(clippy::manual_non_exhaustive)]
pub struct UpdateInfo {
    pub duration: Duration,
    pub tasks: usize,
    pub reasons: InvalidationReasonSet,
    #[allow(dead_code)]
    placeholder_for_future_fields: (),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
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

#[derive(Clone, Copy, Debug, Eq, PartialEq, Default)]
pub enum ReadConsistency {
    /// The default behavior for most APIs. Reads are faster, but may return stale values, which
    /// may later trigger re-computation.
    #[default]
    Eventual,
    /// Ensures all dependencies are fully resolved before returning the cell or output data, at
    /// the cost of slower reads.
    ///
    /// Top-level code that returns data to the user should use strongly consistent reads.
    Strong,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Default)]
pub enum ReadTracking {
    /// Reads are tracked as dependencies of the current task.
    #[default]
    Tracked,
    /// The read is only tracked when there is an error, otherwise it is untracked.
    ///
    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    TrackOnlyError,
    /// The read is not tracked as a dependency of the current task.
    ///
    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    Untracked,
}

impl ReadTracking {
    pub fn should_track(&self, is_err: bool) -> bool {
        match self {
            ReadTracking::Tracked => true,
            ReadTracking::TrackOnlyError => is_err,
            ReadTracking::Untracked => false,
        }
    }
}

impl Display for ReadTracking {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReadTracking::Tracked => write!(f, "tracked"),
            ReadTracking::TrackOnlyError => write!(f, "track only error"),
            ReadTracking::Untracked => write!(f, "untracked"),
        }
    }
}

pub struct TurboTasks<B: Backend + 'static> {
    this: Weak<Self>,
    backend: B,
    task_id_factory: IdFactoryWithReuse<TaskId>,
    transient_task_id_factory: IdFactoryWithReuse<TaskId>,
    execution_id_factory: IdFactory<ExecutionId>,
    stopped: AtomicBool,
    currently_scheduled_foreground_jobs: AtomicUsize,
    currently_scheduled_background_jobs: AtomicUsize,
    scheduled_tasks: AtomicUsize,
    start: Mutex<Option<Instant>>,
    aggregated_update: Mutex<(Option<(Duration, usize)>, InvalidationReasonSet)>,
    /// Event that is triggered when currently_scheduled_foreground_jobs becomes non-zero
    event_foreground_start: Event,
    /// Event that is triggered when all foreground jobs are done
    /// (currently_scheduled_foreground_jobs becomes zero)
    event_foreground_done: Event,
    /// Event that is triggered when all background jobs are done
    event_background_done: Event,
    program_start: Instant,
    compilation_events: CompilationEventQueue,
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
    task_id: Option<TaskId>,
    execution_id: ExecutionId,

    /// True if the current task has state in cells
    stateful: bool,

    /// True if the current task uses an external invalidator
    has_invalidator: bool,

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
}

impl CurrentTaskState {
    fn new(task_id: TaskId, execution_id: ExecutionId) -> Self {
        Self {
            task_id: Some(task_id),
            execution_id,
            stateful: false,
            has_invalidator: false,
            cell_counters: Some(AutoMap::default()),
            local_tasks: Vec::new(),
            local_task_tracker: TaskTracker::new(),
        }
    }

    fn new_temporary(execution_id: ExecutionId) -> Self {
        Self {
            task_id: None,
            execution_id,
            stateful: false,
            has_invalidator: false,
            cell_counters: None,
            local_tasks: Vec::new(),
            local_task_tracker: TaskTracker::new(),
        }
    }

    fn assert_execution_id(&self, expected_execution_id: ExecutionId) {
        if self.execution_id != expected_execution_id {
            panic!(
                "Local tasks can only be scheduled/awaited within the same execution of the \
                 parent task that created them"
            );
        }
    }

    fn create_local_task(&mut self, local_task: LocalTask) -> LocalTaskId {
        self.local_tasks.push(local_task);
        // generate a one-indexed id from len() -- we just pushed so len() is >= 1
        if cfg!(debug_assertions) {
            LocalTaskId::try_from(u32::try_from(self.local_tasks.len()).unwrap()).unwrap()
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
        let task_id_factory = IdFactoryWithReuse::new(
            TaskId::MIN,
            TaskId::try_from(TRANSIENT_TASK_BIT - 1).unwrap(),
        );
        let transient_task_id_factory =
            IdFactoryWithReuse::new(TaskId::try_from(TRANSIENT_TASK_BIT).unwrap(), TaskId::MAX);
        let execution_id_factory = IdFactory::new(ExecutionId::MIN, ExecutionId::MAX);
        let this = Arc::new_cyclic(|this| Self {
            this: this.clone(),
            backend,
            task_id_factory,
            transient_task_id_factory,
            execution_id_factory,
            stopped: AtomicBool::new(false),
            currently_scheduled_foreground_jobs: AtomicUsize::new(0),
            currently_scheduled_background_jobs: AtomicUsize::new(0),
            scheduled_tasks: AtomicUsize::new(0),
            start: Default::default(),
            aggregated_update: Default::default(),
            event_foreground_done: Event::new(|| {
                || "TurboTasks::event_foreground_done".to_string()
            }),
            event_foreground_start: Event::new(|| {
                || "TurboTasks::event_foreground_start".to_string()
            }),
            event_background_done: Event::new(|| {
                || "TurboTasks::event_background_done".to_string()
            }),
            program_start: Instant::now(),
            compilation_events: CompilationEventQueue::default(),
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
    fn spawn_once_task<T, Fut>(&self, future: Fut)
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
    }

    pub async fn run_once<T: TraceRawVcs + Send + 'static>(
        &self,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.spawn_once_task(async move {
            let result = future.await;
            tx.send(result)
                .map_err(|_| anyhow!("unable to send result"))?;
            Ok(Completion::new())
        });

        rx.await?
    }

    #[tracing::instrument(level = "trace", skip_all, name = "turbo_tasks::run")]
    pub async fn run<T: TraceRawVcs + Send + 'static>(
        &self,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T, TurboTasksExecutionError> {
        self.begin_foreground_job();
        // it's okay for execution ids to overflow and wrap, they're just used for an assert
        let execution_id = self.execution_id_factory.wrapping_get();
        let current_task_state =
            Arc::new(RwLock::new(CurrentTaskState::new_temporary(execution_id)));

        let result = TURBO_TASKS
            .scope(
                self.pin(),
                CURRENT_TASK_STATE.scope(current_task_state, async {
                    let (result, _duration, _alloc_info) = CaptureFuture::new(future).await;

                    // wait for all spawned local tasks using `local` to finish
                    let ltt =
                        CURRENT_TASK_STATE.with(|ts| ts.read().unwrap().local_task_tracker.clone());
                    ltt.close();
                    ltt.wait().await;

                    match result {
                        Ok(Ok(raw_vc)) => Ok(raw_vc),
                        Ok(Err(err)) => Err(err.into()),
                        Err(err) => Err(TurboTasksExecutionError::Panic(Arc::new(err))),
                    }
                }),
            )
            .await;
        self.finish_foreground_job();
        result
    }

    pub fn start_once_process(&self, future: impl Future<Output = ()> + Send + 'static) {
        let this = self.pin();
        tokio::spawn(async move {
            this.pin()
                .run_once(async move {
                    this.finish_foreground_job();
                    future.await;
                    this.begin_foreground_job();
                    Ok(())
                })
                .await
                .unwrap()
        });
    }

    pub(crate) fn native_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        match persistence {
            TaskPersistence::Local => {
                let task_type = LocalTaskSpec {
                    task_type: LocalTaskType::Native { native_fn },
                    this,
                    arg,
                };
                self.schedule_local_task(task_type, persistence)
            }
            TaskPersistence::Transient => {
                let task_type = CachedTaskType {
                    native_fn,
                    this,
                    arg,
                };

                RawVc::TaskOutput(self.backend.get_or_create_transient_task(
                    task_type,
                    current_task_if_available("turbo_function calls"),
                    self,
                ))
            }
            TaskPersistence::Persistent => {
                let task_type = CachedTaskType {
                    native_fn,
                    this,
                    arg,
                };

                RawVc::TaskOutput(self.backend.get_or_create_persistent_task(
                    task_type,
                    current_task_if_available("turbo_function calls"),
                    self,
                ))
            }
        }
    }

    pub fn dynamic_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        if this.is_none_or(|this| this.is_resolved()) && native_fn.arg_meta.is_resolved(&*arg) {
            return self.native_call(native_fn, this, arg, persistence);
        }
        let task_type = LocalTaskSpec {
            task_type: LocalTaskType::ResolveNative { native_fn },
            this,
            arg,
        };
        self.schedule_local_task(task_type, persistence)
    }

    pub fn trait_call(
        &self,
        trait_method: &'static TraitMethod,
        this: RawVc,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        // avoid creating a wrapper task if self is already resolved
        // for resolved cells we already know the value type so we can lookup the
        // function
        if let RawVc::TaskCell(_, CellId { type_id, .. }) = this {
            match registry::get_value_type(type_id).get_trait_method(trait_method) {
                Some(native_fn) => {
                    let arg = native_fn.arg_meta.filter_owned(arg);
                    return self.dynamic_call(native_fn, Some(this), arg, persistence);
                }
                None => {
                    // We are destined to fail at this point, but we just retry resolution in the
                    // local task since we cannot report an error from here.
                    // TODO: A panic seems appropriate since the immediate caller is to blame
                }
            }
        }

        // create a wrapper task to resolve all inputs
        let task_type = LocalTaskSpec {
            task_type: LocalTaskType::ResolveTrait { trait_method },
            this: Some(this),
            arg,
        };

        self.schedule_local_task(task_type, persistence)
    }

    #[track_caller]
    pub(crate) fn schedule(&self, task_id: TaskId) {
        self.begin_foreground_job();
        self.scheduled_tasks.fetch_add(1, Ordering::AcqRel);

        let this = self.pin();
        let future = async move {
            let mut schedule_again = true;
            while schedule_again {
                // it's okay for execution ids to overflow and wrap, they're just used for an assert
                let execution_id = this.execution_id_factory.wrapping_get();
                let current_task_state =
                    Arc::new(RwLock::new(CurrentTaskState::new(task_id, execution_id)));
                let single_execution_future = async {
                    if this.stopped.load(Ordering::Acquire) {
                        this.backend.task_execution_canceled(task_id, &*this);
                        return false;
                    }

                    let Some(TaskExecutionSpec { future, span }) =
                        this.backend.try_start_task_execution(task_id, &*this)
                    else {
                        return false;
                    };

                    async {
                        let (result, duration, alloc_info) = CaptureFuture::new(future).await;

                        // wait for all spawned local tasks using `local` to finish
                        let ltt = CURRENT_TASK_STATE
                            .with(|ts| ts.read().unwrap().local_task_tracker.clone());
                        ltt.close();
                        ltt.wait().await;

                        let result = match result {
                            Ok(Ok(raw_vc)) => Ok(raw_vc),
                            Ok(Err(err)) => Err(err.into()),
                            Err(err) => Err(TurboTasksExecutionError::Panic(Arc::new(err))),
                        };

                        let FinishedTaskState {
                            stateful,
                            has_invalidator,
                        } = this.finish_current_task_state();
                        let cell_counters = CURRENT_TASK_STATE
                            .with(|ts| ts.write().unwrap().cell_counters.take().unwrap());
                        this.backend.task_execution_completed(
                            task_id,
                            duration,
                            alloc_info.memory_usage(),
                            result,
                            &cell_counters,
                            stateful,
                            has_invalidator,
                            &*this,
                        )
                    }
                    .instrument(span)
                    .await
                };
                schedule_again = CURRENT_TASK_STATE
                    .scope(current_task_state, single_execution_future)
                    .await;
            }
            this.finish_foreground_job();
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
        ty: LocalTaskSpec,
        // if this is a `LocalTaskType::Resolve*`, we may spawn another task with this persistence,
        // if this is a `LocalTaskType::Native`, persistence is unused.
        //
        // TODO: In the rare case that we're crossing a transient->persistent boundary, we should
        // force `LocalTaskType::Native` to be spawned as real tasks, so that any cells they create
        // have the correct persistence. This is not an issue for resolution stub task, as they
        // don't end up owning any cells.
        persistence: TaskPersistence,
    ) -> RawVc {
        let task_type = ty.task_type;
        let (global_task_state, parent_task_id, execution_id, local_task_id) = CURRENT_TASK_STATE
            .with(|gts| {
                let mut gts_write = gts.write().unwrap();
                let local_task_id = gts_write.create_local_task(LocalTask::Scheduled {
                    done_event: Event::new(move || {
                        move || format!("LocalTask({task_type})::done_event")
                    }),
                });
                (
                    Arc::clone(gts),
                    gts_write.task_id,
                    gts_write.execution_id,
                    local_task_id,
                )
            });

        #[cfg(feature = "tokio_tracing")]
        let description = format!(
            "[local] (parent: {}) {}",
            self.backend.get_task_description(parent_task_id),
            ty.task_type,
        );
        #[cfg(not(feature = "tokio_tracing"))]
        let _ = parent_task_id; // suppress unused variable warning

        let this = self.pin();
        let future = async move {
            let TaskExecutionSpec { future, span } =
                crate::task::local_task::get_local_task_execution_spec(&*this, &ty, persistence);
            async move {
                let (result, _duration, _memory_usage) = CaptureFuture::new(future).await;

                let result = match result {
                    Ok(Ok(raw_vc)) => Ok(raw_vc),
                    Ok(Err(err)) => Err(err.into()),
                    Err(err) => Err(TurboTasksExecutionError::Panic(Arc::new(err))),
                };

                let local_task = LocalTask::Done {
                    output: match result {
                        Ok(raw_vc) => OutputContent::Link(raw_vc),
                        Err(err) => OutputContent::Error(err.with_task_context(task_type)),
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

        RawVc::LocalOutput(execution_id, local_task_id, persistence)
    }

    fn begin_foreground_job(&self) {
        if self
            .currently_scheduled_foreground_jobs
            .fetch_add(1, Ordering::AcqRel)
            == 0
        {
            *self.start.lock().unwrap() = Some(Instant::now());
            self.event_foreground_start.notify(usize::MAX);
            self.backend.idle_end(self);
        }
    }

    fn finish_foreground_job(&self) {
        if self
            .currently_scheduled_foreground_jobs
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
            self.event_foreground_done.notify(usize::MAX);
        }
    }

    fn begin_background_job(&self) {
        self.currently_scheduled_background_jobs
            .fetch_add(1, Ordering::Relaxed);
    }

    fn finish_background_job(&self) {
        if self
            .currently_scheduled_background_jobs
            .fetch_sub(1, Ordering::Relaxed)
            == 1
        {
            self.event_background_done.notify(usize::MAX);
        }
    }

    pub fn get_in_progress_count(&self) -> usize {
        self.currently_scheduled_foreground_jobs
            .load(Ordering::Acquire)
    }

    /// Waits for the given task to finish executing. This works by performing an untracked read,
    /// and discarding the value of the task output.
    ///
    /// [`ReadConsistency::Eventual`] means that this will return after the task executes, but
    /// before all dependencies have completely settled.
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
        read_task_output(
            self,
            id,
            ReadOutputOptions {
                // INVALIDATION: This doesn't return a value, only waits for it to be ready.
                tracking: ReadTracking::Untracked,
                consistency,
            },
        )
        .await?;
        Ok(())
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
            .event_foreground_done
            .listen_with_note(|| || "wait for update info".to_string());
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
                    .event_foreground_start
                    .listen_with_note(|| || "wait for update info".to_string());
                if self
                    .currently_scheduled_foreground_jobs
                    .load(Ordering::Acquire)
                    == 0
                {
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
                    () = self.event_foreground_done.listen_with_note(|| || "wait for update info".to_string()) => {
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
        let listener = self.event_background_done.listen();
        if self
            .currently_scheduled_background_jobs
            .load(Ordering::Acquire)
            != 0
        {
            listener.await;
        }
    }

    pub async fn stop_and_wait(&self) {
        turbo_tasks_future_scope(self.pin(), async move {
            self.backend.stopping(self);
            self.stopped.store(true, Ordering::Release);
            {
                let listener = self
                    .event_foreground_done
                    .listen_with_note(|| || "wait for stop".to_string());
                if self
                    .currently_scheduled_foreground_jobs
                    .load(Ordering::Acquire)
                    != 0
                {
                    listener.await;
                }
            }
            {
                let listener = self.event_background_done.listen();
                if self
                    .currently_scheduled_background_jobs
                    .load(Ordering::Acquire)
                    != 0
                {
                    listener.await;
                }
            }
            self.backend.stop(self);
        })
        .await;
    }

    #[track_caller]
    pub(crate) fn schedule_foreground_job<T>(&self, func: T)
    where
        T: AsyncFnOnce(Arc<TurboTasks<B>>) -> Arc<TurboTasks<B>> + Send + 'static,
        T::CallOnceFuture: Send,
    {
        let mut this = self.pin();
        this.begin_foreground_job();
        tokio::spawn(
            TURBO_TASKS
                .scope(this.clone(), async move {
                    if !this.stopped.load(Ordering::Acquire) {
                        this = func(this.clone()).await;
                    }
                    this.finish_foreground_job();
                })
                .in_current_span(),
        );
    }

    #[track_caller]
    pub(crate) fn schedule_background_job<T>(&self, func: T)
    where
        T: AsyncFnOnce(Arc<TurboTasks<B>>) -> Arc<TurboTasks<B>> + Send + 'static,
        T::CallOnceFuture: Send,
    {
        let mut this = self.pin();
        self.begin_background_job();
        tokio::spawn(
            TURBO_TASKS
                .scope(this.clone(), async move {
                    if !this.stopped.load(Ordering::Acquire) {
                        this = func(this).await;
                    }
                    this.finish_background_job();
                })
                .in_current_span(),
        );
    }

    fn finish_current_task_state(&self) -> FinishedTaskState {
        let (stateful, has_invalidator) = CURRENT_TASK_STATE.with(|cell| {
            let CurrentTaskState {
                stateful,
                has_invalidator,
                ..
            } = &mut *cell.write().unwrap();
            (*stateful, *has_invalidator)
        });

        FinishedTaskState {
            stateful,
            has_invalidator,
        }
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }
}

struct FinishedTaskState {
    /// True if the task has state in cells
    stateful: bool,

    /// True if the task uses an external invalidator
    has_invalidator: bool,
}

impl<B: Backend + 'static> TurboTasksCallApi for TurboTasks<B> {
    fn dynamic_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.dynamic_call(native_fn, this, arg, persistence)
    }
    fn native_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.native_call(native_fn, this, arg, persistence)
    }
    fn trait_call(
        &self,
        trait_method: &'static TraitMethod,
        this: RawVc,
        arg: Box<dyn MagicAny>,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.trait_call(trait_method, this, arg, persistence)
    }

    #[track_caller]
    fn run(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<(), TurboTasksExecutionError>> + Send>> {
        let this = self.pin();
        Box::pin(async move { this.run(future).await })
    }

    #[track_caller]
    fn run_once(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>> {
        let this = self.pin();
        Box::pin(async move { this.run_once(future).await })
    }

    #[track_caller]
    fn run_once_with_reason(
        &self,
        reason: StaticOrArc<dyn InvalidationReason>,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>> {
        {
            let (_, reason_set) = &mut *self.aggregated_update.lock().unwrap();
            reason_set.insert(reason);
        }
        let this = self.pin();
        Box::pin(async move { this.run_once(future).await })
    }

    #[track_caller]
    fn start_once_process(&self, future: Pin<Box<dyn Future<Output = ()> + Send + 'static>>) {
        self.start_once_process(future)
    }
}

impl<B: Backend + 'static> TurboTasksApi for TurboTasks<B> {
    #[instrument(level = "info", skip_all, name = "invalidate")]
    fn invalidate(&self, task: TaskId) {
        self.backend.invalidate_task(task, self);
    }

    #[instrument(level = "info", skip_all, name = "invalidate", fields(name = display(&reason)))]
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

    fn try_read_task_output(
        &self,
        task: TaskId,
        options: ReadOutputOptions,
    ) -> Result<Result<RawVc, EventListener>> {
        self.backend.try_read_task_output(
            task,
            current_task_if_available("reading Vcs"),
            options,
            self,
        )
    }

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.backend.try_read_task_cell(
            task,
            index,
            current_task_if_available("reading Vcs"),
            options,
            self,
        )
    }

    fn try_read_own_task_cell(
        &self,
        current_task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<TypedCellContent> {
        self.backend
            .try_read_own_task_cell(current_task, index, options, self)
    }

    fn try_read_local_output(
        &self,
        execution_id: ExecutionId,
        local_task_id: LocalTaskId,
    ) -> Result<Result<RawVc, EventListener>> {
        CURRENT_TASK_STATE.with(|gts| {
            let gts_read = gts.read().unwrap();

            // Local Vcs are local to their parent task's current execution, and do not exist
            // outside of it. This is weakly enforced at compile time using the `NonLocalValue`
            // marker trait. This assertion exists to handle any potential escapes that the
            // compile-time checks cannot capture.
            gts_read.assert_execution_id(execution_id);

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
            current_task_if_available("reading collectibles"),
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
        self.try_read_own_task_cell(task, index, options)
    }

    fn update_own_task_cell(&self, task: TaskId, index: CellId, content: CellContent) {
        self.backend.update_task_cell(task, index, content, self);
    }

    fn connect_task(&self, task: TaskId) {
        self.backend
            .connect_task(task, current_task_if_available("connecting task"), self);
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

    fn subscribe_to_compilation_events(
        &self,
        event_types: Option<Vec<String>>,
    ) -> Receiver<Arc<dyn CompilationEvent>> {
        self.compilation_events.subscribe(event_types)
    }

    fn send_compilation_event(&self, event: Arc<dyn CompilationEvent>) {
        if let Err(e) = self.compilation_events.send(event) {
            tracing::warn!("Failed to send compilation event: {e}");
        }
    }

    fn is_tracking_dependencies(&self) -> bool {
        self.backend.is_tracking_dependencies()
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
    fn schedule_backend_background_job(&self, job: B::BackendJob) {
        self.schedule_background_job(async move |this| {
            this.backend.run_backend_job(job, &*this).await;
            this
        })
    }

    #[track_caller]
    fn schedule_backend_foreground_job(&self, job: B::BackendJob) {
        self.schedule_foreground_job(async move |this| {
            this.backend.run_backend_job(job, &*this).await;
            this
        })
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

    fn is_idle(&self) -> bool {
        self.currently_scheduled_foreground_jobs
            .load(Ordering::Acquire)
            == 0
    }
}

pub(crate) fn current_task_if_available(from: &str) -> Option<TaskId> {
    match CURRENT_TASK_STATE.try_with(|ts| ts.read().unwrap().task_id) {
        Ok(id) => id,
        Err(_) => panic!(
            "{from} can only be used in the context of a turbo_tasks task execution or \
             turbo_tasks run"
        ),
    }
}

pub(crate) fn current_task(from: &str) -> TaskId {
    match CURRENT_TASK_STATE.try_with(|ts| ts.read().unwrap().task_id) {
        Ok(Some(id)) => id,
        Ok(None) | Err(_) => {
            panic!("{from} can only be used in the context of a turbo_tasks task execution")
        }
    }
}

pub async fn run<T: Send + 'static>(
    tt: Arc<dyn TurboTasksApi>,
    future: impl Future<Output = Result<T>> + Send + 'static,
) -> Result<T> {
    let (tx, rx) = tokio::sync::oneshot::channel();

    tt.run(Box::pin(async move {
        let result = future.await?;
        tx.send(result)
            .map_err(|_| anyhow!("unable to send result"))?;
        Ok(())
    }))
    .await?;

    Ok(rx.await?)
}

pub async fn run_once<T: Send + 'static>(
    tt: Arc<dyn TurboTasksApi>,
    future: impl Future<Output = Result<T>> + Send + 'static,
) -> Result<T> {
    let (tx, rx) = tokio::sync::oneshot::channel();

    tt.run_once(Box::pin(async move {
        let result = future.await?;
        tx.send(result)
            .map_err(|_| anyhow!("unable to send result"))?;
        Ok(())
    }))
    .await?;

    Ok(rx.await?)
}

pub async fn run_once_with_reason<T: Send + 'static>(
    tt: Arc<dyn TurboTasksApi>,
    reason: impl InvalidationReason,
    future: impl Future<Output = Result<T>> + Send + 'static,
) -> Result<T> {
    let (tx, rx) = tokio::sync::oneshot::channel();

    tt.run_once_with_reason(
        (Arc::new(reason) as Arc<dyn InvalidationReason>).into(),
        Box::pin(async move {
            let result = future.await?;
            tx.send(result)
                .map_err(|_| anyhow!("unable to send result"))?;
            Ok(())
        }),
    )
    .await?;

    Ok(rx.await?)
}

/// Calls [`TurboTasks::dynamic_call`] for the current turbo tasks instance.
pub fn dynamic_call(
    func: &'static NativeFunction,
    this: Option<RawVc>,
    arg: Box<dyn MagicAny>,
    persistence: TaskPersistence,
) -> RawVc {
    with_turbo_tasks(|tt| tt.dynamic_call(func, this, arg, persistence))
}

/// Calls [`TurboTasks::trait_call`] for the current turbo tasks instance.
pub fn trait_call(
    trait_method: &'static TraitMethod,
    this: RawVc,
    arg: Box<dyn MagicAny>,
    persistence: TaskPersistence,
) -> RawVc {
    with_turbo_tasks(|tt| tt.trait_call(trait_method, this, arg, persistence))
}

pub fn turbo_tasks() -> Arc<dyn TurboTasksApi> {
    TURBO_TASKS.with(|arc| arc.clone())
}

pub fn try_turbo_tasks() -> Option<Arc<dyn TurboTasksApi>> {
    TURBO_TASKS.try_with(|arc| arc.clone()).ok()
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
    execution_id: ExecutionId,
    f: impl Future<Output = T>,
) -> impl Future<Output = T> {
    TURBO_TASKS.scope(
        tt,
        CURRENT_TASK_STATE.scope(
            Arc::new(RwLock::new(CurrentTaskState::new(
                current_task,
                execution_id,
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

pub fn current_task_for_testing() -> Option<TaskId> {
    CURRENT_TASK_STATE.with(|ts| ts.read().unwrap().task_id)
}

/// Marks the current task as dirty when restored from filesystem cache.
pub fn mark_session_dependent() {
    with_turbo_tasks(|tt| {
        tt.mark_own_task_as_session_dependent(current_task("turbo_tasks::mark_session_dependent()"))
    });
}

/// Marks the current task as a root in the aggregation graph.  This means it starts with the
/// correct aggregation number instead of needing to recompute it after the fact.
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
        let Some(task_id) = *task_id else {
            panic!(
                "mark_stateful() can only be used in the context of a turbo_tasks task execution"
            );
        };
        SerializationInvalidator::new(task_id)
    })
}

pub fn mark_invalidator() {
    CURRENT_TASK_STATE.with(|cell| {
        let CurrentTaskState {
            has_invalidator, ..
        } = &mut *cell.write().unwrap();
        *has_invalidator = true;
    })
}

pub fn prevent_gc() {
    // There is a hack in UpdateCellOperation that need to be updated when this is changed.
    mark_stateful();
}

pub fn emit<T: VcValueTrait + ?Sized>(collectible: ResolvedVc<T>) {
    with_turbo_tasks(|tt| {
        let raw_vc = collectible.node.node;
        tt.emit_collectible(T::get_trait_type_id(), raw_vc)
    })
}

pub(crate) async fn read_task_output(
    this: &dyn TurboTasksApi,
    id: TaskId,
    options: ReadOutputOptions,
) -> Result<RawVc> {
    loop {
        match this.try_read_task_output(id, options)? {
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
            .read_own_task_cell(
                self.current_task,
                self.index,
                ReadCellOptions {
                    // INVALIDATION: Reading our own cell must be untracked
                    tracking: ReadTracking::Untracked,
                    ..Default::default()
                },
            )
            .ok();
        let update = functor(cell_content.as_ref().and_then(|cc| cc.1.0.as_ref()));
        if let Some(update) = update {
            tt.update_own_task_cell(self.current_task, self.index, CellContent(Some(update)))
        }
    }

    /// Replace the current cell's content with `new_value` if the current content is not equal by
    /// value with the existing content.
    ///
    /// The comparison happens using the value itself, not the [`VcRead::Target`] of that value.
    ///
    /// Take this example of a custom equality implementation on a transparent wrapper type:
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
    /// Comparisons of [`Vc<Wrapper>`] used when updating the cell will use `Wrapper`'s custom
    /// equality implementation, rather than the one provided by the target ([`Vec<u32>`]) type.
    ///
    /// However, in most cases, the default derived implementation of [`PartialEq`] is used which
    /// just forwards to the inner value's [`PartialEq`].
    ///
    /// If you already have a `SharedReference`, consider calling
    /// [`Self::compare_and_update_with_shared_reference`] which can re-use the [`SharedReference`]
    /// object.
    pub fn compare_and_update<T>(&self, new_value: T)
    where
        T: PartialEq + VcValueType,
    {
        self.conditional_update(|old_value| {
            if let Some(old_value) = old_value
                && old_value == &new_value
            {
                return None;
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
            .read_own_task_cell(
                self.current_task,
                self.index,
                ReadCellOptions {
                    // INVALIDATION: Reading our own cell must be untracked
                    tracking: ReadTracking::Untracked,
                    ..Default::default()
                },
            )
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
    execution_id: ExecutionId,
    local_task_id: LocalTaskId,
) -> Result<RawVc> {
    loop {
        match this.try_read_local_output(execution_id, local_task_id)? {
            Ok(raw_vc) => return Ok(raw_vc),
            Err(event_listener) => event_listener.await,
        }
    }
}
