use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::Hash,
    ops::Deref,
};

use anyhow::Result;
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use turbo_bincode::{
    TurboBincodeDecoder, TurboBincodeEncoder, turbo_bincode_decode, turbo_bincode_encode,
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

    fn encode(&self, enc: &mut TurboBincodeEncoder) -> Result<(), EncodeError> {
        let Self { type_id, reference } = self;
        let value_type = registry::get_value_type(*type_id);
        if let Some(bincode) = value_type.bincode {
            type_id.encode(enc)?;
            bincode.0(&*reference.0, enc)?;
            Ok(())
        } else {
            Err(EncodeError::OtherString(format!(
                "{:?} is not serializable",
                value_type.global_name
            )))
        }
    }

    fn decode(dec: &mut TurboBincodeDecoder) -> Result<Self, DecodeError> {
        let type_id = ValueTypeId::decode(dec)?;
        let value_type = registry::get_value_type(type_id);
        if let Some(bincode) = value_type.bincode {
            let reference = bincode.1(dec)?;
            Ok(Self { type_id, reference })
        } else {
            #[cold]
            fn not_deserializable(value_type: &ValueType) -> DecodeError {
                DecodeError::OtherString(format!("{value_type} is not deserializable"))
            }
            Err(not_deserializable(value_type))
        }
    }
}

impl Encode for TypedSharedReference {
    fn encode<'a, E: Encoder>(&self, encoder: &'a mut E) -> Result<(), EncodeError> {
        let maybe_turbo_encoder = if unty::type_equal::<E, TurboBincodeEncoder>() {
            // SAFETY: Transmute is safe because `&mut E` is `&mut TurboBincodeEncoder`:
            // - `unty::type_equal::<E, TurboBincodeEncoder>()` does not check lifetimes, but does
            //   check the type and layout, so we know those are correct.
            // - The transmuted encoder cannot escape this function, and we know that the lifetime
            //   of `'f` is at least as long as the function.
            // - Lifetimes don't change layout. This is not guaranteed, but if this assumption is
            //   broken, we'd have a different type id, `type_equal` would return `false` and we'd
            //   fall back to a slower codepath, and wouldn't violate memory safety.
            // - Two mutable references have the same layout and alignment when they reference
            //   exactly the same type.
            // - The explicit lifetime ('a) avoids creating an implitly unbounded lifetime.
            Ok(unsafe { std::mem::transmute::<&'a mut E, &'a mut TurboBincodeEncoder>(encoder) })
        } else {
            Err(encoder)
        };
        match maybe_turbo_encoder {
            Ok(turbo_encoder) => TypedSharedReference::encode(self, turbo_encoder),
            Err(generic_encoder) => {
                // The underlying `SharedReference` can only be serialized using
                // `TurboBincodeEncoder` because the encoder function pointer cannot take type
                // parameters. This is okay, because we expect any hot codepaths to use
                // `TurboBincodeEncoder`.
                //
                // Create a `TurboBincodeEncoder` and encode this as a nested byte array. We must
                // redundantly store a size here, otherwise we won't be able to determine what size
                // buffer to use for `TurboBincodeReader`.
                let buffer = turbo_bincode_encode(self)?;
                buffer.encode(generic_encoder)
            }
        }
    }
}

impl<Context> Decode<Context> for TypedSharedReference {
    fn decode<'a, D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let maybe_turbo_decoder = if unty::type_equal::<D, TurboBincodeDecoder>() {
            // SAFETY: See notes on the `Encode::encode` implementation above.
            Ok(unsafe { std::mem::transmute::<&mut D, &mut TurboBincodeDecoder<'a>>(decoder) })
        } else {
            Err(decoder)
        };
        match maybe_turbo_decoder {
            Ok(turbo_decoder) => TypedSharedReference::decode(turbo_decoder),
            Err(generic_decoder) => {
                // The underlying `SharedReference` can only be deserialized using
                // `TurboBincodeDecoder` because the decoder function pointer cannot take type
                // parameters. This is okay, because we expect any hot codepaths to use
                // `TurboBincodeDecoder`.
                //
                // Decode the nested byte array that was created during encoding, then use a
                // `TurboBincodeDecoder` to decode the contents.
                let buffer: Vec<u8> = Decode::decode(generic_decoder)?;
                turbo_bincode_decode(&buffer)
            }
        }
    }
}

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
