use std::hash::Hash;

use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use serde::{Deserialize, Serialize, de::Visitor};

use crate::{TaskId, manager::with_turbo_tasks, trace::TraceRawVcs};

/// Allows a turbo-tasks value type to notify the backend that its serialized
/// state has changed out-of-band (i.e. without going through the normal
/// output-cell mechanism).
///
/// `invalidate` must always be called from within a turbo-tasks execution
/// context (i.e. inside a `#[turbo_tasks::function]` body or a `State`
/// mutation triggered from one), so `TURBO_TASKS` task-local is always
/// available and we do not need to capture handles at construction time.
#[derive(Clone)]
pub struct SerializationInvalidator {
    task: TaskId,
}

impl Hash for SerializationInvalidator {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.task.hash(state);
    }
}

impl PartialEq for SerializationInvalidator {
    fn eq(&self, other: &Self) -> bool {
        self.task == other.task
    }
}

impl Eq for SerializationInvalidator {}

impl SerializationInvalidator {
    pub fn invalidate(&self) {
        with_turbo_tasks(|tt| tt.invalidate_serialization(self.task));
    }

    pub(crate) fn new(task_id: TaskId) -> Self {
        Self { task: task_id }
    }
}

impl TraceRawVcs for SerializationInvalidator {
    fn trace_raw_vcs(&self, _context: &mut crate::trace::TraceRawVcsContext) {
        // nothing here
    }
}

impl Serialize for SerializationInvalidator {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_newtype_struct("SerializationInvalidator", &self.task)
    }
}

impl<'de> Deserialize<'de> for SerializationInvalidator {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct V;

        impl<'de> Visitor<'de> for V {
            type Value = SerializationInvalidator;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "an SerializationInvalidator")
            }

            fn visit_newtype_struct<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                Ok(SerializationInvalidator {
                    task: TaskId::deserialize(deserializer)?,
                })
            }
        }
        deserializer.deserialize_newtype_struct("SerializationInvalidator", V)
    }
}

impl Encode for SerializationInvalidator {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        Encode::encode(&self.task, encoder)
    }
}

impl<Context> Decode<Context> for SerializationInvalidator {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(SerializationInvalidator {
            task: Decode::decode(decoder)?,
        })
    }
}

impl_borrow_decode!(SerializationInvalidator);
