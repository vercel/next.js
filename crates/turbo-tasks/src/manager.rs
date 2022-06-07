use std::{
    cell::{Cell, RefCell},
    collections::HashSet,
    fmt::Debug,
    future::Future,
    hash::Hash,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex, Weak,
    },
    time::{Duration, Instant},
};

use anyhow::Result;
use async_std::{
    task::{Builder, JoinHandle},
    task_local,
};
use event_listener::{Event, EventListener};
use serde::{de::Visitor, Deserialize, Serialize};

use crate::{
    backend::{Backend, PersistentTaskType, SlotContent, SlotMappings, TransientTaskType},
    id::{BackgroundJobId, FunctionId, TraitTypeId},
    id_factory::IdFactory,
    raw_vc::RawVc,
    task_input::{SharedReference, SharedValue, TaskInput},
    trace::TraceRawVcs,
    TaskId, Typed, TypedForInput, ValueTypeId, Vc,
};

pub trait TurboTasksCallApi: Sync + Send {
    fn dynamic_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc;
    fn native_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc;
    fn trait_call(
        &self,
        trait_type: TraitTypeId,
        trait_fn_name: String,
        inputs: Vec<TaskInput>,
    ) -> RawVc;
}

pub trait TurboTasksApi: TurboTasksCallApi + Sync + Send {
    fn invalidate(&self, task: TaskId);

    /// Eagerly notifies all tasks that were scheduled for notifications via
    /// `schedule_notify_tasks_set()`
    fn notify_scheduled_tasks(&self);

    fn try_read_task_output(&self, task: TaskId) -> Result<Result<RawVc, EventListener>>;
    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
    ) -> Result<Result<RawVc, EventListener>>;

    fn try_read_task_slot(
        &self,
        task: TaskId,
        index: usize,
    ) -> Result<Result<SlotContent, EventListener>>;
    unsafe fn try_read_task_slot_untracked(
        &self,
        task: TaskId,
        index: usize,
    ) -> Result<Result<SlotContent, EventListener>>;
    unsafe fn try_read_own_task_slot(
        &self,
        current_task: TaskId,
        index: usize,
    ) -> Result<SlotContent>;

    fn get_fresh_slot(&self, task: TaskId) -> usize;
    fn read_current_task_slot(&self, index: usize) -> Result<SlotContent>;
    fn update_current_task_slot(&self, index: usize, content: SlotContent);
}

pub trait TaskIdProvider {
    fn get_fresh_task_id(&self) -> TaskId;
    unsafe fn reuse_task_id(&self, id: TaskId);
}

impl TaskIdProvider for IdFactory<TaskId> {
    fn get_fresh_task_id(&self) -> TaskId {
        self.get()
    }

    unsafe fn reuse_task_id(&self, id: TaskId) {
        unsafe { self.reuse(id) }
    }
}

pub trait TurboTasksBackendApi: TaskIdProvider + TurboTasksCallApi + Sync + Send {
    fn pin(&self) -> Arc<dyn TurboTasksBackendApi>;

    fn schedule(&self, task: TaskId);
    fn schedule_backend_background_job(&self, id: BackgroundJobId);

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `invalidate_tasks()` on all tasks.
    fn schedule_notify_tasks(&self, tasks: &Vec<TaskId>);

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `invalidate_tasks()` on all tasks.
    fn schedule_notify_tasks_set(&self, tasks: &HashSet<TaskId>);
}

impl TaskIdProvider for &dyn TurboTasksBackendApi {
    fn get_fresh_task_id(&self) -> TaskId {
        (*self).get_fresh_task_id()
    }

    unsafe fn reuse_task_id(&self, id: TaskId) {
        unsafe { (*self).reuse_task_id(id) }
    }
}

impl TaskIdProvider for &dyn TaskIdProvider {
    fn get_fresh_task_id(&self) -> TaskId {
        (*self).get_fresh_task_id()
    }

    unsafe fn reuse_task_id(&self, id: TaskId) {
        unsafe { (*self).reuse_task_id(id) }
    }
}

