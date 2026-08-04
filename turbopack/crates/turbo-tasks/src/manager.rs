use std::{
    cmp::Reverse,
    fmt::{Debug, Display},
    future::Future,
    hash::{BuildHasher, BuildHasherDefault},
    mem::take,
    panic::AssertUnwindSafe,
    pin::Pin,
    process::abort,
    sync::{
        Arc, Condvar, Mutex, RwLock, Weak,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::{Result, anyhow};
use auto_hash_map::AutoMap;
use bincode::{Decode, Encode};
use either::Either;
use futures::FutureExt;
use rustc_hash::{FxBuildHasher, FxHasher};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
#[cfg(feature = "tokio_runtime")]
use tokio::{select, sync::mpsc::Receiver, task_local};
use tracing::{Instrument, Span, instrument};
use turbo_tasks_hash::{DeterministicHash, hash_xxh3_hash128};

use crate::{
    CellId, Completion, InvalidationReason, InvalidationReasonSet, OutputContent, RawVc,
    ReadCellOptions, ReadOutputOptions, ResolvedVc, SharedReference, TaskId, TraitMethod,
    ValueTypeId, Vc, VcRead, VcValueTrait, VcValueType,
    backend::{
        Backend, CellContent, CellHash, TaskCollectiblesMap, TaskExecutionSpec, TransientTaskType,
        TurboTasksExecutionError, TypedCellContent, VerificationMode,
    },
    capture_future::CaptureFuture,
    dyn_task_inputs::DynTaskInputsStorage,
    event::{Event, EventListener},
    id::{ExecutionId, LocalTaskId, TraitTypeId},
    keyed::KeyedEq,
    local_task_tracker::LocalTaskTracker,
    macro_helpers::NativeFunction,
    registry,
    serialization_invalidation::SerializationInvalidator,
    task::local_task::{LocalTask, LocalTaskSpec, LocalTaskType},
    task_statistics::TaskStatisticsApi,
    trace::TraceRawVcs,
    util::{IdFactory, StaticOrArc},
};
#[cfg(feature = "tokio_runtime")]
use crate::{
    message_queue::{CompilationEvent, CompilationEventQueue},
    priority_runner::{Executor, PriorityRunner},
};

/// Common base trait for [`TurboTasksApi`] and [`TurboTasks`]. Provides APIs for creating tasks
/// from function calls.
pub trait TurboTasksCallApi: Sync + Send {
    /// Calls a native function with arguments. Resolves arguments when needed
    /// with a wrapper task.
    ///
    /// `inputs_resolved` is `TaskInput::is_resolved(&args)` computed at the macro callsite on
    /// the concrete tuple type — when [`InputResolution::Resolved`], the fast path skips wrapper
    /// task creation.
    fn dynamic_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &mut dyn DynTaskInputsStorage,
        inputs_resolved: InputResolution,
        persistence: TaskPersistence,
    ) -> RawVc;
    /// Call a native function with arguments.
    /// All inputs must be resolved.
    fn native_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &mut dyn DynTaskInputsStorage,
        persistence: TaskPersistence,
    ) -> RawVc;
    /// Calls a trait method with arguments. First input is the `self` object.
    /// Uses a wrapper task to resolve.
    ///
    /// `inputs_resolved` is the macro-site `InputResolution` of the *exposed* tuple; when filtering
    /// is involved, the post-filter value is computed inside the filter functor and supersedes
    /// this argument.
    fn trait_call(
        &self,
        trait_method: &'static TraitMethod,
        this: RawVc,
        arg: &mut dyn DynTaskInputsStorage,
        inputs_resolved: InputResolution,
        persistence: TaskPersistence,
    ) -> RawVc;

    #[cfg(feature = "tokio_runtime")]
    fn run(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<(), TurboTasksExecutionError>> + Send>>;
    #[cfg(feature = "tokio_runtime")]
    fn run_once(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>;
    #[cfg(feature = "tokio_runtime")]
    fn run_once_with_reason(
        &self,
        reason: StaticOrArc<dyn InvalidationReason>,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>>;
    #[cfg(feature = "tokio_runtime")]
    fn start_once_process(&self, future: Pin<Box<dyn Future<Output = ()> + Send + 'static>>);

    /// Synchronous counterpart of [`run_once`](Self::run_once) for the no-tokio
    /// (`sync`) build. Runs `future` to completion inline as a transient `Once` root
    /// task on the calling thread — no executor, no tokio channel. The future's
    /// `Result<()>` is propagated; any value is carried out by the caller via a slot
    /// (see the free `run`/`run_once` functions).
    #[cfg(feature = "sync")]
    fn run_once_inline(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Result<()>;

    /// Sends a compilation event to subscribers.
    #[cfg(feature = "tokio_runtime")]
    fn send_compilation_event(&self, event: Arc<dyn CompilationEvent>);

    /// Returns a human-readable name for the given task.
    fn get_task_name(&self, task: TaskId) -> String;
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

    /// Compute a single scheduled task inline on the calling thread (the synchronous
    /// engine has no executor). Used by [`sync_parallel_read`]'s worker pool to compute a
    /// missed `parallel!` item by id, in parallel across workers. Returns `true` if the
    /// task body ran, `false` if it was already done or claimed by another worker.
    #[cfg(feature = "sync")]
    fn sync_execute_scheduled_task(&self, task: TaskId) -> bool;

    /// Drive `task` to completion by id: claim and compute it on this worker, or — if
    /// another worker already claimed it (e.g. a shared dependency) — `managed_block` on its
    /// done-event until it finishes. Unlike [`Self::sync_execute_scheduled_task`] (which
    /// returns immediately if it can't claim), this does not return until `task`'s output is
    /// readable, so [`sync_parallel_read`]'s collection pass sees a completed task.
    #[cfg(feature = "sync")]
    fn sync_compute_task(&self, task: TaskId);

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
    ) -> Result<TypedCellContent>;

    fn read_own_task_cell(&self, task: TaskId, index: CellId) -> Result<TypedCellContent>;
    fn update_own_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        updated_key_hashes: Option<SmallVec<[u64; 2]>>,
        content_hash: Option<CellHash>,
        verification_mode: VerificationMode,
    );
    fn mark_own_task_as_finished(&self, task: TaskId);

    fn connect_task(&self, task: TaskId);

    /// Wraps the given future in the current task.
    ///
    /// Beware: this method is not safe to use in production code. It is only intended for use in
    /// tests and for debugging purposes.
    #[cfg(feature = "tokio_runtime")]
    fn spawn_detached_for_testing(&self, f: Pin<Box<dyn Future<Output = ()> + Send + 'static>>);

    fn task_statistics(&self) -> &TaskStatisticsApi;

    #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
    fn stop_and_wait(&self) -> Pin<Box<dyn Future<Output = ()> + Send>>;
    /// No-tokio counterpart. Marks the backend as stopping and flips the `stopped`
    /// flag, returning an already-`Ready` future so async test-harness call sites
    /// (`tt.stop_and_wait().await`) work unchanged under `sync_poll`. There are no
    /// background jobs to drain in the sync engine (persistence runs inline /
    /// Phase-2 std-thread), so this never actually suspends.
    #[cfg(feature = "sync")]
    fn stop_and_wait(&self) -> Pin<Box<dyn Future<Output = ()> + Send>>;

    #[cfg(feature = "tokio_runtime")]
    fn subscribe_to_compilation_events(
        &self,
        event_types: Option<Vec<String>>,
    ) -> Receiver<Arc<dyn CompilationEvent>>;

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

#[allow(clippy::manual_non_exhaustive)]
pub struct UpdateInfo {
    pub duration: Duration,
    pub tasks: usize,
    pub reasons: InvalidationReasonSet,
    #[allow(dead_code)]
    placeholder_for_future_fields: (),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, Encode, Decode)]
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
}

impl Display for TaskPersistence {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskPersistence::Persistent => write!(f, "persistent"),
            TaskPersistence::Transient => write!(f, "transient"),
        }
    }
}

/// Whether a task call's inputs are already resolved, decided on the concrete input tuple at the
/// call site. Travels alongside [`TaskPersistence`] through [`dynamic_call`] / [`trait_call`].
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum InputResolution {
    /// All inputs (and `this`, where applicable) are resolved — eligible for the synchronous fast
    /// path with no async resolution task.
    Resolved,
    /// At least one input is unresolved and must be resolved in a local task first.
    Unresolved,
}

impl InputResolution {
    #[inline]
    pub fn from_is_resolved(is_resolved: bool) -> Self {
        if is_resolved {
            Self::Resolved
        } else {
            Self::Unresolved
        }
    }

    #[inline]
    pub fn is_resolved(self) -> bool {
        matches!(self, Self::Resolved)
    }
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadCellTracking {
    /// Reads are tracked as dependencies of the current task.
    Tracked {
        /// The key used for the dependency
        key: Option<u64>,
    },
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

impl ReadCellTracking {
    pub fn should_track(&self, is_err: bool) -> bool {
        match self {
            ReadCellTracking::Tracked { .. } => true,
            ReadCellTracking::TrackOnlyError => is_err,
            ReadCellTracking::Untracked => false,
        }
    }

    pub fn key(&self) -> Option<u64> {
        match self {
            ReadCellTracking::Tracked { key } => *key,
            ReadCellTracking::TrackOnlyError => None,
            ReadCellTracking::Untracked => None,
        }
    }
}

impl Default for ReadCellTracking {
    fn default() -> Self {
        ReadCellTracking::Tracked { key: None }
    }
}

impl Display for ReadCellTracking {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReadCellTracking::Tracked { key: None } => write!(f, "tracked"),
            ReadCellTracking::Tracked { key: Some(key) } => write!(f, "tracked with key {key}"),
            ReadCellTracking::TrackOnlyError => write!(f, "track only error"),
            ReadCellTracking::Untracked => write!(f, "untracked"),
        }
    }
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

#[derive(Encode, Decode, Default, Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum TaskPriority {
    #[default]
    Initial,
    Invalidation {
        priority: Reverse<u32>,
    },
    Recomputation,
}

impl TaskPriority {
    pub fn invalidation(priority: u32) -> Self {
        Self::Invalidation {
            priority: Reverse(priority),
        }
    }

    pub fn initial() -> Self {
        Self::Initial
    }

    pub fn leaf() -> Self {
        Self::Invalidation {
            priority: Reverse(0),
        }
    }

    pub fn in_parent(&self, parent_priority: TaskPriority) -> Self {
        match self {
            TaskPriority::Initial => parent_priority,
            TaskPriority::Invalidation { priority } => {
                if let TaskPriority::Invalidation {
                    priority: parent_priority,
                } = parent_priority
                    && priority.0 < parent_priority.0
                {
                    Self::Invalidation {
                        priority: Reverse(parent_priority.0.saturating_add(1)),
                    }
                } else {
                    *self
                }
            }
            TaskPriority::Recomputation => TaskPriority::Recomputation,
        }
    }
}

impl Display for TaskPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskPriority::Initial => write!(f, "initial"),
            TaskPriority::Invalidation { priority } => write!(f, "invalidation({})", priority.0),
            TaskPriority::Recomputation => write!(f, "recomputation"),
        }
    }
}

enum ScheduledTask {
    // Under `sync`, `TurboTasks::schedule` is a no-op (tasks run inline on read), so
    // this variant is never constructed; the runner machinery is otherwise unused.
    #[cfg_attr(feature = "sync", allow(dead_code))]
    Task { task_id: TaskId, span: Span },
    LocalTask {
        ty: LocalTaskSpec,
        persistence: TaskPersistence,
        local_task_id: LocalTaskId,
        global_task_state: Arc<RwLock<CurrentTaskState>>,
        span: Span,
    },
}

pub struct TurboTasks<B: Backend + 'static> {
    this: Weak<Self>,
    backend: B,
    execution_id_factory: IdFactory<ExecutionId>,
    stopped: AtomicBool,
    currently_scheduled_foreground_jobs: AtomicUsize,
    currently_scheduled_background_jobs: AtomicUsize,
    scheduled_tasks: AtomicUsize,
    #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
    priority_runner:
        Arc<PriorityRunner<TurboTasks<B>, ScheduledTask, TaskPriority, TurboTasksExecutor>>,
    start: Mutex<Option<Instant>>,
    aggregated_update: Mutex<(Option<(Duration, usize)>, InvalidationReasonSet)>,
    /// Event that is triggered when currently_scheduled_foreground_jobs becomes non-zero
    event_foreground_start: Event,
    /// Event that is triggered when all foreground jobs are done
    /// (currently_scheduled_foreground_jobs becomes zero)
    event_foreground_done: Event,
    /// Event that is triggered when all background jobs are done
    event_background_done: Event,
    #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
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
    priority: TaskPriority,

    /// True if the current task has state in cells (interior mutability).
    /// Only tracked when verify_determinism feature is enabled.
    #[cfg(feature = "verify_determinism")]
    stateful: bool,

    /// True if the current task uses an external invalidator
    has_invalidator: bool,

    /// True if we're in a top-level task (e.g. `.run_once(...)` or `.run(...)`).
    /// Eventually consistent reads are not allowed in top-level tasks.
    in_top_level_task: bool,

    /// Tracks how many cells of each type has been allocated so far during this task execution.
    /// When a task is re-executed, the cell count may not match the existing cell vec length.
    ///
    /// This is taken (and becomes `None`) during teardown of a task.
    cell_counters: Option<AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>>,

    /// Tracks execution of Local tasks (and detached test futures) created during this global
    /// task's execution.
    local_tasks: LocalTaskTracker,
}

