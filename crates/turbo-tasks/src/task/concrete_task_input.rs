use std::{
    any::Any,
    fmt::{Debug, Display},
    future::Future,
    hash::Hash,
    pin::Pin,
    sync::Arc,
};

use anyhow::Result;
use serde::{ser::SerializeTuple, Deserialize, Serialize};
use unsize::CoerceUnsize;

use crate::{
    backend::CellContent,
    magic_any::MagicAny,
    manager::{read_task_cell, read_task_output},
    registry,
    triomphe_utils::{coerce_to_any_send_sync, downcast_triomphe_arc},
    turbo_tasks, CellId, RawVc, RcStr, TaskId, ValueTypeId,
};

/// A type-erased wrapper for [`triomphe::Arc`].
#[derive(Clone)]
pub struct SharedReference(
    pub Option<ValueTypeId>,
    pub triomphe::Arc<dyn Any + Send + Sync>,
);

impl SharedReference {
    pub fn new(type_id: Option<ValueTypeId>, data: triomphe::Arc<impl Any + Send + Sync>) -> Self {
        Self(type_id, data.unsize(coerce_to_any_send_sync()))
    }

    pub fn downcast<T: Any + Send + Sync>(self) -> Result<triomphe::Arc<T>, Self> {
        match downcast_triomphe_arc(self.1) {
            Ok(data) => Ok(data),
            Err(data) => Err(Self(self.0, data)),
        }
    }
}

impl Hash for SharedReference {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&(&*self.1 as *const (dyn Any + Send + Sync)), state)
    }
}
impl PartialEq for SharedReference {
    // Must compare with PartialEq rather than std::ptr::addr_eq since the latter
    // only compares their addresses.
    #[allow(ambiguous_wide_pointer_comparisons)]
    fn eq(&self, other: &Self) -> bool {
        triomphe::Arc::ptr_eq(&self.1, &other.1)
    }
}
impl Eq for SharedReference {}
impl PartialOrd for SharedReference {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for SharedReference {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        Ord::cmp(
            &(&*self.1 as *const (dyn Any + Send + Sync)).cast::<()>(),
            &(&*other.1 as *const (dyn Any + Send + Sync)).cast::<()>(),
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
                                Ok(SharedReference::new(Some(ty), value.into()))
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

/// Intermediate representation of task inputs.
///
/// When a task is called, all its arguments will be converted and stored as
/// [`ConcreteTaskInput`]s. When the task is actually run, these inputs will be
/// converted back into the argument types. This is handled by the
/// [`TaskInput`][crate::TaskInput] trait.
#[allow(clippy::derived_hash_with_manual_eq)]
#[derive(Debug, Hash, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Default)]
pub enum ConcreteTaskInput {
    TaskOutput(TaskId),
    TaskCell(TaskId, CellId),
    List(Vec<ConcreteTaskInput>),
    String(RcStr),
    Bool(bool),
    Usize(usize),
    I8(i8),
    U8(u8),
    I16(i16),
    U16(u16),
    I32(i32),
    U32(u32),
    U64(u64),
    #[default]
    Nothing,
    SharedValue(SharedValue),
    TransientSharedValue(TransientSharedValue),
    SharedReference(SharedReference),
}

impl ConcreteTaskInput {
    pub async fn resolve_to_value(self) -> Result<ConcreteTaskInput> {
        let tt = turbo_tasks();
        let mut current = self;
        loop {
            current = match current {
                ConcreteTaskInput::TaskOutput(task_id) => {
                    read_task_output(&*tt, task_id, false).await?.into()
                }
                ConcreteTaskInput::TaskCell(task_id, index) => {
                    read_task_cell(&*tt, task_id, index).await?.into()
                }
                _ => return Ok(current),
            }
        }
    }

    pub async fn resolve(self) -> Result<ConcreteTaskInput> {
        let tt = turbo_tasks();
        let mut current = self;
        loop {
            current = match current {
                ConcreteTaskInput::TaskOutput(task_id) => {
                    read_task_output(&*tt, task_id, false).await?.into()
                }
                ConcreteTaskInput::List(list) => {
                    if list.iter().all(|i| i.is_resolved()) {
                        return Ok(ConcreteTaskInput::List(list));
                    }
                    fn resolve_all(
                        list: Vec<ConcreteTaskInput>,
                    ) -> Pin<Box<dyn Future<Output = Result<Vec<ConcreteTaskInput>>> + Send>>
                    {
                        use crate::TryJoinIterExt;
                        Box::pin(list.into_iter().map(|i| i.resolve()).try_join())
                    }
                    return Ok(ConcreteTaskInput::List(resolve_all(list).await?));
                }
                _ => return Ok(current),
            }
        }
    }

    pub fn get_task_id(&self) -> Option<TaskId> {
        match self {
            ConcreteTaskInput::TaskOutput(t) | ConcreteTaskInput::TaskCell(t, _) => Some(*t),
            _ => None,
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            ConcreteTaskInput::TaskOutput(_) => false,
            ConcreteTaskInput::List(list) => list.iter().all(|i| i.is_resolved()),
            _ => true,
        }
    }

    pub fn is_nothing(&self) -> bool {
        matches!(self, ConcreteTaskInput::Nothing)
    }
}

impl From<RawVc> for ConcreteTaskInput {
    fn from(raw_vc: RawVc) -> Self {
        match raw_vc {
            RawVc::TaskOutput(task) => ConcreteTaskInput::TaskOutput(task),
            RawVc::TaskCell(task, i) => ConcreteTaskInput::TaskCell(task, i),
        }
    }
}

impl From<CellContent> for ConcreteTaskInput {
    fn from(content: CellContent) -> Self {
        match content {
            CellContent(None) => ConcreteTaskInput::Nothing,
            CellContent(Some(shared_ref)) => ConcreteTaskInput::SharedReference(shared_ref),
        }
    }
}

impl Display for ConcreteTaskInput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConcreteTaskInput::TaskOutput(task) => write!(f, "task output {}", task),
            ConcreteTaskInput::TaskCell(task, index) => write!(f, "cell {} in {}", index, task),
            ConcreteTaskInput::List(list) => write!(
                f,
                "list {}",
                list.iter()
                    .map(|i| i.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            ConcreteTaskInput::String(s) => write!(f, "string {:?}", s),
            ConcreteTaskInput::Bool(b) => write!(f, "bool {:?}", b),
            ConcreteTaskInput::Usize(v) => write!(f, "usize {}", v),
            ConcreteTaskInput::I8(v) => write!(f, "i8 {}", v),
            ConcreteTaskInput::U8(v) => write!(f, "u8 {}", v),
            ConcreteTaskInput::I16(v) => write!(f, "i16 {}", v),
            ConcreteTaskInput::U16(v) => write!(f, "u16 {}", v),
            ConcreteTaskInput::I32(v) => write!(f, "i32 {}", v),
            ConcreteTaskInput::U32(v) => write!(f, "u32 {}", v),
            ConcreteTaskInput::U64(v) => write!(f, "u64 {}", v),
            ConcreteTaskInput::Nothing => write!(f, "nothing"),
            ConcreteTaskInput::SharedValue(_) => write!(f, "any value"),
            ConcreteTaskInput::TransientSharedValue(_) => write!(f, "any transient value"),
            ConcreteTaskInput::SharedReference(data) => {
                write!(f, "shared reference with {}", data)
            }
        }
    }
}
