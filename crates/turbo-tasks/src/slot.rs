use anyhow::{anyhow, Result};
use std::{
    any::Any,
    collections::HashSet,
    fmt::{Debug, Display},
    sync::Arc,
};

use crate::{
    id::ValueTypeId,
    manager::schedule_notify_tasks,
    raw_vc::{RawVc, RawVcReadResult},
    registry,
    task_input::SharedReference,
    TaskId,
};

#[derive(Default, Debug)]
pub struct Slot {
    content: SlotContent,
    updates: u32,
    pub(crate) dependent_tasks: HashSet<TaskId>,
}

#[derive(Clone, Debug)]
pub enum SlotContent {
    Empty,
    // TODO wrap in SharedReference
    SharedReference(ValueTypeId, Arc<dyn Any + Send + Sync>),
}

impl Default for SlotContent {
    fn default() -> Self {
        SlotContent::Empty
    }
}

impl Display for SlotContent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SlotContent::Empty => write!(f, "empty"),
            SlotContent::SharedReference(ty, _) => {
                write!(f, "shared {}", registry::get_value_type(*ty).name)
            }
        }
    }
}

impl SlotContent {
    pub fn cast<T: Any + Send + Sync>(self) -> Result<RawVcReadResult<T>> {
        match self {
            SlotContent::Empty => Err(anyhow!("Slot it empty")),
            SlotContent::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                Ok(data) => Ok(RawVcReadResult::shared_reference(data)),
                Err(_) => Err(anyhow!("Unexpected type in slot")),
            },
        }
    }

    pub fn try_cast<T: Any + Send + Sync>(self) -> Option<RawVcReadResult<T>> {
        match self {
            SlotContent::Empty => None,
            SlotContent::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                Ok(data) => Some(RawVcReadResult::shared_reference(data)),
                Err(_) => None,
            },
        }
    }
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

    pub fn assign(&mut self, content: SlotContent) {
        self.content = content;
        self.updates += 1;
        // notify
        schedule_notify_tasks(self.dependent_tasks.iter());
    }
}