impl CurrentTaskState {
    fn new(
        task_id: TaskId,
        execution_id: ExecutionId,
        priority: TaskPriority,
        in_top_level_task: bool,
    ) -> Self {
        Self {
            task_id: Some(task_id),
            execution_id,
            priority,
            #[cfg(feature = "verify_determinism")]
            stateful: false,
            has_invalidator: false,
            in_top_level_task,
            cell_counters: Some(AutoMap::default()),
            local_tasks: LocalTaskTracker::new(),
        }
    }

    fn new_temporary(
        execution_id: ExecutionId,
        priority: TaskPriority,
        in_top_level_task: bool,
    ) -> Self {
        Self {
            task_id: None,
            execution_id,
            priority,
            #[cfg(feature = "verify_determinism")]
            stateful: false,
            has_invalidator: false,
            in_top_level_task,
            cell_counters: None,
            local_tasks: LocalTaskTracker::new(),
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
}

/// A scoped thread-local exposing the subset of tokio's `task_local!` API the sync
/// engine uses (`with` / `try_with` / `sync_scope`). The value lives on the stack
/// for the duration of `sync_scope`; nesting saves and restores the previous value.
/// (Mirrors the `scoped-tls` pattern. The async-only `.scope()` is intentionally
/// absent — async paths are compiled only under `tokio_runtime`.)
#[cfg(not(feature = "tokio_runtime"))]
pub(crate) struct SyncTaskLocal<T: 'static> {
    inner: &'static std::thread::LocalKey<std::cell::Cell<*const ()>>,
    _marker: std::marker::PhantomData<fn() -> T>,
}

#[cfg(not(feature = "tokio_runtime"))]
pub(crate) struct SyncAccessError;

#[cfg(not(feature = "tokio_runtime"))]
impl<T: 'static> SyncTaskLocal<T> {
    pub(crate) const fn new(
        inner: &'static std::thread::LocalKey<std::cell::Cell<*const ()>>,
    ) -> Self {
        Self {
            inner,
            _marker: std::marker::PhantomData,
        }
    }

    pub(crate) fn sync_scope<R>(&'static self, value: T, f: impl FnOnce() -> R) -> R {
        struct Reset {
            inner: &'static std::thread::LocalKey<std::cell::Cell<*const ()>>,
            prev: *const (),
        }
        impl Drop for Reset {
            fn drop(&mut self) {
                self.inner.with(|c| c.set(self.prev));
            }
        }
        let prev = self
            .inner
            .with(|c| c.replace(&value as *const T as *const ()));
        let _reset = Reset {
            inner: self.inner,
            prev,
        };
        f()
    }

    pub(crate) fn with<R>(&'static self, f: impl FnOnce(&T) -> R) -> R {
        self.try_with(f)
            .unwrap_or_else(|_| panic!("sync task-local accessed outside of a scope"))
    }

    pub(crate) fn try_with<R>(
        &'static self,
        f: impl FnOnce(&T) -> R,
    ) -> Result<R, SyncAccessError> {
        let ptr = self.inner.with(|c| c.get());
        if ptr.is_null() {
            Err(SyncAccessError)
        } else {
            // SAFETY: a non-null pointer was set by `sync_scope` and the referent
            // (a stack local in the enclosing `sync_scope` frame) outlives this call.
            Ok(f(unsafe { &*(ptr as *const T) }))
        }
    }
}

