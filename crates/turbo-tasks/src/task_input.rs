use std::{
    any::{type_name, Any},
    borrow::Cow,
    fmt::{Debug, Display},
    future::Future,
    hash::Hash,
    pin::Pin,
    sync::Arc,
};

use anyhow::{anyhow, Result};
use serde::{ser::SerializeTuple, Deserialize, Serialize};

use crate::{
    backend::CellContent,
    id::{FunctionId, TraitTypeId},
    magic_any::MagicAny,
    manager::{read_task_cell, read_task_output},
    registry, turbo_tasks,
    value::{TransientInstance, TransientValue, Value},
    value_type::TypedForInput,
    CellId, RawVc, TaskId, TraitType, Typed, ValueTypeId,
};

#[derive(Clone)]
pub struct SharedReference(pub Option<ValueTypeId>, pub Arc<dyn Any + Send + Sync>);

impl SharedReference {
    pub fn downcast<T: Any + Send + Sync>(self) -> Option<Arc<T>> {
        match Arc::downcast(self.1) {
            Ok(data) => Some(data),
            Err(_) => None,
        }
    }
}

impl Hash for SharedReference {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&(&*self.1 as *const (dyn Any + Send + Sync)), state)
    }
}
impl PartialEq for SharedReference {
    fn eq(&self, other: &Self) -> bool {
        PartialEq::eq(
            &(&*self.1 as *const (dyn Any + Send + Sync)),
            &(&*other.1 as *const (dyn Any + Send + Sync)),
        )
    }
}
impl Eq for SharedReference {}
impl PartialOrd for SharedReference {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        PartialOrd::partial_cmp(
            &(&*self.1 as *const (dyn Any + Send + Sync)),
            &(&*other.1 as *const (dyn Any + Send + Sync)),
        )
    }
}
impl Ord for SharedReference {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        Ord::cmp(
            &(&*self.1 as *const (dyn Any + Send + Sync)),
            &(&*other.1 as *const (dyn Any + Send + Sync)),
        )
    }
}
impl Debug for SharedReference {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("SharedReference")
            .field(&self.0)
            .field(&self.1)
            .finish()
    }
}

impl Serialize for SharedReference {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        if let SharedReference(Some(ty), arc) = self {
            let value_type = registry::get_value_type(*ty);
            if let Some(serializable) = value_type.any_as_serializable(arc) {
                let mut t = serializer.serialize_tuple(2)?;
                t.serialize_element(registry::get_value_type_global_name(*ty))?;
                t.serialize_element(serializable)?;
                t.end()
            } else {
                Err(serde::ser::Error::custom(format!(
                    "{:?} is not serializable",
                    arc
                )))
            }
        } else {
            Err(serde::ser::Error::custom(
                "untyped values are not serializable",
            ))
        }
    }
}

impl Display for SharedReference {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(ty) = self.0 {
            write!(f, "value of type {}", registry::get_value_type(ty).name)
        } else {
            write!(f, "untyped value")
        }
    }
}

impl<'de> Deserialize<'de> for SharedReference {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = SharedReference;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a serializable shared reference")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::SeqAccess<'de>,
            {
                if let Some(global_name) = seq.next_element()? {
                    if let Some(ty) = registry::get_value_type_id_by_global_name(global_name) {
                        if let Some(seed) = registry::get_value_type(ty).get_any_deserialize_seed()
                        {
                            if let Some(value) = seq.next_element_seed(seed)? {
                                Ok(SharedReference(Some(ty), value.into()))
                            } else {
                                Err(serde::de::Error::invalid_length(
                                    1,
                                    &"tuple with type and value",
                                ))
                            }
                        } else {
                            Err(serde::de::Error::custom(format!(
                                "{ty} is not deserializable"
                            )))
                        }
                    } else {
                        Err(serde::de::Error::unknown_variant(global_name, &[]))
                    }
                } else {
                    Err(serde::de::Error::invalid_length(
                        0,
                        &"tuple with type and value",
                    ))
                }
            }
        }

        deserializer.deserialize_tuple(2, Visitor)
    }
}

#[derive(Debug, Clone, PartialOrd, Ord)]
pub struct TransientSharedValue(pub Arc<dyn MagicAny>);

impl TransientSharedValue {
    pub fn downcast<T: MagicAny>(self) -> Option<Arc<T>> {
        match Arc::downcast(self.0.magic_any_arc()) {
            Ok(data) => Some(data),
            Err(_) => None,
        }
    }
}

impl Hash for TransientSharedValue {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}

impl PartialEq for TransientSharedValue {
    #[allow(clippy::op_ref)]
    fn eq(&self, other: &Self) -> bool {
        &self.0 == &other.0
    }
}
impl Eq for TransientSharedValue {}
impl Serialize for TransientSharedValue {
    fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Err(serde::ser::Error::custom(
            "Transient values can't be serialized",
        ))
    }
}
impl<'de> Deserialize<'de> for TransientSharedValue {
    fn deserialize<D>(_deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        unreachable!("Transient values can't be serialized")
    }
}

