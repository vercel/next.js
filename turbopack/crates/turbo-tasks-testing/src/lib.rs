//! Testing utilities and macros for turbo-tasks and applications based on it.

pub mod retry;
mod run;

use std::{
    future::Future,
    mem::replace,
    panic::AssertUnwindSafe,
    pin::Pin,
    sync::{Arc, Mutex, Weak},
};

use anyhow::{Result, anyhow};
use futures::FutureExt;
use rustc_hash::FxHashMap;
use tokio::sync::mpsc::Receiver;
use turbo_tasks::{
    CellId, ExecutionId, InvalidationReason, LocalTaskId, MagicAny, RawVc, ReadCellOptions,
    ReadOutputOptions, TaskId, TaskPersistence, TraitTypeId, TurboTasksApi, TurboTasksCallApi,
    backend::{CellContent, TaskCollectiblesMap, TypedCellContent},
    event::{Event, EventListener},
    message_queue::CompilationEvent,
    test_helpers::with_turbo_tasks_for_testing,
    util::{SharedError, StaticOrArc},
};

pub use crate::run::{
    Registration, run, run_once, run_once_without_cache_check, run_with_tt, run_without_cache_check,
};

enum Task {
    Spawned(Event),
    Finished(Result<RawVc, SharedError>),
}

#[derive(Default)]
pub struct VcStorage {
    this: Weak<Self>,
    cells: Mutex<FxHashMap<(TaskId, CellId), CellContent>>,
    tasks: Mutex<Vec<Task>>,
}

impl VcStorage {
    fn dynamic_call(
        &self,
        func: &'static turbo_tasks::macro_helpers::NativeFunction,
        this_arg: Option<RawVc>,
        arg: Box<dyn MagicAny>,
    ) -> RawVc {
        let this = self.this.upgrade().unwrap();
        let handle = tokio::runtime::Handle::current();
        let future = func.execute(this_arg, &*arg);
        let i = {
            let mut tasks = self.tasks.lock().unwrap();
            let i = tasks.len();
            tasks.push(Task::Spawned(Event::new(move || {
                move || format!("Task({i})::event")
            })));
            i
        };
        let task_id = TaskId::try_from(u32::try_from(i + 1).unwrap()).unwrap();
        let execution_id = ExecutionId::try_from(u16::try_from(i + 1).unwrap()).unwrap();
        handle.spawn(with_turbo_tasks_for_testing(
            this.clone(),
            task_id,
            execution_id,
            async move {
                let result = AssertUnwindSafe(future).catch_unwind().await;

                // Convert the unwind panic to an anyhow error that can be cloned.
                let result = result
                    .map_err(|any| match any.downcast::<String>() {
                        Ok(owned) => anyhow!(owned),
                        Err(any) => match any.downcast::<&'static str>() {
                            Ok(str) => anyhow!(str),
                            Err(_) => anyhow!("unknown panic"),
                        },
                    })
                    .and_then(|r| r)
                    .map_err(SharedError::new);

                let mut tasks = this.tasks.lock().unwrap();
                if let Task::Spawned(event) = replace(&mut tasks[i], Task::Finished(result)) {
                    event.notify(usize::MAX);
                }
            },
        ));
        RawVc::TaskOutput(task_id)
    }
}

impl TurboTasksCallApi for VcStorage {
    fn dynamic_call(
        &self,
        func: &'static turbo_tasks::macro_helpers::NativeFunction,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
        _persistence: TaskPersistence,
    ) -> RawVc {
        self.dynamic_call(func, this, arg)
    }
    fn native_call(
        &self,
        _func: &'static turbo_tasks::macro_helpers::NativeFunction,
        _this: Option<RawVc>,
        _arg: Box<dyn MagicAny>,
        _persistence: TaskPersistence,
    ) -> RawVc {
        unreachable!()
    }

    fn trait_call(
        &self,
        _trait_type: &'static turbo_tasks::TraitMethod,
        _this: RawVc,
        _arg: Box<dyn MagicAny>,
        _persistence: TaskPersistence,
    ) -> RawVc {
        unreachable!()
    }