#[cfg(not(feature = "tokio_runtime"))]
macro_rules! sync_task_local {
    ($( $(#[$attr:meta])* $vis:vis static $name:ident: $ty:ty; )*) => {
        $(
            $(#[$attr])*
            $vis static $name: SyncTaskLocal<$ty> = {
                thread_local! {
                    static SLOT: std::cell::Cell<*const ()> =
                        const { std::cell::Cell::new(std::ptr::null()) };
                }
                SyncTaskLocal::new(&SLOT)
            };
        )*
    };
}

// The ambient task-locals. Under the async runtime these are tokio task-locals
// (correct task-local semantics: they follow a task across `.await`/thread moves).
// Under the synchronous engine (no tokio) they are scoped *thread*-locals — correct
// because sync execution is inline on one call stack, and `parallel!` re-establishes
// them per worker thread.
#[cfg(feature = "tokio_runtime")]
task_local! {
    /// The current TurboTasks instance
    static TURBO_TASKS: Arc<dyn TurboTasksApi>;

    static CURRENT_TASK_STATE: Arc<RwLock<CurrentTaskState>>;

    /// Temporarily suppresses the eventual consistency check in top-level tasks.
    /// This is used by strongly consistent reads to allow them to succeed in top-level tasks.
    /// This is NOT shared across local tasks (unlike CURRENT_TASK_STATE), so it's safe
    /// to set/unset without race conditions.
    pub(crate) static SUPPRESS_EVENTUAL_CONSISTENCY_TOP_LEVEL_TASK_CHECK: bool;
}

#[cfg(not(feature = "tokio_runtime"))]
sync_task_local! {
    static TURBO_TASKS: Arc<dyn TurboTasksApi>;
    static CURRENT_TASK_STATE: Arc<RwLock<CurrentTaskState>>;
    pub(crate) static SUPPRESS_EVENTUAL_CONSISTENCY_TOP_LEVEL_TASK_CHECK: bool;
}

impl<B: Backend + 'static> TurboTasks<B> {
    // TODO better lifetime management for turbo tasks
    // consider using unsafe for the task_local turbo tasks
    // that should be safe as long tasks can't outlife turbo task
    // so we probably want to make sure that all tasks are joined
    // when trying to drop turbo tasks
    pub fn new(backend: B) -> Arc<Self> {
        let execution_id_factory = IdFactory::new(ExecutionId::MIN, ExecutionId::MAX);
        let this = Arc::new_cyclic(|this| Self {
            this: this.clone(),
            backend,
            execution_id_factory,
            stopped: AtomicBool::new(false),
            currently_scheduled_foreground_jobs: AtomicUsize::new(0),
            currently_scheduled_background_jobs: AtomicUsize::new(0),
            scheduled_tasks: AtomicUsize::new(0),
            #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
            priority_runner: Arc::new(PriorityRunner::new(TurboTasksExecutor)),
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
            #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
            compilation_events: CompilationEventQueue::default(),
        });
        // Start the sync worker pool up front (analogous to the async build creating its
        // tokio runtime before any task runs), so the first build doesn't pay thread
        // creation inside its timed region.
        #[cfg(feature = "sync")]
        sync_pool::ensure_started();
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
        Fut: Future<Output = Result<Vc<T>>> + Send + 'static,
    {
        let id = self.backend.create_transient_task(
            TransientTaskType::Root(Box::new(move || {
                let functor = functor.clone();
                future_as_native_task(async move {
                    mark_top_level_task();
                    let raw_vc = functor().await?.node;
                    crate::read!(raw_vc.to_non_local())
                })
            })),
            self,
        );
        self.schedule(id, TaskPriority::initial());
        id
    }

    pub fn dispose_root_task(&self, task_id: TaskId) {
        self.backend.dispose_root_task(task_id, self);
    }

    // TODO make sure that all dependencies settle before reading them
    /// Creates a new root task, that is only executed once.
    /// Dependencies will not invalidate the task.
    #[cfg(feature = "tokio_runtime")]
    #[track_caller]
    fn spawn_once_task<T, Fut>(&self, future: Fut)
    where
        T: ?Sized,
        Fut: Future<Output = Result<Vc<T>>> + Send + 'static,
    {
        #[cfg(not(feature = "sync"))]
        let task = {
            TransientTaskType::Once(Box::pin(async move {
                mark_top_level_task();
                let raw_vc = future.await?.node;
                raw_vc.to_non_local().await
            }))
        };
        #[cfg(feature = "sync")]
        let task = {
            TransientTaskType::Once(future_as_native_task(async move {
                mark_top_level_task();
                let raw_vc = future.await?.node;
                raw_vc.to_non_local()
            }))
        };
        let id = self.backend.create_transient_task(task, self);
        self.schedule(id, TaskPriority::initial());
    }

    #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
    pub async fn run_once<T: TraceRawVcs + Send + 'static>(
        &self,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.spawn_once_task(async move {
            mark_top_level_task();
            let result = future.await;
            tx.send(result)
                .map_err(|_| anyhow!("unable to send result"))?;
            Ok(Completion::new())
        });

        rx.await?
    }

    #[cfg(feature = "tokio_runtime")]
    #[tracing::instrument(level = "trace", skip_all, name = "turbo_tasks::run")]
    pub async fn run<T: TraceRawVcs + Send + 'static>(
        &self,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T, TurboTasksExecutionError> {
        self.begin_foreground_job();
        // it's okay for execution ids to overflow and wrap, they're just used for an assert
        let execution_id = self.execution_id_factory.wrapping_get();
        let current_task_state = Arc::new(RwLock::new(CurrentTaskState::new_temporary(
            execution_id,
            TaskPriority::initial(),
            true, // in_top_level_task
        )));

        let result = TURBO_TASKS
            .scope(
                self.pin(),
                CURRENT_TASK_STATE.scope(current_task_state, async {
                    let result = CaptureFuture::new(future).await;

                    // wait for all spawned local tasks using `local` to finish
                    wait_for_local_tasks().await;

                    match result {
                        Ok(Ok(value)) => Ok(value),
                        Ok(Err(err)) => Err(err.into()),
                        Err(err) => Err(TurboTasksExecutionError::Panic(Arc::new(err))),
                    }
                }),
            )
            .await;
        self.finish_foreground_job();
        result
    }

    // Inherent no-tokio counterpart of `run_once`, for tests that hold a concrete
    // `TurboTasks<B>` and call `tt.run_once(fut).await` directly (rather than the free
    // function). Same `async fn` signature, but driven inline via `run_once_inline` —
    // the returned future is `Ready` after a single poll.
    #[cfg(feature = "sync")]
    pub async fn run_once<T: TraceRawVcs + Send + 'static>(
        &self,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T> {
        let slot: Arc<std::sync::Mutex<Option<T>>> = Arc::new(std::sync::Mutex::new(None));
        let slot_inner = slot.clone();
        TurboTasksCallApi::run_once_inline(
            self,
            Box::pin(async move {
                let result = future.await?;
                *slot_inner.lock().unwrap() = Some(result);
                Ok(())
            }),
        )?;
        Ok(slot
            .lock()
            .unwrap()
            .take()
            .expect("sync run_once: body did not produce a result"))
    }

    // Inherent no-tokio counterpart of `stop_and_wait`, for tests that hold a concrete
    // `TurboTasks<B>`. Marks the backend stopping and flips the `stopped` flag; there
    // are no background foreground-jobs to drain in the inline engine. Persistence is
    // exercised explicitly by tests via `snapshot_and_evict_for_testing`.
    #[cfg(feature = "sync")]
    pub async fn stop_and_wait(&self) {
        self.backend.stopping(self);
        self.stopped.store(true, Ordering::Release);
    }

    #[cfg(feature = "tokio_runtime")]
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
        arg: &mut dyn DynTaskInputsStorage,
        persistence: TaskPersistence,
    ) -> RawVc {
        // Parent task for child-connection. Under the synchronous engine a top-level
        // call (outside any task) legitimately has no parent, so don't panic.
        #[cfg(feature = "sync")]
        let parent = current_reader_or_none();
        #[cfg(not(feature = "sync"))]
        let parent = current_task_if_available("turbo_function calls");
        RawVc::task_output(self.backend.get_or_create_task(
            native_fn,
            this,
            arg,
            parent,
            persistence,
            self,
        ))
    }

    pub fn dynamic_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &mut dyn DynTaskInputsStorage,
        inputs_resolved: InputResolution,
        persistence: TaskPersistence,
    ) -> RawVc {
        if inputs_resolved.is_resolved() && this.is_none_or(|this| this.is_resolved()) {
            return self.native_call(native_fn, this, arg, persistence);
        }
        // Synchronous engine: resolve `this` and the arguments inline instead of
        // spawning an async `ResolveNative` local task. `run_resolve_native` is a plain
        // synchronous fn under `sync` (no future/poll) — call it directly.
        #[cfg(feature = "sync")]
        {
            let arg = arg.take_box();
            return LocalTaskType::run_resolve_native(
                native_fn,
                this,
                &*arg,
                persistence,
                self.pin(),
            )
            .expect("sync turbo-tasks: failed to resolve task inputs");
        }
        #[cfg(not(feature = "sync"))]
        {
            // Need async resolution — must move the arg to the heap now
            let arg = arg.take_box();
            let task_type = LocalTaskSpec {
                task_type: LocalTaskType::ResolveNative { native_fn },
                this,
                arg,
            };
            self.schedule_local_task(task_type, persistence)
        }
    }

    pub fn trait_call(
        &self,
        trait_method: &'static TraitMethod,
        this: RawVc,
        arg: &mut dyn DynTaskInputsStorage,
        inputs_resolved: InputResolution,
        persistence: TaskPersistence,
    ) -> RawVc {
        // avoid creating a wrapper task if self is already resolved
        // for resolved cells we already know the value type so we can lookup the
        // function
        if let Some((_, cell_id)) = this.as_task_cell() {
            match registry::get_value_type(cell_id.type_id()).get_trait_method(trait_method) {
                Some(native_fn) => {
                    if let Some(filter) = native_fn.arg_meta.filter_owned {
                        let (resolved, mut arg) = (filter)(arg);
                        return self.dynamic_call(
                            native_fn,
                            Some(this),
                            &mut arg,
                            resolved,
                            persistence,
                        );
                    } else {
                        return self.dynamic_call(
                            native_fn,
                            Some(this),
                            arg,
                            inputs_resolved,
                            persistence,
                        );
                    }
                }
                None => {
                    // We are destined to fail at this point, but we just retry resolution in the
                    // local task since we cannot report an error from here.
                    // TODO: A panic seems appropriate since the immediate caller is to blame
                }
            }
        }

        // Synchronous engine: resolve `this` + inputs inline (mirrors dynamic_call).
        // `run_resolve_trait` is a plain synchronous fn under `sync` — call it directly.
        #[cfg(feature = "sync")]
        {
            let _ = inputs_resolved;
            let arg = arg.take_box();
            return LocalTaskType::run_resolve_trait(
                trait_method,
                this,
                &*arg,
                persistence,
                self.pin(),
            )
            .expect("sync turbo-tasks: failed to resolve trait call inputs");
        }
        // create a wrapper task to resolve all inputs
        #[cfg(not(feature = "sync"))]
        {
            let task_type = LocalTaskSpec {
                task_type: LocalTaskType::ResolveTrait { trait_method },
                this: Some(this),
                arg: arg.take_box(),
            };
            self.schedule_local_task(task_type, persistence)
        }
    }

    #[track_caller]
    pub fn schedule(&self, task_id: TaskId, priority: TaskPriority) {
        // Synchronous engine: scheduling a task = making sure it is computed by the sync
        // scheduler. In parallel mode that means enqueuing a pool job that claim-dedups with
        // other readers. In sequential mode it means computing immediately on this stack; this
        // keeps the correctness fallback genuinely fork-free instead of leaving scheduled work
        // on helper threads where it can participate in the parallel wait cycle.
        #[cfg(feature = "sync")]
        {
            let _ = priority;
            if sync_trace(task_id) {
                eprintln!("[trace] SCHED {}", sync_token(task_id));
            }
            if sync_sequential() {
                self.begin_foreground_job();
                self.sync_execute_scheduled_task(task_id);
                self.finish_foreground_job();
                return;
            }
            let this = self.pin();
            let tt: Arc<dyn TurboTasksApi> = this.clone();
            crate::sync_stats::bump(&crate::sync_stats::SCHEDULE_CALLS);
            sync_pool::pool().spawn_external(move |_w| {
                crate::sync_stats::bump(&crate::sync_stats::POOL_JOBS_RUN);
                let claimed = if TURBO_TASKS.try_with(|_| ()).is_ok() {
                    tt.sync_execute_scheduled_task(task_id)
                } else {
                    let tt2 = tt.clone();
                    TURBO_TASKS.sync_scope(tt, move || tt2.sync_execute_scheduled_task(task_id))
                };
                if claimed {
                    crate::sync_stats::bump(&crate::sync_stats::POOL_CLAIMED);
                }
            });
            return;
        }
        #[cfg(not(feature = "sync"))]
        {
            self.begin_foreground_job();
            self.scheduled_tasks.fetch_add(1, Ordering::AcqRel);

            self.priority_runner.schedule(
                &self.pin(),
                ScheduledTask::Task {
                    task_id,
                    span: Span::current(),
                },
                priority,
            );
        }
    }

    #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
    fn schedule_local_task(
        &self,
        ty: LocalTaskSpec,
        // if this is a `LocalTaskType::Resolve*`, we may spawn another task with this persistence,
        persistence: TaskPersistence,
    ) -> RawVc {
        let task_type = ty.task_type;
        let (global_task_state, execution_id, priority, local_task_id) =
            CURRENT_TASK_STATE.with(|gts| {
                let mut gts_write = gts.write().unwrap();
                let local_task_id = gts_write.local_tasks.create(task_type);
                (
                    Arc::clone(gts),
                    gts_write.execution_id,
                    gts_write.priority,
                    local_task_id,
                )
            });

        self.priority_runner.schedule(
            &self.pin(),
            ScheduledTask::LocalTask {
                ty,
                persistence,
                local_task_id,
                global_task_state,
                span: Span::current(),
            },
            priority,
        );

        RawVc::local_output(execution_id, local_task_id, persistence)
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
    #[cfg(feature = "tokio_runtime")]
    pub async fn get_or_wait_aggregated_update_info(&self, aggregation: Duration) -> UpdateInfo {
        self.aggregated_update_info(aggregation, Duration::MAX)
            .await
            .unwrap()
    }

    /// Returns [UpdateInfo] with all updates aggregated over a given duration
    /// (`aggregation`). Will only return None when the timeout is reached while
    /// waiting for the first update.
    #[cfg(feature = "tokio_runtime")]
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

    #[cfg(feature = "tokio_runtime")]
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

    #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
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

    #[cfg(feature = "tokio_runtime")]
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
        CURRENT_TASK_STATE.with(|cell| {
            let current_task_state = &*cell.write().unwrap();
            FinishedTaskState {
                #[cfg(feature = "verify_determinism")]
                stateful: current_task_state.stateful,
                has_invalidator: current_task_state.has_invalidator,
            }
        })
    }

    /// Called from the sync read loops when a read returned `Err(listener)` (the task
    /// is not yet available). A genuine dependency *cycle* is already ruled out by the
    /// [`SyncWaitGraph`] before we get here, so `task` is being produced by another worker.
    ///
    /// The strategy: try to claim and compute `task` inline; if it is already claimed by
    /// another worker, just block on its done-event until that worker finishes. Because
    /// [`sync_parallel_read`] gives every outermost item its own dedicated OS thread, the
    /// producer of any in-flight task is always runnable, and the wait-for graph of an
    /// acyclic task graph is itself acyclic, so the block always resolves. The `deadline`
    /// is a backstop: it turns a genuine (undetected-cycle) hang into a fast, clear panic
    /// instead of an indefinite wait.
    ///
    /// The deadline is progress-aware: if the pool's `completed` counter advances, the build
    /// is making progress (just slow), so we reset the deadline. True deadlock has no
    /// progress.
    #[cfg(feature = "sync")]
    fn sync_advance_or_wait(
        &self,
        task: TaskId,
        listener: EventListener,
        deadline: &mut Option<(std::time::Instant, u64)>,
    ) {
        if self.execute_task_inline(task) {
            crate::sync_stats::bump(&crate::sync_stats::INLINE_CLAIMED);
            *deadline = None;
            return;
        }
        if sync_trace(task) {
            eprintln!(
                "[trace] ADV {} inline-claim-failed -> will managed_block",
                sync_token(task)
            );
        }
        let now_progress = sync_pool::pool().progress();
        let until = match deadline {
            Some((until, last_progress)) => {
                if now_progress != *last_progress {
                    let new_until = std::time::Instant::now() + *SYNC_DEADLOCK_TIMEOUT;
                    *deadline = Some((new_until, now_progress));
                    new_until
                } else {
                    *until
                }
            }
            None => {
                let new_until = std::time::Instant::now() + *SYNC_DEADLOCK_TIMEOUT;
                *deadline = Some((new_until, now_progress));
                new_until
            }
        };
        let remaining = until.saturating_duration_since(std::time::Instant::now());
        if remaining.is_zero() {
            let progress = sync_pool::pool().progress();
            eprintln!(
                "\n=== sync deadlock on {task:?} ({}) progress={} (deadline stalled, no \
                 completion since set) ===\n{}",
                self.backend.debug_description(task),
                progress,
                sync_pool::pool().dump_state_simple()
            );
            #[cfg(feature = "sync_instrument")]
            {
                let backend = &self.backend;
                let describe = |token: u64| -> Option<String> {
                    std::num::NonZeroU64::new(token)
                        .and_then(|nz| TaskId::try_from(nz).ok())
                        .map(|id| backend.debug_description(id))
                };
                eprintln!(
                    "=== detailed wait-graph (instrument) ===
{}",
                    sync_pool::pool().dump_state_described(describe)
                );
                static SAMPLED: std::sync::atomic::AtomicBool =
                    std::sync::atomic::AtomicBool::new(false);
                if SAMPLED
                    .compare_exchange(
                        false,
                        true,
                        std::sync::atomic::Ordering::SeqCst,
                        std::sync::atomic::Ordering::SeqCst,
                    )
                    .is_ok()
                {
                    let pid = std::process::id().to_string();
                    let out = std::env::var("TT_DEADLOCK_SAMPLE_FILE")
                        .unwrap_or_else(|_| "/tmp/tt_deadlock_sample.txt".to_string());
                    let _ = std::process::Command::new("sample")
                        .args([&pid, "2", "-file", &out, "-mayDie"])
                        .status();
                    eprintln!("=== sync deadlock: thread sample written to {out} ===");
                } else {
                    std::thread::sleep(std::time::Duration::from_secs(4));
                }
            }
            panic!(
                "sync turbo-tasks: deadlock — task {task:?} was not produced within {:?}                  (progress={} stalled, no completion since deadline was set). This indicates a                  genuine dependency cycle that escaped detection, or a bug in the synchronous                  scheduler. If the build is just slow, this panic means *no* global progress                  was observed — a true stall, not slowness — or increase                  `TURBO_SYNC_DEADLOCK_SECS`.",
                *SYNC_DEADLOCK_TIMEOUT, progress
            );
        }
        if tt_parallel::in_worker() {
            crate::sync_stats::bump(&crate::sync_stats::MANAGED_BLOCKS);
            let blocker = ListenerBlocker {
                listener: Some(listener),
                timeout: remaining,
                wake: Arc::new(ListenerWake::default()),
            };
            if tt_parallel::managed_block_current(sync_token(task), blocker).is_err() {
                panic!(
                    "sync turbo-tasks: dependency cycle detected while waiting on task {task:?} \
                     (the producer is, transitively, waiting on a task this worker is producing)."
                );
            }
        } else {
            // Off-pool fallback (no worker context): a plain bounded wait. Reached only if
            // a read happens outside the pool, which the bootstrap normally prevents.
            listener.wait_timeout(remaining);
        }
    }

    /// Precondition: the task is in the `Scheduled` state (the read-miss path in
    /// `try_read_task_*` sets this before calling here).
    #[cfg(feature = "sync")]
    fn execute_task_inline(&self, task_id: TaskId) -> bool {
        use crate::capture_future::capture_sync;

        enum Outcome {
            NotStarted,
            Completed,
            Stale(TaskPriority),
        }

        loop {
            // It's okay for execution ids to overflow and wrap; they're just used for
            // an assert.
            let execution_id = self.execution_id_factory.wrapping_get();
            let current_task_state = Arc::new(RwLock::new(CurrentTaskState::new(
                task_id,
                execution_id,
                TaskPriority::initial(),
                false, // in_top_level_task
            )));
            let outcome = CURRENT_TASK_STATE.sync_scope(current_task_state, || {
                if self.stopped.load(Ordering::Acquire) {
                    self.backend.task_execution_canceled(task_id, self);
                    return Outcome::NotStarted;
                }
                let Some(TaskExecutionSpec { future, span }) = self
                    .backend
                    .try_start_task_execution(task_id, TaskPriority::initial(), self)
                else {
                    // Not scheduled: already done, or in progress on this stack (cycle).
                    if sync_trace(task_id) {
                        eprintln!(
                            "[trace] INLINE {} -> NotStarted (claim failed)",
                            sync_token(task_id)
                        );
                    }
                    return Outcome::NotStarted;
                };
                if sync_trace(task_id) {
                    eprintln!(
                        "[trace] INLINE {} -> claimed, running body",
                        sync_token(task_id)
                    );
                }
                let _entered = span.entered();

                // Cycle detection lives in the global `SyncWaitGraph` (edges added by the
                // read path in `try_read_task_*`), not on this thread — so there is
                // nothing to push/pop here.

                // A synchronous task body has no real `.await` points — every
                // dependency read is a `read!` (a synchronous call that recurses back
                // through the manager to inline-compute missing deps). So the body's
                // future completes in exactly one poll, on this call stack.
                //
                // Note: unlike the async executor we do NOT `wait_for_local_tasks` —
                // the synchronous model resolves inputs eagerly and does not spawn
                // `local` tasks.
                //
                // Reset the eventual-consistency top-level suppression flag for this
                // task. The async executor runs each task on its own worker thread, so a
                // task never inherits the transient suppress scope of whichever read
                // triggered it. The sync engine runs the task inline on the SAME thread,
                // so without this reset a task executed in the middle of a caller's
                // strongly-consistent read would wrongly inherit `suppressed = true` and
                // skip the top-level-task eventual-read check.
                // Declare to the scheduler that this worker is producing `task_id` for the
                // duration of the body, so another worker that reaches `task_id` (and
                // `managed_block`s on it) participates in cross-worker cycle detection, and
                // a `join` waiting on a stolen child parks-rather-than-steals (avoiding the
                // self-wait). `owning` requires a pool worker; the read/schedule paths
                // guarantee we're on one. Off-pool (a stray inline drive) we just run.
                let run_body = || {
                    // A task body is never itself a probe (the probe is the parent's
                    // classification pass in `sync_parallel_read`). Clear `SYNC_PROBE` for the
                    // body so a `read!` miss inside it claims+computes / blocks rather than
                    // reporting a miss — a worker can reach here from inside a `parallel!`
                    // probe via work-stealing.
                    let probing = SYNC_PROBE.with(|p| p.replace(false));
                    // Per-task-type timing (analysis only, `TURBO_SYNC_STATS=1` — see
                    // `sync_stats::task_time`).
                    let _timer = crate::sync_stats::time_task_named(|| {
                        self.backend.get_task_name(task_id, self)
                    });
                    // Run the task body closure directly (no future/poll), catching panics
                    // exactly as the async `CaptureFuture` does.
                    let r = SUPPRESS_EVENTUAL_CONSISTENCY_TOP_LEVEL_TASK_CHECK
                        .sync_scope(false, || capture_sync(future));
                    SYNC_PROBE.with(|p| p.set(probing));
                    r
                };
                let result = if tt_parallel::in_worker() {
                    tt_parallel::owning_current(sync_token(task_id), run_body)
                } else {
                    run_body()
                };
                let result = match result {
                    Ok(Ok(raw_vc)) => raw_vc
                        .to_non_local_unchecked_sync(self)
                        .map_err(|err| err.into()),
                    Ok(Err(err)) => Err(err.into()),
                    Err(err) => Err(TurboTasksExecutionError::Panic(Arc::new(err))),
                };

                let finished_state = self.finish_current_task_state();
                let cell_counters =
                    CURRENT_TASK_STATE.with(|ts| ts.write().unwrap().cell_counters.take().unwrap());
                let outcome = match self.backend.task_execution_completed(
                    task_id,
                    result,
                    &cell_counters,
                    #[cfg(feature = "verify_determinism")]
                    finished_state.stateful,
                    finished_state.has_invalidator,
                    self,
                ) {
                    Some(stale_priority) => Outcome::Stale(stale_priority),
                    None => Outcome::Completed,
                };
                outcome
            });
            if sync_trace(task_id) {
                eprintln!(
                    "[trace] INLINE {} -> {}",
                    sync_token(task_id),
                    match &outcome {
                        Outcome::NotStarted => "NotStarted",
                        Outcome::Completed => "Completed",
                        Outcome::Stale(_) => "Stale(reschedule)",
                    }
                );
            }
            match outcome {
                Outcome::NotStarted => return false,
                Outcome::Completed => return true,
                Outcome::Stale(stale_priority) => {
                    // Task went stale during execution; re-schedule and re-run inline.
                    self.schedule(task_id, stale_priority);
                }
            }
        }
    }

    /// Synchronous entry point into the task graph — the sync counterpart of
    /// [`TurboTasks::run_once`]. Runs `closure` as a root `Once` task on the current
    /// thread, so it executes within a task context (top-level `.cell()` and `read!`
    /// work), and returns the closure's result.
    ///
    /// The closure must be `Send + 'static` (it becomes a task body), matching
    /// `run_once`. Computation is fully inline — no tokio, no scheduler.
    #[cfg(feature = "sync")]
    pub fn run_sync<T, F>(&self, closure: F) -> Result<T>
    where
        F: FnOnce() -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        let this = self.pin();
        let tt_dyn: Arc<dyn TurboTasksApi> = this.clone();
        turbo_tasks_scope(tt_dyn, move || {
            // The closure's result is carried out of the task body via a slot (the
            // task's own output is a `Completion`, like `run_once`).
            let slot: Arc<std::sync::Mutex<Option<Result<T>>>> =
                Arc::new(std::sync::Mutex::new(None));
            let slot_inner = slot.clone();
            // The task body is a plain closure — the sync `NativeTaskFuture` — so `run_sync`
            // is genuinely async-free: no future, no poll, no `sync_poll` (unlike the
            // async `run_once`, which wraps a caller-provided future). The closure is the
            // whole call chain: it runs inline when the Once task is read below.
            let once_id = this.backend.create_transient_task(
                TransientTaskType::Once(Box::new(move || {
                    mark_top_level_task();
                    let result = closure();
                    *slot_inner.lock().unwrap() = Some(result);
                    Ok(crate::Vc::into_raw(Completion::new()))
                })),
                &this,
            );
            // Drive the Once task to completion by reading its output inline. Under
            // the sync engine this always resolves (never returns an EventListener).
            let _ = this.try_read_task_output(once_id, ReadOutputOptions::default())?;
            slot.lock()
                .unwrap()
                .take()
                .expect("sync Once task did not produce a result")
        })
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }

    pub fn get_current_task_priority(&self) -> TaskPriority {
        CURRENT_TASK_STATE
            .try_with(|task_state| task_state.read().unwrap().priority)
            .unwrap_or(TaskPriority::initial())
    }

    pub fn is_idle(&self) -> bool {
        self.currently_scheduled_foreground_jobs
            .load(Ordering::Acquire)
            == 0
    }

    #[cfg(feature = "tokio_runtime")]
    #[track_caller]
    pub fn schedule_backend_background_job(&self, job: B::BackendJob) {
        self.schedule_background_job(async move |this| {
            this.backend.run_backend_job(job, &*this).await;
            this
        })
    }
}