#[derive(Debug, Clone, PartialOrd, Ord)]
pub struct SharedValue(pub Option<ValueTypeId>, pub Arc<dyn MagicAny>);

impl SharedValue {
    pub fn downcast<T: Any + Send + Sync>(self) -> Option<Arc<T>> {
        match Arc::downcast(self.1.magic_any_arc()) {
            Ok(data) => Some(data),
            Err(_) => None,
        }
    }
}

impl PartialEq for SharedValue {
    // this breaks without the ref
    #[allow(clippy::op_ref)]
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0 && &self.1 == &other.1
    }
}

impl Eq for SharedValue {}

impl Hash for SharedValue {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.hash(state);
        self.1.hash(state);
    }
}

impl Display for SharedValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(ty) = self.0 {
            write!(f, "value of type {}", registry::get_value_type(ty).name)
        } else {
            write!(f, "untyped value")
        }
    }
}

impl Serialize for SharedValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        if let SharedValue(Some(ty), arc) = self {
            let value_type = registry::get_value_type(*ty);
            if let Some(serializable) = value_type.magic_as_serializable(arc) {
                let mut t = serializer.serialize_tuple(2)?;
                t.serialize_element(registry::get_value_type_global_name(*ty))?;
                t.serialize_element(serializable)?;
                t.end()
            } else {
                Err(serde::ser::Error::custom(format!(
                    "{:?} is not serializable",
                    arc
                )))
            }
        } else {
            Err(serde::ser::Error::custom(
                "untyped values are not serializable",
            ))
        }
    }
}

impl<'de> Deserialize<'de> for SharedValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = SharedValue;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a serializable shared value")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::SeqAccess<'de>,
            {
                if let Some(global_name) = seq.next_element()? {
                    if let Some(ty) = registry::get_value_type_id_by_global_name(global_name) {
                        if let Some(seed) =
                            registry::get_value_type(ty).get_magic_deserialize_seed()
                        {
                            if let Some(value) = seq.next_element_seed(seed)? {
                                Ok(SharedValue(Some(ty), value.into()))
                            } else {
                                Err(serde::de::Error::invalid_length(
                                    1,
                                    &"tuple with type and value",
                                ))
                            }
                        } else {
                            Err(serde::de::Error::custom(format!(
                                "{ty} is not deserializable"
                            )))
                        }
                    } else {
                        Err(serde::de::Error::unknown_variant(global_name, &[]))
                    }
                } else {
                    Err(serde::de::Error::invalid_length(
                        0,
                        &"tuple with type and value",
                    ))
                }
            }
        }

        deserializer.deserialize_tuple(2, Visitor)
    }
}

#[allow(clippy::derive_hash_xor_eq)]
#[derive(Debug, Hash, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum TaskInput {
    TaskOutput(TaskId),
    TaskCell(TaskId, CellId),
    List(Vec<TaskInput>),
    String(String),
    Bool(bool),
    Usize(usize),
    I32(i32),
    U32(u32),
    U64(u64),
    Nothing,
    SharedValue(SharedValue),
    TransientSharedValue(TransientSharedValue),
    SharedReference(SharedReference),
}

impl TaskInput {
    pub async fn resolve_to_value(self) -> Result<TaskInput> {
        let tt = turbo_tasks();
        let mut current = self;
        loop {
            current = match current {
                TaskInput::TaskOutput(task_id) => {
                    read_task_output(&*tt, task_id, false).await?.into()
                }
                TaskInput::TaskCell(task_id, index) => {
                    read_task_cell(&*tt, task_id, index).await?.into()
                }
                _ => return Ok(current),
            }
        }
    }

    pub async fn resolve(self) -> Result<TaskInput> {
        let tt = turbo_tasks();
        let mut current = self;
        loop {
            current = match current {
                TaskInput::TaskOutput(task_id) => {
                    read_task_output(&*tt, task_id, false).await?.into()
                }
                TaskInput::List(list) => {
                    if list.iter().all(|i| i.is_resolved()) {
                        return Ok(TaskInput::List(list));
                    }
                    fn resolve_all(
                        list: Vec<TaskInput>,
                    ) -> Pin<Box<dyn Future<Output = Result<Vec<TaskInput>>> + Send>>
                    {
                        use crate::TryJoinIterExt;
                        Box::pin(list.into_iter().map(|i| i.resolve()).try_join())
                    }
                    return Ok(TaskInput::List(resolve_all(list).await?));
                }
                _ => return Ok(current),
            }
        }
    }

