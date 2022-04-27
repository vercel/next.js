use std::{
    cell::RefCell,
    collections::HashSet,
    future::Future,
    hash::Hash,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex, Weak,
    },
    time::{Duration, Instant},
};

use anyhow::{anyhow, Result};
use async_std::{
    task::{Builder, JoinHandle},
    task_local,
};
use event_listener::{Event, EventListener};
use flurry::HashMap as FHashMap;

use crate::{
    backend::Backend,
    id::{FunctionId, TraitTypeId},
    id_factory::IdFactory,
    output::Output,
    raw_vc::RawVc,
    slot::SlotContent,
    task::NativeTaskFuture,
    task_input::TaskInput,
    trace::TraceRawVcs,
    Task, TaskId, Vc,
};

pub trait TurboTasksApi: Sync + Send {
    fn dynamic_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc;
    fn trait_call(
        &self,
        trait_type: TraitTypeId,
        trait_fn_name: String,
        inputs: Vec<TaskInput>,
    ) -> RawVc;
    fn invalidate(&self, task: TaskId);

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
        let task = Task::new_root(id, functor);
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
        let task = Task::new_once(id, future);
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
    fn cached_call<K: Ord + PartialEq + Clone + Hash + Sync + Send + 'static>(
        &self,
        map: &FHashMap<K, TaskId>,
        key: K,
        create_new: impl FnOnce(TaskId) -> Task,
    ) -> RawVc {
        let map = map.pin();
        let result = if let Some(task) = map.get(&key).map(|guard| *guard) {
            // fast pass without creating a new task
            self.with_task(Task::current().unwrap(), |parent| {
                parent.connect_child(task, self)
            });
            // TODO maybe force (background) scheduling to avoid inactive tasks hanging in
            // "in progress" until they become active
            RawVc::TaskOutput(task)
        } else {
            // slow pass with key lock
            let id = self.task_id_factory.get();
            let new_task = create_new(id);
            // SAFETY: We have a fresh task id where nobody knows about yet
            unsafe {
                self.backend.insert_task(id, new_task);
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
            self.with_task(Task::current().unwrap(), |parent| {
                parent.connect_child(result_task, self)
            });
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
        self.cached_call(&self.native_task_cache, (func, inputs.clone()), |id| {
            Task::new_native(id, inputs, func)
        })
    }

    /// Calls a native function with arguments. Resolves arguments when needed
    /// with a wrapper [Task].
    pub fn dynamic_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
        if inputs.iter().all(|i| i.is_resolved() && !i.is_nothing()) {
            self.native_call(func, inputs)
        } else {
            self.cached_call(&self.resolve_task_cache, (func, inputs.clone()), |id| {
                Task::new_resolve_native(id, inputs, func)
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
            (trait_type, trait_fn_name.clone(), inputs.clone()),
            |id| Task::new_resolve_trait(id, trait_type, trait_fn_name, inputs),
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
                let execution = this.with_task(task_id, |task| {
                    if task.execution_started(&this) {
                        Task::set_current(task, task_id);
                        let tt = this.clone();
                        TURBO_TASKS.with(|c| (*c.borrow_mut()) = Some(tt));
                        Some(task.execute(&this))
                    } else {
                        None
                    }
                });
                if let Some(execution) = execution {
                    let result = execution.await;
                    this.with_task(task_id, |task| {
                        if let Err(err) = &result {
                            println!("Task {} errored  {}", task, err);
                        }
                        task.execution_result(result);
                        this.notify_scheduled_tasks_internal();
                        task.execution_completed(this.clone());
                    });
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

    fn try_get_output<T, F: FnOnce(&mut Output) -> T>(
        &self,
        id: TaskId,
        func: F,
    ) -> Result<T, EventListener> {
        self.with_task(id, |task| task.get_or_wait_output(func))
    }

    pub async fn wait_done(&self) -> (Duration, usize) {
        self.event.listen().await;
        self.last_update.lock().unwrap().unwrap()
    }

    pub(crate) fn with_task<T>(&self, id: TaskId, func: impl FnOnce(&Task) -> T) -> T {
        self.backend.with_task(id, func)
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
            for task in tasks.into_iter() {
                self.with_task(task, |task| {
                    task.dependent_slot_updated(self);
                });
            }
        });
    }

    /// Schedules a background job that will deactive a list of tasks, when
    /// their active_parents count is still zero.
    pub(crate) fn schedule_deactivate_tasks(&self, tasks: Vec<TaskId>) {
        self.schedule_background_job(|tt| async move {
            Task::deactivate_tasks(tasks, &tt);
        });
    }

    /// Schedules a background job that will decrease the active_parents count
    /// from each task by one and might deactive them after that.
    pub(crate) fn schedule_remove_tasks(&self, tasks: HashSet<TaskId>) {
        self.schedule_background_job(|tt| async move {
            for id in tasks {
                tt.with_task(id, |task| {
                    task.remove(&tt);
                });
            }
        });
    }

    pub fn with_all_cached_tasks(&self, mut func: impl FnMut(&Task)) {
        let guard = &self.native_task_cache.guard();
        for id in self
            .resolve_task_cache
            .values(guard)
            .chain(self.native_task_cache.values(guard))
            .chain(self.trait_task_cache.values(guard))
        {
            self.backend.with_task(*id, &mut func)
        }
    }
}

impl<B: Backend> TurboTasksApi for TurboTasks<B> {
    fn dynamic_call(&self, func: FunctionId, inputs: Vec<TaskInput>) -> RawVc {
        self.dynamic_call(func, inputs)
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
        if let Some(this) = self.this.upgrade() {
            self.with_task(task, |task| task.invaldate(&this));
        }
    }

    fn notify_scheduled_tasks(&self) {
        TASKS_TO_NOTIFY.with(|tasks| {
            let tasks = tasks.take();
            if tasks.is_empty() {
                return;
            }
            for task in tasks.into_iter() {
                self.with_task(task, |task| {
                    task.dependent_slot_updated(self);
                });
            }
        });
    }

    fn try_read_task_output(&self, task: TaskId) -> Result<Result<RawVc>, EventListener> {
        self.try_get_output(task, |output| {
            Task::add_dependency_to_current(RawVc::TaskOutput(task));
            output.read(Task::current().unwrap())
        })
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
    ) -> Result<Result<RawVc>, EventListener> {
        self.try_get_output(task, |output| unsafe { output.read_untracked() })
    }

    fn read_task_slot(&self, task: TaskId, index: usize) -> SlotContent {
        Task::add_dependency_to_current(RawVc::TaskSlot(task, index));
        self.with_task(task, |task| {
            task.with_slot_mut(index, |slot| slot.read_content(Task::current().unwrap()))
        })
    }

    unsafe fn read_task_slot_untracked(&self, task: TaskId, index: usize) -> SlotContent {
        self.with_task(task, |task| {
            task.with_slot(index, |slot| unsafe { slot.read_content_untracked() })
        })
    }

    fn get_fresh_slot(&self, task: TaskId) -> usize {
        self.with_task(task, |task| task.get_fresh_slot())
    }

    fn read_current_task_slot(&self, index: usize) -> SlotContent {
        unsafe { self.read_task_slot_untracked(Task::current().unwrap(), index) }
    }

    fn update_current_task_slot(&self, index: usize, content: SlotContent) {
        self.with_task(Task::current().unwrap(), |task| {
            task.with_slot_mut(index, |slot| slot.assign(content))
        })
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
        task: Task::current()
            .ok_or_else(|| {
                anyhow!("turbo_tasks::get_invalidator() can only be used in the context of a Task")
            })
            .unwrap(),
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
