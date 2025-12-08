use std::time::Duration;

use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use turbo_rcstr::RcStr;
use turbo_tasks_macros::primitive as __turbo_tasks_internal_primitive;

use crate::{
    self as turbo_tasks, Vc,
    value_type::{ManualDecodeWrapper, ManualEncodeWrapper},
};

__turbo_tasks_internal_primitive!(());
__turbo_tasks_internal_primitive!(String);
__turbo_tasks_internal_primitive!(RcStr);
__turbo_tasks_internal_primitive!(Option<String>);
__turbo_tasks_internal_primitive!(Option<RcStr>);
__turbo_tasks_internal_primitive!(Vec<RcStr>);
__turbo_tasks_internal_primitive!(Option<u16>);
__turbo_tasks_internal_primitive!(Option<u64>);
__turbo_tasks_internal_primitive!(bool);
__turbo_tasks_internal_primitive!(Option<bool>);
__turbo_tasks_internal_primitive!(u8);
__turbo_tasks_internal_primitive!(u16);
__turbo_tasks_internal_primitive!(u32);
__turbo_tasks_internal_primitive!(u64);
__turbo_tasks_internal_primitive!(u128);
__turbo_tasks_internal_primitive!(i8);
__turbo_tasks_internal_primitive!(i16);
__turbo_tasks_internal_primitive!(i32);
__turbo_tasks_internal_primitive!(i64);
__turbo_tasks_internal_primitive!(i128);
__turbo_tasks_internal_primitive!(usize);
__turbo_tasks_internal_primitive!(isize);
__turbo_tasks_internal_primitive!(
    serde_json::Value,
    bincode_wrappers(JsonValueEncodeWrapper, JsonValueDecodeWrapper),
);
__turbo_tasks_internal_primitive!(Duration);
__turbo_tasks_internal_primitive!(Vec<u8>);
__turbo_tasks_internal_primitive!(Vec<bool>);

struct JsonValueEncodeWrapper<'a>(&'a serde_json::Value);

impl ManualEncodeWrapper for JsonValueEncodeWrapper<'_> {
    type Value = serde_json::Value;

    fn new<'a>(value: &'a Self::Value) -> impl Encode + 'a {
        JsonValueEncodeWrapper(value)
    }
}

impl Encode for JsonValueEncodeWrapper<'_> {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        turbo_bincode::serde_json::encode(self.0, encoder)
    }
}

struct JsonValueDecodeWrapper(serde_json::Value);

impl ManualDecodeWrapper for JsonValueDecodeWrapper {
    type Value = serde_json::Value;

    fn inner(self) -> Self::Value {
        self.0
    }
}

impl<Context> Decode<Context> for JsonValueDecodeWrapper {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self(turbo_bincode::serde_json::decode(decoder)?))
    }
}