    pub fn get_task_id(&self) -> Option<TaskId> {
        match self {
            TaskInput::TaskOutput(t) | TaskInput::TaskCell(t, _) => Some(*t),
            _ => None,
        }
    }

    pub fn get_trait_method(
        &self,
        trait_type: TraitTypeId,
        name: Cow<'static, str>,
    ) -> Result<FunctionId, Cow<'static, str>> {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskCell(_, _) => {
                panic!("get_trait_method must be called on a resolved TaskInput")
            }
            TaskInput::SharedValue(SharedValue(ty, _))
            | TaskInput::SharedReference(SharedReference(ty, _)) => {
                if let Some(ty) = *ty {
                    let key = (trait_type, name);
                    if let Some(func) = registry::get_value_type(ty).get_trait_method(&key) {
                        Ok(*func)
                    } else if let Some(func) = registry::get_trait(trait_type)
                        .default_trait_methods
                        .get(&key.1)
                    {
                        Ok(*func)
                    } else {
                        Err(key.1)
                    }
                } else {
                    Err(name)
                }
            }
            _ => Err(name),
        }
    }

    pub fn has_trait(&self, trait_type: TraitTypeId) -> bool {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskCell(_, _) => {
                panic!("has_trait() must be called on a resolved TaskInput")
            }
            TaskInput::SharedValue(SharedValue(ty, _))
            | TaskInput::SharedReference(SharedReference(ty, _)) => {
                if let Some(ty) = *ty {
                    registry::get_value_type(ty).has_trait(&trait_type)
                } else {
                    false
                }
            }
            _ => false,
        }
    }

    pub fn traits(&self) -> Vec<&'static TraitType> {
        match self {
            TaskInput::TaskOutput(_) | TaskInput::TaskCell(_, _) => {
                panic!("traits() must be called on a resolved TaskInput")
            }
            TaskInput::SharedValue(SharedValue(ty, _))
            | TaskInput::SharedReference(SharedReference(ty, _)) => {
                if let Some(ty) = *ty {
                    registry::get_value_type(ty)
                        .traits_iter()
                        .map(registry::get_trait)
                        .collect()
                } else {
                    Vec::new()
                }
            }
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
        matches!(self, TaskInput::Nothing)
    }
}

pub trait FromTaskInput<'a>
where
    Self: Sized,
{
    type Error;

    fn try_from(value: &'a TaskInput) -> Result<Self, Self::Error>;
}

impl From<RawVc> for TaskInput {
    fn from(raw_vc: RawVc) -> Self {
        match raw_vc {
            RawVc::TaskOutput(task) => TaskInput::TaskOutput(task),
            RawVc::TaskCell(task, i) => TaskInput::TaskCell(task, i),
        }
    }
}

impl From<CellContent> for TaskInput {
    fn from(content: CellContent) -> Self {
        match content {
            CellContent(None) => TaskInput::Nothing,
            CellContent(Some(shared_ref)) => TaskInput::SharedReference(shared_ref),
        }
    }
}

impl Display for TaskInput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskInput::TaskOutput(task) => write!(f, "task output {}", task),
            TaskInput::TaskCell(task, index) => write!(f, "cell {} in {}", index, task),
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
            TaskInput::U64(v) => write!(f, "u64 {}", v),
            TaskInput::Nothing => write!(f, "nothing"),
            TaskInput::SharedValue(_) => write!(f, "any value"),
            TaskInput::TransientSharedValue(_) => write!(f, "any transient value"),
            TaskInput::SharedReference(data) => {
                write!(f, "shared reference with {}", data)
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

impl From<u64> for TaskInput {
    fn from(v: u64) -> Self {
        TaskInput::U64(v)
    }
}

impl From<usize> for TaskInput {
    fn from(v: usize) -> Self {
        TaskInput::Usize(v)
    }
}

impl<T> From<Option<T>> for TaskInput
where
    TaskInput: From<T>,
{
    fn from(v: Option<T>) -> Self {
        match v {
            None => TaskInput::Nothing,
            Some(v) => {
                let result = v.into();
                // Option<Option<T>> leads to problems with using Some(None)
                debug_assert!(result != TaskInput::Nothing);
                result
            }
        }
    }
}

impl<T: Any + Debug + Clone + Hash + Eq + Ord + Typed + TypedForInput + Send + Sync + 'static>
    From<Value<T>> for TaskInput
where
    T: Serialize,
    for<'de2> T: Deserialize<'de2>,
{
    fn from(v: Value<T>) -> Self {
        let raw_value: T = v.into_value();
        TaskInput::SharedValue(SharedValue(
            Some(T::get_value_type_id()),
            Arc::new(raw_value),
        ))
    }
}

impl<T: MagicAny + 'static> From<TransientValue<T>> for TaskInput {
    fn from(v: TransientValue<T>) -> Self {
        let raw_value: T = v.into_value();
        TaskInput::TransientSharedValue(TransientSharedValue(Arc::new(raw_value)))
    }
}

impl<T: Send + Sync + 'static> From<TransientInstance<T>> for TaskInput {
    fn from(v: TransientInstance<T>) -> Self {
        TaskInput::SharedReference(v.into())
    }
}

