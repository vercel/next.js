use std::{
    future::Future,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Result};
use event_listener::EventListener;
use turbo_tasks::{
    backend::SlotContent, test_helpers::with_turbo_tasks_for_testing, RawVc, TaskId, TurboTasksApi,
    TurboTasksCallApi,
};

#[derive(Default)]
pub struct VcStorage {
    slots: Mutex<Vec<SlotContent>>,
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
        _trait_fn_name: String,
        _inputs: Vec<turbo_tasks::TaskInput>,
    ) -> RawVc {
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

    fn try_read_task_output(&self, _task: TaskId) -> Result<Result<RawVc, EventListener>> {
        unreachable!()
    }

    unsafe fn try_read_task_output_untracked(
        &self,
        _task: TaskId,
    ) -> Result<Result<RawVc, EventListener>> {
        unreachable!()
    }

    fn try_read_task_slot(
        &self,
        _task: TaskId,
        index: usize,
    ) -> Result<Result<SlotContent, EventListener>> {
        self.read_current_task_slot(index).map(|c| Ok(c))
    }

    unsafe fn try_read_task_slot_untracked(
        &self,
        task: TaskId,
        index: usize,
    ) -> Result<Result<SlotContent, EventListener>> {
        self.try_read_task_slot(task, index)
    }

    unsafe fn try_read_own_task_slot(
        &self,
        _current_task: TaskId,
        index: usize,
    ) -> Result<SlotContent> {
        self.read_current_task_slot(index)
    }

    fn get_fresh_slot(&self, _task: TaskId) -> usize {
        let mut slots = self.slots.lock().unwrap();
        let i = slots.len();
        slots.push(SlotContent(None));
        i
    }

    fn read_current_task_slot(&self, index: usize) -> Result<SlotContent> {
        if let Some(slot) = self.slots.lock().unwrap().get(index) {
            Ok(slot.clone())
        } else {
            Err(anyhow!("non-existing slot"))
        }
    }

    fn update_current_task_slot(&self, index: usize, content: SlotContent) {
        if let Some(slot) = self.slots.lock().unwrap().get_mut(index) {
            *slot = content;
        }
    }
}

impl VcStorage {
    pub fn with<T>(f: impl Future<Output = T>) -> impl Future<Output = T> {
        unsafe { with_turbo_tasks_for_testing(Arc::new(VcStorage::default()), TaskId::from(0), f) }
    }
}
