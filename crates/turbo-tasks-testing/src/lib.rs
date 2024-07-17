//! Testing utilities and macros for turbo-tasks and applications based on it.

mod macros;
pub mod retry;

use std::{
    borrow::Cow,
    collections::HashMap,
    future::Future,
    mem::replace,
    panic::AssertUnwindSafe,
    sync::{Arc, Mutex, Weak},
};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoMap;
use futures::FutureExt;
use turbo_tasks::{
    backend::CellContent,
    event::{Event, EventListener},
    registry,
    test_helpers::with_turbo_tasks_for_testing,
    util::{SharedError, StaticOrArc},
    CellId, InvalidationReason, RawVc, TaskId, TraitTypeId, TurboTasksApi, TurboTasksCallApi,
};

enum Task {
    Spawned(Event),
    Finished(Result<RawVc, SharedError>),
}

#[derive(Default)]
pub struct VcStorage {
    this: Weak<Self>,
    cells: Mutex<HashMap<(TaskId, CellId), CellContent>>,
    tasks: Mutex<Vec<Task>>,
}

impl VcStorage {
    fn dynamic_call(
        &self,
        func: turbo_tasks::FunctionId,
        this_arg: Option<RawVc>,
        inputs: Vec<turbo_tasks::ConcreteTaskInput>,
    ) -> RawVc {
        let this = self.this.upgrade().unwrap();
        let func = registry::get_function(func).bind(this_arg, &inputs);
        let handle = tokio::runtime::Handle::current();
        let future = func();
        let i = {
            let mut tasks = self.tasks.lock().unwrap();
            let i = tasks.len();
            tasks.push(Task::Spawned(Event::new(move || {
                format!("Task({i})::event")
            })));
            i
        };
        let id = TaskId::from(i as u32 + 1);
        handle.spawn(with_turbo_tasks_for_testing(this.clone(), id, async move {
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
        }));
        RawVc::TaskOutput(id)
    }
}

impl TurboTasksCallApi for VcStorage {
    fn dynamic_call(
        &self,
        func: turbo_tasks::FunctionId,
        inputs: Vec<turbo_tasks::ConcreteTaskInput>,
    ) -> RawVc {
        self.dynamic_call(func, None, inputs)
    }

    fn dynamic_this_call(
        &self,
        func: turbo_tasks::FunctionId,
        this_arg: RawVc,
        inputs: Vec<turbo_tasks::ConcreteTaskInput>,
    ) -> RawVc {
        self.dynamic_call(func, Some(this_arg), inputs)
    }

    fn native_call(
        &self,
        _func: turbo_tasks::FunctionId,
        _inputs: Vec<turbo_tasks::ConcreteTaskInput>,
    ) -> RawVc {
        unreachable!()
    }

    fn this_call(
        &self,
        _func: turbo_tasks::FunctionId,
        _this: RawVc,
        _inputs: Vec<turbo_tasks::ConcreteTaskInput>,
    ) -> RawVc {
        unreachable!()
    }

    fn trait_call(
        &self,
        _trait_type: turbo_tasks::TraitTypeId,
        _trait_fn_name: Cow<'static, str>,
        _this: RawVc,
        _inputs: Vec<turbo_tasks::ConcreteTaskInput>,
    ) -> RawVc {
        unreachable!()
    }

    fn run_once(
        &self,
        _future: std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId {
        unreachable!()
    }

    fn run_once_with_reason(
        &self,
        _reason: StaticOrArc<dyn InvalidationReason>,
        _future: std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId {
        unreachable!()
    }

    fn run_once_process(
        &self,
        _future: std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> TaskId {
        unreachable!()
    }
}

impl TurboTasksApi for VcStorage {
    fn pin(&self) -> Arc<dyn TurboTasksApi> {
        self.this.upgrade().unwrap()
    }

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

    fn notify_scheduled_tasks(&self) {
        // ignore
    }

    fn try_read_task_output(
        &self,
        id: TaskId,
        _strongly_consistent: bool,
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

    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        strongly_consistent: bool,
    ) -> Result<Result<RawVc, EventListener>> {
        self.try_read_task_output(task, strongly_consistent)
    }

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
    ) -> Result<Result<CellContent, EventListener>> {
        let map = self.cells.lock().unwrap();
        if let Some(cell) = map.get(&(task, index)) {
            Ok(Ok(cell.clone()))
        } else {
            Ok(Ok(CellContent::default()))
        }
    }

    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
    ) -> Result<Result<CellContent, EventListener>> {
        let map = self.cells.lock().unwrap();
        if let Some(cell) = map.get(&(task, index)) {
            Ok(Ok(cell.clone()))
        } else {
            Ok(Ok(CellContent::default()))
        }
    }

    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
    ) -> Result<CellContent> {
        self.read_own_task_cell(current_task, index)
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
        _collectibles: &AutoMap<RawVc, i32>,
    ) {
        unimplemented!()
    }

    fn read_task_collectibles(&self, _task: TaskId, _trait_id: TraitTypeId) -> AutoMap<RawVc, i32> {
        unimplemented!()
    }

    fn read_own_task_cell(&self, task: TaskId, index: CellId) -> Result<CellContent> {
        let map = self.cells.lock().unwrap();
        if let Some(cell) = map.get(&(task, index)) {
            Ok(cell.clone())
        } else {
            Ok(CellContent::default())
        }
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

    fn detached(
        &self,
        _f: std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>>,
    ) -> std::pin::Pin<Box<dyn Future<Output = Result<()>> + Send + 'static>> {
        unimplemented!()
    }
}

impl VcStorage {
    pub fn with<T>(f: impl Future<Output = T>) -> impl Future<Output = T> {
        with_turbo_tasks_for_testing(
            Arc::new_cyclic(|weak| VcStorage {
                this: weak.clone(),
                ..Default::default()
            }),
            TaskId::from(u32::MAX),
            f,
        )
    }
}