#[cfg(feature = "tokio_runtime")]
struct TurboTasksExecutor;

/// Run a future and abort the process if a panic is reported
///
/// Turbtasks catches panics from user code and propagates throught the task tree, but if it happens
/// as part of state management we have to abort
#[cfg(feature = "tokio_runtime")]
async fn abort_on_panic<F: Future>(f: F) -> F::Output {
    match AssertUnwindSafe(f).catch_unwind().await {
        Ok(r) => r,
        Err(_) => {
            eprintln!(
                "\nturbo-tasks: an internal panic occurred outside the per-task panic \
                 boundary. This is a bug in turbo-tasks/Turbopack — please report it at \
                 https://github.com/vercel/next.js/discussions and include the panic message \
                 and stack trace above.\n\nAborting."
            );
            abort();
        }
    }
}

// In sync mode tasks run inline via `execute_task_inline` / `sync_pool`,
// never via the `PriorityRunner` executor, even when `tokio_runtime` is also enabled (dual-mode /
// edge bridge).
#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
impl<B: Backend> Executor<TurboTasks<B>, ScheduledTask, TaskPriority> for TurboTasksExecutor {
    type Future = impl Future<Output = ()> + Send + 'static;

    fn execute(
        &self,
        this: &Arc<TurboTasks<B>>,
        scheduled_task: ScheduledTask,
        priority: TaskPriority,
    ) -> Self::Future {
        match scheduled_task {
            ScheduledTask::Task { task_id, span } => {
                let this2 = this.clone();
                let this = this.clone();
                let future = async move {
                    abort_on_panic(async {
                        // it's okay for execution ids to overflow and wrap, they're just used
                        // for an assert
                        let execution_id = this.execution_id_factory.wrapping_get();
                        let current_task_state = Arc::new(RwLock::new(CurrentTaskState::new(
                            task_id,
                            execution_id,
                            priority,
                            false, // in_top_level_task
                        )));
                        let single_execution_future = async {
                            if this.stopped.load(Ordering::Acquire) {
                                this.backend.task_execution_canceled(task_id, &*this);
                                return None;
                            }

                            let TaskExecutionSpec { future, span } = this
                                .backend
                                .try_start_task_execution(task_id, priority, &*this)?;

                            async {
                                let result = CaptureFuture::new(future).await;

                                // wait for all spawned local tasks using `local` to finish
                                wait_for_local_tasks().await;

                                let result = match result {
                                    Ok(Ok(raw_vc)) => {
                                        // This is safe because we waited for all local tasks to
                                        // complete above
                                        raw_vc
                                            .to_non_local_unchecked_sync(&*this)
                                            .map_err(|err| err.into())
                                    }
                                    Ok(Err(err)) => Err(err.into()),
                                    Err(err) => Err(TurboTasksExecutionError::Panic(Arc::new(err))),
                                };

                                let finished_state = this.finish_current_task_state();
                                let cell_counters = CURRENT_TASK_STATE
                                    .with(|ts| ts.write().unwrap().cell_counters.take().unwrap());
                                this.backend.task_execution_completed(
                                    task_id,
                                    result,
                                    &cell_counters,
                                    #[cfg(feature = "verify_determinism")]
                                    finished_state.stateful,
                                    finished_state.has_invalidator,
                                    &*this,
                                )
                            }
                            .instrument(span)
                            .await
                        };
                        if let Some(stale_priority) = CURRENT_TASK_STATE
                            .scope(current_task_state, single_execution_future)
                            .await
                        {
                            // Task was stale; re-schedule at the correct invalidation priority so
                            // other tasks can run in the right priority order.
                            this.schedule(task_id, stale_priority);
                        }
                        this.finish_foreground_job();
                    })
                    .await
                };

                Either::Left(TURBO_TASKS.scope(this2, future).instrument(span))
            }
            ScheduledTask::LocalTask {
                ty,
                persistence,
                local_task_id,
                global_task_state,
                span,
            } => {
                let this2 = this.clone();
                let this = this.clone();
                let task_type = ty.task_type;
                let future = async move {
                    let span = match &ty.task_type {
                        LocalTaskType::ResolveNative { native_fn } => {
                            native_fn.resolve_span(priority)
                        }
                        LocalTaskType::ResolveTrait { trait_method } => {
                            trait_method.resolve_span(priority)
                        }
                    };
                    abort_on_panic(
                        async move {
                            let result = match ty.task_type {
                                LocalTaskType::ResolveNative { native_fn } => {
                                    LocalTaskType::run_resolve_native(
                                        native_fn,
                                        ty.this,
                                        &*ty.arg,
                                        persistence,
                                        this,
                                    )
                                    .await
                                }
                                LocalTaskType::ResolveTrait { trait_method } => {
                                    LocalTaskType::run_resolve_trait(
                                        trait_method,
                                        ty.this.unwrap(),
                                        &*ty.arg,
                                        persistence,
                                        this,
                                    )
                                    .await
                                }
                            };

                            let output = match result {
                                Ok(raw_vc) => OutputContent::Link(raw_vc),
                                Err(err) => OutputContent::Error(
                                    TurboTasksExecutionError::from(err)
                                        .with_local_task_context(task_type.to_string()),
                                ),
                            };

                            CURRENT_TASK_STATE.with(move |gts| {
                                gts.write()
                                    .unwrap()
                                    .local_tasks
                                    .complete(local_task_id, output);
                            });
                        }
                        .instrument(span),
                    )
                    .await
                };
                let future = CURRENT_TASK_STATE.scope(global_task_state, future);

                Either::Right(TURBO_TASKS.scope(this2, future).instrument(span))
            }
        }
    }
}

struct FinishedTaskState {
    /// True if the task has state in cells (interior mutability).
    /// Only tracked when verify_determinism feature is enabled.
    #[cfg(feature = "verify_determinism")]
    stateful: bool,

    /// True if the task uses an external invalidator
    has_invalidator: bool,
}

