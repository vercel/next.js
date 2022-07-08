use std::{
    borrow::Cow,
    future::Future,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Result};
use event_listener::EventListener;
use turbo_tasks::{
    backend::CellContent, test_helpers::with_turbo_tasks_for_testing, RawVc, TaskId, TurboTasksApi,
    TurboTasksCallApi,
};

#[derive(Default)]
pub struct VcStorage {
    cells: Mutex<Vec<CellContent>>,
}

impl TurboTasksCallApi for VcStorage {
    fn dynamic_call(
        &self,
        _func: turbo_tasks::FunctionId,
        _inputs: Vec<turbo_tasks::TaskInput>,
    ) -> RawVc {
        unreachable!()
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
        _task: TaskId,
        _strongly_consistent: bool,
    ) -> Result<Result<RawVc, EventListener>> {
        unreachable!()
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        _task: TaskId,
        _strongly_consistent: bool,
    ) -> Result<Result<RawVc, EventListener>> {
        unreachable!()
    }

    fn try_read_task_cell(
        &self,
        _task: TaskId,
        index: usize,
    ) -> Result<Result<CellContent, EventListener>> {
        self.read_current_task_cell(index).map(|c| Ok(c))
    }

    unsafe fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: usize,
    ) -> Result<Result<CellContent, EventListener>> {
        self.try_read_task_cell(task, index)
    }

    unsafe fn try_read_own_task_cell(
        &self,
        _current_task: TaskId,
        index: usize,
    ) -> Result<CellContent> {
        self.read_current_task_cell(index)
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
        unsafe { with_turbo_tasks_for_testing(Arc::new(VcStorage::default()), TaskId::from(0), f) }
    }
}