pub struct TurboTasks<B: Backend + 'static> {
    this: Weak<Self>,
    backend: B,
    task_id_factory: IdFactory<TaskId>,
    stopped: AtomicBool,
    currently_scheduled_tasks: AtomicUsize,
    currently_scheduled_background_jobs: AtomicUsize,
    scheduled_tasks: AtomicUsize,
    start: Mutex<Option<Instant>>,
    last_update: Mutex<Option<(Duration, usize)>>,
    event: Event,
    event_background: Event,
}

// TODO implement our own thread pool and make these thread locals instead
task_local! {
    /// The current TurboTasks instance
    static TURBO_TASKS: RefCell<Option<Arc<dyn TurboTasksApi>>> = RefCell::new(None);

    static PREVIOUS_SLOTS: Cell<SlotMappings> = Default::default();

    static CURRENT_TASK_ID: Cell<Option<TaskId>> = Cell::new(None);

    /// Affected [Task]s, that are tracked during task execution
    /// These tasks will be invalidated when the execution finishes
    /// or before reading a slot value
    static TASKS_TO_NOTIFY: RefCell<Vec<TaskId>> = Default::default();
}

impl<B: Backend> TurboTasks<B> {
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
            scheduled_tasks: AtomicUsize::new(0),
            start: Default::default(),
            last_update: Default::default(),
            event: Event::new(),
            event_background: Event::new(),
        });
        this.backend.startup(&*this);
        this
    }

    pub fn pin(&self) -> Arc<Self> {
        self.this.upgrade().unwrap()
    }

    /// Creates a new root task
    pub fn spawn_root_task(
        &self,
        functor: impl Fn() -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>
            + Sync
            + Send
            + 'static,
    ) -> TaskId {
        let id = self
            .backend
            .create_transient_task(TransientTaskType::Root(Box::new(functor)), self);
        self.schedule(id);
        id
    }

    // TODO make sure that all dependencies settle before reading them
    /// Creates a new root task, that is only executed once.
    /// Dependencies will not invalidate the task.
    pub fn spawn_once_task(
        &self,
        future: impl Future<Output = Result<RawVc>> + Send + 'static,
    ) -> TaskId {
        let id = self
            .backend
            .create_transient_task(TransientTaskType::Once(Box::pin(future)), self);
        self.schedule(id);
        id
    }

    pub async fn run_once<T: TraceRawVcs + Sync + Send + 'static>(
        &self,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T> {
        let task_id = self.spawn_once_task(async move {
            let result = future.await?;
            Ok(Vc::slot_new(Mutex::new(RefCell::new(Some(result)))).into())
        });
        // SAFETY: A Once task will never invalidate, therefore we don't need to track a
        // dependency
        let raw_result = unsafe { read_task_output_untracked(self, task_id) }.await?;
        let read_result =
            unsafe { raw_result.into_read_untracked::<Mutex<RefCell<Option<T>>>>(self) }.await?;
        let exchange = &*read_result;
        let guard = exchange.lock().unwrap();
        Ok(guard.take().unwrap())
    }

    /// Call a native function with arguments.
    /// All inputs must be resolved.
    pub(crate) fn native_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
        debug_assert!(inputs.iter().all(|i| i.is_resolved() && !i.is_nothing()));
        RawVc::TaskOutput(self.backend.get_or_create_persistent_task(
            PersistentTaskType::Native(func, inputs.clone()),
            current_task("turbo_function calls"),
            self,
        ))
    }

    /// Calls a native function with arguments. Resolves arguments when needed
    /// with a wrapper [Task].
    pub fn dynamic_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
        if inputs.iter().all(|i| i.is_resolved() && !i.is_nothing()) {
            self.native_call(func, inputs)
        } else {
            RawVc::TaskOutput(self.backend.get_or_create_persistent_task(
                PersistentTaskType::ResolveNative(func, inputs.clone()),
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
        trait_fn_name: String,
        inputs: Vec<TaskInput>,
    ) -> RawVc {
        RawVc::TaskOutput(self.backend.get_or_create_persistent_task(
            PersistentTaskType::ResolveTrait(trait_type, trait_fn_name.clone(), inputs.clone()),
            current_task("turbo_function calls"),
            self,
        ))
    }

    pub(crate) fn schedule(&self, task_id: TaskId) -> JoinHandle<()> {
        let this = self.pin();
        if self
            .currently_scheduled_tasks
            .fetch_add(1, Ordering::AcqRel)
            == 0
        {
            *self.start.lock().unwrap() = Some(Instant::now());
        }
        self.scheduled_tasks.fetch_add(1, Ordering::AcqRel);
        Builder::new()
            // that's expensive
            // .name(format!("{:?} {:?}", &*task, &*task as *const Task))
            .spawn(async move {
                TURBO_TASKS.with(|c| (*c.borrow_mut()) = Some(this.clone()));
                loop {
                    if this.stopped.load(Ordering::Acquire) {
                        break;
                    }
                    if let Some(execution) = this.backend.try_start_task_execution(task_id, &*this)
                    {
                        // Setup thread locals
                        let has_slot_mappings = execution.slot_mappings.is_some();
                        PREVIOUS_SLOTS
                            .with(|cell| cell.set(execution.slot_mappings.unwrap_or_default()));
                        CURRENT_TASK_ID.with(|c| c.set(Some(task_id)));
                        let result = execution.future.await;
                        if let Err(err) = &result {
                            println!("{} errored {}", task_id, err);
                        }
                        let slot_mappings = if has_slot_mappings {
                            PREVIOUS_SLOTS.with(|cell| Some(cell.take()))
                        } else {
                            None
                        };
                        let reexecute = this.backend.task_execution_completed(
                            task_id,
                            slot_mappings,
                            result,
                            &*this,
                        );
                        this.notify_scheduled_tasks_internal();
                        if !reexecute {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                if this
                    .currently_scheduled_tasks
                    .fetch_sub(1, Ordering::AcqRel)
                    == 1
                {
                    // That's not super race-condition-safe, but it's only for statistical
                    // reasons
                    let total = this.scheduled_tasks.load(Ordering::Acquire);
                    this.scheduled_tasks.store(0, Ordering::Release);
                    if let Some(start) = *this.start.lock().unwrap() {
                        *this.last_update.lock().unwrap() = Some((start.elapsed(), total));
                    }
                    this.event.notify(usize::MAX);
                }
            })
            .unwrap()
    }

    pub async fn wait_done(&self) -> (Duration, usize) {
        let listener = self.event.listen();
        if self.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
            listener.await;
        }
        self.last_update.lock().unwrap().unwrap()
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
            let listener = self.event.listen();
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
        Builder::new()
            .spawn(async move {
                TURBO_TASKS.with(|c| (*c.borrow_mut()) = Some(this.clone()));
                if this.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
                    let listener = this.event.listen();
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
            .unwrap();
    }

    fn notify_scheduled_tasks_internal(&self) {
        TASKS_TO_NOTIFY.with(|tasks| {
            let tasks = tasks.take();
            if tasks.is_empty() {
                return;
            }
            self.backend.invalidate_tasks(tasks, self);
        });
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }
}

impl<B: Backend> TurboTasksCallApi for TurboTasks<B> {
    fn dynamic_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
        self.dynamic_call(func, inputs)
    }
    fn native_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
        self.native_call(func, inputs)
    }
    fn trait_call(
        &self,
        trait_type: TraitTypeId,
        trait_fn_name: String,
        inputs: Vec<TaskInput>,
    ) -> RawVc {
        self.trait_call(trait_type, trait_fn_name, inputs)
    }
}

impl<B: Backend> TurboTasksApi for TurboTasks<B> {
    fn invalidate(&self, task: TaskId) {
        self.backend.invalidate_task(task, self);
    }

    fn notify_scheduled_tasks(&self) {
        TASKS_TO_NOTIFY.with(|tasks| {
            let tasks = tasks.take();
            if tasks.is_empty() {
                return;
            }
            self.backend.invalidate_tasks(tasks, self);
        });
    }

    fn try_read_task_output(&self, task: TaskId) -> Result<Result<RawVc, EventListener>> {
        self.backend
            .try_read_task_output(task, current_task("reading Vcs"), self)
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
    ) -> Result<Result<RawVc, EventListener>> {
        unsafe { self.backend.try_read_task_output_untracked(task, self) }
    }

    fn try_read_task_slot(
        &self,
        task: TaskId,
        index: usize,
    ) -> Result<Result<SlotContent, EventListener>> {
        self.backend
            .try_read_task_slot(task, index, current_task("reading Vcs"), self)
    }

    unsafe fn try_read_task_slot_untracked(
        &self,
        task: TaskId,
        index: usize,
    ) -> Result<Result<SlotContent, EventListener>> {
        unsafe { self.backend.try_read_task_slot_untracked(task, index, self) }
    }

    unsafe fn try_read_own_task_slot(
        &self,
        current_task: TaskId,
        index: usize,
    ) -> Result<SlotContent> {
        unsafe {
            self.backend
                .try_read_own_task_slot(current_task, index, self)
        }
    }

    fn get_fresh_slot(&self, task: TaskId) -> usize {
        self.backend.get_fresh_slot(task, self)
    }

    fn read_current_task_slot(&self, index: usize) -> Result<SlotContent> {
        unsafe { Ok(self.try_read_own_task_slot(current_task("reading Vcs"), index)?) }
    }

    fn update_current_task_slot(&self, index: usize, content: SlotContent) {
        self.backend.update_task_slot(
            current_task("slotting turbo_tasks values"),
            index,
            content,
            self,
        );
    }
}

impl<B: Backend> TurboTasksBackendApi for TurboTasks<B> {
    fn pin(&self) -> Arc<dyn TurboTasksBackendApi> {
        self.pin()
    }
    fn schedule_backend_background_job(&self, id: BackgroundJobId) {
        self.schedule_background_job(move |this| async move {
            this.backend.run_background_job(id, &*this).await;
        })
    }

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `dependent_slot_updated()` on all tasks.
    fn schedule_notify_tasks(&self, tasks: &Vec<TaskId>) {
        TASKS_TO_NOTIFY.with(|tasks_list| {
            let mut list = tasks_list.borrow_mut();
            list.extend(tasks.iter());
        });
    }

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `dependent_slot_updated()` on all tasks.
    fn schedule_notify_tasks_set(&self, tasks: &HashSet<TaskId>) {
        TASKS_TO_NOTIFY.with(|tasks_list| {
            let mut list = tasks_list.borrow_mut();
            list.extend(tasks.iter());
        });
    }

    fn schedule(&self, task: TaskId) {
        self.schedule(task);
    }
}

impl<B: Backend> TaskIdProvider for TurboTasks<B> {
    fn get_fresh_task_id(&self) -> TaskId {
        self.task_id_factory.get()
    }

    unsafe fn reuse_task_id(&self, id: TaskId) {
        unsafe { self.task_id_factory.reuse(id) }
    }
}

fn current_task(from: &str) -> TaskId {
    if let Some(id) = CURRENT_TASK_ID.with(|c| c.get()) {
        id
    } else {
        panic!(
            "{} can only be used in the context of turbo_tasks task execution",
            from
        );
    }
}

pub struct Invalidator {
    task: TaskId,
    turbo_tasks: Weak<dyn TurboTasksApi>,
}

impl Invalidator {
    pub fn invalidate(self) {
        let Invalidator { task, turbo_tasks } = self;
        if let Some(turbo_tasks) = turbo_tasks.upgrade() {
            turbo_tasks.invalidate(task);
        }
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
                })
            }
        }
        deserializer.deserialize_newtype_struct("Invalidator", V)
    }
}