impl<B: Backend + 'static> TurboTasksCallApi for TurboTasks<B> {
    fn dynamic_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &mut dyn DynTaskInputsStorage,
        inputs_resolved: InputResolution,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.dynamic_call(native_fn, this, arg, inputs_resolved, persistence)
    }
    fn native_call(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &mut dyn DynTaskInputsStorage,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.native_call(native_fn, this, arg, persistence)
    }
    fn trait_call(
        &self,
        trait_method: &'static TraitMethod,
        this: RawVc,
        arg: &mut dyn DynTaskInputsStorage,
        inputs_resolved: InputResolution,
        persistence: TaskPersistence,
    ) -> RawVc {
        self.trait_call(trait_method, this, arg, inputs_resolved, persistence)
    }

    #[cfg(feature = "tokio_runtime")]
    #[track_caller]
    fn run(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<(), TurboTasksExecutionError>> + Send>> {
        let this = self.pin();
        Box::pin(async move { this.run(future).await })
    }

    #[cfg(feature = "tokio_runtime")]
    #[track_caller]
    fn run_once(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send>> {
        let this = self.pin();
        Box::pin(async move { this.run_once(future).await })
    }

    #[cfg(feature = "tokio_runtime")]
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

    #[cfg(feature = "tokio_runtime")]
    #[track_caller]
    fn start_once_process(&self, future: Pin<Box<dyn Future<Output = ()> + Send + 'static>>) {
        self.start_once_process(future)
    }

    #[cfg(feature = "sync")]
    fn run_once_inline(
        &self,
        future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Result<()> {
        let this = self.pin();
        let tt_dyn: Arc<dyn TurboTasksApi> = this.clone();
        // Establish the ambient turbo-tasks context, then run the body as a transient
        // `Once` root task. Reading its output inline drives the body to completion
        // (the sync engine inline-computes every dependency, never suspending).
        turbo_tasks_scope(tt_dyn, move || {
            let once_id = this.backend.create_transient_task(
                TransientTaskType::Once(future_as_native_task(async move {
                    mark_top_level_task();
                    future.await?;
                    Ok(crate::Vc::into_raw(Completion::new()))
                })),
                &this,
            );
            let _ = this.try_read_task_output(once_id, ReadOutputOptions::default())?;
            Ok(())
        })
    }

    #[cfg(feature = "tokio_runtime")]
    fn send_compilation_event(&self, event: Arc<dyn CompilationEvent>) {
        #[cfg(not(feature = "sync"))]
        {
            if let Err(e) = self.compilation_events.send(event) {
                tracing::warn!("Failed to send compilation event: {e}");
            }
        }
        #[cfg(feature = "sync")]
        {
            let _ = event;
        }
    }

    fn get_task_name(&self, task: TaskId) -> String {
        self.backend.get_task_name(task, self)
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

    #[cfg(feature = "sync")]
    fn sync_execute_scheduled_task(&self, task: TaskId) -> bool {
        let r = self.execute_task_inline(task);
        if sync_trace(task) {
            eprintln!("[trace] SCHEDEXEC {} -> claimed={}", sync_token(task), r);
        }
        r
    }

    #[cfg(feature = "sync")]
    fn sync_compute_task(&self, task: TaskId) {
        if self.execute_task_inline(task) {
            return;
        }
        let mut deadline = None;
        loop {
            match self
                .backend
                .try_read_task_output(task, None, ReadOutputOptions::default(), self)
            {
                Ok(Ok(_)) => return,
                Ok(Err(listener)) => self.sync_advance_or_wait(task, listener, &mut deadline),
                Err(_) => return,
            }
        }
    }

    #[track_caller]
    fn try_read_task_output(
        &self,
        task: TaskId,
        options: ReadOutputOptions,
    ) -> Result<Result<RawVc, EventListener>> {
        if options.consistency == ReadConsistency::Eventual {
            debug_assert_not_in_top_level_task("read_task_output");
        }
        #[cfg(feature = "sync")]
        {
            // Bootstrap onto the pool if reached off-pool (the `run_sync` driver or a
            // top-level `read!`), so the claim/`managed_block`/fan-out below run on a worker.
            // Nested reads inside a task body are already on a worker and skip this.
            if !tt_parallel::in_worker() {
                return sync_bootstrap_on_pool(|| self.try_read_task_output(task, options));
            }
            // Synchronous engine: on a miss, claim+compute the task on this worker (or
            // `managed_block` on its producer) instead of returning an EventListener.
            // Cycle detection lives on the cold blocking path only: `sync_advance_or_wait`
            // computes the task inline when it can (the common case, no wait) and otherwise
            // `managed_block`s, which rejects a wait that would close a cross-worker cycle;
            // a same-stack cycle is caught by the backend's in-progress state. No global
            // per-read bookkeeping is needed.
            let reader = current_reader_or_none();
            let mut deadline = None;
            loop {
                match self
                    .backend
                    .try_read_task_output(task, reader, options, self)?
                {
                    Ok(raw) => return Ok(Ok(raw)),
                    Err(listener) => {
                        // Probe mode (see `sync_parallel_read`): record the miss and yield
                        // `Pending` so the caller can dispatch this task to the pool by id,
                        // rather than computing it here on the probing worker.
                        if SYNC_PROBE.with(|p| p.get()) {
                            SYNC_PROBE_MISS.with(|m| m.set(Some(task)));
                            return Ok(Err(listener));
                        }
                        self.sync_advance_or_wait(task, listener, &mut deadline);
                    }
                }
            }
        }
        #[cfg(not(feature = "sync"))]
        self.backend.try_read_task_output(
            task,
            current_task_if_available("reading Vcs"),
            options,
            self,
        )
    }

    #[track_caller]
    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        #[cfg(feature = "sync")]
        {
            // Bootstrap onto the pool if reached off-pool (see `try_read_task_output`).
            if !tt_parallel::in_worker() {
                return sync_bootstrap_on_pool(|| self.try_read_task_cell(task, index, options));
            }
            // Synchronous engine: claim+compute the owning task on this worker on a miss.
            // Cycle detection is on the cold blocking path only (see `try_read_task_output`).
            let reader = current_reader_or_none();
            let mut deadline = None;
            loop {
                match self
                    .backend
                    .try_read_task_cell(task, index, reader, options, self)?
                {
                    Ok(content) => return Ok(Ok(content)),
                    Err(listener) => {
                        // Probe mode (see `sync_parallel_read`): record the miss and yield
                        // `Pending` instead of computing on the probing worker.
                        if SYNC_PROBE.with(|p| p.get()) {
                            SYNC_PROBE_MISS.with(|m| m.set(Some(task)));
                            return Ok(Err(listener));
                        }
                        self.sync_advance_or_wait(task, listener, &mut deadline);
                    }
                }
            }
        }
        #[cfg(not(feature = "sync"))]
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
    ) -> Result<TypedCellContent> {
        self.backend
            .try_read_own_task_cell(current_task, index, self)
    }

    #[track_caller]
    fn try_read_local_output(
        &self,
        execution_id: ExecutionId,
        local_task_id: LocalTaskId,
    ) -> Result<Result<RawVc, EventListener>> {
        debug_assert_not_in_top_level_task("read_local_output");
        CURRENT_TASK_STATE.with(|gts| {
            let gts_read = gts.read().unwrap();

            // Local Vcs are local to their parent task's current execution, and do not exist
            // outside of it. This is weakly enforced at compile time using the `NonLocalValue`
            // marker trait. This assertion exists to handle any potential escapes that the
            // compile-time checks cannot capture.
            gts_read.assert_execution_id(execution_id);

            match gts_read.local_tasks.get(local_task_id) {
                LocalTask::Scheduled { done_event } => Ok(Err(done_event.listen())),
                LocalTask::Done { output } => Ok(Ok(output.as_read_result()?)),
            }
        })
    }

    fn read_task_collectibles(&self, task: TaskId, trait_id: TraitTypeId) -> TaskCollectiblesMap {
        // TODO: Add assert_not_in_top_level_task("read_task_collectibles") check here.
        // Collectible reads are eventually consistent.
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

    fn read_own_task_cell(&self, task: TaskId, index: CellId) -> Result<TypedCellContent> {
        self.try_read_own_task_cell(task, index)
    }

    fn update_own_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        updated_key_hashes: Option<SmallVec<[u64; 2]>>,
        content_hash: Option<CellHash>,
        verification_mode: VerificationMode,
    ) {
        self.backend.update_task_cell(
            task,
            index,
            content,
            updated_key_hashes,
            content_hash,
            verification_mode,
            self,
        );
    }

    fn connect_task(&self, task: TaskId) {
        self.backend
            .connect_task(task, current_task_if_available("connecting task"), self);
    }

    fn mark_own_task_as_finished(&self, task: TaskId) {
        self.backend.mark_own_task_as_finished(task, self);
    }

    /// Creates a future that inherits the current task id and task state. The current global task
    /// will wait for this future to be dropped before exiting.
    #[cfg(feature = "tokio_runtime")]
    fn spawn_detached_for_testing(&self, fut: Pin<Box<dyn Future<Output = ()> + Send + 'static>>) {
        // this is similar to what happens for a local task, except that we keep the local task's
        // state as well.
        let global_task_state = CURRENT_TASK_STATE.with(|ts| ts.clone());
        global_task_state
            .write()
            .unwrap()
            .local_tasks
            .register_detached();
        let wrapped = async move {
            // use a drop guard for panic safety
            struct DropGuard;
            impl Drop for DropGuard {
                fn drop(&mut self) {
                    CURRENT_TASK_STATE
                        .with(|ts| ts.write().unwrap().local_tasks.decrement_in_flight());
                }
            }
            let _guard = DropGuard;
            fut.await;
        };
        tokio::spawn(TURBO_TASKS.scope(
            turbo_tasks(),
            CURRENT_TASK_STATE.scope(global_task_state, wrapped),
        ));
    }

    fn task_statistics(&self) -> &TaskStatisticsApi {
        self.backend.task_statistics()
    }

    #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
    fn stop_and_wait(&self) -> Pin<Box<dyn Future<Output = ()> + Send + 'static>> {
        let this = self.pin();
        Box::pin(async move {
            this.stop_and_wait().await;
        })
    }

    #[cfg(feature = "sync")]
    fn stop_and_wait(&self) -> Pin<Box<dyn Future<Output = ()> + Send + 'static>> {
        let this = self.pin();
        this.backend.stopping(&*this);
        this.stopped.store(true, Ordering::Release);
        Box::pin(std::future::ready(()))
    }

    #[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
    fn subscribe_to_compilation_events(
        &self,
        event_types: Option<Vec<String>>,
    ) -> Receiver<Arc<dyn CompilationEvent>> {
        self.compilation_events.subscribe(event_types)
    }

    #[cfg(all(feature = "tokio_runtime", feature = "sync"))]
    fn subscribe_to_compilation_events(
        &self,
        _event_types: Option<Vec<String>>,
    ) -> Receiver<Arc<dyn CompilationEvent>> {
        // Sync engine has no compilation-event queue (HMR is async-only). Return a
        // channel that never yields events; callers `.recv().await` will park forever,
        // which matches the fact that sync never subscribes.
        let (_tx, rx) = tokio::sync::mpsc::channel(1);
        rx
    }

    fn is_tracking_dependencies(&self) -> bool {
        self.backend.is_tracking_dependencies()
    }
}

async fn wait_for_local_tasks() {
    let listener =
        CURRENT_TASK_STATE.with(|ts| ts.read().unwrap().local_tasks.listen_for_in_flight());
    let Some(listener) = listener else {
        return;
    };
    listener.await;
}

/// How long the sync engine blocks on a task's done-event before declaring a
/// deadlock. Legitimate cross-thread waits (`parallel!` on rayon) resolve in well
/// under this; exceeding it means a re-entrant read the inline engine can't drive.
///
/// Default was 5s (unit-test friendly) but real cold builds (`v0/chat`,
/// `ModuleGraph::from_graphs_inner`, `AppEndpoint::output`) legitimately keep a
/// dependent task waiting 30–90s under contention, so the old default turned
/// slowness into false deadlock panics. Bump to 60s; still overridable via
/// `TURBO_SYNC_DEADLOCK_SECS`. This combines with the progress-aware reset below:
/// a deadline only fires if *no* global progress was observed since it was set.
#[cfg(feature = "sync")]
static SYNC_DEADLOCK_TIMEOUT: std::sync::LazyLock<std::time::Duration> =
    std::sync::LazyLock::new(|| {
        std::env::var("TURBO_SYNC_DEADLOCK_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .map(std::time::Duration::from_secs)
            .unwrap_or(std::time::Duration::from_secs(60))
    });

/// The current task id, or `None` if not inside a task execution. Unlike
/// [`current_task_if_available`] this never panics — a top-level synchronous read
/// (outside any task) legitimately has no reader to track a dependency against.
#[cfg(feature = "sync")]
pub(crate) fn current_reader_or_none() -> Option<TaskId> {
    CURRENT_TASK_STATE
        .try_with(|ts| ts.read().unwrap().task_id)
        .ok()
        .flatten()
}

#[cfg(feature = "sync")]
#[cfg(feature = "sync")]
thread_local! {
    /// Set while [`sync_parallel_read`] is *probing* an item to classify it as a cache hit
    /// (resolve inline, free) or a miss (dispatch to the pool by id). While set, a read-miss
    /// in [`try_read_task_output`]/[`try_read_task_cell`] records the missed task in
    /// [`SYNC_PROBE_MISS`] and returns the backend's `EventListener` (so the future yields
    /// `Pending`) instead of computing the task. Keeping hits off the pool is what makes an
    /// incremental rebuild cheap. Cleared while a task body runs (see `execute_task_inline`),
    /// since work-stealing can re-enter a body on a probing worker.
    static SYNC_PROBE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };

    /// The task a probing read missed on (see [`SYNC_PROBE`]).
    static SYNC_PROBE_MISS: std::cell::Cell<Option<TaskId>> = const { std::cell::Cell::new(None) };

}

