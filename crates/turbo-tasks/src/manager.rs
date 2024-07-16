use std::{
    borrow::Cow,
    cell::RefCell,
    future::Future,
    hash::{BuildHasherDefault, Hash},
    mem::take,
    panic::AssertUnwindSafe,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex, Weak,
    },
    thread,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoMap;
use futures::FutureExt;
use rustc_hash::FxHasher;
use serde::{de::Visitor, Deserialize, Serialize};
use tokio::{runtime::Handle, select, task_local};
use tracing::{info_span, instrument, trace_span, Instrument, Level};
use turbo_tasks_malloc::TurboMalloc;

use crate::{
    backend::{Backend, CellContent, PersistentTaskType, TaskExecutionSpec, TransientTaskType},
    capture_future::{self, CaptureFuture},
    event::{Event, EventListener},
    id::{BackendJobId, FunctionId, TraitTypeId},
    id_factory::IdFactory,
    raw_vc::{CellId, RawVc},
    registry,
    trace::TraceRawVcs,
    util::StaticOrArc,
    vc::ReadVcFuture,
    Completion, ConcreteTaskInput, InvalidationReason, InvalidationReasonSet, SharedReference,
    TaskId, TaskIdSet, ValueTypeId, Vc, VcRead, VcValueTrait, VcValueType,
};

pub trait TurboTasksCallApi: Sync + Send {
    fn dynamic_call(&self, func: FunctionId, inputs: Vec<ConcreteTaskInput>) -> RawVc;
    fn native_call(&self, func: FunctionId, inputs: Vec<ConcreteTaskInput>) -> RawVc;
    fn trait_call(
        &self,
        trait_type: TraitTypeId,
        trait_fn_name: Cow<'static, str>,
        inputs: Vec<ConcreteTaskInput>,
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

    /// Eagerly notifies all tasks that were scheduled for notifications via
    /// `schedule_notify_tasks_set()`
    fn notify_scheduled_tasks(&self);

    fn try_read_task_output(
        &self,
        task: TaskId,
        strongly_consistent: bool,
    ) -> Result<Result<RawVc, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        strongly_consistent: bool,
    ) -> Result<Result<RawVc, EventListener>>;

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
    ) -> Result<Result<CellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
    ) -> Result<Result<CellContent, EventListener>>;

    fn read_task_collectibles(&self, task: TaskId, trait_id: TraitTypeId) -> AutoMap<RawVc, i32>;

    fn emit_collectible(&self, trait_type: TraitTypeId, collectible: RawVc);
    fn unemit_collectible(&self, trait_type: TraitTypeId, collectible: RawVc, count: u32);
    fn unemit_collectibles(&self, trait_type: TraitTypeId, collectibles: &AutoMap<RawVc, i32>);

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
    ) -> Result<CellContent>;

    fn read_own_task_cell(&self, task: TaskId, index: CellId) -> Result<CellContent>;
    fn update_own_task_cell(&self, task: TaskId, index: CellId, content: CellContent);
    fn mark_own_task_as_finished(&self, task: TaskId);

    fn connect_task(&self, task: TaskId);

    /// Wraps the given future in the current task.
    fn detached(
        &self,
        f: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>;
}

pub trait TaskIdProvider {
    fn get_fresh_task_id(&self) -> Unused<TaskId>;
    fn reuse_task_id(&self, id: Unused<TaskId>);
}

impl TaskIdProvider for IdFactory<TaskId> {
    fn get_fresh_task_id(&self) -> Unused<TaskId> {
        // Safety: This is a fresh id from the factory
        unsafe { Unused::new_unchecked(self.get()) }
    }

    fn reuse_task_id(&self, id: Unused<TaskId>) {
        unsafe { self.reuse(id.into()) }
    }
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

pub trait TurboTasksBackendApi<B: Backend + 'static>:
    TaskIdProvider + TurboTasksCallApi + Sync + Send
{
    fn pin(&self) -> Arc<dyn TurboTasksBackendApi<B>>;

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
    /// Returns a reference to the backend.
    fn backend(&self) -> &B;
}

impl<B: Backend + 'static> TaskIdProvider for &dyn TurboTasksBackendApi<B> {
    fn get_fresh_task_id(&self) -> Unused<TaskId> {
        (*self).get_fresh_task_id()
    }

