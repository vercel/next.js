use std::{any::Any, fmt::Display, hash::Hash, sync::Arc};

use any_key::AnyHash;
use anyhow::{anyhow, Result};

use crate::{slot::CloneableData, NativeFunction, SlotRef, SlotValueType, Task, TraitType};

#[derive(Clone)]
pub struct SharedReference(pub Arc<dyn Any + Send + Sync>);

impl Hash for SharedReference {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&(&*self.0 as *const (dyn Any + Send + Sync)), state)
    }
}
impl PartialEq for SharedReference {
    fn eq(&self, other: &Self) -> bool {
        PartialEq::eq(
            &(&*self.0 as *const (dyn Any + Send + Sync)),
            &(&*other.0 as *const (dyn Any + Send + Sync)),
        )
    }
}
impl Eq for SharedReference {}

#[derive(Hash, Clone)]
pub enum TaskInput {
    TaskOutput(Arc<Task>),
    TaskCreated(Arc<Task>, usize),
    String(String),
    Usize(usize),
    I32(i32),
    Nothing,
    SharedValue(Arc<dyn AnyHash + Send + Sync>),
    SharedReference(&'static SlotValueType, SharedReference),
    CloneableData(&'static SlotValueType, Box<dyn CloneableData>),
}

impl TaskInput {
    pub async fn resolve_to_value(self) -> Result<TaskInput> {
        let mut current = self;
        loop {
            current = match current {
                TaskInput::TaskOutput(ref task) => task
                    .with_done_output(|output| {
                        Task::with_current(|reader| {
                            reader.add_dependency(SlotRef::TaskOutput(task.clone()));
                            output.read(reader.clone())
                        })
                    })
                    .await?
                    .into(),
                TaskInput::TaskCreated(ref task, index) => Task::with_current(|reader| {
                    reader.add_dependency(SlotRef::TaskCreated(task.clone(), index));
                    task.with_created_slot_mut(index, |slot| slot.resolve(reader.clone()))
                })?,
                _ => return Ok(current),
            }
        }
    }

    pub async fn resolve(self) -> Result<TaskInput> {
        let mut current = self;
        loop {
            current = match current {
                TaskInput::TaskOutput(ref task) => task
                    .with_done_output(|output| {
                        Task::with_current(|reader| {
                            reader.add_dependency(SlotRef::TaskOutput(task.clone()));
                            output.read(reader.clone())
                        })
                    })
                    .await?
                    .into(),
                _ => return Ok(current),
            }
        }
    }

    pub fn get_trait_method(
        &self,
        trait_type: &'static TraitType,
        name: String,
    ) -> Option<&'static NativeFunction> {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskCreated(_, _) => {
                panic!("get_trait_method must be called on a resolved TaskInput")
            }
            TaskInput::SharedReference(ty, _) | TaskInput::CloneableData(ty, _) => {
                ty.trait_methods.get(&(trait_type, name)).map(|r| *r)
            }
            _ => None,
        }
    }

    pub fn has_trait(&self, trait_type: &'static TraitType) -> bool {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskCreated(_, _) => {
                panic!("has_trait() must be called on a resolved TaskInput")
            }
            TaskInput::SharedReference(ty, _) | TaskInput::CloneableData(ty, _) => {
                ty.traits.contains(&trait_type)
            }
            _ => false,
        }
    }

    pub fn traits(&self) -> Vec<&'static TraitType> {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskCreated(_, _) => {
                panic!("traits() must be called on a resolved TaskInput")
            }
            TaskInput::SharedReference(ty, _) | TaskInput::CloneableData(ty, _) => {
                ty.traits.iter().map(|t| *t).collect()
            }
            _ => Vec::new(),
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            TaskInput::TaskOutput(_) => false,
            _ => true,
        }
    }

    pub fn is_nothing(&self) -> bool {
        match self {
            TaskInput::Nothing => true,
            _ => false,
        }
    }
}

impl PartialEq for TaskInput {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::TaskOutput(l0), Self::TaskOutput(r0)) => Arc::ptr_eq(l0, r0),
            (Self::TaskCreated(l0, l1), Self::TaskCreated(r0, r1)) => {
                Arc::ptr_eq(l0, r0) && l1 == r1
            }
            (Self::String(l0), Self::String(r0)) => l0 == r0,
            (Self::Usize(l0), Self::Usize(r0)) => l0 == r0,
            (Self::I32(l0), Self::I32(r0)) => l0 == r0,
            (Self::SharedValue(l0), Self::SharedValue(r0)) => AnyHash::eq(l0, r0),
            (Self::SharedReference(l0, l1), Self::SharedReference(r0, r1)) => l0 == r0 && l1 == r1,
            (Self::CloneableData(l0, l1), Self::CloneableData(r0, r1)) => l0 == r0 && l1 == r1,
            (Self::Nothing, Self::Nothing) => true,
            _ => false,
        }
    }
}

impl Eq for TaskInput {}

impl From<SlotRef> for TaskInput {
    fn from(slot_ref: SlotRef) -> Self {
        match slot_ref {
            SlotRef::TaskOutput(task) => TaskInput::TaskOutput(task),
            SlotRef::TaskCreated(task, i) => TaskInput::TaskCreated(task, i),
        }
    }
}

impl Display for TaskInput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskInput::TaskOutput(task) => write!(f, "task output {}", task),
            TaskInput::TaskCreated(task, index) => write!(f, "slot {} in {}", index, task),
            TaskInput::String(s) => write!(f, "string {:?}", s),
            TaskInput::Usize(v) => write!(f, "usize {}", v),
            TaskInput::I32(v) => write!(f, "i32 {}", v),
            TaskInput::Nothing => write!(f, "nothing"),
            TaskInput::SharedValue(_) => write!(f, "any value"),
            TaskInput::SharedReference(ty, _) => write!(f, "shared reference {}", ty.name),
            TaskInput::CloneableData(ty, _) => write!(f, "cloneable data {}", ty.name),
        }
    }
}

impl From<String> for TaskInput {
    fn from(s: String) -> Self {
        TaskInput::String(s)
    }
}

impl From<&str> for TaskInput {
    fn from(s: &str) -> Self {
        TaskInput::String(s.to_string())
    }
}

impl From<usize> for TaskInput {
    fn from(v: usize) -> Self {
        TaskInput::Usize(v)
    }
}

impl TryFrom<&TaskInput> for String {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::String(str) => Ok(str.to_string()),
            _ => Err(anyhow!("invalid task input type, expected string")),
        }
    }
}

impl<'a> TryFrom<&'a TaskInput> for &'a str {
    type Error = anyhow::Error;

    fn try_from(value: &'a TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::String(str) => Ok(&str),
            _ => Err(anyhow!("invalid task input type, expected string")),
        }
    }
}

impl TryFrom<&TaskInput> for usize {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::Usize(value) => Ok(*value),
            _ => Err(anyhow!("invalid task input type, expected usize")),
        }
    }
}

impl TryFrom<&TaskInput> for SlotRef {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::TaskOutput(task) => Ok(SlotRef::TaskOutput(task.clone())),
            TaskInput::TaskCreated(task, index) => Ok(SlotRef::TaskCreated(task.clone(), *index)),
            _ => Err(anyhow!("invalid task input type, expected slot ref")),
        }
    }
}