/// Run `f` with the [`SYNC_PROBE`] flag set, so a read-miss inside it reports the
/// missed task (via `Err(EventListener)`) instead of computing it inline. Used by the
/// direct (no-poll) probe reads in `vc/raw.rs`. Restores the previous flag on return.
#[cfg(feature = "sync")]
pub(crate) fn with_sync_probe<R>(f: impl FnOnce() -> R) -> R {
    let prev = SYNC_PROBE.with(|p| p.replace(true));
    let r = f();
    SYNC_PROBE.with(|p| p.set(prev));
    r
}

/// Wrap a top-level future (a `run`/root/once task body coming from the async `run`
/// API surface) into a [`NativeTaskFuture`](crate::task::function::NativeTaskFuture).
/// Async mode boxes it as a future the executor polls; the sync engine wraps it in a
/// closure that drives it to completion.
///
/// This is the ONE place the sync build still drives a future: the OUTERMOST `run`
/// boundary, where the caller handed us `Box::pin(async { .. })`. Every *inner* task
/// body is a plain closure (see `task::function`), so the entire task/read/parallel
/// hot path is genuinely async-free. A fully synchronous `run` API would remove even
/// this last driver.
#[cfg(not(feature = "sync"))]
pub(crate) fn future_as_native_task<F>(fut: F) -> crate::task::function::NativeTaskFuture
where
    F: Future<Output = Result<RawVc>> + Send + 'static,
{
    Box::pin(fut)
}
#[cfg(feature = "sync")]
pub(crate) fn future_as_native_task<F>(fut: F) -> crate::task::function::NativeTaskFuture
where
    F: Future<Output = Result<RawVc>> + Send + 'static,
{
    Box::new(move || crate::sync_runtime::sync_poll(fut))
}

/// A stable `u64` token for a task, used as the [`tt_parallel`] wait-graph key (which
/// worker is producing a task / which task a worker is blocked on) for cycle detection.
#[cfg(feature = "sync")]
#[inline]
fn sync_token(task: TaskId) -> u64 {
    task.to_non_zero_u64().get()
}

/// A [`tt_parallel::Blocker`] backed by the backend's done-event `EventListener`: a worker
/// that reaches a task another worker is producing parks here (with compensation) until the
/// producer fires the event. One `block()` consumes the listener (a wait that doesn't miss
/// a wakeup — the listener is registered before the producer completes); `managed_block`
/// then returns and the read loop re-checks the backend. `timeout` bounds the park so a
/// genuine (detection-escaping) cycle fails fast via the read loop's deadline instead of
/// hanging.
#[cfg(feature = "sync")]
struct ListenerBlocker {
    listener: Option<EventListener>,
    timeout: std::time::Duration,
    wake: Arc<ListenerWake>,
}

#[cfg(feature = "sync")]
#[derive(Default)]
struct ListenerWake {
    generation: Mutex<u64>,
    cv: Condvar,
}

#[cfg(feature = "sync")]
impl ListenerWake {
    fn generation(&self) -> u64 {
        *self.generation.lock().unwrap()
    }

    fn wait(&self, generation: u64, timeout: Duration) -> bool {
        let current = self.generation.lock().unwrap();
        if *current == generation {
            let (current, result) = self.cv.wait_timeout(current, timeout).unwrap();
            !result.timed_out() || *current != generation
        } else {
            true
        }
    }
}

#[cfg(feature = "sync")]
impl tt_parallel::WaitWake for ListenerWake {
    fn wake(&self) {
        let mut generation = self.generation.lock().unwrap();
        *generation = generation.wrapping_add(1);
        self.cv.notify_all();
    }
}

#[cfg(feature = "sync")]
struct EventListenerWake(Arc<ListenerWake>);

#[cfg(feature = "sync")]
impl std::task::Wake for EventListenerWake {
    fn wake(self: Arc<Self>) {
        tt_parallel::WaitWake::wake(&*self.0);
    }

    fn wake_by_ref(self: &Arc<Self>) {
        tt_parallel::WaitWake::wake(&*self.0);
    }
}

#[cfg(feature = "sync")]
impl tt_parallel::Blocker for ListenerBlocker {
    fn is_releasable(&mut self) -> bool {
        self.listener.is_none()
    }
    fn cycle_waker(&self) -> Option<Arc<dyn tt_parallel::WaitWake>> {
        Some(self.wake.clone())
    }

    fn block(&mut self, timeout: Option<std::time::Duration>) {
        let Some(listener) = self.listener.as_mut() else {
            return;
        };
        let generation = self.wake.generation();
        let waker = std::task::Waker::from(Arc::new(EventListenerWake(self.wake.clone())));
        let mut context = std::task::Context::from_waker(&waker);
        if Pin::new(&mut *listener).poll(&mut context).is_ready() {
            self.listener = None;
            return;
        }

        let woke = self.wake.wait(
            generation,
            timeout.unwrap_or(self.timeout).min(self.timeout),
        );
        if !woke {
            // Preserve the old deadline behavior: return to the outer read loop so it can
            // refresh progress and either register a new listener or report a true stall.
            self.listener = None;
            return;
        }
        if Pin::new(listener).poll(&mut context).is_ready() {
            self.listener = None;
        }
    }
}

/// Run `f` on the [`tt_parallel`] pool so that all task execution happens on pool workers
/// (where `owning`/`managed_block`/`par_map` are valid). Called from the off-pool entry
/// points — the `run_sync` driver and any top-level `read!`/`parallel!` reached directly
/// from `turbo_tasks_scope` — to bootstrap onto the pool; nested reads are already on a
/// worker and skip this. The pool worker is a fresh thread, so `TURBO_TASKS` is re-bound
/// from the ambient handle (a top-level read has no task context to carry).
#[cfg(feature = "sync")]
fn sync_bootstrap_on_pool<R, F>(f: F) -> R
where
    F: FnOnce() -> R + Send,
    R: Send,
{
    let tt = turbo_tasks();
    sync_pool::pool().run(move |_w| {
        if TURBO_TASKS.try_with(|_| ()).is_ok() {
            f()
        } else {
            TURBO_TASKS.sync_scope(tt, f)
        }
    })
}

/// `TURBO_SYNC_SEQUENTIAL=1` selects the
/// genuinely-serial correctness fallback. Read once and cached. Consumed both here (to skip
/// the [`sync_parallel_read`] probe/fan-out) and by [`sync_pool::pool`] (to run `join` inline).
///
/// Default is **parallel** (`false`): the sync engine fans out `parallel!` / `par_map` / `join`
/// across the work-stealing pool. Set `TURBO_SYNC_SEQUENTIAL=1` to force the fully-inline,
/// fork-free fallback (deadlock-free by construction, single-core-slow) as an A/B oracle.
#[cfg(feature = "sync")]
fn sync_sequential() -> bool {
    static SEQUENTIAL: std::sync::LazyLock<bool> = std::sync::LazyLock::new(|| {
        std::env::var("TURBO_SYNC_SEQUENTIAL")
            .map(|value| value != "0")
            .unwrap_or(false)
    });
    *SEQUENTIAL
}

/// TEMP diagnostic: trace the sync lifecycle of tasks whose id is in
/// `[SYNC_TRACE_LO, SYNC_TRACE_HI]`. Used to find why a specific task is never produced.
#[cfg(feature = "sync")]
fn sync_trace(task: TaskId) -> bool {
    static RANGE: std::sync::LazyLock<Option<(u64, u64)>> = std::sync::LazyLock::new(|| {
        let lo = std::env::var("SYNC_TRACE_LO").ok()?.parse().ok()?;
        let hi = std::env::var("SYNC_TRACE_HI").ok()?.parse().ok()?;
        Some((lo, hi))
    });
    match *RANGE {
        Some((lo, hi)) => {
            let n = task.to_non_zero_u64().get();
            n >= lo && n <= hi
        }
        None => false,
    }
}

/// Read many task outputs in parallel under the synchronous engine (backs the `parallel!`
/// macro). Each item is any awaitable producing `Result<T>` (typically a `Vc`); results are
/// collected in order into a single `Result<Vec<T>>`, matching the async `try_join` shape
/// and yielding the first error by list position.
///
/// Three passes: probe every item (which resolves cache hits for free and *publishes* the
/// misses to the worker pool), help the pool compute the misses, then re-read the missed
/// items on this worker so their dependency edges are attributed to the calling task.
#[cfg(feature = "sync")]
pub fn sync_parallel_read<I>(items: Vec<I>) -> Result<Vec<I::Ok>>
where
    I: crate::vc::SyncParallelRead + Copy + Send,
    I::Ok: Send,
{
    // Bootstrap onto the pool if reached off-pool (a top-level `parallel!` from
    // `turbo_tasks_scope`), so the fan-out and all nested computation run on workers.
    if !tt_parallel::in_worker() {
        return sync_bootstrap_on_pool(move || sync_parallel_read(items));
    }

    // The genuinely-serial correctness fallback, and the degenerate widths where the probe
    // pass would be pure overhead.
    if sync_sequential() || items.len() < 2 {
        return items.into_iter().map(|item| item.sync_par_read()).collect();
    }

    // Pass 1 — probe (no future, no poll). A cache HIT resolves here for free (its value is
    // kept, so it is not read again) and records its dependency edge; a MISS yields the id of
    // the not-yet-computed task, dispatched to the pool below rather than computed here.
    //
    // The probe is also what *publishes* the fan-out. A read miss transitions the task to
    // `Scheduled` and the backend calls `schedule`, which (in sync mode) injects a pool job
    // for it. So by the end of this loop all `n` missed tasks are queued and idle workers can
    // start on them immediately. This is the entire point of probing before computing: the
    // old serial path read item 0 to completion — recursively computing its whole subtree
    // inline — before item 1 was so much as looked at, so items 1..n were never *visible* to
    // the pool at the same time and the fan-out could not overlap.
    let n = items.len();
    crate::sync_stats::bump(&crate::sync_stats::PAR_CALLS);
    crate::sync_stats::bump_by(&crate::sync_stats::PAR_ITEMS, n as u64);
    let mut results: Vec<Option<I::Ok>> = (0..n).map(|_| None).collect();
    let mut misses: Vec<usize> = Vec::new();
    let mut miss_tasks: Vec<TaskId> = Vec::new();
    for (idx, item) in items.iter().enumerate() {
        match (*item).sync_probe()? {
            crate::vc::SyncProbe::Hit(value) => results[idx] = Some(value),
            crate::vc::SyncProbe::Miss(task) => {
                misses.push(idx);
                miss_tasks.push(task);
            }
        }
    }
    crate::sync_stats::bump_by(&crate::sync_stats::PAR_MISSES, miss_tasks.len() as u64);
    crate::sync_stats::bump_by(&crate::sync_stats::PAR_HITS, (n - miss_tasks.len()) as u64);

    // Pass 2 — help. Every miss is queued on the pool (see above); this worker now walks the
    // list claiming whatever the pool has not picked up yet, so it contributes real work
    // instead of idling. `sync_execute_scheduled_task` is the *non-blocking* claim: it
    // returns `false` immediately if another worker already owns the task, so we skip past
    // in-flight items rather than serializing on them. Anything still outstanding is waited
    // for in pass 3.
    //
    // Deliberately NOT fork/join (`par_map`/`join`). A join parks the caller on a latch —
    // a wait the `WaitGraph` cannot see, which strands every in-progress task token pinned to
    // this worker's frozen stack with no way for another worker to satisfy them. That is the
    // resulting cross-layer deadlock is why fan-out used to be disabled inside `owning` task
    // bodies.
    //
    // With claim-or-block the only wait is `managed_block` on a *task token*, and it is only
    // ever reached after a claim has failed — i.e. only when some other worker is actively
    // running that task. So a blocked worker is always blocked on a task owned by a *running*
    // worker; the wait-for graph is exactly `worker -> task -> owning worker`, all of it
    // recorded in the `WaitGraph`; and a cycle in it would imply a cycle in the task graph,
    // which cannot exist. No interleaving of blocks or steals can stall the pool, so fan-out
    // is safe inside owning task bodies — which is what makes the sync engine parallel at all.
    if !miss_tasks.is_empty() {
        let tt = turbo_tasks();
        for &task in &miss_tasks {
            if tt.sync_execute_scheduled_task(task) {
                crate::sync_stats::bump(&crate::sync_stats::PAR_HELP_CLAIMED);
            }
        }
    }

    // Pass 3 — read ONLY the missed items here (now computed), recording dependency edges.
    // Hits were already read + edge-recorded during the probe.
    for idx in misses {
        results[idx] = Some(items[idx].sync_par_read()?);
    }

    Ok(results
        .into_iter()
        .map(|slot| slot.expect("each slot filled by probe hit or miss collection"))
        .collect())
}

