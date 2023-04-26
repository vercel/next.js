//! Testing utilities and macros for turbo-tasks and applications based on it.

mod macros;
pub mod retry;

use std::{
    borrow::Cow,
    collections::HashMap,
    future::Future,
    mem::replace,
    sync::{Arc, Mutex, Weak},
};

use anyhow::Result;
use auto_hash_map::AutoSet;
use turbo_tasks::{
    backend::CellContent,
    event::{Event, EventListener},
    primitives::RawVcSetVc,
    registry,
    test_helpers::with_turbo_tasks_for_testing,
    util::StaticOrArc,
    CellId, InvalidationReason, RawVc, TaskId, TraitTypeId, TurboTasksApi, TurboTasksCallApi,
};

enum Task {
    Spawned(Event),
    Finished(RawVc),
}

#[derive(Default)]
pub struct VcStorage {
    this: Weak<Self>,
    cells: Mutex<HashMap<(TaskId, CellId), CellContent>>,
    tasks: Mutex<Vec<Task>>,
}

impl TurboTasksCallApi for VcStorage {
    fn dynamic_call(
        &self,
        func: turbo_tasks::FunctionId,
        inputs: Vec<turbo_tasks::TaskInput>,
    ) -> RawVc {
        let this = self.this.upgrade().unwrap();
        let func = registry::get_function(func).bind(&inputs);
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
        handle.spawn(with_turbo_tasks_for_testing(
            this.clone(),
            TaskId::from(i),
            async move {
                let result = future.await.unwrap();
                let mut tasks = this.tasks.lock().unwrap();
                if let Task::Spawned(event) = replace(&mut tasks[i], Task::Finished(result)) {
                    event.notify(usize::MAX);
                }
            },
        ));
        RawVc::TaskOutput(i.into())
    }

    fn native_call(
        &self,
        _func: turbo_tasks::FunctionId,
        _inputs: Vec<turbo_tasks::TaskInput>,
    ) -> RawVc {
        unreachable!()
    }

    fn trait_call(
        &self,
        _trait_type: turbo_tasks::TraitTypeId,
        _trait_fn_name: Cow<'static, str>,
        _inputs: Vec<turbo_tasks::TaskInput>,
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
        task: TaskId,
        _strongly_consistent: bool,
    ) -> Result<Result<RawVc, EventListener>> {
        let tasks = self.tasks.lock().unwrap();
        let task = tasks.get(*task).unwrap();
        match task {
            Task::Spawned(event) => Ok(Err(event.listen())),
            Task::Finished(result) => Ok(Ok(*result)),
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

    fn unemit_collectible(&self, _trait_type: turbo_tasks::TraitTypeId, _collectible: RawVc) {
        unimplemented!()
    }

    fn unemit_collectibles(
        &self,
        _trait_type: turbo_tasks::TraitTypeId,
        _collectibles: &AutoSet<RawVc>,
    ) {
        unimplemented!()
    }

    fn read_task_collectibles(&self, _task: TaskId, _trait_id: TraitTypeId) -> RawVcSetVc {
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
}

impl VcStorage {
    pub fn with<T>(f: impl Future<Output = T>) -> impl Future<Output = T> {
        with_turbo_tasks_for_testing(
            Arc::new_cyclic(|weak| VcStorage {
                this: weak.clone(),
                ..Default::default()
            }),
            TaskId::from(usize::MAX),
            f,
        )
    }
}
