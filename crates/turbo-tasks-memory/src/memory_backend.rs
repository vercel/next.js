use std::{collections::HashSet, future::Future, pin::Pin};

use anyhow::Result;
use event_listener::EventListener;

use turbo_tasks::{
    backend::{
        Backend, BackgroundJobId, PersistentTaskType, SlotContent, SlotMappings, TaskExecutionSpec,
        TaskType, TransientTaskType,
    },
    util::{IdFactory, NoMoveVec},
    RawVc, TaskId, TurboTasksApi,
};

use crate::{output::Output, task::Task};

pub struct MemoryBackend {
    memory_tasks: NoMoveVec<Task, 13>,
    background_jobs: NoMoveVec<BackgroundJob>,
    background_job_id_factory: IdFactory<BackgroundJobId>,
}

impl MemoryBackend {
    pub fn new() -> Self {
        Self {
            memory_tasks: NoMoveVec::new(),
            background_jobs: NoMoveVec::new(),
            background_job_id_factory: IdFactory::new(),
        }
    }

    pub(crate) fn create_background_job(&self, job: BackgroundJob) -> BackgroundJobId {
        let id = self.background_job_id_factory.get();
        // SAFETY: This is a fresh id
        unsafe {
            self.background_jobs.insert(*id, job);
        }
        id
    }

    fn try_get_output<T, F: FnOnce(&mut Output) -> T>(
        &self,
        id: TaskId,
        func: F,
    ) -> Result<T, EventListener> {
        self.with_task(id, |task| task.get_or_wait_output(func))
    }

    pub fn with_task<T>(&self, id: TaskId, func: impl FnOnce(&Task) -> T) -> T {
        func(&self.memory_tasks.get(*id).unwrap())
    }
}

impl Backend for MemoryBackend {
    /// SAFETY: id must be a fresh id
    unsafe fn insert_task(&self, id: TaskId, task_type: TaskType) {
        let task = match task_type {
            TaskType::Transient(TransientTaskType::Root(f)) => Task::new_root(id, f),
            TaskType::Transient(TransientTaskType::Once(f)) => Task::new_once(id, f),
            TaskType::Persistent(PersistentTaskType::Native(fn_id, inputs)) => {
                Task::new_native(id, inputs, fn_id)
            }
            TaskType::Persistent(PersistentTaskType::ResolveNative(fn_id, inputs)) => {
                Task::new_resolve_native(id, inputs, fn_id)
            }
            TaskType::Persistent(PersistentTaskType::ResolveTrait(
                trait_type,
                trait_fn_name,
                inputs,
            )) => Task::new_resolve_trait(id, trait_type, trait_fn_name, inputs),
        };
        unsafe {
            self.memory_tasks.insert(*id, task);
        }
    }

    /// SAFETY: id must no longer be used
    unsafe fn remove_task(&self, id: TaskId) {
        unsafe {
            self.memory_tasks.remove(*id);
        }
    }

    fn connect_task_child(&self, parent: TaskId, child: TaskId, turbo_tasks: &dyn TurboTasksApi) {
        self.with_task(parent, |parent| {
            parent.connect_child(child, self, turbo_tasks)
        });
    }

    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksApi) {
        self.with_task(task, |task| task.invalidate(self, turbo_tasks));
    }

    fn notify_slot_change(&self, tasks: Vec<TaskId>, turbo_tasks: &dyn TurboTasksApi) {
        for task in tasks.into_iter() {
            self.with_task(task, |task| {
                task.dependent_slot_updated(self, turbo_tasks);
            });
        }
    }

    fn try_start_task_execution(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> Option<TaskExecutionSpec> {
        self.with_task(task, |task| {
            if task.execution_started(self, turbo_tasks) {
                let slot_mappings = task.take_slot_mappings();
                Some(TaskExecutionSpec {
                    slot_mappings: Some(slot_mappings),
                    future: task.execute(turbo_tasks),
                })
            } else {
                None
            }
        })
    }

    fn task_execution_completed(
        &self,
        task: TaskId,
        slot_mappings: Option<SlotMappings>,
        result: anyhow::Result<RawVc>,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> bool {
        self.with_task(task, |task| {
            task.execution_result(result, turbo_tasks);
            task.execution_completed(slot_mappings, self)
        })
    }

    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
    ) -> Result<Result<RawVc>, EventListener> {
        self.try_get_output(task, |output| {
            Task::add_dependency_to_current(RawVc::TaskOutput(task));
            output.read(reader)
        })
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
    ) -> Result<Result<RawVc>, EventListener> {
        self.try_get_output(task, |output| unsafe { output.read_untracked() })
    }

    fn read_task_slot(&self, task: TaskId, index: usize, reader: TaskId) -> SlotContent {
        Task::add_dependency_to_current(RawVc::TaskSlot(task, index));
        self.with_task(task, |task| {
            task.with_slot_mut(index, |slot| slot.read_content(reader))
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

    fn update_task_slot(
        &self,
        task: TaskId,
        index: usize,
        content: SlotContent,
        turbo_tasks: &dyn TurboTasksApi,
    ) {
        self.with_task(task, |task| {
            task.with_slot_mut(index, |slot| slot.assign(content, turbo_tasks))
        })
    }

    /// SAFETY: Must only called once with the same id
    fn run_background_job<'a>(
        &'a self,
        id: BackgroundJobId,
        turbo_tasks: &'a dyn TurboTasksApi,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        // SAFETY: id will not be reused until with job is done
        if let Some(job) = unsafe { self.background_jobs.take(*id) } {
            Box::pin(async move {
                job.run(self, turbo_tasks).await;
                // SAFETY: This id will no longer be used
                unsafe {
                    self.background_job_id_factory.reuse(id);
                }
            })
        } else {
            Box::pin(async {})
        }
    }
}

pub(crate) enum BackgroundJob {
    RemoveTasks(HashSet<TaskId>),
    DeactivateTasks(Vec<TaskId>),
}

impl BackgroundJob {
    async fn run(self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksApi) {
        match self {
            BackgroundJob::RemoveTasks(tasks) => {
                for id in tasks {
                    backend.with_task(id, |task| {
                        task.remove(backend, turbo_tasks);
                    });
                }
            }
            BackgroundJob::DeactivateTasks(tasks) => {
                Task::deactivate_tasks(tasks, backend, turbo_tasks);
            }
        }
    }
}
