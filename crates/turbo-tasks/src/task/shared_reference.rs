use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::Hash,
};

use anyhow::Result;
use serde::{ser::SerializeTuple, Deserialize, Serialize};
use unsize::CoerceUnsize;

use crate::{
    registry,
    triomphe_utils::{coerce_to_any_send_sync, downcast_triomphe_arc},
    ValueTypeId,
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