    fn run(
        &self,
        _future: Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<
        Box<dyn Future<Output = Result<(), turbo_tasks::backend::TurboTasksExecutionError>> + Send>,
    > {
        unreachable!()
    }

    fn run_once(
        &self,
        _future: std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<
        Box<dyn futures::Future<Output = Result<(), anyhow::Error>> + std::marker::Send + 'static>,
    > {
        unreachable!()
    }

    fn run_once_with_reason(
        &self,
        _reason: StaticOrArc<dyn InvalidationReason>,
        _future: std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> Pin<
        Box<dyn futures::Future<Output = Result<(), anyhow::Error>> + std::marker::Send + 'static>,
    > {
        unreachable!()
    }

    fn start_once_process(
        &self,
        _future: std::pin::Pin<Box<dyn Future<Output = ()> + Send + 'static>>,
    ) {
        unreachable!()
    }
}

impl TurboTasksApi for VcStorage {
    fn invalidate(&self, _task: TaskId) {
        unreachable!()
    }

    fn invalidate_with_reason(
        &self,
        _task: TaskId,
        _reason: turbo_tasks::util::StaticOrArc<dyn turbo_tasks::InvalidationReason>,
    ) {
        unreachable!()
    }

    fn invalidate_serialization(&self, _task: TaskId) {
        // ignore
    }

    fn try_read_task_output(
        &self,
        id: TaskId,
        _options: ReadOutputOptions,
    ) -> Result<Result<RawVc, EventListener>> {
        let tasks = self.tasks.lock().unwrap();
        let i = *id - 1;
        let task = tasks.get(i as usize).unwrap();
        match task {
            Task::Spawned(event) => Ok(Err(event.listen())),
            Task::Finished(result) => match result {
                Ok(vc) => Ok(Ok(*vc)),
                Err(err) => Err(anyhow!(err.clone())),
            },
        }
    }

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        _options: ReadCellOptions,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        let map = self.cells.lock().unwrap();
        Ok(Ok(if let Some(cell) = map.get(&(task, index)) {
            cell.clone()
        } else {
            Default::default()
        }
        .into_typed(index.type_id)))
    }
    fn try_read_own_task_cell(
        &self,
        current_task: TaskId,
        index: CellId,
        options: ReadCellOptions,
    ) -> Result<TypedCellContent> {
        self.read_own_task_cell(current_task, index, options)
    }

    fn try_read_local_output(
        &self,
        _execution_id: ExecutionId,
        _local_task_id: LocalTaskId,
    ) -> Result<Result<RawVc, EventListener>> {
        unimplemented!()
    }

    fn emit_collectible(&self, _trait_type: turbo_tasks::TraitTypeId, _collectible: RawVc) {
        unimplemented!()
    }

    fn unemit_collectible(
        &self,
        _trait_type: turbo_tasks::TraitTypeId,
        _collectible: RawVc,
        _count: u32,
    ) {
        unimplemented!()
    }

    fn unemit_collectibles(
        &self,
        _trait_type: turbo_tasks::TraitTypeId,
        _collectibles: &TaskCollectiblesMap,
    ) {
        unimplemented!()
    }

    fn read_task_collectibles(&self, _task: TaskId, _trait_id: TraitTypeId) -> TaskCollectiblesMap {
        unimplemented!()
    }

    fn read_own_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        _options: ReadCellOptions,
    ) -> Result<TypedCellContent> {
        let map = self.cells.lock().unwrap();
        Ok(if let Some(cell) = map.get(&(task, index)) {
            cell.to_owned()
        } else {
            Default::default()
        }
        .into_typed(index.type_id))
    }

    fn update_own_task_cell(&self, task: TaskId, index: CellId, content: CellContent) {
        let mut map = self.cells.lock().unwrap();
        let cell = map.entry((task, index)).or_default();
        *cell = content;
    }

    fn connect_task(&self, _task: TaskId) {
        // no-op
    }

    fn mark_own_task_as_finished(&self, _task: TaskId) {
        // no-op
    }

    fn mark_own_task_as_session_dependent(&self, _task: TaskId) {
        // no-op
    }

    fn set_own_task_aggregation_number(&self, _task: TaskId, _aggregation_number: u32) {
        // no-op
    }

    fn detached_for_testing(
        &self,
        _f: std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>> {
        unimplemented!()
    }

    fn task_statistics(&self) -> &turbo_tasks::task_statistics::TaskStatisticsApi {
        unimplemented!()
    }

    fn stop_and_wait(&self) -> std::pin::Pin<Box<dyn Future<Output = ()> + Send + 'static>> {
        Box::pin(async {})
    }

    /// Should not be called on the testing VcStorage. These methods are only implemented for
    /// structs with access to a `MessageQueue` like `TurboTasks`.
    fn subscribe_to_compilation_events(
        &self,
        _event_types: Option<Vec<String>>,
    ) -> Receiver<Arc<dyn CompilationEvent>> {
        unimplemented!()
    }

    /// Should not be called on the testing VcStorage. These methods are only implemented for
    /// structs with access to a `MessageQueue` like `TurboTasks`.
    fn send_compilation_event(&self, _event: Arc<dyn CompilationEvent>) {
        unimplemented!()
    }

    fn is_tracking_dependencies(&self) -> bool {
        false
    }
}

impl VcStorage {
    pub fn with<T>(f: impl Future<Output = T>) -> impl Future<Output = T> {
        with_turbo_tasks_for_testing(
            Arc::new_cyclic(|weak| VcStorage {
                this: weak.clone(),
                ..Default::default()
            }),
            TaskId::MAX,
            ExecutionId::MIN,
            f,
        )
    }
}
