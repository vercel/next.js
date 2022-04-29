use std::{collections::HashSet, fmt::Debug};

use turbo_tasks::TurboTasksApi;

use turbo_tasks::{backend::SlotContent, TaskId};

#[derive(Default, Debug)]
pub struct Slot {
    content: SlotContent,
    updates: u32,
    pub(crate) dependent_tasks: HashSet<TaskId>,
}

impl Slot {
    pub fn new() -> Self {
        Self {
            content: SlotContent::Empty,
            updates: 0,
            dependent_tasks: HashSet::new(),
        }
    }

    pub fn read_content(&mut self, reader: TaskId) -> SlotContent {
        self.dependent_tasks.insert(reader);
        unsafe { self.read_content_untracked() }
    }

    pub unsafe fn read_content_untracked(&self) -> SlotContent {
        self.content.clone()
    }

    pub fn assign(&mut self, content: SlotContent, turbo_tasks: &dyn TurboTasksApi) {
        self.content = content;
        self.updates += 1;
        // notify
        turbo_tasks.schedule_notify_tasks(&self.dependent_tasks);
    }
}
