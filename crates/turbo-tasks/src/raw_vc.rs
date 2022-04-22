use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::Hash,
    sync::Arc,
};

use anyhow::Result;

use crate::{slot::SlotReadResult, Task, TaskId, TurboTasks};

/// The result of reading a ValueVc.
/// Can be dereferenced to the concrete type.
///
/// This type is needed because the content of the slot can change
/// concurrently, so we can't return a reference to the data directly.
/// Instead the data or an [Arc] to the data is cloned out of the slot
/// and hold by this type.
pub struct RawVcReadResult<T: Any + Send + Sync> {
    inner: RawVcReadResultInner<T>,
}

pub enum RawVcReadResultInner<T: Any + Send + Sync> {
    SharedReference(Arc<T>),
}

impl<T: Any + Send + Sync> RawVcReadResult<T> {
    pub(crate) fn shared_reference(shared_ref: Arc<T>) -> Self {
        Self {
            inner: RawVcReadResultInner::SharedReference(shared_ref),
        }
    }
}

impl<T: Any + Send + Sync> std::ops::Deref for RawVcReadResult<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match &self.inner {
            RawVcReadResultInner::SharedReference(a) => a,
        }
    }
}

impl<T: Display + Any + Send + Sync> Display for RawVcReadResult<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<T: Debug + Any + Send + Sync> Debug for RawVcReadResult<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&**self, f)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RawVc {
    TaskOutput(TaskId),
    TaskCreated(TaskId, usize),
}

impl RawVc {
    pub async fn into_read<T: Any + Send + Sync>(
        self,
        tt: Arc<TurboTasks>,
    ) -> Result<RawVcReadResult<T>> {
        tt.notify_scheduled_tasks();
        let mut current = self;
        loop {
            match match current {
                RawVc::TaskOutput(task) => SlotReadResult::Link(
                    Task::with_done_output(task, &tt, |_, output| {
                        Task::with_current(|reader, reader_id| {
                            reader.add_dependency(current.clone());
                            output.read(reader_id)
                        })
                    })
                    .await?,
                ),
                RawVc::TaskCreated(task, index) => tt.with_task_and_tt(task, |task| {
                    Task::with_current(|reader, reader_id| {
                        reader.add_dependency(current.clone());
                        task.with_created_slot_mut(index, |slot| slot.read(reader_id))
                    })
                })?,
            } {
                SlotReadResult::Final(result) => {
                    return Ok(result);
                }
                SlotReadResult::Link(raw_vc) => current = raw_vc,
            }
        }
    }

    pub async unsafe fn into_read_untracked<T: Any + Send + Sync>(
        self,
        tt: Arc<TurboTasks>,
    ) -> Result<RawVcReadResult<T>> {
        tt.notify_scheduled_tasks();
        let mut current = self;
        loop {
            match match current {
                RawVc::TaskOutput(task) => SlotReadResult::Link(
                    Task::with_done_output(task, &tt, |_, output| output.read_untracked()).await?,
                ),
                RawVc::TaskCreated(task, index) => tt.with_task_and_tt(task, |task| {
                    task.with_created_slot_mut(index, |slot| slot.read_untracked())
                })?,
            } {
                SlotReadResult::Final(result) => {
                    return Ok(result);
                }
                SlotReadResult::Link(raw_vc) => current = raw_vc,
            }
        }
    }

    pub async fn resolve(self) -> Result<RawVc> {
        let tt = TurboTasks::current().unwrap();
        let mut current = self;
        let mut notified = false;
        loop {
            current = match current {
                RawVc::TaskOutput(task) => {
                    if !notified {
                        tt.notify_scheduled_tasks();
                        notified = true;
                    }
                    Task::with_done_output(task, &tt, |_, output| {
                        Task::with_current(|reader, reader_id| {
                            reader.add_dependency(current.clone());
                            output.read(reader_id)
                        })
                    })
                    .await?
                }
                RawVc::TaskCreated(_, _) => return Ok(current.clone()),
            }
        }
    }

    pub(crate) fn remove_dependent_task(&self, reader: TaskId, turbo_tasks: &TurboTasks) {
        match self {
            RawVc::TaskOutput(task) => {
                turbo_tasks.with_task_and_tt(*task, |task| {
                    task.with_output_mut(|slot| {
                        slot.dependent_tasks.remove(&reader);
                    });
                });
            }
            RawVc::TaskCreated(task, index) => {
                turbo_tasks.with_task_and_tt(*task, |task| {
                    task.with_created_slot_mut(*index, |slot| {
                        slot.dependent_tasks.remove(&reader);
                    });
                });
            }
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            RawVc::TaskOutput(_) => false,
            RawVc::TaskCreated(_, _) => true,
        }
    }

    pub(crate) fn get_task_id(&self) -> TaskId {
        match self {
            RawVc::TaskOutput(t) | RawVc::TaskCreated(t, _) => *t,
        }
    }
}

impl Display for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RawVc::TaskOutput(task) => {
                write!(f, "output of {}", task)
            }
            RawVc::TaskCreated(task, index) => {
                write!(f, "value {} of {}", index, task)
            }
        }
    }
}
