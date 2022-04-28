use std::{
    any::{type_name, Any},
    fmt::{Debug, Display},
    future::Future,
    hash::Hash,
    pin::Pin,
    sync::Arc,
};

use any_key::AnyHash;
use anyhow::{anyhow, Result};
use serde::Serialize;

use crate::{
    id::{FunctionId, TraitTypeId},
    magic_any::MagicAny,
    manager::read_task_output,
    registry,
    slot::SlotContent,
    turbo_tasks,
    util::try_join_all,
    value::Value,
    RawVc, Task, TaskId, TraitType, TurboTasks, ValueTypeId,
};

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
impl PartialOrd for SharedReference {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        PartialOrd::partial_cmp(
            &(&*self.0 as *const (dyn Any + Send + Sync)),
            &(&*other.0 as *const (dyn Any + Send + Sync)),
        )
    }
}
impl Ord for SharedReference {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        Ord::cmp(
            &(&*self.0 as *const (dyn Any + Send + Sync)),
            &(&*other.0 as *const (dyn Any + Send + Sync)),
        )
    }
}

#[allow(clippy::derive_hash_xor_eq)]
#[derive(Hash, Clone, PartialOrd, Ord)]
pub enum TaskInput {
    TaskOutput(TaskId),
    TaskSlot(TaskId, usize),
    List(Vec<TaskInput>),
    String(String),
    Bool(bool),
    Usize(usize),
    I32(i32),
    U32(u32),
    Nothing,
    SharedValue(Arc<dyn MagicAny>),
    SharedReference(ValueTypeId, SharedReference),
}

impl TaskInput {
    pub async fn resolve_to_value(self) -> Result<TaskInput> {
        let tt = turbo_tasks();
        let mut current = self;
        loop {
            current = match current {
                TaskInput::TaskOutput(task_id) => read_task_output(&*tt, task_id).await?.into(),
                TaskInput::TaskSlot(task_id, index) => tt.read_task_slot(task_id, index).into(),
                _ => return Ok(current),
            }
        }
    }

    pub async fn resolve(self) -> Result<TaskInput> {
        let tt = turbo_tasks();
        let mut current = self;
        loop {
            current = match current {
                TaskInput::TaskOutput(task_id) => read_task_output(&*tt, task_id).await?.into(),
                TaskInput::List(list) => {
                    if list.iter().all(|i| i.is_resolved()) {
                        return Ok(TaskInput::List(list));
                    }
                    fn resolve_all(
                        list: Vec<TaskInput>,
                    ) -> Pin<Box<dyn Future<Output = Result<Vec<TaskInput>>> + Send>>
                    {
                        Box::pin(try_join_all(list.into_iter().map(|i| i.resolve())))
                    }
                    return Ok(TaskInput::List(resolve_all(list).await?));
                }
                _ => return Ok(current),
            }
        }
    }

    pub(crate) fn get_task_id(&self) -> Option<TaskId> {
        match self {
            TaskInput::TaskOutput(t) | TaskInput::TaskSlot(t, _) => Some(*t),
            _ => None,
        }
    }

    pub fn get_trait_method(&self, trait_type: TraitTypeId, name: String) -> Option<FunctionId> {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskSlot(_, _) => {
                panic!("get_trait_method must be called on a resolved TaskInput")
            }
            TaskInput::SharedReference(ty, _) => registry::get_value_type(*ty)
                .trait_methods
                .get(&(trait_type, name))
                .map(|r| *r),
            _ => None,
        }
    }

    pub fn has_trait(&self, trait_type: TraitTypeId) -> bool {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskSlot(_, _) => {
                panic!("has_trait() must be called on a resolved TaskInput")
            }
            TaskInput::SharedReference(ty, _) => {
                registry::get_value_type(*ty).traits.contains(&trait_type)
            }
            _ => false,
        }
    }

    pub fn traits(&self) -> Vec<&'static TraitType> {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskSlot(_, _) => {
                panic!("traits() must be called on a resolved TaskInput")
            }
            TaskInput::SharedReference(ty, _) => registry::get_value_type(*ty)
                .traits
                .iter()
                .map(|t| registry::get_trait(*t))
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            TaskInput::TaskOutput(_) => false,
            TaskInput::List(list) => list.iter().all(|i| i.is_resolved()),
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
            (Self::TaskOutput(l0), Self::TaskOutput(r0)) => l0 == r0,
            (Self::TaskSlot(l0, l1), Self::TaskSlot(r0, r1)) => l0 == r0 && l1 == r1,
            (Self::List(l0), Self::List(r0)) => l0 == r0,
            (Self::String(l0), Self::String(r0)) => l0 == r0,
            (Self::Bool(l0), Self::Bool(r0)) => l0 == r0,
            (Self::Usize(l0), Self::Usize(r0)) => l0 == r0,
            (Self::I32(l0), Self::I32(r0)) => l0 == r0,
            (Self::U32(l0), Self::U32(r0)) => l0 == r0,
            (Self::SharedValue(l0), Self::SharedValue(r0)) => AnyHash::eq(l0, r0),
            (Self::SharedReference(l0, l1), Self::SharedReference(r0, r1)) => l0 == r0 && l1 == r1,
            (Self::Nothing, Self::Nothing) => true,
            _ => false,
        }
    }
}