/// see [TurboTasks] `dynamic_call`
pub fn dynamic_call(func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
    with_turbo_tasks(|tt| tt.dynamic_call(func, inputs))
}

/// see [TurboTasks] `trait_call`
pub fn trait_call(trait_type: TraitTypeId, trait_fn_name: String, inputs: Vec<TaskInput>) -> RawVc {
    with_turbo_tasks(|tt| tt.trait_call(trait_type, trait_fn_name, inputs))
}

pub fn turbo_tasks() -> Arc<dyn TurboTasksApi> {
    TURBO_TASKS.with(|c| (*c.borrow()).clone()).unwrap()
}

pub fn with_turbo_tasks<T>(func: impl FnOnce(&Arc<dyn TurboTasksApi>) -> T) -> T {
    TURBO_TASKS.with(|c| {
        if let Some(arc) = c.borrow().as_ref() {
            func(arc)
        } else {
            panic!("Outside of TurboTasks");
        }
    })
}

pub fn weak_turbo_tasks() -> Weak<dyn TurboTasksApi> {
    TURBO_TASKS.with(|c| Arc::downgrade(c.borrow().as_ref().unwrap()))
}

/// Get an [Invalidator] that can be used to invalidate the current [Task]
/// based on external events.
pub fn get_invalidator() -> Invalidator {
    Invalidator {
        task: current_task("turbo_tasks::get_invalidator()"),
        turbo_tasks: weak_turbo_tasks(),
    }
}

