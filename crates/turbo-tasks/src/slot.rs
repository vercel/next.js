use anyhow::{anyhow, Result};
use std::{
    any::Any,
    collections::HashSet,
    fmt::{Debug, Display},
    sync::Arc,
};

use crate::{
    id::ValueTypeId,
    raw_vc::{RawVc, RawVcReadResult},
    registry,
    task_input::SharedReference,
    TaskId, TurboTasks,
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
                write!(f, "shared {}", registry::get_value(*ty).name)
            }
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

    pub fn conditional_update_shared<
        T: Send + Sync + 'static,
        F: FnOnce(Option<&T>) -> Option<T>,
    >(
        &mut self,
        ty: ValueTypeId,
        functor: F,
    ) {
        let change;
        let mut _type_change = false;
        match &self.content {
            SlotContent::Empty => {
                _type_change = true;
                change = functor(None);
            }
            SlotContent::SharedReference(old_ty, old_content) => {
                if *old_ty != ty {
                    _type_change = true;
                    change = functor(None);
                } else {
                    if let Some(old_content) = old_content.downcast_ref::<T>() {
                        change = functor(Some(old_content));
                    } else {
                        panic!("This can't happen as the type is compared");
                    }
                }
            }
        };
        if let Some(new_content) = change {
            self.assign(SlotContent::SharedReference(ty, Arc::new(new_content)))
        }
    }

    pub fn compare_and_update_shared<T: PartialEq + Send + Sync + 'static>(
        &mut self,
        ty: ValueTypeId,
        new_content: T,
    ) {
        self.conditional_update_shared(ty, |old_content| {
            if let Some(old_content) = old_content {
                if PartialEq::eq(&new_content, old_content) {
                    return None;
                }
            }
            Some(new_content)
        });
    }

    pub fn update_shared<T: Send + Sync + 'static>(&mut self, ty: ValueTypeId, new_content: T) {
        self.assign(SlotContent::SharedReference(ty, Arc::new(new_content)))
    }

    pub fn read<T: Any + Send + Sync>(&mut self, reader: TaskId) -> Result<SlotReadResult<T>> {
        self.dependent_tasks.insert(reader);
        unsafe { self.read_untracked() }
    }

    pub unsafe fn read_untracked<T: Any + Send + Sync>(&mut self) -> Result<SlotReadResult<T>> {
        match &self.content {
            SlotContent::Empty => Err(anyhow!("Slot it empty")),
            SlotContent::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                Ok(data) => Ok(SlotReadResult::Final(RawVcReadResult::shared_reference(
                    data,
                ))),
                Err(_) => Err(anyhow!("Unexpected type in slot")),
            },
        }
    }

    pub fn resolve(&mut self, reader: TaskId) -> Option<(ValueTypeId, SharedReference)> {
        self.dependent_tasks.insert(reader);
        match &self.content {
            SlotContent::Empty => None,
            SlotContent::SharedReference(ty, data) => Some((*ty, SharedReference(data.clone()))),
        }
    }

    pub fn assign(&mut self, content: SlotContent) {
        self.content = content;
        self.updates += 1;
        // notify
        TurboTasks::schedule_notify_tasks(self.dependent_tasks.iter());
    }
}

pub enum SlotReadResult<T: Any + Send + Sync> {
    Final(RawVcReadResult<T>),
    Link(RawVc),
}
