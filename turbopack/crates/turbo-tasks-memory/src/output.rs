use std::{
    borrow::Cow,
    fmt::{Debug, Display},
    mem::take,
};

use anyhow::{anyhow, Error, Result};
use turbo_tasks::{util::SharedError, RawVc, TaskId, TaskIdSet, TurboTasksBackendApi};

use crate::MemoryBackend;

#[derive(Default, Debug)]
pub struct Output {
    pub(crate) content: OutputContent,
    pub(crate) dependent_tasks: TaskIdSet,
}

#[derive(Clone, Debug, Default)]
pub enum OutputContent {
    #[default]
    Empty,
    Link(RawVc),
    Error(SharedError),
    Panic(Option<Box<Cow<'static, str>>>),
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
            OutputContent::Error(err) => Err(anyhow::Error::new(err.clone())),
            OutputContent::Link(raw_vc) => Ok(*raw_vc),
            OutputContent::Panic(Some(message)) => Err(anyhow!("A task panicked: {message}")),
            OutputContent::Panic(None) => Err(anyhow!("A task panicked")),
        }
    }

    pub fn link(&mut self, target: RawVc, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        debug_assert!(*self != target);
        if let OutputContent::Link(old_target) = &self.content {
            if *old_target == target {
                // unchanged
                return;
            }
        }
        self.content = OutputContent::Link(target);
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&take(&mut self.dependent_tasks));
        }
    }

    pub fn error(&mut self, error: Error, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        self.content = OutputContent::Error(SharedError::new(error));
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&take(&mut self.dependent_tasks));
        }
    }

    pub fn panic(
        &mut self,
        message: Option<Cow<'static, str>>,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.content = OutputContent::Panic(message.map(Box::new));
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&take(&mut self.dependent_tasks));
        }
    }

    pub fn gc_drop(self, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&self.dependent_tasks);
        }
    }
}

impl PartialEq<RawVc> for Output {
    fn eq(&self, rhs: &RawVc) -> bool {
        match &self.content {
            OutputContent::Link(old_target) => old_target == rhs,
            OutputContent::Empty | OutputContent::Error(_) | OutputContent::Panic(_) => false,
        }
    }
}
