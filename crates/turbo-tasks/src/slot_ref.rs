use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::Hash,
    sync::Arc,
};

use anyhow::Result;

use crate::{slot::SlotReadResult, viz::SlotSnapshot, Task, TurboTasks};

/// The result of reading a ValueRef.
/// Can be dereferenced to the concrete type.
///
/// This type is needed because the content of the slot can change
/// concurrently, so we can't return a reference to the data directly.
/// Instead the data or an [Arc] to the data is cloned out of the slot
/// and hold by this type.
pub struct SlotRefReadResult<T: Any + Send + Sync> {
    inner: SlotRefReadResultInner<T>,
}

pub enum SlotRefReadResultInner<T: Any + Send + Sync> {
    SharedReference(Arc<T>),
    ClonedData(Box<T>),
}

impl<T: Any + Send + Sync> SlotRefReadResult<T> {
    pub(crate) fn shared_reference(shared_ref: Arc<T>) -> Self {
        Self {
            inner: SlotRefReadResultInner::SharedReference(shared_ref),
        }
    }
    pub(crate) fn cloned_data(data: Box<T>) -> Self {
        Self {
            inner: SlotRefReadResultInner::ClonedData(data),
        }
    }
}

impl<T: Any + Send + Sync> std::ops::Deref for SlotRefReadResult<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match &self.inner {
            SlotRefReadResultInner::SharedReference(a) => a,
            SlotRefReadResultInner::ClonedData(a) => a,
        }
    }
}

impl<T: Display + Any + Send + Sync> Display for SlotRefReadResult<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<T: Debug + Any + Send + Sync> Debug for SlotRefReadResult<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&**self, f)
    }
}

#[derive(Clone)]
pub enum SlotRef {
    TaskOutput(Arc<Task>),
    TaskCreated(Arc<Task>, usize),
}

impl SlotRef {
    pub async fn into_read<T: Any + Send + Sync>(self) -> Result<SlotRefReadResult<T>> {
        TurboTasks::notify_scheduled_tasks();
        let mut current = self;
        loop {
            match match current {
                SlotRef::TaskOutput(ref task) => SlotReadResult::Link(
                    task.with_done_output(|output| {
                        Task::with_current(|reader| {
                            reader.add_dependency(current.clone());
                            output.read(reader.clone())
                        })
                    })
                    .await?,
                ),
                SlotRef::TaskCreated(ref task, index) => Task::with_current(|reader| {
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

    pub async fn resolve(self) -> Result<SlotRef> {
        let mut current = self;
        let mut notified = false;
        loop {
            current = match current {
                SlotRef::TaskOutput(ref task) => {
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
                SlotRef::TaskCreated(_, _) => return Ok(current.clone()),
            }
        }
    }

    pub(crate) fn remove_dependent_task(&self, reader: &Arc<Task>) {
        match self {
            SlotRef::TaskOutput(task) => {
                task.with_output_mut(|slot| {
                    slot.dependent_tasks.remove(reader);
                });
            }
            SlotRef::TaskCreated(task, index) => {
                task.with_created_slot_mut(*index, |slot| {
                    slot.dependent_tasks.remove(reader);
                });
            }
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            SlotRef::TaskOutput(_) => false,
            SlotRef::TaskCreated(_, _) => true,
        }
    }

    pub fn get_snapshot_for_visualization(&self) -> SlotSnapshot {
        match self {
            SlotRef::TaskOutput(task) => {
                task.with_output(|output| output.get_snapshot_for_visualization())
            }
            SlotRef::TaskCreated(task, index) => {
                task.with_created_slot(*index, |slot| slot.get_snapshot_for_visualization(*index))
            }
        }
    }
}

impl PartialEq<SlotRef> for SlotRef {
    fn eq(&self, other: &SlotRef) -> bool {
        match (self, other) {
            (Self::TaskOutput(a), Self::TaskOutput(b)) => Arc::ptr_eq(a, b),
            (Self::TaskCreated(a, ai), Self::TaskCreated(b, bi)) => Arc::ptr_eq(a, b) && ai == bi,
            _ => false,
        }
    }
}

impl Eq for SlotRef {}

impl Display for SlotRef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SlotRef::TaskOutput(task) => {
                write!(f, "task output {}", task)
            }
            SlotRef::TaskCreated(task, index) => {
                write!(f, "task created {} {}", task, index)
            }
        }
    }
}

impl Debug for SlotRef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SlotRef::TaskOutput(task) => f
                .debug_struct("SlotRef::TaskOutput")
                .field("task", task)
                .finish(),
            SlotRef::TaskCreated(task, index) => f
                .debug_struct("SlotRef::TaskCreated")
                .field("task", task)
                .field("index", index)
                .finish(),
        }
    }
}

impl Hash for SlotRef {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            SlotRef::TaskOutput(task) => {
                Hash::hash(&Arc::as_ptr(task), state);
            }
            SlotRef::TaskCreated(task, index) => {
                Hash::hash(&Arc::as_ptr(task), state);
                Hash::hash(&index, state);
            }
        }
    }
}
