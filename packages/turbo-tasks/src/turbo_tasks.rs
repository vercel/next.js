use std::{
    any::{Any, TypeId},
    cell::Cell,
    hash::Hash,
    sync::Arc,
};

use any_key::AnyHash;
use anyhow::{anyhow, Result};
use async_std::{
    task::{Builder, JoinHandle},
    task_local,
};
use chashmap::CHashMap;

use crate::{
    slot::SlotRef, task::NativeTaskFuture, NativeFunction, SlotValueType, Task, TraitType,
};

pub struct TurboTasks {
    interning_map: CHashMap<
        Box<dyn AnyHash + Send + Sync>,
        (&'static SlotValueType, Arc<dyn Any + Sync + Send>),
    >,
    resolve_task_cache: CHashMap<(&'static NativeFunction, Vec<SlotRef>), Arc<Task>>,
    native_task_cache: CHashMap<(&'static NativeFunction, Vec<SlotRef>), Arc<Task>>,
    trait_task_cache: CHashMap<(&'static TraitType, String, Vec<SlotRef>), Arc<Task>>,
}

task_local! {
    static TURBO_TASKS: Cell<Option<&'static TurboTasks>> = Cell::new(None);
    static TASKS_TO_NOTIFY: Cell<Vec<Arc<Task>>> = Default::default();
}

impl TurboTasks {
    // TODO better lifetime management for turbo tasks
    // consider using unsafe for the task_local turbo tasks
    // that should be safe as long tasks can't outlife turbo task
    // so we probably want to make sure that all tasks are joined
    // when trying to drop turbo tasks
    pub fn new() -> &'static Self {
        Box::leak(Box::new(Self {
            interning_map: CHashMap::new(),
            resolve_task_cache: CHashMap::new(),
            native_task_cache: CHashMap::new(),
            trait_task_cache: CHashMap::new(),
        }))
    }

    pub fn spawn_root_task(
        &'static self,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
    ) -> Arc<Task> {
        let task = Arc::new(Task::new_root(functor));
        self.schedule(task.clone());
        task
    }

    pub(crate) fn native_call(
        self: &'static TurboTasks,
        func: &'static NativeFunction,
        inputs: Vec<SlotRef>,
    ) -> Result<SlotRef> {
        debug_assert!(inputs.iter().all(|i| i.is_resolved() && !i.is_nothing()));
        let mut result_task = Err(anyhow!("Unreachable"));
        self.native_task_cache
            .alter((func, inputs.clone()), |old| match old {
                Some(t) => {
                    result_task = Ok(t.clone());
                    Some(t)
                }
                None => match Task::new_native(inputs, func) {
                    Ok(task) => {
                        let new_task = Arc::new(task);
                        self.schedule(new_task.clone());
                        result_task = Ok(new_task.clone());
                        Some(new_task)
                    }
                    Err(err) => {
                        result_task = Err(err);
                        None
                    }
                },
            });
        let task = result_task?;
        task.ensure_scheduled(self);
        return Ok(SlotRef::TaskOutput(task));
    }

    pub fn dynamic_call(
        self: &'static TurboTasks,
        func: &'static NativeFunction,
        inputs: Vec<SlotRef>,
    ) -> Result<SlotRef> {
        let mut result_task = Err(anyhow!("Unreachable"));
        self.resolve_task_cache
            .alter((func, inputs.clone()), |old| match old {
                Some(t) => {
                    result_task = Ok(t.clone());
                    Some(t)
                }
                None => {
                    let task = Task::new_resolve_native(inputs, func);
                    let new_task = Arc::new(task);
                    self.schedule(new_task.clone());
                    result_task = Ok(new_task.clone());
                    Some(new_task)
                }
            });
        let task = result_task?;
        task.ensure_scheduled(self);
        return Ok(SlotRef::TaskOutput(task));
    }

    pub fn trait_call(
        self: &'static TurboTasks,
        trait_type: &'static TraitType,
        trait_fn_name: String,
        inputs: Vec<SlotRef>,
    ) -> Result<SlotRef> {
        let mut result_task = Err(anyhow!("Unreachable"));
        self.trait_task_cache
            .alter(
                (trait_type, trait_fn_name.clone(), inputs.clone()),
                |old| match old {
                    Some(t) => {
                        result_task = Ok(t.clone());
                        Some(t)
                    }
                    None => {
                        let task = Task::new_resolve_trait(trait_type, trait_fn_name, inputs);
                        let new_task = Arc::new(task);
                        self.schedule(new_task.clone());
                        result_task = Ok(new_task.clone());
                        Some(new_task)
                    }
                },
            );
        let task = result_task?;
        task.ensure_scheduled(self);
        return Ok(SlotRef::TaskOutput(task));
    }

    pub(crate) fn schedule(&'static self, task: Arc<Task>) -> JoinHandle<()> {
        Builder::new()
            .name(format!("{:?} {:?}", &*task, &*task as *const Task))
            .spawn(async move {
                Task::set_current(task.clone());
                TURBO_TASKS.with(|c| c.set(Some(self)));
                task.execution_started();
                let result = task.execute(self).await;
                task.finalize_execution();
                task.execution_completed(result, self);
                TASKS_TO_NOTIFY.with(|tasks| {
                    for task in tasks.take().iter() {
                        task.dependent_slot_updated(self);
                    }
                })
            })
            .unwrap()
    }

    pub(crate) fn current() -> Option<&'static Self> {
        TURBO_TASKS.with(|c| c.get())
    }

    pub(crate) fn schedule_notify_task(task: Arc<Task>) {
        TASKS_TO_NOTIFY.with(|tasks| {
            let mut temp = Vec::new();
            tasks.swap(Cell::from_mut(&mut temp));
            temp.push(task);
            tasks.swap(Cell::from_mut(&mut temp));
        });
    }

    pub(crate) fn intern<
        T: Any + ?Sized,
        K: Hash + PartialEq + Eq + Send + Sync + 'static,
        F: FnOnce() -> (&'static SlotValueType, Arc<dyn Any + Send + Sync>),
    >(
        &self,
        key: K,
        fallback: F,
    ) -> SlotRef {
        let mut result = None;
        self.interning_map.alter(
            Box::new((TypeId::of::<T>(), key)) as Box<dyn AnyHash + Send + Sync>,
            |entry| match entry {
                Some((ty, value)) => {
                    result = Some(SlotRef::SharedReference(ty, value.clone()));
                    Some((ty, value))
                }
                None => {
                    let (ty, value) = fallback();
                    result = Some(SlotRef::SharedReference(ty, value.clone()));
                    Some((ty, value))
                }
            },
        );
        result.unwrap()
    }
}

pub fn dynamic_call(func: &'static NativeFunction, inputs: Vec<SlotRef>) -> Result<SlotRef> {
    let tt = TurboTasks::current()
        .ok_or_else(|| anyhow!("tried to call dynamic_call outside of turbo tasks"))?;
    tt.dynamic_call(func, inputs)
}

pub fn trait_call(
    trait_type: &'static TraitType,
    trait_fn_name: String,
    inputs: Vec<SlotRef>,
) -> Result<SlotRef> {
    let tt = TurboTasks::current()
        .ok_or_else(|| anyhow!("tried to call trait_call outside of turbo tasks"))?;
    tt.trait_call(trait_type, trait_fn_name, inputs)
}

pub(crate) fn intern<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce() -> (&'static SlotValueType, Arc<dyn Any + Send + Sync>),
>(
    key: K,
    fallback: F,
) -> SlotRef {
    let tt = TurboTasks::current()
        .ok_or_else(|| anyhow!("tried to call intern outside of turbo tasks"))
        .unwrap();
    tt.intern::<T, K, F>(key, fallback)
}

// impl Visualizable for &'static TurboTasks {
//     fn visualize(&self, visualizer: &mut impl crate::viz::Visualizer) {
//         for (_key, task) in self.task_cache.clone().into_iter() {
//             task.visualize(visualizer);
//         }
//     }
// }
