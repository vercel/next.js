use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::Hash,
    ops::Deref,
};

use anyhow::Result;
use bincode::{
    Decode, Encode,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use turbo_bincode::{
    TurboBincodeDecode, TurboBincodeDecoder, TurboBincodeEncode, TurboBincodeEncoder,
    impl_decode_for_turbo_bincode_decode, impl_encode_for_turbo_bincode_encode,
};
use unsize::CoerceUnsize;

use crate::{
    ValueType, ValueTypeId, registry,
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

impl TurboBincodeEncode for TypedSharedReference {
    fn encode(&self, encoder: &mut TurboBincodeEncoder) -> Result<(), EncodeError> {
        let Self { type_id, reference } = self;
        let value_type = registry::get_value_type(*type_id);
        if let Some(bincode) = value_type.bincode {
            type_id.encode(encoder)?;
            bincode.0(&*reference.0, encoder)?;
            Ok(())
        } else {
            Err(EncodeError::OtherString(format!(
                "{} is not encodable",
                value_type.global_name
            )))
        }
    }
}

impl<Context> TurboBincodeDecode<Context> for TypedSharedReference {
    fn decode(decoder: &mut TurboBincodeDecoder) -> Result<Self, DecodeError> {
        let type_id = ValueTypeId::decode(decoder)?;
        let value_type = registry::get_value_type(type_id);
        if let Some(bincode) = value_type.bincode {
            let reference = bincode.1(decoder)?;
            Ok(Self { type_id, reference })
        } else {
            #[cold]
            fn not_decodable(value_type: &ValueType) -> DecodeError {
                DecodeError::OtherString(format!("{} is not decodable", value_type.global_name))
            }
            Err(not_decodable(value_type))
        }
    }
}

impl_encode_for_turbo_bincode_encode!(TypedSharedReference);
impl_decode_for_turbo_bincode_decode!(TypedSharedReference);
impl_borrow_decode!(TypedSharedReference);

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
