use anyhow::{anyhow, Error, Result};
use std::{
    fmt::{Debug, Display},
    sync::{Arc, Weak},
};
use weak_table::WeakHashSet;

use crate::{error::SharedError, viz::SlotSnapshot, SlotRef, Task, TurboTasks};

#[derive(Default, Debug)]
pub struct Output {
    pub(crate) content: OutputContent,
    updates: u32,
    pub(crate) dependent_tasks: WeakHashSet<Weak<Task>>,
}

#[derive(Clone, Debug)]
pub enum OutputContent {
    Empty,
    Link(SlotRef),
    Error(SharedError),
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
            OutputContent::Link(slot_ref) => write!(f, "link {}", slot_ref),
            OutputContent::Error(err) => write!(f, "error {}", err),
        }
    }
}

impl Output {
    pub fn read(&mut self, reader: Arc<Task>) -> Result<SlotRef> {
        self.dependent_tasks.insert(reader);
        match &self.content {
            OutputContent::Empty => Err(anyhow!("Output it empty")),
            OutputContent::Error(err) => Err(err.clone().into()),
            OutputContent::Link(slot_ref) => Ok(slot_ref.clone()),
        }
    }

    pub fn link(&mut self, target: SlotRef) {
        let change;
        let mut _type_change = false;
        match &self.content {
            OutputContent::Link(old_target) => {
                if match (old_target, &target) {
                    (SlotRef::TaskOutput(old_task), SlotRef::TaskOutput(new_task)) => {
                        Arc::ptr_eq(old_task, new_task)
                    }
                    (
                        SlotRef::TaskCreated(old_task, old_index),
                        SlotRef::TaskCreated(new_task, new_index),
                    ) => Arc::ptr_eq(old_task, new_task) && *old_index == *new_index,
                    _ => false,
                } {
                    change = None;
                } else {
                    change = Some(target);
                }
            }
            OutputContent::Empty | OutputContent::Error(_) => {
                change = Some(target);
            }
        };
        if let Some(target) = change {
            self.assign(OutputContent::Link(target))
        }
    }

    pub fn error(&mut self, error: Error) {
        self.content = OutputContent::Error(SharedError::new(error));
        self.updates += 1;
        // notify
        TurboTasks::schedule_notify_tasks(self.dependent_tasks.iter());
    }

    pub fn assign(&mut self, content: OutputContent) {
        self.content = content;
        self.updates += 1;
        // notify
        TurboTasks::schedule_notify_tasks(self.dependent_tasks.iter());
    }

    pub fn get_snapshot_for_visualization(&self) -> SlotSnapshot {
        SlotSnapshot {
            name: "output".to_string(),
            content: self.content.to_string(),
            updates: self.updates,
            linked_to_slot: match &self.content {
                OutputContent::Link(slot_ref) => Some(slot_ref.clone()),
                _ => None,
            },
        }
    }
}
