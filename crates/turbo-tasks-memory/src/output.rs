use std::{
    borrow::Cow,
    collections::HashSet,
    fmt::{Debug, Display},
};

use anyhow::{anyhow, Error, Result};
use turbo_tasks::{util::SharedError, RawVc, TaskId, TurboTasksBackendApi};

#[derive(Default, Debug)]
pub struct Output {
    pub(crate) content: OutputContent,
    updates: u32,
    pub(crate) dependent_tasks: HashSet<TaskId>,
}

#[derive(Clone, Debug)]
pub enum OutputContent {
    Empty,
    Link(RawVc),
    Error(SharedError),
    Panic(Option<Cow<'static, str>>),
}

impl Default for OutputContent {
    fn default() -> Self {
        OutputContent::Empty
    }
}

impl Display for OutputContent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputContent::Empty => write!(f, "empty"),
            OutputContent::Link(raw_vc) => write!(f, "link {}", raw_vc),
            OutputContent::Error(err) => write!(f, "error {}", err),
            OutputContent::Panic(Some(message)) => write!(f, "panic {}", message),
            OutputContent::Panic(None) => write!(f, "panic"),
        }
    }
}

impl Output {
    pub fn read(&mut self, reader: TaskId) -> Result<RawVc> {
        self.dependent_tasks.insert(reader);
        self.read_untracked()
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub fn read_untracked(&mut self) -> Result<RawVc> {
        match &self.content {
            OutputContent::Empty => Err(anyhow!("Output is empty")),
            OutputContent::Error(err) => Err(err.clone().into()),
            OutputContent::Link(raw_vc) => Ok(*raw_vc),
            OutputContent::Panic(Some(message)) => Err(anyhow!("A task panicked: {message}")),
            OutputContent::Panic(None) => Err(anyhow!("A task panicked")),
        }
    }

    pub fn track_read(&mut self, reader: TaskId) {
        self.dependent_tasks.insert(reader);
    }

    pub fn link(&mut self, target: RawVc, turbo_tasks: &dyn TurboTasksBackendApi) {
        let change;
        let mut _type_change = false;
        match &self.content {
            OutputContent::Link(old_target) => {
                if match (old_target, &target) {
                    (RawVc::TaskOutput(old_task), RawVc::TaskOutput(new_task)) => {
                        old_task == new_task
                    }
                    (
                        RawVc::TaskCell(old_task, old_index),
                        RawVc::TaskCell(new_task, new_index),
                    ) => old_task == new_task && *old_index == *new_index,
                    _ => false,
                } {
                    change = None;
                } else {
                    change = Some(target);
                }
            }
            OutputContent::Empty | OutputContent::Error(_) | OutputContent::Panic(_) => {
                change = Some(target);
            }
        };
        if let Some(target) = change {
            self.assign(OutputContent::Link(target), turbo_tasks)
        }
    }

    pub fn error(&mut self, error: Error, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.content = OutputContent::Error(SharedError::new(error));
        self.updates += 1;
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&self.dependent_tasks);
        }
    }

    pub fn panic(
        &mut self,
        message: Option<Cow<'static, str>>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.content = OutputContent::Panic(message);
        self.updates += 1;
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&self.dependent_tasks);
        }
    }

    pub fn assign(&mut self, content: OutputContent, turbo_tasks: &dyn TurboTasksBackendApi) {
        self.content = content;
        self.updates += 1;
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&self.dependent_tasks);
        }
    }
}
