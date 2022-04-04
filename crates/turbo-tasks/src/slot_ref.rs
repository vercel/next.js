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
pub struct SlotVcReadResult<T: Any + Send + Sync> {
    inner: SlotVcReadResultInner<T>,
}

pub enum SlotVcReadResultInner<T: Any + Send + Sync> {
    SharedReference(Arc<T>),
    ClonedData(Box<T>),
}

impl<T: Any + Send + Sync> SlotVcReadResult<T> {
    pub(crate) fn shared_reference(shared_ref: Arc<T>) -> Self {
        Self {
            inner: SlotVcReadResultInner::SharedReference(shared_ref),
        }
    }
    pub(crate) fn cloned_data(data: Box<T>) -> Self {
        Self {
            inner: SlotVcReadResultInner::ClonedData(data),
        }
    }
}

impl<T: Any + Send + Sync> std::ops::Deref for SlotVcReadResult<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match &self.inner {
            SlotVcReadResultInner::SharedReference(a) => a,
            SlotVcReadResultInner::ClonedData(a) => a,
        }
    }
}

impl<T: Display + Any + Send + Sync> Display for SlotVcReadResult<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<T: Debug + Any + Send + Sync> Debug for SlotVcReadResult<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&**self, f)
    }
}

#[derive(Clone)]
pub enum SlotVc {
    TaskOutput(Arc<Task>),
    TaskCreated(Arc<Task>, usize),
}

impl SlotVc {
    pub async fn into_read<T: Any + Send + Sync>(self) -> Result<SlotVcReadResult<T>> {
        TurboTasks::notify_scheduled_tasks();
        let mut current = self;
        loop {
            match match current {
                SlotVc::TaskOutput(ref task) => SlotReadResult::Link(
                    task.with_done_output(|output| {
                        Task::with_current(|reader| {
                            reader.add_dependency(current.clone());
                            output.read(reader.clone())
                        })
                    })
                    .await?,
                ),
                SlotVc::TaskCreated(ref task, index) => Task::with_current(|reader| {
                    reader.add_dependency(current.clone());
                    task.with_created_slot_mut(index, |slot| slot.read(reader.clone()))
                })?,
            } {
                SlotReadResult::Final(result) => {
                    return Ok(result);
                }
                SlotReadResult::Link(slot_ref) => current = slot_ref,
            }
        }
    }

    pub async fn resolve(self) -> Result<SlotVc> {
        let mut current = self;
        let mut notified = false;
        loop {
            current = match current {
                SlotVc::TaskOutput(ref task) => {
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
                SlotVc::TaskCreated(_, _) => return Ok(current.clone()),
            }
        }
    }

    pub(crate) fn remove_dependent_task(&self, reader: &Arc<Task>) {
        match self {
            SlotVc::TaskOutput(task) => {
                task.with_output_mut(|slot| {
                    slot.dependent_tasks.remove(reader);
                });
            }
            SlotVc::TaskCreated(task, index) => {
                task.with_created_slot_mut(*index, |slot| {
                    slot.dependent_tasks.remove(reader);
                });
            }
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            SlotVc::TaskOutput(_) => false,
            SlotVc::TaskCreated(_, _) => true,
        }
    }

    pub(crate) fn get_task(&self) -> Arc<Task> {
        match self {
            SlotVc::TaskOutput(t) | SlotVc::TaskCreated(t, _) => t.clone(),
        }
    }
}

impl PartialEq<SlotVc> for SlotVc {
    fn eq(&self, other: &SlotVc) -> bool {
        match (self, other) {
            (Self::TaskOutput(a), Self::TaskOutput(b)) => Arc::ptr_eq(a, b),
            (Self::TaskCreated(a, ai), Self::TaskCreated(b, bi)) => Arc::ptr_eq(a, b) && ai == bi,
            _ => false,
        }
    }
}

impl Eq for SlotVc {}

impl Display for SlotVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SlotVc::TaskOutput(task) => {
                write!(f, "task output {}", task)
            }
            SlotVc::TaskCreated(task, index) => {
                write!(f, "task created {} {}", task, index)
            }
        }
    }
}

impl Debug for SlotVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SlotVc::TaskOutput(task) => f
                .debug_struct("SlotVc::TaskOutput")
                .field("task", task)
                .finish(),
            SlotVc::TaskCreated(task, index) => f
                .debug_struct("SlotVc::TaskCreated")
                .field("task", task)
                .field("index", index)
                .finish(),
        }
    }
}

impl Hash for SlotVc {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            SlotVc::TaskOutput(task) => {
                Hash::hash(&Arc::as_ptr(task), state);
            }
            SlotVc::TaskCreated(task, index) => {
                Hash::hash(&Arc::as_ptr(task), state);
                Hash::hash(&index, state);
            }
        }
    }
}