    fn reuse_task_id(&self, id: Unused<TaskId>) {
        (*self).reuse_task_id(id)
    }
}

impl TaskIdProvider for &dyn TaskIdProvider {
    fn get_fresh_task_id(&self) -> Unused<TaskId> {
        (*self).get_fresh_task_id()
    }

    fn reuse_task_id(&self, id: Unused<TaskId>) {
        (*self).reuse_task_id(id)
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

pub struct TurboTasks<B: Backend + 'static> {
    this: Weak<Self>,
    backend: B,
    task_id_factory: IdFactory<TaskId>,
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

#[derive(Default)]
struct CurrentTaskState {
    /// Affected tasks, that are tracked during task execution. These tasks will
    /// be invalidated when the execution finishes or before reading a cell
    /// value.
    tasks_to_notify: Vec<TaskId>,

    /// True if the current task has state in cells
    stateful: bool,
}

// TODO implement our own thread pool and make these thread locals instead
task_local! {
    /// The current TurboTasks instance
    static TURBO_TASKS: Arc<dyn TurboTasksApi>;

    static CELL_COUNTERS: RefCell<AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>>;

    static CURRENT_TASK_ID: TaskId;

    static CURRENT_TASK_STATE: RefCell<CurrentTaskState>;
}

impl<B: Backend + 'static> TurboTasks<B> {
    // TODO better lifetime management for turbo tasks
    // consider using unsafe for the task_local turbo tasks
    // that should be safe as long tasks can't outlife turbo task
    // so we probably want to make sure that all tasks are joined
    // when trying to drop turbo tasks
    pub fn new(mut backend: B) -> Arc<Self> {
        let task_id_factory = IdFactory::new();
        backend.initialize(&task_id_factory);
        let this = Arc::new_cyclic(|this| Self {
            this: this.clone(),
            backend,
            task_id_factory,
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
        T: Send,
        F: Fn() -> Fut + Send + Sync + Clone + 'static,
        Fut: Future<Output = Result<Vc<T>>> + Send,
    {
        let id = self.backend.create_transient_task(
            TransientTaskType::Root(Box::new(move || {
                let functor = functor.clone();
                Box::pin(async move { Ok(functor().await?.node) })
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
        T: Send,
        Fut: Future<Output = Result<Vc<T>>> + Send + 'static,
    {
        let id = self.backend.create_transient_task(
            TransientTaskType::Once(Box::pin(async move { Ok(future.await?.node) })),
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
        let raw_result = read_task_output_untracked(self, task_id, false).await?;
        ReadVcFuture::<Completion>::from(raw_result.into_read_untracked_with_turbo_tasks(self))
            .await?;

        Ok(rx.await?)
    }

    /// Call a native function with arguments.
    /// All inputs must be resolved.
    pub(crate) fn native_call(&self, func: FunctionId, inputs: Vec<ConcreteTaskInput>) -> RawVc {
        RawVc::TaskOutput(self.backend.get_or_create_persistent_task(
            PersistentTaskType::Native(func, inputs),
            current_task("turbo_function calls"),
            self,
        ))
    }

    /// Calls a native function with arguments. Resolves arguments when needed
    /// with a wrapper task.
    pub fn dynamic_call(&self, func: FunctionId, inputs: Vec<ConcreteTaskInput>) -> RawVc {
        if inputs.iter().all(|i| i.is_resolved()) {
            self.native_call(func, inputs)
        } else {
            RawVc::TaskOutput(self.backend.get_or_create_persistent_task(
                PersistentTaskType::ResolveNative(func, inputs),
                current_task("turbo_function calls"),
                self,
            ))
        }
    }

    /// Calls a trait method with arguments. First input is the `self` object.
    /// Uses a wrapper task to resolve
    pub fn trait_call(
        &self,
        trait_type: TraitTypeId,
        mut trait_fn_name: Cow<'static, str>,
        inputs: Vec<ConcreteTaskInput>,
    ) -> RawVc {
        // avoid creating a wrapper task if self is already resolved
        // for resolved cells we already know the value type so we can lookup the
        // function
        let first_input = inputs.first().expect("trait call without self argument");
        if let &ConcreteTaskInput::TaskCell(_, CellId { type_id, .. }) = first_input {
            let value_type = registry::get_value_type(type_id);
            let key = (trait_type, trait_fn_name);
            if let Some(native_fn) = value_type.get_trait_method(&key) {
                return self.dynamic_call(*native_fn, inputs);
            }
            trait_fn_name = key.1;
        }

        // create a wrapper task to resolve all inputs
        RawVc::TaskOutput(self.backend.get_or_create_persistent_task(
            PersistentTaskType::ResolveTrait(trait_type, trait_fn_name, inputs),
            current_task("turbo_function calls"),
            self,
        ))
    }

    #[track_caller]
    pub(crate) fn schedule(&self, task_id: TaskId) {
        self.begin_primary_job();
        self.scheduled_tasks.fetch_add(1, Ordering::AcqRel);

        #[cfg(feature = "tokio_tracing")]
        let description = self.backend.get_task_description(task_id);

        let this = self.pin();
        let future = async move {
            #[allow(clippy::blocks_in_conditions)]
            while CURRENT_TASK_STATE
                .scope(Default::default(), async {
                    if this.stopped.load(Ordering::Acquire) {
                        return false;
                    }

                    // Setup thread locals
                    CELL_COUNTERS
                        .scope(Default::default(), async {
                            let Some(TaskExecutionSpec { future, span }) =
                                this.backend.try_start_task_execution(task_id, &*this)
                            else {
                                return false;
                            };

                            async {
                                let (result, duration, memory_usage) =
                                    CaptureFuture::new(AssertUnwindSafe(future).catch_unwind())
                                        .await;

                                let result = result.map_err(|any| match any.downcast::<String>() {
                                    Ok(owned) => Some(Cow::Owned(*owned)),
                                    Err(any) => match any.downcast::<&'static str>() {
                                        Ok(str) => Some(Cow::Borrowed(*str)),
                                        Err(_) => None,
                                    },
                                });
                                this.backend.task_execution_result(task_id, result, &*this);
                                let stateful = this.finish_current_task_state();
                                this.backend.task_execution_completed(
                                    task_id,
                                    duration,
                                    memory_usage,
                                    stateful,
                                    &*this,
                                )
                            }
                            .instrument(span)
                            .await
                        })
                        .await
                })
                .await
            {}
            this.finish_primary_job();
            anyhow::Ok(())
        };

        let future = TURBO_TASKS
            .scope(
                self.pin(),
                CURRENT_TASK_ID.scope(task_id, self.backend.execution_scope(task_id, future)),
            )
            .in_current_span();

        #[cfg(feature = "tokio_tracing")]
        tokio::task::Builder::new()
            .name(&description)
            .spawn(future)
            .unwrap();
        #[cfg(not(feature = "tokio_tracing"))]
        tokio::task::spawn(future);
    }

    fn begin_primary_job(&self) {
        if self
            .currently_scheduled_tasks
            .fetch_add(1, Ordering::AcqRel)
            == 0
        {
            *self.start.lock().unwrap() = Some(Instant::now());
            self.event_start.notify(usize::MAX);
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

    pub async fn wait_task_completion(&self, id: TaskId, fully_settled: bool) -> Result<()> {
        // INVALIDATION: This doesn't return a value, only waits for it to be ready.
        let result = read_task_output_untracked(self, id, fully_settled).await;
        result.map(|_| ())
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
            } = &mut *cell.borrow_mut();
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
    fn dynamic_call(&self, func: FunctionId, inputs: Vec<ConcreteTaskInput>) -> RawVc {
        self.dynamic_call(func, inputs)
    }
    fn native_call(&self, func: FunctionId, inputs: Vec<ConcreteTaskInput>) -> RawVc {
        self.native_call(func, inputs)
    }
    fn trait_call(
        &self,
        trait_type: TraitTypeId,
        trait_fn_name: Cow<'static, str>,
        inputs: Vec<ConcreteTaskInput>,
    ) -> RawVc {
        self.trait_call(trait_type, trait_fn_name, inputs)
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

    fn notify_scheduled_tasks(&self) {
        let _ = CURRENT_TASK_STATE.try_with(|cell| {
            let tasks = {
                let CurrentTaskState {
                    tasks_to_notify, ..
                } = &mut *cell.borrow_mut();
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
        strongly_consistent: bool,
    ) -> Result<Result<RawVc, EventListener>> {
        self.backend.try_read_task_output(
            task,
            current_task("reading Vcs"),
            strongly_consistent,
            self,
        )
    }

    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        strongly_consistent: bool,
    ) -> Result<Result<RawVc, EventListener>> {
        self.backend
            .try_read_task_output_untracked(task, strongly_consistent, self)
    }

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
    ) -> Result<Result<CellContent, EventListener>> {
        self.backend
            .try_read_task_cell(task, index, current_task("reading Vcs"), self)
    }

    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
    ) -> Result<Result<CellContent, EventListener>> {
        self.backend.try_read_task_cell_untracked(task, index, self)
    }

    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
    ) -> Result<CellContent> {
        self.backend
            .try_read_own_task_cell_untracked(current_task, index, self)
    }

    fn read_task_collectibles(&self, task: TaskId, trait_id: TraitTypeId) -> AutoMap<RawVc, i32> {
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

    fn unemit_collectibles(&self, trait_type: TraitTypeId, collectibles: &AutoMap<RawVc, i32>) {
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

    fn read_own_task_cell(&self, task: TaskId, index: CellId) -> Result<CellContent> {
        // INVALIDATION: don't need to track a dependency to itself
        self.try_read_own_task_cell_untracked(task, index)
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

    fn detached(
        &self,
        f: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>> {
        let current_task_id = CURRENT_TASK_ID.get();
        Box::pin(TURBO_TASKS.scope(
            turbo_tasks(),
            CURRENT_TASK_ID.scope(
                current_task_id,
                CELL_COUNTERS.scope(
                    Default::default(),
                    self.backend.execution_scope(current_task_id, f),
                ),
            ),
        ))
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
            } = &mut *cell.borrow_mut();
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
            } = &mut *cell.borrow_mut();
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
}

impl<B: Backend + 'static> TaskIdProvider for TurboTasks<B> {
    fn get_fresh_task_id(&self) -> Unused<TaskId> {
        // Safety: This is a fresh id from the factory
        unsafe { Unused::new_unchecked(self.task_id_factory.get()) }
    }

    fn reuse_task_id(&self, id: Unused<TaskId>) {
        unsafe { self.task_id_factory.reuse(id.into()) }
    }
}

pub(crate) fn current_task(from: &str) -> TaskId {
    match CURRENT_TASK_ID.try_with(|id| *id) {
        Ok(id) => id,
        Err(_) => panic!(
            "{} can only be used in the context of turbo_tasks task execution",
            from
        ),
    }
}

pub struct Invalidator {
    task: TaskId,
    turbo_tasks: Weak<dyn TurboTasksApi>,
    handle: Handle,
}

impl Hash for Invalidator {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.task.hash(state);
    }
}

impl PartialEq for Invalidator {
    fn eq(&self, other: &Self) -> bool {
        self.task == other.task
    }
}

impl Eq for Invalidator {}

impl Invalidator {
    pub fn invalidate(self) {
        let Invalidator {
            task,
            turbo_tasks,
            handle,
        } = self;
        let _ = handle.enter();
        if let Some(turbo_tasks) = turbo_tasks.upgrade() {
            turbo_tasks.invalidate(task);
        }
    }

    pub fn invalidate_with_reason<T: InvalidationReason>(self, reason: T) {
        let Invalidator {
            task,
            turbo_tasks,
            handle,
        } = self;
        let _ = handle.enter();
        if let Some(turbo_tasks) = turbo_tasks.upgrade() {
            turbo_tasks.invalidate_with_reason(
                task,
                (Arc::new(reason) as Arc<dyn InvalidationReason>).into(),
            );
        }
    }

    pub fn invalidate_with_static_reason<T: InvalidationReason>(self, reason: &'static T) {
        let Invalidator {
            task,
            turbo_tasks,
            handle,
        } = self;
        let _ = handle.enter();
        if let Some(turbo_tasks) = turbo_tasks.upgrade() {
            turbo_tasks
                .invalidate_with_reason(task, (reason as &'static dyn InvalidationReason).into());
        }
    }
}

impl TraceRawVcs for Invalidator {
    fn trace_raw_vcs(&self, _context: &mut crate::trace::TraceRawVcsContext) {
        // nothing here
    }
}

impl Serialize for Invalidator {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_newtype_struct("Invalidator", &self.task)
    }
}

impl<'de> Deserialize<'de> for Invalidator {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct V;

        impl<'de> Visitor<'de> for V {
            type Value = Invalidator;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "an Invalidator")
            }

            fn visit_newtype_struct<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                Ok(Invalidator {
                    task: TaskId::deserialize(deserializer)?,
                    turbo_tasks: weak_turbo_tasks(),
                    handle: tokio::runtime::Handle::current(),
                })
            }
        }
        deserializer.deserialize_newtype_struct("Invalidator", V)
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
    let raw_result = read_task_output_untracked(&*tt, task_id, false).await?;
    ReadVcFuture::<Completion>::from(raw_result.into_read_untracked_with_turbo_tasks(&*tt)).await?;

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
    let raw_result = read_task_output_untracked(&*tt, task_id, false).await?;
    ReadVcFuture::<Completion>::from(raw_result.into_read_untracked_with_turbo_tasks(&*tt)).await?;

    Ok(rx.await?)
}

/// Calls [`TurboTasks::dynamic_call`] for the current turbo tasks instance.
pub fn dynamic_call(func: FunctionId, inputs: Vec<ConcreteTaskInput>) -> RawVc {
    with_turbo_tasks(|tt| tt.dynamic_call(func, inputs))
}

/// Calls [`TurboTasks::trait_call`] for the current turbo tasks instance.
pub fn trait_call(
    trait_type: TraitTypeId,
    trait_fn_name: Cow<'static, str>,
    inputs: Vec<ConcreteTaskInput>,
) -> RawVc {
    with_turbo_tasks(|tt| tt.trait_call(trait_type, trait_fn_name, inputs))
}

pub fn turbo_tasks() -> Arc<dyn TurboTasksApi> {
    TURBO_TASKS.with(|arc| arc.clone())
}

pub fn with_turbo_tasks<T>(func: impl FnOnce(&Arc<dyn TurboTasksApi>) -> T) -> T {
    TURBO_TASKS.with(|arc| func(arc))
}

pub fn weak_turbo_tasks() -> Weak<dyn TurboTasksApi> {
    TURBO_TASKS.with(Arc::downgrade)
}

pub fn with_turbo_tasks_for_testing<T>(
    tt: Arc<dyn TurboTasksApi>,
    current_task: TaskId,
    f: impl Future<Output = T>,
) -> impl Future<Output = T> {
    TURBO_TASKS.scope(
        tt,
        CURRENT_TASK_ID.scope(current_task, CELL_COUNTERS.scope(Default::default(), f)),
    )
}

/// Spawns the given future within the context of the current task.
///
/// Beware: this method is not safe to use in production code. It is only
/// intended for use in tests and for debugging purposes.
pub fn spawn_detached(f: impl Future<Output = Result<()>> + Send + 'static) {
    tokio::spawn(turbo_tasks().detached(Box::pin(f.in_current_span())));
}

pub fn current_task_for_testing() -> TaskId {
    CURRENT_TASK_ID.with(|id| *id)
}

/// Get an [`Invalidator`] that can be used to invalidate the current task
/// based on external events.
pub fn get_invalidator() -> Invalidator {
    let handle = Handle::current();
    Invalidator {
        task: current_task("turbo_tasks::get_invalidator()"),
        turbo_tasks: weak_turbo_tasks(),
        handle,
    }
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
pub fn mark_stateful() {
    CURRENT_TASK_STATE.with(|cell| {
        let CurrentTaskState { stateful, .. } = &mut *cell.borrow_mut();
        *stateful = true;
    })
}

pub fn prevent_gc() {
    mark_stateful();
}

/// Notifies scheduled tasks for execution.
pub fn notify_scheduled_tasks() {
    with_turbo_tasks(|tt| tt.notify_scheduled_tasks())
}

pub fn emit<T: VcValueTrait + Send>(collectible: Vc<T>) {
    with_turbo_tasks(|tt| tt.emit_collectible(T::get_trait_type_id(), collectible.node))
}

pub async fn spawn_blocking<T: Send + 'static>(func: impl FnOnce() -> T + Send + 'static) -> T {
    let span = trace_span!("blocking operation").or_current();
    let (result, duration, alloc_info) = tokio::task::spawn_blocking(|| {
        let _guard = span.entered();
        let start = Instant::now();
        let start_allocations = TurboMalloc::allocation_counters();
        let r = func();
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
    strongly_consistent: bool,
) -> Result<RawVc> {
    loop {
        match this.try_read_task_output(id, strongly_consistent)? {
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
    strongly_consistent: bool,
) -> Result<RawVc> {
    loop {
        match this.try_read_task_output_untracked(id, strongly_consistent)? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

pub(crate) async fn read_task_cell(
    this: &dyn TurboTasksApi,
    id: TaskId,
    index: CellId,
) -> Result<CellContent> {
    loop {
        match this.try_read_task_cell(id, index)? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurrentCellRef {
    current_task: TaskId,
    index: CellId,
}

impl CurrentCellRef {
    pub fn conditional_update_shared<
        T: VcValueType + 'static,
        F: FnOnce(Option<&T>) -> Option<T>,
    >(
        &self,
        functor: F,
    ) {
        let tt = turbo_tasks();
        let content = tt
            .read_own_task_cell(self.current_task, self.index)
            .ok()
            .and_then(|v| v.try_cast::<T>());
        let update =
            functor(content.as_deref().map(|content| {
                <<T as VcValueType>::Read as VcRead<T>>::target_to_value_ref(content)
            }));
        if let Some(update) = update {
            tt.update_own_task_cell(
                self.current_task,
                self.index,
                CellContent(Some(SharedReference::new(
                    Some(self.index.type_id),
                    triomphe::Arc::new(update),
                ))),
            )
        }
    }

    pub fn compare_and_update_shared<T: PartialEq + VcValueType + 'static>(&self, new_content: T) {
        self.conditional_update_shared(|old_content| {
            if let Some(old_content) = old_content {
                if PartialEq::eq(&new_content, old_content) {
                    return None;
                }
            }
            Some(new_content)
        });
    }

    pub fn update_shared<T: VcValueType + 'static>(&self, new_content: T) {
        let tt = turbo_tasks();
        tt.update_own_task_cell(
            self.current_task,
            self.index,
            CellContent(Some(SharedReference::new(
                Some(self.index.type_id),
                triomphe::Arc::new(new_content),
            ))),
        )
    }

    pub fn update_shared_reference(&self, shared_ref: SharedReference) {
        let tt = turbo_tasks();
        let content = tt.read_own_task_cell(self.current_task, self.index).ok();
        let update = if let Some(CellContent(Some(content))) = content {
            content != shared_ref
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
    CELL_COUNTERS.with(|cell| {
        let current_task = current_task("celling turbo_tasks values");
        let mut map = cell.borrow_mut();
        let current_index = map.entry(ty).or_default();
        let index = *current_index;
        *current_index += 1;
        CurrentCellRef {
            current_task,
            index: CellId { type_id: ty, index },
        }
    })
}
