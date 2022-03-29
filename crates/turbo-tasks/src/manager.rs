use std::{
    cell::RefCell,
    collections::HashSet,
    future::Future,
    hash::Hash,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};
use async_std::{
    task::{Builder, JoinHandle},
    task_local,
};
use chashmap::CHashMap;
use event_listener::Event;

use crate::{
    output::OutputContent, slot_ref::SlotRef, task::NativeTaskFuture, task_input::TaskInput,
    NativeFunction, NothingRef, Task, TraitType,
};

pub struct TurboTasks {
    resolve_task_cache: CHashMap<(&'static NativeFunction, Vec<TaskInput>), Arc<Task>>,
    native_task_cache: CHashMap<(&'static NativeFunction, Vec<TaskInput>), Arc<Task>>,
    trait_task_cache: CHashMap<(&'static TraitType, String, Vec<TaskInput>), Arc<Task>>,
    currently_scheduled_tasks: AtomicUsize,
    scheduled_tasks: AtomicUsize,
    start: Mutex<Option<Instant>>,
    last_update: Mutex<Option<(Duration, usize)>>,
    event: Event,
}

// TODO implement our own thread pool and make these thread locals instead
task_local! {
    /// The current TurboTasks instance
    static TURBO_TASKS: RefCell<Option<Arc<TurboTasks>>> = RefCell::new(None);

    /// Affected [Task]s, that are tracked during task execution
    /// These tasks will be invalidated when the execution finishes
    /// or before reading a slot value
    static TASKS_TO_NOTIFY: RefCell<Vec<Arc<Task>>> = Default::default();
}

impl TurboTasks {
    // TODO better lifetime management for turbo tasks
    // consider using unsafe for the task_local turbo tasks
    // that should be safe as long tasks can't outlife turbo task
    // so we probably want to make sure that all tasks are joined
    // when trying to drop turbo tasks
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            resolve_task_cache: CHashMap::new(),
            native_task_cache: CHashMap::new(),
            trait_task_cache: CHashMap::new(),
            currently_scheduled_tasks: AtomicUsize::new(0),
            scheduled_tasks: AtomicUsize::new(0),
            start: Default::default(),
            last_update: Default::default(),
            event: Event::new(),
        })
    }

    /// Creates a new root task
    pub fn spawn_root_task(
        self: &Arc<Self>,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
    ) -> Arc<Task> {
        let task = Arc::new(Task::new_root(functor));
        self.clone().schedule(task.clone());
        task
    }

    // TODO make sure that all dependencies settle before reading them
    /// Creates a new root task, that is only executed once.
    /// Dependencies will not invalidate the task.
    pub fn spawn_once_task(
        self: &Arc<Self>,
        future: impl Future<Output = Result<SlotRef>> + Send + 'static,
    ) -> Arc<Task> {
        let task = Arc::new(Task::new_once(future));
        self.clone().schedule(task.clone());
        task
    }