pub(crate) async fn read_task_output(this: &dyn TurboTasksApi, id: TaskId) -> Result<RawVc> {
    loop {
        match this.try_read_task_output(id)? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

pub(crate) async unsafe fn read_task_output_untracked(
    this: &dyn TurboTasksApi,
    id: TaskId,
) -> Result<RawVc> {
    loop {
        match unsafe { this.try_read_task_output_untracked(id) }? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

pub(crate) async fn read_task_slot(
    this: &dyn TurboTasksApi,
    id: TaskId,
    index: usize,
) -> Result<SlotContent> {
    loop {
        match this.try_read_task_slot(id, index)? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

pub(crate) async unsafe fn read_task_slot_untracked(
    this: &dyn TurboTasksApi,
    id: TaskId,
    index: usize,
) -> Result<SlotContent> {
    loop {
        match unsafe { this.try_read_task_slot_untracked(id, index) }? {
            Ok(result) => return Ok(result),
            Err(listener) => listener.await,
        }
    }
}

pub struct CurrentSlotRef {
    current_task: TaskId,
    index: usize,
    type_id: ValueTypeId,
}

impl CurrentSlotRef {
    pub fn conditional_update_shared<
        T: Send + Sync + 'static,
        F: FnOnce(Option<&T>) -> Option<T>,
    >(
        &self,
        functor: F,
    ) {
        let tt = turbo_tasks();
        let content = tt
            .read_current_task_slot(self.index)
            .ok()
            .and_then(|v| v.try_cast::<T>());
        let update = functor(content.as_ref().map(|read| &**read));
        if let Some(update) = update {
            tt.update_current_task_slot(
                self.index,
                SlotContent(Some(SharedReference(Some(self.type_id), Arc::new(update)))),
            )
        }
    }

    pub fn compare_and_update_shared<T: PartialEq + Send + Sync + 'static>(&self, new_content: T) {
        self.conditional_update_shared(|old_content| {
            if let Some(old_content) = old_content {
                if PartialEq::eq(&new_content, old_content) {
                    return None;
                }
            }
            Some(new_content)
        });
    }

    pub fn update_shared<T: Send + Sync + 'static>(&self, new_content: T) {
        let tt = turbo_tasks();
        tt.update_current_task_slot(
            self.index,
            SlotContent(Some(SharedReference(
                Some(self.type_id),
                Arc::new(new_content),
            ))),
        )
    }
}

impl From<CurrentSlotRef> for RawVc {
    fn from(slot: CurrentSlotRef) -> Self {
        RawVc::TaskSlot(slot.current_task, slot.index)
    }
}

pub fn find_slot_by_key<
    K: Debug + Eq + Ord + Hash + Typed + TypedForInput + Send + Sync + 'static,
>(
    type_id: ValueTypeId,
    key: K,
) -> CurrentSlotRef {
    PREVIOUS_SLOTS.with(|cell| {
        let current_task = current_task("slotting turbo_tasks values");
        let mut map = cell.take();
        let index = *map
            .by_key
            .entry((
                type_id,
                SharedValue(Some(K::get_value_type_id()), Arc::new(key)),
            ))
            .or_insert_with(|| with_turbo_tasks(|tt| tt.get_fresh_slot(current_task)));
        cell.set(map);
        CurrentSlotRef {
            current_task,
            index,
            type_id,
        }
    })
}

pub fn find_slot_by_type(type_id: ValueTypeId) -> CurrentSlotRef {
    PREVIOUS_SLOTS.with(|cell| {
        let current_task = current_task("slotting turbo_tasks values");
        let mut map = cell.take();
        let (ref mut current_index, ref mut list) = map.by_type.entry(type_id).or_default();
        let index = if let Some(i) = list.get(*current_index) {
            *i
        } else {
            let index = turbo_tasks().get_fresh_slot(current_task);
            list.push(index);
            index
        };
        *current_index += 1;
        cell.set(map);
        CurrentSlotRef {
            current_task,
            index,
            type_id,
        }
    })
}
