use std::{
    cell::{Cell, RefCell},
    fmt::Debug,
    future::Future,
    hash::Hash,
    sync::{
        atomic::{AtomicUsize, Ordering},
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
use flurry::HashMap as FHashMap;

use crate::{
    backend::{
        Backend, PersistentTaskType, SlotContent, SlotMappings, TaskType, TransientTaskType,
    },
    id::{BackgroundJobId, FunctionId, TraitTypeId},
    id_factory::IdFactory,
    raw_vc::RawVc,
    task::NativeTaskFuture,
    task_input::{SharedReference, TaskInput},
    trace::TraceRawVcs,
    TaskId, ValueTypeId, Vc,
};

pub trait TurboTasksApi: Sync + Send {
    fn pin(&self) -> Arc<dyn TurboTasksApi>;
    fn dynamic_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc;
    fn native_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc;
    fn trait_call(
        &self,
        trait_type: TraitTypeId,
        trait_fn_name: String,
        inputs: Vec<TaskInput>,
    ) -> RawVc;
    fn invalidate(&self, task: TaskId);
    fn schedule(&self, task: TaskId);

    /// Eagerly notifies all tasks that were scheduled for notifications via
    /// `schedule_notify_tasks()`
    fn notify_scheduled_tasks(&self);

    fn try_read_task_output(&self, task: TaskId) -> Result<Result<RawVc>, EventListener>;
    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
    ) -> Result<Result<RawVc>, EventListener>;

    fn read_task_slot(&self, task: TaskId, index: usize) -> SlotContent;
    unsafe fn read_task_slot_untracked(&self, task: TaskId, index: usize) -> SlotContent;

    fn get_fresh_slot(&self, task: TaskId) -> usize;
    fn read_current_task_slot(&self, index: usize) -> SlotContent;
    fn update_current_task_slot(&self, index: usize, content: SlotContent);

    fn schedule_backend_background_job(&self, id: BackgroundJobId);
}

pub struct TurboTasks<B: Backend + 'static> {
    this: Weak<Self>,
    backend: B,
    task_id_factory: IdFactory<TaskId>,
    resolve_task_cache: FHashMap<(FunctionId, Vec<TaskInput>), TaskId>,
    native_task_cache: FHashMap<(FunctionId, Vec<TaskInput>), TaskId>,
    trait_task_cache: FHashMap<(TraitTypeId, String, Vec<TaskInput>), TaskId>,
    currently_scheduled_tasks: AtomicUsize,
    scheduled_tasks: AtomicUsize,
    start: Mutex<Option<Instant>>,
    last_update: Mutex<Option<(Duration, usize)>>,
    event: Event,
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
    pub fn new(backend: B) -> Arc<Self> {
        Arc::new_cyclic(|this| Self {
            this: this.clone(),
            backend,
            task_id_factory: IdFactory::new(),
            resolve_task_cache: FHashMap::new(),
            native_task_cache: FHashMap::new(),
            trait_task_cache: FHashMap::new(),
            currently_scheduled_tasks: AtomicUsize::new(0),
            scheduled_tasks: AtomicUsize::new(0),
            start: Default::default(),
            last_update: Default::default(),
            event: Event::new(),
        })
    }

    pub fn pin(&self) -> Arc<Self> {
        self.this.upgrade().unwrap()
    }

    /// Creates a new root task
    pub fn spawn_root_task(
        self: &Arc<Self>,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
    ) -> TaskId {
        let id = self.task_id_factory.get();
        let task = TaskType::Transient(TransientTaskType::Root(Box::new(functor)));
        // SAFETY: We have a fresh task id where nobody knows about yet
        unsafe {
            self.backend.insert_task(id, task);
        }
        self.clone().schedule(id);
        id
    }

    // TODO make sure that all dependencies settle before reading them
    /// Creates a new root task, that is only executed once.
    /// Dependencies will not invalidate the task.
    pub fn spawn_once_task(
        &self,
        future: impl Future<Output = Result<RawVc>> + Send + 'static,
    ) -> TaskId {
        let id = self.task_id_factory.get();
        let task = TaskType::Transient(TransientTaskType::Once(Box::pin(future)));
        // SAFETY: We have a fresh task id where nobody knows about yet
        unsafe {
            self.backend.insert_task(id, task);
        }
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

    /// Helper to get a [Task] from a HashMap or create a new one
    fn cached_call<'de, K: Ord + PartialEq + Clone + Hash + Sync + Send + 'static>(
        &self,
        map: &FHashMap<K, TaskId>,
        key: K,
        create_new: impl FnOnce(&K) -> TaskType,
    ) -> RawVc {
        let map = map.pin();
        let result = if let Some(task) = map.get(&key).map(|guard| *guard) {
            // fast pass without creating a new task
            self.backend
                .connect_task_child(current_task("turbo_function calls"), task, self);

            // TODO maybe force (background) scheduling to avoid inactive tasks hanging in
            // "in progress" until they become active
            RawVc::TaskOutput(task)
        } else {
            // slow pass with key lock
            let id = self.task_id_factory.get();
            let task_type = create_new(&key);
            // SAFETY: We have a fresh task id where nobody knows about yet
            unsafe {
                self.backend.insert_task(id, task_type);
            }
            let result_task = match map.try_insert(key, id) {
                Ok(_) => {
                    // This is the most likely case
                    id
                }
                Err(r) => {
                    // SAFETY: We have a fresh task id where nobody knows about yet
                    unsafe {
                        self.backend.remove_task(id);
                        self.task_id_factory.reuse(id);
                    }
                    *r.current
                }
            };
            self.backend.connect_task_child(
                current_task("turbo_function calls"),
                result_task,
                self,
            );
            RawVc::TaskOutput(result_task)
        };
        // keep the guard alive over the whole function
        // to avoid load on GC
        drop(map);
        result
    }

    /// Call a native function with arguments.
    /// All inputs must be resolved.
    pub(crate) fn native_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
        debug_assert!(inputs.iter().all(|i| i.is_resolved() && !i.is_nothing()));
        self.cached_call(&self.native_task_cache, (func, inputs), |(_, inputs)| {
            TaskType::Persistent(PersistentTaskType::Native(func, inputs.clone()))
        })
    }

    /// Calls a native function with arguments. Resolves arguments when needed
    /// with a wrapper [Task].
    pub fn dynamic_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
        if inputs.iter().all(|i| i.is_resolved() && !i.is_nothing()) {
            self.native_call(func, inputs)
        } else {
            self.cached_call(&self.resolve_task_cache, (func, inputs), |(_, inputs)| {
                TaskType::Persistent(PersistentTaskType::ResolveNative(func, inputs.clone()))
            })
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
        self.cached_call(
            &self.trait_task_cache,
            (trait_type, trait_fn_name, inputs),
            |(_, trait_fn_name, inputs)| {
                TaskType::Persistent(PersistentTaskType::ResolveTrait(
                    trait_type,
                    trait_fn_name.clone(),
                    inputs.clone(),
                ))
            },
        )
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
                loop {
                    if let Some(execution) = this.backend.try_start_task_execution(task_id, &*this)
                    {
                        // Setup thread locals
                        TURBO_TASKS.with(|c| (*c.borrow_mut()) = Some(this.clone()));
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
        self.event.listen().await;
        self.last_update.lock().unwrap().unwrap()
    }

    pub(crate) fn schedule_background_job<
        T: FnOnce(Arc<TurboTasks<B>>) -> F + Send + 'static,
        F: Future<Output = ()> + Send + 'static,
    >(
        &self,
        func: T,
    ) {
        let this = self.pin();
        Builder::new()
            .spawn(async move {
                TURBO_TASKS.with(|c| (*c.borrow_mut()) = Some(this.clone()));
                if this.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
                    let listener = this.event.listen();
                    if this.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
                        listener.await;
                    }
                }
                func(this).await;
            })
            .unwrap();
    }

    fn notify_scheduled_tasks_internal(&self) {
        TASKS_TO_NOTIFY.with(|tasks| {
            let tasks = tasks.take();
            if tasks.is_empty() {
                return;
            }
            self.backend.notify_slot_change(tasks, self);
        });
    }

    pub fn with_all_cached_tasks(&self, mut func: impl FnMut(TaskId)) {
        let guard = &self.native_task_cache.guard();
        for id in self
            .resolve_task_cache
            .values(guard)
            .chain(self.native_task_cache.values(guard))
            .chain(self.trait_task_cache.values(guard))
        {
            func(*id);
        }
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }
}