/// Run `f` over `items` on the sync worker pool, preserving order, with the ambient
/// `TURBO_TASKS` handle bound on each worker (so `read!` inside `f` works even on a
/// stolen worker). Unlike [`sync_parallel_read`], `f` is an arbitrary closure — used by
/// the sync `GraphTraversal` driver to compute a BFS frontier's edges concurrently.
///
/// IMPORTANT: the closures run on pool workers *without* the caller's `CURRENT_TASK_STATE`,
/// so reads inside `f` are not attributed to the calling task. The caller must only use
/// this when dependency tracking is off (e.g. a one-shot `turbopack build`); with tracking
/// on, use the serial path so dependency edges are recorded correctly.
/// Parallel-map helper for the sync build — the sync counterpart of pushing a whole
/// frontier into a `FuturesUnordered` (see `graph_traversal.rs`).
///
/// This is the single most important fan-out site in the engine. An async task body gets
/// breadth for free: awaiting a dependency suspends the future and frees the worker, so
/// hundreds of in-flight `edges()` computations can have outstanding demands at once and the
/// executor queue fills up with work for every core. A sync task body cannot suspend — a
/// worker that demands a dependency computes it inline, depth-first, on its own stack — so
/// unless a fan-out site explicitly hands work to the pool, the entire traversal runs on one
/// worker and the other cores sit parked on an empty queue.
///
/// `TURBO_SYNC_PARALLEL_MAP=0` restores the serial behaviour (A/B oracle).
///
/// Callers must only use this where reads inside `f` do not need to be attributed to the
/// calling task: `f` runs on pool workers that do not carry the caller's
/// `CURRENT_TASK_STATE`. `GraphTraversal` enforces that by checking
/// `is_tracking_dependencies()`.
#[cfg(feature = "sync")]
pub fn sync_parallel_map<T, R>(items: Vec<T>, f: impl Fn(T) -> R + Sync + Send) -> Vec<R>
where
    T: Send,
    R: Send,
{
    // Trivial sizes: run inline, no pool.
    crate::sync_stats::bump(&crate::sync_stats::PARMAP_CALLS);
    crate::sync_stats::bump_by(&crate::sync_stats::PARMAP_ITEMS, items.len() as u64);
    if items.len() <= 1 || sync_sequential() || !sync_parallel_map_enabled() {
        crate::sync_stats::bump(&crate::sync_stats::PARMAP_SERIAL);
        return items.into_iter().map(&f).collect();
    }
    crate::sync_stats::bump_by(&crate::sync_stats::PARMAP_FANNED, items.len() as u64);
    if !tt_parallel::in_worker() {
        return sync_bootstrap_on_pool(move || sync_parallel_map(items, f));
    }
    let w = tt_parallel::current_worker().expect("in_worker checked above");
    let tt = turbo_tasks();
    // `scoped_fork` is what makes this actually fan out: the caller is inside an `owning`
    // task body, where `join` would otherwise stay inline.
    w.scoped_fork(|w| {
        w.par_map(items, |_w, item| {
            // A stolen chunk runs on a worker with no ambient handle; rebind it so `read!`
            // inside `f` works there.
            if TURBO_TASKS.try_with(|_| ()).is_ok() {
                f(item)
            } else {
                TURBO_TASKS.sync_scope(tt.clone(), || f(item))
            }
        })
    })
}

/// `TURBO_SYNC_PARALLEL_MAP=0` disables [`sync_parallel_map`]'s pool fan-out.
#[cfg(feature = "sync")]
fn sync_parallel_map_enabled() -> bool {
    static ENABLED: std::sync::LazyLock<bool> =
        std::sync::LazyLock::new(|| std::env::var("TURBO_SYNC_PARALLEL_MAP").as_deref() != Ok("0"));
    *ENABLED
}

/// Whether the sync graph-traversal driver may use the *streaming* strategy (every
/// discovered node's `edges()` published to the pool immediately, driver consuming a
/// completion channel — see `visit_streaming` in `graph_traversal.rs`). Off when
/// dependency tracking is on (job reads would not be attributed to the traversal
/// task), or under the `TURBO_SYNC_SEQUENTIAL=1` oracle.
///
/// **Default on** (`TURBO_SYNC_TRAV_STREAMING=0` disables it): the self-draining
/// [`tt_parallel::JobSource`] makes traversal progress independent of free pool capacity,
/// while event-driven managed waits keep its larger fan-out from turning into a per-waiter
/// polling storm. Level-BFS remains available as the fallback/A-B oracle.
#[cfg(feature = "sync")]
pub(crate) fn sync_traversal_streaming_enabled() -> bool {
    static STREAMING: std::sync::LazyLock<bool> = std::sync::LazyLock::new(|| {
        std::env::var("TURBO_SYNC_TRAV_STREAMING").as_deref() != Ok("0")
    });
    !turbo_tasks().is_tracking_dependencies() && !sync_sequential() && *STREAMING
}

/// Create a [`tt_parallel::JobSource`] on the sync worker pool for a streaming graph
/// traversal (see `visit_streaming` in `graph_traversal.rs`): a driver-owned queue that
/// free workers prefer over the injector backlog and that the driver itself can drain,
/// making the traversal's completion independent of pool capacity.
#[cfg(feature = "sync")]
pub(crate) fn sync_job_source() -> tt_parallel::JobSource {
    sync_pool::pool().job_source()
}

/// Push one traversal `edges()` job onto `source`, binding `TURBO_TASKS` on whichever
/// worker runs it (pool workers do not carry the ambient handle) — the sync counterpart
/// of pushing the edges future into the async driver's `FuturesUnordered`.
#[cfg(feature = "sync")]
pub(crate) fn sync_source_push(
    source: &tt_parallel::JobSource,
    token: u64,
    f: impl FnOnce() + Send + 'static,
) {
    let tt = turbo_tasks();
    source.push(token, move |_w| {
        if TURBO_TASKS.try_with(|_| ()).is_ok() {
            f()
        } else {
            TURBO_TASKS.sync_scope(tt, f)
        }
    });
}

/// The synchronous engine's worker pool — the standalone [`tt_parallel`] work-stealing
/// scheduler. It is the sole sync execution engine: the `run_sync` driver and every
/// top-level `read!`/`parallel!` bootstrap onto it ([`sync_bootstrap_on_pool`]), task
/// computation runs as claimed pool work under `owning` ([`TurboTasks::execute_task_inline`]),
/// reads block on a producer via `managed_block` ([`TurboTasks::sync_advance_or_wait`]), and
/// `parallel!` / `schedule` fan out jobs into it. Created once (lazily) and reused.
#[cfg(feature = "sync")]
mod sync_pool {
    use std::sync::OnceLock;

    use tt_parallel::{Config, Pool};

    pub(super) fn pool() -> &'static Pool {
        static POOL: OnceLock<Pool> = OnceLock::new();
        POOL.get_or_init(|| {
            // Honor `TURBO_TASKS_AVAILABLE_PARALLELISM` for the sync worker pool too
            // (`Config::default()` reads `std::thread::available_parallelism()` directly and
            // would otherwise ignore the override). Setting it to `1` forces the fully-serial
            // path in `sync_parallel_read` (no fan-out, no cross-worker waits), which is the
            // deadlock-free fallback while the parallel scheduler's wide-nested-fan-out
            // deadlock is being fixed.
            // Honor `TURBO_TASKS_AVAILABLE_PARALLELISM` for worker count, but keep the
            // default compensation headroom (`max_threads`). A blocked worker relies on
            // compensation to run the task it is waiting on, so capping `max_threads` to the
            // worker count (e.g. 1) would itself deadlock — the wait path is not serial.
            let mut config = Config::default();
            if let Ok(n) = crate::parallel::available_parallelism() {
                config.workers = n.get();
                config.max_threads = config.max_threads.max(n.get());
            }
            // `TURBO_SYNC_SEQUENTIAL=1` forces the
            // genuinely-serial mode — `join` runs inline (no fork/latch/steal) and
            // `sync_parallel_read` skips the probe/fan-out — so no cross-layer wait cycle can
            // form. The deadlock-free correctness fallback and A/B oracle.
            config.sequential = super::sync_sequential();
            let pool = Pool::new(config);
            crate::sync_stats::start_sampler(|| super::sync_pool::pool().snapshot());
            pool
        })
    }

    /// Force the pool to start now (it is otherwise created lazily on first use), so a cold
    /// build doesn't pay worker-thread creation inside its timed region — mirroring the
    /// async build, whose tokio pool exists before any task runs.
    pub(super) fn ensure_started() {
        pool();
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

/// Panics if we're not in a top-level task (e.g. [`run_once`]). Some function calls should only
/// happen in a top-level task (e.g. [`Effects::apply`][crate::Effects::apply]).
#[track_caller]
pub(crate) fn debug_assert_in_top_level_task(message: &str) {
    if !cfg!(debug_assertions) {
        return;
    }

    let in_top_level = CURRENT_TASK_STATE
        .try_with(|ts| ts.read().unwrap().in_top_level_task)
        .unwrap_or(true);
    if !in_top_level {
        panic!("{message}");
    }
}

#[track_caller]
pub(crate) fn debug_assert_not_in_top_level_task(operation: &str) {
    if !cfg!(debug_assertions) {
        return;
    }

    // HACK: We set this inside of `ReadRawVcFuture` to suppress warnings about an internal
    // consistency bug
    let suppressed = SUPPRESS_EVENTUAL_CONSISTENCY_TOP_LEVEL_TASK_CHECK
        .try_with(|&suppressed| suppressed)
        .unwrap_or(false);
    if suppressed {
        return;
    }

    let in_top_level = CURRENT_TASK_STATE
        .try_with(|ts| ts.read().unwrap().in_top_level_task)
        .unwrap_or(false);
    if in_top_level {
        panic!(
            "Eventually consistent read ({operation}) cannot be performed from a top-level task. \
             Top-level tasks (e.g. code inside `.run_once(...)`) must use strongly consistent \
             reads to avoid leaking inconsistent return values."
        );
    }
}

#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
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

#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
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

#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
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

// --- No-tokio (`sync`) free-function counterparts -------------------------------
//
// These keep the `async fn` *signature* of their tokio twins so the test harness
// (`turbo-tasks-testing`) and test bodies can keep writing `run_once(tt, fut).await`
// unchanged. They contain no real `.await` point: `run_once_inline` drives the body
// to completion synchronously (inline compute), so the returned future is always
// `Ready` after a single poll — exactly what `#[turbo_tasks::test]`'s `sync_poll`
// expects. The result value is carried out of the erased `run_once_inline` via a slot.

#[cfg(feature = "sync")]
pub async fn run<T: Send + 'static>(
    tt: Arc<dyn TurboTasksApi>,
    future: impl Future<Output = Result<T>> + Send + 'static,
) -> Result<T> {
    run_once(tt, future).await
}

#[cfg(feature = "sync")]
pub async fn run_once<T: Send + 'static>(
    tt: Arc<dyn TurboTasksApi>,
    future: impl Future<Output = Result<T>> + Send + 'static,
) -> Result<T> {
    let slot: Arc<std::sync::Mutex<Option<T>>> = Arc::new(std::sync::Mutex::new(None));
    let slot_inner = slot.clone();
    tt.run_once_inline(Box::pin(async move {
        let result = future.await?;
        *slot_inner.lock().unwrap() = Some(result);
        Ok(())
    }))?;
    Ok(slot
        .lock()
        .unwrap()
        .take()
        .expect("sync run_once: body did not produce a result"))
}

#[cfg(feature = "sync")]
pub async fn run_once_with_reason<T: Send + 'static>(
    tt: Arc<dyn TurboTasksApi>,
    reason: impl InvalidationReason,
    future: impl Future<Output = Result<T>> + Send + 'static,
) -> Result<T> {
    // The reason only feeds the async aggregated-update-info telemetry path, which
    // the sync engine does not run; the invalidation itself is independent of it.
    let _ = reason;
    run_once(tt, future).await
}

/// Calls [`TurboTasks::dynamic_call`] for the current turbo tasks instance.
pub fn dynamic_call(
    func: &'static NativeFunction,
    this: Option<RawVc>,
    arg: &mut dyn DynTaskInputsStorage,
    inputs_resolved: InputResolution,
    persistence: TaskPersistence,
) -> RawVc {
    with_turbo_tasks(|tt| tt.dynamic_call(func, this, arg, inputs_resolved, persistence))
}

/// Calls [`TurboTasks::trait_call`] for the current turbo tasks instance.
pub fn trait_call(
    trait_method: &'static TraitMethod,
    this: RawVc,
    arg: &mut dyn DynTaskInputsStorage,
    inputs_resolved: InputResolution,
    persistence: TaskPersistence,
) -> RawVc {
    with_turbo_tasks(|tt| tt.trait_call(trait_method, this, arg, inputs_resolved, persistence))
}

pub fn turbo_tasks() -> Arc<dyn TurboTasksApi> {
    TURBO_TASKS.with(|arc| arc.clone())
}

