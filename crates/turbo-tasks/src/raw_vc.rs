use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::Hash,
    sync::Arc,
};

use anyhow::Result;

use crate::{slot::SlotReadResult, Task, TurboTasks};

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
    ClonedData(Box<T>),
}

impl<T: Any + Send + Sync> RawVcReadResult<T> {
    pub(crate) fn shared_reference(shared_ref: Arc<T>) -> Self {
        Self {
            inner: RawVcReadResultInner::SharedReference(shared_ref),
        }
    }
    pub(crate) fn cloned_data(data: Box<T>) -> Self {
        Self {
            inner: RawVcReadResultInner::ClonedData(data),
        }
    }
}

impl<T: Any + Send + Sync> std::ops::Deref for RawVcReadResult<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match &self.inner {
            RawVcReadResultInner::SharedReference(a) => a,
            RawVcReadResultInner::ClonedData(a) => a,
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

#[derive(Clone)]
pub enum RawVc {
    TaskOutput(Arc<Task>),
    TaskCreated(Arc<Task>, usize),
}

impl RawVc {
    pub async fn into_read<T: Any + Send + Sync>(self) -> Result<RawVcReadResult<T>> {
        TurboTasks::notify_scheduled_tasks();
        let mut current = self;
        loop {
            match match current {
                RawVc::TaskOutput(ref task) => SlotReadResult::Link(
                    task.with_done_output(|output| {
                        Task::with_current(|reader| {
                            reader.add_dependency(current.clone());
                            output.read(reader.clone())
                        })
                    })
                    .await?,
                ),
                RawVc::TaskCreated(ref task, index) => Task::with_current(|reader| {
                    reader.add_dependency(current.clone());
                    task.with_created_slot_mut(index, |slot| slot.read(reader.clone()))
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
        let mut current = self;
        let mut notified = false;
        loop {
            current = match current {
                RawVc::TaskOutput(ref task) => {
                    if !notified {
                        TurboTasks::notify_scheduled_tasks();
                        notified = true;
                    }
                    task.with_done_output(|output| {
                        Task::with_current(|reader| {
                            reader.add_dependency(current.clone());
                            output.read(reader.clone())
                        })
                    })
                    .await?
                }
                RawVc::TaskCreated(_, _) => return Ok(current.clone()),
            }
        }
    }

    pub(crate) fn remove_dependent_task(&self, reader: &Arc<Task>) {
        match self {
            RawVc::TaskOutput(task) => {
                task.with_output_mut(|slot| {
                    slot.dependent_tasks.remove(reader);
                });
            }
            RawVc::TaskCreated(task, index) => {
                task.with_created_slot_mut(*index, |slot| {
                    slot.dependent_tasks.remove(reader);
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

    pub(crate) fn get_task(&self) -> Arc<Task> {
        match self {
            RawVc::TaskOutput(t) | RawVc::TaskCreated(t, _) => t.clone(),
        }
    }
}

impl PartialEq<RawVc> for RawVc {
    fn eq(&self, other: &RawVc) -> bool {
        match (self, other) {
            (Self::TaskOutput(a), Self::TaskOutput(b)) => Arc::ptr_eq(a, b),
            (Self::TaskCreated(a, ai), Self::TaskCreated(b, bi)) => Arc::ptr_eq(a, b) && ai == bi,
            _ => false,
        }
    }
}

impl Eq for RawVc {}

impl Display for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RawVc::TaskOutput(task) => {
                write!(f, "task output {}", task)
            }
            RawVc::TaskCreated(task, index) => {
                write!(f, "task created {} {}", task, index)
            }
        }
    }
}

impl Debug for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RawVc::TaskOutput(task) => f
                .debug_struct("RawVc::TaskOutput")
                .field("task", task)
                .finish(),
            RawVc::TaskCreated(task, index) => f
                .debug_struct("RawVc::TaskCreated")
                .field("task", task)
                .field("index", index)
                .finish(),
        }
    }
}

impl Hash for RawVc {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            RawVc::TaskOutput(task) => {
                Hash::hash(&Arc::as_ptr(task), state);
            }
            RawVc::TaskCreated(task, index) => {
                Hash::hash(&Arc::as_ptr(task), state);
                Hash::hash(&index, state);
            }
        }
    }
}
