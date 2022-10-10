//! Testing utilities and macros for turbo-tasks and applications based on it.

#![feature(box_syntax)]

mod macros;

use std::{
    borrow::Cow,
    collections::HashSet,
    future::Future,
    mem::replace,
    sync::{Arc, Mutex, Weak},
};

use anyhow::{anyhow, Result};
use event_listener::{Event, EventListener};
use turbo_tasks::{
    backend::CellContent, registry, test_helpers::with_turbo_tasks_for_testing, RawVc, TaskId,
    TraitTypeId, TurboTasksApi, TurboTasksCallApi,
};

enum Task {
    Spawned(Event),
    Finished(RawVc),
}

#[derive(Default)]
pub struct VcStorage {
    this: Weak<Self>,
    cells: Mutex<Vec<CellContent>>,
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
            tasks.push(Task::Spawned(Event::new()));
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
        _task: TaskId,
        index: usize,
    ) -> Result<Result<CellContent, EventListener>> {
        self.read_current_task_cell(index).map(Ok)
    }

    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: usize,
    ) -> Result<Result<CellContent, EventListener>> {
        self.try_read_task_cell(task, index)
    }

    fn try_read_own_task_cell_untracked(
        &self,
        _current_task: TaskId,
        index: usize,
    ) -> Result<CellContent> {
        self.read_current_task_cell(index)
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
        _collectibles: &HashSet<RawVc>,
    ) {
        unimplemented!()
    }

    fn try_read_task_collectibles(
        &self,
        _task: TaskId,
        _trait_id: TraitTypeId,
    ) -> Result<Result<HashSet<RawVc>, EventListener>> {
        unimplemented!()
    }

    fn get_fresh_cell(&self, _task: TaskId) -> usize {
        let mut cells = self.cells.lock().unwrap();
        let i = cells.len();
        cells.push(CellContent(None));
        i
    }

    fn read_current_task_cell(&self, index: usize) -> Result<CellContent> {
        if let Some(cell) = self.cells.lock().unwrap().get(index) {
            Ok(cell.clone())
        } else {
            Err(anyhow!("non-existing cell"))
        }
    }

    fn update_current_task_cell(&self, index: usize, content: CellContent) {
        if let Some(cell) = self.cells.lock().unwrap().get_mut(index) {
            *cell = content;
        }
    }
}

impl VcStorage {
    pub fn with<T>(f: impl Future<Output = T>) -> impl Future<Output = T> {
        with_turbo_tasks_for_testing(
            Arc::new_cyclic(|weak| VcStorage {
                this: weak.clone(),
                ..Default::default()
            }),
            TaskId::from(0),
            f,
        )
    }
}
