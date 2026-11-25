use std::{
    hash::{Hash, Hasher},
    ops::Deref,
    sync::Arc,
};

use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use serde::Serialize;
use serde_json::value::RawValue;
use turbo_tasks::TaskInput;

/// A reference-counted [`RawValue`]: a string that is guaranteed to contain valid JSON.
///
/// This lets JSON produced in one task be passed through other tasks and re-emitted verbatim
/// without re-validating it.
///
/// Values restored from the persistent cache are trusted to be valid JSON, like all other cached
/// data.
#[turbo_tasks::value(shared, serialization = "custom", eq = "manual")]
#[derive(Clone, Debug)]
pub struct RcJsonRawValue(#[turbo_tasks(debug_ignore, unsafe_ignore)] Arc<RawValue>);

impl RcJsonRawValue {
    pub fn from_serialize<T: Serialize + ?Sized>(value: &T) -> serde_json::Result<Self> {
        Ok(Self(serde_json::value::to_raw_value(value)?.into()))
    }
}

impl Deref for RcJsonRawValue {
    type Target = RawValue;

    fn deref(&self) -> &RawValue {
        &self.0
    }
}

impl PartialEq for RcJsonRawValue {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0) || self.0.get() == other.0.get()
    }
}

impl Eq for RcJsonRawValue {}

impl Hash for RcJsonRawValue {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.get().hash(state);
    }
}

impl TaskInput for RcJsonRawValue {
    fn is_transient(&self) -> bool {
        false
    }
}

impl Encode for RcJsonRawValue {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        self.0.get().encode(encoder)
    }
}

impl<Context> Decode<Context> for RcJsonRawValue {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let json = String::decode(decoder)?;
        // SAFETY: This was encoded from an `RcJsonRawValue`, which always holds valid JSON. Like
        // all other persistent cache data, the encoded bytes are trusted.
        Ok(Self(
            unsafe { RawValue::from_string_unchecked(json) }.into(),
        ))
    }
}

impl_borrow_decode!(RcJsonRawValue);