impl Eq for TaskInput {}

impl From<RawVc> for TaskInput {
    fn from(raw_vc: RawVc) -> Self {
        match raw_vc {
            RawVc::TaskOutput(task) => TaskInput::TaskOutput(task),
            RawVc::TaskSlot(task, i) => TaskInput::TaskSlot(task, i),
        }
    }
}

impl From<SlotContent> for TaskInput {
    fn from(content: SlotContent) -> Self {
        match content {
            SlotContent::Empty => TaskInput::Nothing,
            SlotContent::SharedReference(ty, data) => {
                TaskInput::SharedReference(ty, SharedReference(data))
            }
        }
    }
}

impl Display for TaskInput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskInput::TaskOutput(task) => write!(f, "task output {}", task),
            TaskInput::TaskSlot(task, index) => write!(f, "slot {} in {}", index, task),
            TaskInput::List(list) => write!(
                f,
                "list {}",
                list.iter()
                    .map(|i| i.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            TaskInput::String(s) => write!(f, "string {:?}", s),
            TaskInput::Bool(b) => write!(f, "bool {:?}", b),
            TaskInput::Usize(v) => write!(f, "usize {}", v),
            TaskInput::I32(v) => write!(f, "i32 {}", v),
            TaskInput::U32(v) => write!(f, "u32 {}", v),
            TaskInput::Nothing => write!(f, "nothing"),
            TaskInput::SharedValue(_) => write!(f, "any value"),
            TaskInput::SharedReference(ty, _) => {
                write!(f, "shared reference {}", registry::get_value_type(*ty).name)
            }
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

impl From<bool> for TaskInput {
    fn from(b: bool) -> Self {
        TaskInput::Bool(b)
    }
}

impl From<i32> for TaskInput {
    fn from(v: i32) -> Self {
        TaskInput::I32(v)
    }
}

impl From<u32> for TaskInput {
    fn from(v: u32) -> Self {
        TaskInput::U32(v)
    }
}

impl From<usize> for TaskInput {
    fn from(v: usize) -> Self {
        TaskInput::Usize(v)
    }
}

impl<T: Any + Debug + Clone + Hash + Eq + Ord + Send + Sync + 'static> From<Value<T>>
    for TaskInput
{
    fn from(v: Value<T>) -> Self {
        TaskInput::SharedValue(Arc::new(v))
    }
}

impl<T: Into<TaskInput>> From<Vec<T>> for TaskInput {
    fn from(s: Vec<T>) -> Self {
        TaskInput::List(s.into_iter().map(|i| i.into()).collect())
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

impl TryFrom<&TaskInput> for bool {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::Bool(b) => Ok(*b),
            _ => Err(anyhow!("invalid task input type, expected bool")),
        }
    }
}

impl<'a, T: TryFrom<&'a TaskInput, Error = anyhow::Error>> TryFrom<&'a TaskInput> for Vec<T> {
    type Error = anyhow::Error;

    fn try_from(value: &'a TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::List(list) => Ok(list
                .iter()
                .map(|i| i.try_into())
                .collect::<Result<Vec<_>, _>>()?),
            _ => Err(anyhow!("invalid task input type, expected list")),
        }
    }
}

impl TryFrom<&TaskInput> for u32 {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::U32(value) => Ok(*value),
            _ => Err(anyhow!("invalid task input type, expected u32")),
        }
    }
}

impl TryFrom<&TaskInput> for i32 {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::I32(value) => Ok(*value),
            _ => Err(anyhow!("invalid task input type, expected i32")),
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

impl<T: Any + Debug + Clone + Hash + Eq + Ord + Send + Sync + 'static> TryFrom<&TaskInput>
    for Value<T>
{
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::SharedValue(value) => {
                let v = value.downcast_ref::<Value<T>>().ok_or_else(|| {
                    anyhow!(
                        "invalid task input type, expected {} got {:?}",
                        type_name::<Value<T>>(),
                        value,
                    )
                })?;
                Ok(v.clone())
            }
            _ => Err(anyhow!(
                "invalid task input type, expected Value<{}>",
                type_name::<T>()
            )),
        }
    }
}

impl TryFrom<&TaskInput> for RawVc {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::TaskOutput(task) => Ok(RawVc::TaskOutput(*task)),
            TaskInput::TaskSlot(task, index) => Ok(RawVc::TaskSlot(*task, *index)),
            _ => Err(anyhow!("invalid task input type, expected slot ref")),
        }
    }
}