    pub async fn run_once<T: Send + 'static>(
        self: &Arc<Self>,
        future: impl Future<Output = Result<T>> + Send + 'static,
    ) -> Result<T> {
        let exchange = Arc::new(Mutex::new(None));
        let exchange_clone = exchange.clone();
        let task = self.spawn_once_task(async move {
            let result = future.await;
            *exchange_clone.lock().unwrap() = Some(result);
            Ok(NothingRef::new().into())
        });
        task.with_done_output(move |output| match &output.content {
            OutputContent::Empty => Err(anyhow!(
                "execution failed for unknown reasons (output is empty)"
            )),
            OutputContent::Link(_) => exchange.lock().unwrap().take().unwrap_or_else(|| {
                Err(anyhow!(
                    "execution failed for unknown reasons (exchange is empty)"
                ))
            }),
            OutputContent::Error(err) => {
                Err(err.clone()).context(anyhow!("execution failed with error"))
            }
        })
        .await
    }

    /// Helper to get a [Task] from a HashMap or create a new one
    fn cached_call<K: PartialEq + Hash>(
        self: &Arc<Self>,
        map: &CHashMap<K, Arc<Task>>,
        key: K,
        create_new: impl FnOnce() -> Task,
    ) -> SlotRef {
        if let Some(cached) = map.get(&key) {
            // fast pass without key lock (only read lock on table)
            let task = cached.clone();
            drop(cached);
            Task::with_current(|parent| task.connect_parent(parent));
            // TODO maybe force (background) scheduling to avoid inactive tasks hanging in
            // "in progress" until they become active
            SlotRef::TaskOutput(task)
        } else {
            // slow pass with key lock
            let new_task = Arc::new(create_new());
            let mut result_task = new_task.clone();
            map.alter(key, |old| match old {
                Some(t) => {
                    result_task = t.clone();
                    Some(t)
                }
                None => {
                    // This is the most likely case
                    // so we want this to be as fast as possible
                    // avoiding locking the map too long
                    Some(new_task)
                }
            });
            let task = result_task;
            Task::with_current(|parent| task.connect_parent(parent));
            SlotRef::TaskOutput(task)
        }
    }

    /// Call a native function with arguments.
    /// All inputs must be resolved.
    pub(crate) fn native_call(
        self: &Arc<Self>,
        func: &'static NativeFunction,
        inputs: Vec<TaskInput>,
    ) -> SlotRef {
        debug_assert!(inputs.iter().all(|i| i.is_resolved() && !i.is_nothing()));
        self.cached_call(&self.native_task_cache, (func, inputs.clone()), || {
            Task::new_native(inputs, func)
        })
    }

    /// Calls a native function with arguments. Resolves arguments when needed
    /// with a wrapper [Task].
    pub fn dynamic_call(
        self: &Arc<Self>,
        func: &'static NativeFunction,
        inputs: Vec<TaskInput>,
    ) -> SlotRef {
        if inputs.iter().all(|i| i.is_resolved() && !i.is_nothing()) {
            self.native_call(func, inputs)
        } else {
            self.cached_call(&self.resolve_task_cache, (func, inputs.clone()), || {
                Task::new_resolve_native(inputs, func)
            })
        }
    }

    /// Calls a trait method with arguments. First input is the `self` object.
    /// Uses a wrapper task to resolve
    pub fn trait_call(
        self: &Arc<Self>,
        trait_type: &'static TraitType,
        trait_fn_name: String,
        inputs: Vec<TaskInput>,
    ) -> SlotRef {
        self.cached_call(
            &self.trait_task_cache,
            (trait_type, trait_fn_name.clone(), inputs.clone()),
            || Task::new_resolve_trait(trait_type, trait_fn_name, inputs),
        )
    }

    pub(crate) fn schedule(self: Arc<Self>, task: Arc<Task>) -> JoinHandle<()> {
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
                if task.execution_started(&self) {
                    Task::set_current(task.clone());
                    let tt = self.clone();
                    TURBO_TASKS.with(|c| (*c.borrow_mut()) = Some(tt));
                    let result = task.execute(self.clone()).await;
                    if let Err(err) = &result {
                        println!("Task {} errored  {}", task, err);
                    }
                    task.execution_result(result);
                    self.notify_scheduled_tasks_with_turbo_tasks();
                    task.execution_completed(self.clone());
                }
                if self
                    .currently_scheduled_tasks
                    .fetch_sub(1, Ordering::AcqRel)
                    == 1
                {
                    // That's not super race-condition-safe, but it's only for statistical reasons
                    let total = self.scheduled_tasks.load(Ordering::Acquire);
                    self.scheduled_tasks.store(0, Ordering::Release);
                    if let Some(start) = *self.start.lock().unwrap() {
                        *self.last_update.lock().unwrap() = Some((start.elapsed(), total));
                    }
                    self.event.notify(usize::MAX);
                }
            })
            .unwrap()
    }

    pub async fn wait_done(self: &Arc<Self>) -> (Duration, usize) {
        self.event.listen().await;
        self.last_update.lock().unwrap().unwrap()
    }

    pub(crate) fn current() -> Option<Arc<Self>> {
        TURBO_TASKS.with(|c| (*c.borrow()).clone())
    }

    pub(crate) fn with_current<T>(func: impl FnOnce(&Arc<TurboTasks>) -> T) -> T {
        TURBO_TASKS.with(|c| {
            if let Some(arc) = c.borrow().as_ref() {
                func(arc)
            } else {
                panic!("Outside of TurboTasks");
            }
        })
    }

    pub(crate) fn schedule_background_job(
        self: Arc<Self>,
        job: impl Future<Output = ()> + Send + 'static,
    ) {
        Builder::new()
            .spawn(async move {
                TURBO_TASKS.with(|c| (*c.borrow_mut()) = Some(self.clone()));
                if self.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
                    let listener = self.event.listen();
                    if self.currently_scheduled_tasks.load(Ordering::Acquire) != 0 {
                        listener.await;
                    }
                }
                job.await;
            })
            .unwrap();
    }

    /// Eagerly notifies all tasks that were scheduled for notifications via
    /// `schedule_notify_tasks()`
    pub(crate) fn notify_scheduled_tasks() {
        TASKS_TO_NOTIFY.with(|tasks| {
            let tasks = tasks.take();
            if tasks.is_empty() {
                return;
            }
            TurboTasks::with_current(|current| {
                for task in tasks.into_iter() {
                    task.dependent_slot_updated(current);
                }
            })
        });
    }

    /// Eagerly notifies all tasks that were scheduled for notifications via
    /// `schedule_notify_tasks()`
    pub(crate) fn notify_scheduled_tasks_with_turbo_tasks(self: &Arc<TurboTasks>) {
        TASKS_TO_NOTIFY.with(|tasks| {
            for task in tasks.take().into_iter() {
                task.dependent_slot_updated(self);
            }
        });
    }

    /// Enqueues tasks for notification of changed dependencies. This will
    /// eventually call `dependent_slot_updated()` on all tasks.
    pub(crate) fn schedule_notify_tasks(tasks_iter: impl Iterator<Item = Arc<Task>>) {
        TASKS_TO_NOTIFY.with(|tasks| {
            let mut list = tasks.borrow_mut();
            list.extend(tasks_iter);
        });
    }

    /// Schedules a background job that will deactive a list of tasks, when
    /// their active_parents count is still zero.
    pub(crate) fn schedule_deactivate_tasks(self: &Arc<Self>, tasks: Vec<Arc<Task>>) {
        let tt = self.clone();
        self.clone().schedule_background_job(async move {
            Task::deactivate_tasks(tasks, tt);
        });
    }

    /// Schedules a background job that will decrease the active_parents count
    /// from each task by one and might deactive them after that.
    pub(crate) fn schedule_remove_tasks(self: &Arc<Self>, tasks: HashSet<Arc<Task>>) {
        let tt = self.clone();
        self.clone().schedule_background_job(async move {
            Task::remove_tasks(tasks, tt);
        });
    }

    /// Get a snapshot of all cached Tasks.
    pub fn cached_tasks_iter(&self) -> impl Iterator<Item = Arc<Task>> {
        let mut tasks = Vec::new();
        for (_, task) in self.resolve_task_cache.clone().into_iter() {
            tasks.push(task);
        }
        for (_, task) in self.native_task_cache.clone().into_iter() {
            tasks.push(task);
        }
        for (_, task) in self.trait_task_cache.clone().into_iter() {
            tasks.push(task);
        }
        tasks.into_iter()
    }
}

/// see [TurboTasks] `dynamic_call`
pub fn dynamic_call(func: &'static NativeFunction, inputs: Vec<TaskInput>) -> SlotRef {
    TurboTasks::with_current(|tt| tt.dynamic_call(func, inputs))
}

/// see [TurboTasks] `trait_call`
pub fn trait_call(
    trait_type: &'static TraitType,
    trait_fn_name: String,
    inputs: Vec<TaskInput>,
) -> SlotRef {
    TurboTasks::with_current(|tt| tt.trait_call(trait_type, trait_fn_name, inputs))
}
