use std::{borrow::Cow, fmt::Debug, mem::take};

use anyhow::{anyhow, Error, Result};
use turbo_tasks::{
    util::SharedError, OutputContent, RawVc, TaskId, TaskIdSet, TurboTasksBackendApi,
};

use crate::MemoryBackend;

#[derive(Default, Debug)]
pub struct Output {
    pub(crate) content: Option<OutputContent>,
    pub(crate) dependent_tasks: TaskIdSet,
}

impl Output {
    pub fn read(&mut self, reader: TaskId) -> Result<RawVc> {
        self.dependent_tasks.insert(reader);
        self.read_untracked()
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub fn read_untracked(&self) -> Result<RawVc> {
        match &self.content {
            None => Err(anyhow!("Output is empty")),
            Some(content) => content.as_read_result(),
        }
    }

    pub fn link(&mut self, target: RawVc, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        debug_assert!(*self != target);
        if let Some(OutputContent::Link(old_target)) = &self.content {
            if *old_target == target {
                // unchanged
                return;
            }
        }
        self.content = Some(OutputContent::Link(target));
        // notify
        if !self.dependent_tasks.is_empty() {
            turbo_tasks.schedule_notify_tasks_set(&take(&mut self.dependent_tasks));
        }
    }

    pub fn error(&mut self, error: Error, turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>) {
        self.content = Some(OutputContent::Error(SharedError::new(error)));
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
        self.content = Some(OutputContent::Panic(message.map(Box::new)));
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
            Some(OutputContent::Link(old_target)) => old_target == rhs,
            Some(OutputContent::Error(_) | OutputContent::Panic(_)) | None => false,
        }
    }
}