impl<B: Backend> TurboTasksApi for TurboTasks<B> {
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
    fn invalidate(&self, task: TaskId) {
        self.backend.invalidate_task(task, self);
    }
    fn schedule(&self, task: TaskId) {
        self.schedule(task);
    }

    fn notify_scheduled_tasks(&self) {
        TASKS_TO_NOTIFY.with(|tasks| {
            let tasks = tasks.take();
            if tasks.is_empty() {
                return;
            }
            self.backend.notify_slot_change(tasks, self);
        });
    }

    fn try_read_task_output(&self, task: TaskId) -> Result<Result<RawVc>, EventListener> {
        self.backend
            .try_read_task_output(task, current_task("reading Vcs"))
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
    ) -> Result<Result<RawVc>, EventListener> {
        unsafe { self.backend.try_read_task_output_untracked(task) }
    }

    fn read_task_slot(&self, task: TaskId, index: usize) -> SlotContent {
        self.backend
            .read_task_slot(task, index, current_task("reading Vcs"))
    }

    unsafe fn read_task_slot_untracked(&self, task: TaskId, index: usize) -> SlotContent {
        unsafe { self.backend.read_task_slot_untracked(task, index) }
    }

    fn get_fresh_slot(&self, task: TaskId) -> usize {
        self.backend.get_fresh_slot(task)
    }

