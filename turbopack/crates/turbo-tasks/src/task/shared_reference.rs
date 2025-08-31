use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::Hash,
    ops::Deref,
};

use anyhow::Result;
use serde::{Deserialize, Serialize, ser::SerializeTuple};
use unsize::CoerceUnsize;

use crate::{
    ValueTypeId, registry,
    triomphe_utils::{coerce_to_any_send_sync, downcast_triomphe_arc},
};

/// A reference to a piece of data
#[derive(Clone)]
pub struct SharedReference(pub triomphe::Arc<dyn Any + Send + Sync>);

impl SharedReference {
    pub fn new(data: triomphe::Arc<impl Any + Send + Sync>) -> Self {
        Self(data.unsize(coerce_to_any_send_sync()))
    }
}

/// A reference to a piece of data with type information
#[derive(Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub struct TypedSharedReference {
    pub type_id: ValueTypeId,
    pub reference: SharedReference,
}

impl SharedReference {
    pub fn downcast<T: Any + Send + Sync>(self) -> Result<triomphe::Arc<T>, Self> {
        match downcast_triomphe_arc(self.0) {
            Ok(data) => Ok(data),
            Err(data) => Err(Self(data)),
        }
    }

    pub fn downcast_ref<T: Any>(&self) -> Option<&T> {
        self.0.downcast_ref()
    }

    pub fn into_typed(self, type_id: ValueTypeId) -> TypedSharedReference {
        TypedSharedReference {
            type_id,
            reference: self,
        }
    }
}

impl TypedSharedReference {
    pub fn into_untyped(self) -> SharedReference {
        self.reference
    }
}

impl Deref for TypedSharedReference {
    type Target = SharedReference;

    fn deref(&self) -> &Self::Target {
        &self.reference
    }
}

impl Hash for SharedReference {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&(&*self.0 as *const (dyn Any + Send + Sync)), state)
    }
}
impl PartialEq for SharedReference {
    // Must compare with PartialEq rather than std::ptr::addr_eq since the latter
    // only compares their addresses.
    #[allow(ambiguous_wide_pointer_comparisons)]
    fn eq(&self, other: &Self) -> bool {
        triomphe::Arc::ptr_eq(&self.0, &other.0)
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
            &(&*self.0 as *const (dyn Any + Send + Sync)).cast::<()>(),
            &(&*other.0 as *const (dyn Any + Send + Sync)).cast::<()>(),
        )
    }
}
impl Debug for SharedReference {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("SharedReference").field(&self.0).finish()
    }
}

impl Serialize for TypedSharedReference {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let TypedSharedReference {
            type_id: ty,
            reference: SharedReference(arc),
        } = self;
        let value_type = registry::get_value_type(*ty);
        if let Some(serializable) = value_type.any_as_serializable(arc) {
            let mut t = serializer.serialize_tuple(2)?;
            t.serialize_element(ty)?;
            t.serialize_element(serializable)?;
            t.end()
        } else {
            Err(serde::ser::Error::custom(format!(
                "{:?} is not serializable",
                registry::get_value_type(*ty).global_name
            )))
        }
    }
}

impl Display for SharedReference {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "untyped value")
    }
}

impl Display for TypedSharedReference {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "value of type {}",
            registry::get_value_type(self.type_id).name
        )
    }
}

impl<'de> Deserialize<'de> for TypedSharedReference {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = TypedSharedReference;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a serializable shared reference")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::SeqAccess<'de>,
            {
                if let Some(type_id) = seq.next_element()? {
                    let value_type = registry::get_value_type(type_id);
                    if let Some(seed) = value_type.get_any_deserialize_seed() {
                        if let Some(value) = seq.next_element_seed(seed)? {
                            let arc = triomphe::Arc::<dyn Any + Send + Sync>::from(value);
                            Ok(TypedSharedReference {
                                type_id,
                                reference: SharedReference(arc),
                            })
                        } else {
                            Err(serde::de::Error::invalid_length(
                                1,
                                &"tuple with type and value",
                            ))
                        }
                    } else {
                        Err(serde::de::Error::custom(format!(
                            "{value_type} is not deserializable"
                        )))
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
