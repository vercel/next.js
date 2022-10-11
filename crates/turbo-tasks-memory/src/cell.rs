use std::{collections::HashSet, fmt::Debug};

use turbo_tasks::{backend::CellContent, TaskId, TurboTasksBackendApi};

#[derive(Default, Debug)]
pub struct Cell {
    content: CellContent,
    updates: u32,
    pub(crate) dependent_tasks: HashSet<TaskId>,
}

impl Cell {
    pub fn new() -> Self {
        Self {
            content: CellContent(None),
            updates: 0,
            dependent_tasks: HashSet::new(),
        }
    }

    pub fn read_content(&mut self, reader: TaskId) -> CellContent {
        self.dependent_tasks.insert(reader);
        self.read_content_untracked()
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub fn read_content_untracked(&self) -> CellContent {
        self.content.clone()
    }

    pub fn track_read(&mut self, reader: TaskId) {
        self.dependent_tasks.insert(reader);
    }

    pub fn assign(&mut self, content: CellContent, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.content = content;
        self.updates += 1;
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&self.dependent_tasks);
        }
    }
}