    fn read_current_task_slot(&self, index: usize) -> SlotContent {
        unsafe { self.read_task_slot_untracked(current_task("reading Vcs"), index) }
    }

    fn update_current_task_slot(&self, index: usize, content: SlotContent) {
        self.backend
            .update_task_slot(current_task("slotting turbo_tasks values"), index, content);
    }

    fn pin(&self) -> Arc<dyn TurboTasksApi> {
        self.pin()
    }

    fn schedule_backend_background_job(&self, id: BackgroundJobId) {
        self.schedule_background_job(move |this| async move {
            this.backend.run_background_job(id, &*this).await;
        })
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

/// Enqueues tasks for notification of changed dependencies. This will
/// eventually call `dependent_slot_updated()` on all tasks.
pub(crate) fn schedule_notify_tasks<'a>(tasks_iter: impl Iterator<Item = &'a TaskId>) {
    TASKS_TO_NOTIFY.with(|tasks| {
        let mut list = tasks.borrow_mut();
        list.extend(tasks_iter);
    });
}

pub(crate) async fn read_task_output(this: &dyn TurboTasksApi, id: TaskId) -> Result<RawVc> {
    loop {
        match this.try_read_task_output(id) {
            Ok(result) => return result,
            Err(listener) => listener.await,
        }
    }
}

pub(crate) async unsafe fn read_task_output_untracked(
    this: &dyn TurboTasksApi,
    id: TaskId,
) -> Result<RawVc> {
    loop {
        match unsafe { this.try_read_task_output_untracked(id) } {
            Ok(result) => return result,
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
        let content = tt.read_current_task_slot(self.index).try_cast::<T>();
        let update = functor(content.as_ref().map(|read| &**read));
        if let Some(update) = update {
            tt.update_current_task_slot(
                self.index,
                SlotContent::SharedReference(self.type_id, SharedReference(Arc::new(update))),
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
            SlotContent::SharedReference(self.type_id, SharedReference(Arc::new(new_content))),
        )
    }
}

impl From<CurrentSlotRef> for RawVc {
    fn from(slot: CurrentSlotRef) -> Self {
        RawVc::TaskSlot(slot.current_task, slot.index)
    }
}

pub fn find_slot_by_key<K: Debug + Eq + Ord + Hash + Send + Sync + 'static>(
    type_id: ValueTypeId,
    key: K,
) -> CurrentSlotRef {
    PREVIOUS_SLOTS.with(|cell| {
        let current_task = current_task("slotting turbo_tasks values");
        let mut map = cell.take();
        let index = *map
            .by_key
            .entry((type_id, Box::new(key)))
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