impl<T: Into<TaskInput>> From<Vec<T>> for TaskInput {
    fn from(s: Vec<T>) -> Self {
        TaskInput::List(s.into_iter().map(|i| i.into()).collect())
    }
}

impl FromTaskInput<'_> for RawVc {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::TaskCell(task, index) => Ok(RawVc::TaskCell(*task, *index)),
            TaskInput::TaskOutput(task) => Ok(RawVc::TaskOutput(*task)),
            _ => Err(anyhow!("invalid task input type, expected RawVc")),
        }
    }
}

impl FromTaskInput<'_> for String {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::String(str) => Ok(str.to_string()),
            _ => Err(anyhow!("invalid task input type, expected string")),
        }
    }
}

impl<'a> FromTaskInput<'a> for &'a str {
    type Error = anyhow::Error;

    fn try_from(value: &'a TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::String(str) => Ok(str),
            _ => Err(anyhow!("invalid task input type, expected string")),
        }
    }
}

impl FromTaskInput<'_> for bool {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::Bool(b) => Ok(*b),
            _ => Err(anyhow!("invalid task input type, expected bool")),
        }
    }
}

impl<'a, T: FromTaskInput<'a, Error = anyhow::Error>> FromTaskInput<'a> for Vec<T> {
    type Error = anyhow::Error;

    fn try_from(value: &'a TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::List(list) => Ok(list
                .iter()
                .map(|i| FromTaskInput::try_from(i))
                .collect::<Result<Vec<_>, _>>()?),
            _ => Err(anyhow!("invalid task input type, expected list")),
        }
    }
}

impl FromTaskInput<'_> for u32 {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::U32(value) => Ok(*value),
            _ => Err(anyhow!("invalid task input type, expected u32")),
        }
    }
}

impl FromTaskInput<'_> for i32 {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::I32(value) => Ok(*value),
            _ => Err(anyhow!("invalid task input type, expected i32")),
        }
    }
}

impl FromTaskInput<'_> for u64 {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::U64(value) => Ok(*value),
            _ => Err(anyhow!("invalid task input type, expected u64")),
        }
    }
}

impl FromTaskInput<'_> for usize {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::Usize(value) => Ok(*value),
            _ => Err(anyhow!("invalid task input type, expected usize")),
        }
    }
}

impl<'a, T> FromTaskInput<'a> for Option<T>
where
    T: FromTaskInput<'a>,
{
    type Error = T::Error;

    fn try_from(value: &'a TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::Nothing => Ok(None),
            _ => Ok(Some(FromTaskInput::try_from(value)?)),
        }
    }
}

impl<T: Any + Debug + Clone + Hash + Eq + Ord + Typed + Send + Sync + 'static> FromTaskInput<'_>
    for Value<T>
where
    T: Serialize,
    for<'de2> T: Deserialize<'de2>,
{
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::SharedValue(value) => {
                let v = value.1.downcast_ref::<T>().ok_or_else(|| {
                    anyhow!(
                        "invalid task input type, expected {} got {:?}",
                        type_name::<T>(),
                        value.1,
                    )
                })?;
                Ok(Value::new(v.clone()))
            }
            _ => Err(anyhow!(
                "invalid task input type, expected {}",
                type_name::<T>()
            )),
        }
    }
}

impl<T: MagicAny + Clone + 'static> FromTaskInput<'_> for TransientValue<T> {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::TransientSharedValue(value) => {
                let v = value.0.downcast_ref::<T>().ok_or_else(|| {
                    anyhow!(
                        "invalid task input type, expected {} got {:?}",
                        type_name::<T>(),
                        value.0,
                    )
                })?;
                Ok(TransientValue::new(v.clone()))
            }
            _ => Err(anyhow!(
                "invalid task input type, expected {}",
                type_name::<T>()
            )),
        }
    }
}

impl<T: Send + Sync + 'static> FromTaskInput<'_> for TransientInstance<T> {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        match value {
            TaskInput::SharedReference(reference) => {
                if let Ok(i) = reference.clone().try_into() {
                    Ok(i)
                } else {
                    Err(anyhow!(
                        "invalid task input type, expected {} got {:?}",
                        type_name::<T>(),
                        reference.0,
                    ))
                }
            }
            _ => Err(anyhow!(
                "invalid task input type, expected {}",
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
            TaskInput::TaskCell(task, index) => Ok(RawVc::TaskCell(*task, *index)),
            _ => Err(anyhow!("invalid task input type, expected cell ref")),
        }
    }
}
