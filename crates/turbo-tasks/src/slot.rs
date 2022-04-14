use anyhow::{anyhow, Result};
use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::{Hash, Hasher},
    sync::{Arc, Weak},
};
use weak_table::WeakHashSet;

use crate::{
    raw_vc::{RawVc, RawVcReadResult},
    task_input::{SharedReference, TaskInput},
    SlotValueType, Task, TurboTasks,
};

#[derive(Default, Debug)]
pub struct Slot {
    content: SlotContent,
    updates: u32,
    pub(crate) dependent_tasks: WeakHashSet<Weak<Task>>,
}

#[derive(Clone, Debug)]
pub enum SlotContent {
    Empty,
    SharedReference(&'static SlotValueType, Arc<dyn Any + Send + Sync>),
    Cloneable(&'static SlotValueType, Box<dyn CloneableData>),
}

pub trait CloneableData: Debug + Any + Send + Sync {
    fn as_any(&self) -> Box<dyn Any + Send + Sync>;
    fn clone_cloneable(&self) -> Box<dyn CloneableData>;
    fn eq(&self, other: &dyn Any) -> bool;
    fn hash_cloneable(&self, state: &mut dyn Hasher);
}

impl Clone for Box<dyn CloneableData> {
    fn clone(&self) -> Self {
        self.clone_cloneable()
    }
}

impl Hash for Box<dyn CloneableData> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.hash_cloneable(state as &mut dyn Hasher)
    }
}

impl PartialEq for Box<dyn CloneableData> {
    fn eq(&self, other: &Self) -> bool {
        (self as &dyn CloneableData).eq(&other.as_any())
    }
}

impl Eq for Box<dyn CloneableData> {}

impl<T: PartialEq + Hash + Debug + Clone + Sync + Send + 'static> CloneableData for T {
    fn as_any(&self) -> Box<dyn Any + Send + Sync> {
        Box::new(self.clone())
    }

    fn clone_cloneable(&self) -> Box<dyn CloneableData> {
        Box::new(self.clone())
    }

    fn eq(&self, other: &dyn Any) -> bool {
        if let Some(other) = other.downcast_ref() {
            *self == *other
        } else {
            false
        }
    }

    fn hash_cloneable(&self, state: &mut dyn Hasher) {
        Hash::hash(self, &mut Box::new(state))
    }
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
            SlotContent::SharedReference(ty, _) => write!(f, "shared {}", ty.name),
            SlotContent::Cloneable(ty, _) => write!(f, "cloneable {}", ty.name),
        }
    }
}

impl Slot {
    pub fn new() -> Self {
        Self {
            content: SlotContent::Empty,
            updates: 0,
            dependent_tasks: WeakHashSet::new(),
        }
    }

    pub fn conditional_update_shared<
        T: Send + Sync + 'static,
        F: FnOnce(Option<&T>) -> Option<T>,
    >(
        &mut self,
        ty: &'static SlotValueType,
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
            SlotContent::Cloneable(old_ty, old_content) => {
                if *old_ty != ty {
                    _type_change = true;
                    change = functor(None);
                } else {
                    if let Ok(old_content) = old_content.as_any().downcast::<T>() {
                        change = functor(Some(&*old_content));
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

    pub fn conditional_update_cloneable<
        T: PartialEq + Hash + Clone + Debug + Send + Sync + 'static,
        F: FnOnce(Option<&T>) -> Option<T>,
    >(
        &mut self,
        ty: &'static SlotValueType,
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
            SlotContent::Cloneable(old_ty, old_content) => {
                if *old_ty != ty {
                    _type_change = true;
                    change = functor(None);
                } else {
                    if let Ok(old_content) = old_content.as_any().downcast::<T>() {
                        change = functor(Some(&*old_content));
                    } else {
                        panic!("This can't happen as the type is compared");
                    }
                }
            }
        };
        if let Some(new_content) = change {
            self.assign(SlotContent::Cloneable(ty, Box::new(new_content)))
        }
    }

    pub fn compare_and_update_shared<T: PartialEq + Send + Sync + 'static>(
        &mut self,
        ty: &'static SlotValueType,
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

    pub fn compare_and_update_cloneable<
        T: PartialEq + Hash + Clone + Debug + PartialEq + Send + Sync + 'static,
    >(
        &mut self,
        ty: &'static SlotValueType,
        new_content: T,
    ) {
        self.conditional_update_cloneable(ty, |old_content| {
            if let Some(old_content) = old_content {
                if PartialEq::eq(&new_content, old_content) {
                    return None;
                }
            }
            Some(new_content)
        });
    }

    pub fn update_shared<T: Send + Sync + 'static>(
        &mut self,
        ty: &'static SlotValueType,
        new_content: T,
    ) {
        self.assign(SlotContent::SharedReference(ty, Arc::new(new_content)))
    }

    pub fn read<T: Any + Send + Sync>(&mut self, reader: Arc<Task>) -> Result<SlotReadResult<T>> {
        self.dependent_tasks.insert(reader);
        match &self.content {
            SlotContent::Empty => Err(anyhow!("Slot it empty")),
            SlotContent::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                Ok(data) => Ok(SlotReadResult::Final(RawVcReadResult::shared_reference(
                    data,
                ))),
                Err(_) => Err(anyhow!("Unexpected type in slot")),
            },
            SlotContent::Cloneable(_, data) => {
                match Box::<dyn Any + Send + Sync>::downcast(data.as_any()) {
                    Ok(data) => Ok(SlotReadResult::Final(RawVcReadResult::cloned_data(data))),
                    Err(_) => Err(anyhow!("Unexpected type in slot")),
                }
            }
        }
    }

    pub fn resolve(&mut self, reader: Arc<Task>) -> Result<TaskInput> {
        self.dependent_tasks.insert(reader);
        match &self.content {
            SlotContent::Empty => Ok(TaskInput::Nothing),
            SlotContent::SharedReference(ty, data) => Ok(TaskInput::SharedReference(
                ty,
                SharedReference(data.clone()),
            )),
            SlotContent::Cloneable(ty, data) => Ok(TaskInput::CloneableData(ty, data.clone())),
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