pub fn turbo_tasks_weak() -> Weak<dyn TurboTasksApi> {
    TURBO_TASKS.with(Arc::downgrade)
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

#[cfg(feature = "tokio_runtime")]
pub fn turbo_tasks_future_scope<T>(
    tt: Arc<dyn TurboTasksApi>,
    f: impl Future<Output = T>,
) -> impl Future<Output = T> {
    TURBO_TASKS.scope(tt, f)
}

/// Spawns the given future within the context of the current task.
///
/// Beware: this method is not safe to use in production code. It is only
/// intended for use in tests and for debugging purposes.
#[cfg(feature = "tokio_runtime")]
pub fn spawn_detached_for_testing(f: impl Future<Output = ()> + Send + 'static) {
    turbo_tasks().spawn_detached_for_testing(Box::pin(f));
}

/// Marks the current task as finished. This excludes it from waiting for
/// strongly consistency.
pub fn mark_finished() {
    with_turbo_tasks(|tt| {
        tt.mark_own_task_as_finished(current_task("turbo_tasks::mark_finished()"))
    });
}

/// Returns a [`SerializationInvalidator`] that can be used to invalidate the
/// serialization of the current task cells.
///
/// Also marks the current task as stateful when the `verify_determinism` feature is enabled,
/// since State allocation implies interior mutability.
pub fn get_serialization_invalidator() -> SerializationInvalidator {
    CURRENT_TASK_STATE.with(|cell| {
        let CurrentTaskState {
            task_id,
            #[cfg(feature = "verify_determinism")]
            stateful,
            ..
        } = &mut *cell.write().unwrap();
        #[cfg(feature = "verify_determinism")]
        {
            *stateful = true;
        }
        let Some(task_id) = *task_id else {
            panic!(
                "get_serialization_invalidator() can only be used in the context of a turbo_tasks \
                 task execution"
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

/// Marks the current task as stateful. This is used to indicate that the task
/// has interior mutability (e.g., via [`State`][crate::State]), which means
/// the task may produce different outputs even with the same inputs.
///
/// Only has an effect when the `verify_determinism` feature is enabled.
pub fn mark_stateful() {
    #[cfg(feature = "verify_determinism")]
    {
        CURRENT_TASK_STATE.with(|cell| {
            let CurrentTaskState { stateful, .. } = &mut *cell.write().unwrap();
            *stateful = true;
        })
    }
    // No-op when verify_determinism is not enabled
}

/// Marks the current task context as being in a top-level task. When in a top-level task,
/// eventually consistent reads will panic. It is almost always a mistake to perform an eventually
/// consistent read at the top-level of the application.
pub fn mark_top_level_task() {
    if cfg!(debug_assertions) {
        CURRENT_TASK_STATE.with(|cell| {
            cell.write().unwrap().in_top_level_task = true;
        })
    }
}

/// Unmarks the current task context as being in a top-level task. The opposite of
/// [`mark_top_level_task`].
///
/// This utility can be okay in unit tests, where we're observing the internal behavior of
/// turbo-tasks, but otherwise, it is probably a mistake to call this function.
///
/// Calling this will allow eventually-consistent reads at the top-level, potentially exposing
/// incomplete computations and internal errors caused by eventual consistency that would've been
/// caught when the function was re-run. A strongly-consistent read re-runs parts of a task until
/// all of the dependencies have settled.
pub fn unmark_top_level_task_may_leak_eventually_consistent_state() {
    if cfg!(debug_assertions) {
        CURRENT_TASK_STATE.with(|cell| {
            cell.write().unwrap().in_top_level_task = false;
        })
    }
}

pub fn prevent_gc() {
    // TODO implement garbage collection
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

/// A reference to a task's cell with methods that allow updating the contents
/// of the cell.
///
/// Mutations should not outside of the task that that owns this cell. Doing so
/// is a logic error, and may lead to incorrect caching behavior.
#[derive(Clone, Copy)]
pub struct CurrentCellRef {
    current_task: TaskId,
    index: CellId,
}

type VcReadTarget<T> = <<T as VcValueType>::Read as VcRead<T>>::Target;

impl CurrentCellRef {
    /// Updates the cell if the given `functor` returns a value.
    fn conditional_update<T>(
        &self,
        functor: impl FnOnce(Option<&T>) -> Option<(T, Option<SmallVec<[u64; 2]>>, Option<CellHash>)>,
    ) where
        T: VcValueType,
    {
        self.conditional_update_with_shared_reference(|old_shared_reference| {
            let old_ref = old_shared_reference.and_then(|sr| sr.0.downcast_ref::<T>());
            let (new_value, updated_key_hashes, content_hash) = functor(old_ref)?;
            Some((
                SharedReference::new(triomphe::Arc::new(new_value)),
                updated_key_hashes,
                content_hash,
            ))
        })
    }

    /// Updates the cell if the given `functor` returns a `SharedReference`.
    fn conditional_update_with_shared_reference(
        &self,
        functor: impl FnOnce(
            Option<&SharedReference>,
        ) -> Option<(
            SharedReference,
            Option<SmallVec<[u64; 2]>>,
            Option<CellHash>,
        )>,
    ) {
        let tt = turbo_tasks();
        let cell_content = tt.read_own_task_cell(self.current_task, self.index).ok();
        let update = functor(cell_content.as_ref().and_then(|cc| cc.1.0.as_ref()));
        if let Some((update, updated_key_hashes, content_hash)) = update {
            tt.update_own_task_cell(
                self.current_task,
                self.index,
                CellContent(Some(update)),
                updated_key_hashes,
                content_hash,
                VerificationMode::EqualityCheck,
            )
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
            Some((new_value, None, None))
        });
    }

    /// Replace the current cell's content with `new_shared_reference` if the current content is not
    /// equal by value with the existing content.
    ///
    /// If you already have a `SharedReference`, this is a faster version of
    /// [`CurrentCellRef::compare_and_update`].
    ///
    /// The value should be stored in [`SharedReference`] using the type `T`.
    pub fn compare_and_update_with_shared_reference<T>(&self, new_shared_reference: SharedReference)
    where
        T: VcValueType + PartialEq,
    {
        self.conditional_update_with_shared_reference(|old_sr| {
            if let Some(old_sr) = old_sr {
                let old_value = extract_sr_value::<T>(old_sr);
                let new_value = extract_sr_value::<T>(&new_shared_reference);
                if old_value == new_value {
                    return None;
                }
            }
            Some((new_shared_reference, None, None))
        });
    }

    /// Replace the current cell's content if the new value is different.
    ///
    /// Like [`Self::compare_and_update`], but also computes and stores a hash of the value.
    /// When the cell's transient data is evicted, the stored hash enables the backend to detect
    /// whether the value actually changed without re-comparing values—avoiding unnecessary
    /// downstream invalidation.
    ///
    /// Requires `T: DeterministicHash` in addition to `T: PartialEq`.
    pub fn hashed_compare_and_update<T>(&self, new_value: T)
    where
        T: PartialEq + DeterministicHash + VcValueType,
    {
        self.conditional_update(|old_value| {
            if let Some(old_value) = old_value
                && old_value == &new_value
            {
                return None;
            }
            let content_hash = hash_xxh3_hash128(&new_value);
            Some((new_value, None, Some(content_hash)))
        });
    }

    /// Replace the current cell's content if the new value (from a pre-existing
    /// [`SharedReference`]) is different.
    ///
    /// Like [`Self::compare_and_update_with_shared_reference`], but also passes a hash
    /// for hash-based change detection when transient data has been evicted.
    pub fn hashed_compare_and_update_with_shared_reference<T>(
        &self,
        new_shared_reference: SharedReference,
    ) where
        T: VcValueType + PartialEq + DeterministicHash,
    {
        self.conditional_update_with_shared_reference(move |old_sr| {
            if let Some(old_sr) = old_sr {
                let old_value = extract_sr_value::<T>(old_sr);
                let new_value = extract_sr_value::<T>(&new_shared_reference);
                if old_value == new_value {
                    return None;
                }
            }
            let content_hash = hash_xxh3_hash128(extract_sr_value::<T>(&new_shared_reference));
            Some((new_shared_reference, None, Some(content_hash)))
        });
    }

    /// See [`Self::compare_and_update`], but selectively update individual keys.
    pub fn keyed_compare_and_update<T>(&self, new_value: T)
    where
        T: PartialEq + VcValueType,
        VcReadTarget<T>: KeyedEq,
        <VcReadTarget<T> as KeyedEq>::Key: std::hash::Hash,
    {
        self.conditional_update(|old_value| {
            let Some(old_value) = old_value else {
                return Some((new_value, None, None));
            };
            let old_value = <T as VcValueType>::Read::value_to_target_ref(old_value);
            let new_value_ref = <T as VcValueType>::Read::value_to_target_ref(&new_value);
            let updated_keys = old_value.different_keys(new_value_ref);
            if updated_keys.is_empty() {
                return None;
            }
            // Duplicates are very unlikely, but ok since the backend is deduplicating them
            let updated_key_hashes = updated_keys
                .into_iter()
                .map(|key| FxBuildHasher.hash_one(key))
                .collect();
            Some((new_value, Some(updated_key_hashes), None))
        });
    }

    /// See [`Self::compare_and_update_with_shared_reference`], but selectively update individual
    /// keys.
    pub fn keyed_compare_and_update_with_shared_reference<T>(
        &self,
        new_shared_reference: SharedReference,
    ) where
        T: VcValueType + PartialEq,
        VcReadTarget<T>: KeyedEq,
        <VcReadTarget<T> as KeyedEq>::Key: std::hash::Hash,
    {
        self.conditional_update_with_shared_reference(|old_sr| {
            let Some(old_sr) = old_sr else {
                return Some((new_shared_reference, None, None));
            };
            let old_value = extract_sr_value::<T>(old_sr);
            let old_value = <T as VcValueType>::Read::value_to_target_ref(old_value);
            let new_value = extract_sr_value::<T>(&new_shared_reference);
            let new_value = <T as VcValueType>::Read::value_to_target_ref(new_value);
            let updated_keys = old_value.different_keys(new_value);
            if updated_keys.is_empty() {
                return None;
            }
            // Duplicates are very unlikely, but ok since the backend is deduplicating them
            let updated_key_hashes = updated_keys
                .into_iter()
                .map(|key| FxBuildHasher.hash_one(key))
                .collect();
            Some((new_shared_reference, Some(updated_key_hashes), None))
        });
    }

    /// Unconditionally updates the content of the cell.
    pub fn update<T>(&self, new_value: T, verification_mode: VerificationMode)
    where
        T: VcValueType,
    {
        let tt = turbo_tasks();
        tt.update_own_task_cell(
            self.current_task,
            self.index,
            CellContent(Some(SharedReference::new(triomphe::Arc::new(new_value)))),
            None,
            None,
            verification_mode,
        )
    }

    /// A faster version of [`Self::update`] if you already have a
    /// [`SharedReference`].
    ///
    /// If the passed-in [`SharedReference`] is the same as the existing cell's
    /// by identity, no update is performed.
    ///
    /// The value should be stored in [`SharedReference`] using the type `T`.
    pub fn update_with_shared_reference(
        &self,
        shared_ref: SharedReference,
        verification_mode: VerificationMode,
    ) {
        let tt = turbo_tasks();
        let update = if matches!(verification_mode, VerificationMode::EqualityCheck) {
            let content = tt.read_own_task_cell(self.current_task, self.index).ok();
            if let Some(TypedCellContent(_, CellContent(Some(shared_ref_exp)))) = content {
                // pointer equality (not value equality)
                shared_ref_exp != shared_ref
            } else {
                true
            }
        } else {
            true
        };
        if update {
            tt.update_own_task_cell(
                self.current_task,
                self.index,
                CellContent(Some(shared_ref)),
                None,
                None,
                verification_mode,
            )
        }
    }
}

impl From<CurrentCellRef> for RawVc {
    fn from(cell: CurrentCellRef) -> Self {
        RawVc::task_cell(cell.current_task, cell.index)
    }
}

fn extract_sr_value<T: VcValueType>(sr: &SharedReference) -> &T {
    sr.0.downcast_ref::<T>()
        .expect("cannot update SharedReference of different type")
}

pub fn find_cell_by_type<T: VcValueType>() -> CurrentCellRef {
    find_cell_by_id(T::get_value_type_id())
}

pub fn find_cell_by_id(ty: ValueTypeId) -> CurrentCellRef {
    CURRENT_TASK_STATE.with(|ts| {
        let current_task = current_task("celling turbo_tasks values");
        let mut ts = ts.write().unwrap();
        let map = ts.cell_counters.as_mut().unwrap();
        let current_index = map.entry(ty).or_default();
        let index = *current_index;
        assert!(
            index <= CellId::MAX_CELL_INDEX,
            "task allocated more than {} cells of a single type",
            CellId::MAX_CELL_INDEX as u64 + 1,
        );
        *current_index += 1;
        CurrentCellRef {
            current_task,
            index: CellId::new(ty, index),
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
