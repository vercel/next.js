//! [`serde_json::Value`] and [`serde_json::Map`] wrappers whose equality and hash include the
//! order of object keys.
//!
//! JSON objects are unordered, so `serde_json` compares and hashes them ignoring key order. That is
//! the wrong equality for a cell when a consumer reads the order: `package.json` `exports` and
//! `imports` conditions are matched in key order, and options objects are handed to JavaScript,
//! where key order is observable. A recomputation that only reorders keys compares equal, so the
//! cell keeps the old order and its readers are not invalidated.
//!
//! These are the JSON counterparts of [`crate::OrderedIndexMap`]. They rely on `serde_json`'s
//! `preserve_order` feature: without it, objects are always sorted by key and the order carries no
//! information.

use std::{
    fmt,
    hash::{Hash, Hasher},
    ops::{Deref, DerefMut},
};

use bincode::{
    BorrowDecode, Decode, Encode,
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Map, Value};
use shrink_to_fit::ShrinkToFit;

/// A [`serde_json::Value`] whose equality and hash include the order of object keys.
///
/// `serde_json` compares objects ignoring key order, so a cell holding JSON keeps its old content
/// when only the key order changes. Use this type where a consumer reads the order, such as
/// `package.json` `exports` conditions or options passed to JavaScript. It relies on `serde_json`'s
/// `preserve_order` feature: without it, objects are sorted by key.
///
/// This is the JSON counterpart of [`crate::OrderedIndexMap`].
#[derive(Clone, Default)]
pub struct OrderedJsonValue(Value);

/// A [`serde_json::Map`] whose equality and hash include the order of its keys. See
/// [`OrderedJsonValue`].
#[derive(Clone, Default)]
pub struct OrderedJsonMap(Map<String, Value>);

fn value_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Object(a), Value::Object(b)) => map_eq(a, b),
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| value_eq(a, b))
        }
        _ => a == b,
    }
}

fn map_eq(a: &Map<String, Value>, b: &Map<String, Value>) -> bool {
    a.len() == b.len()
        && a.iter().zip(b).all(|((a_key, a_value), (b_key, b_value))| {
            a_key == b_key && value_eq(a_value, b_value)
        })
}

fn hash_value<H: Hasher>(value: &Value, state: &mut H) {
    std::mem::discriminant(value).hash(state);
    match value {
        Value::Null => {}
        Value::Bool(value) => value.hash(state),
        Value::Number(value) => value.hash(state),
        Value::String(value) => value.hash(state),
        Value::Array(values) => {
            state.write_usize(values.len());
            for value in values {
                hash_value(value, state);
            }
        }
        Value::Object(map) => hash_map(map, state),
    }
}

fn hash_map<H: Hasher>(map: &Map<String, Value>, state: &mut H) {
    state.write_usize(map.len());
    for (key, value) in map {
        key.hash(state);
        hash_value(value, state);
    }
}

impl OrderedJsonValue {
    pub fn into_inner(self) -> Value {
        self.0
    }
}

impl OrderedJsonMap {
    pub fn new() -> Self {
        Self(Map::new())
    }

    pub fn into_inner(self) -> Map<String, Value> {
        self.0
    }
}

impl Deref for OrderedJsonValue {
    type Target = Value;

    fn deref(&self) -> &Value {
        &self.0
    }
}

impl DerefMut for OrderedJsonValue {
    fn deref_mut(&mut self) -> &mut Value {
        &mut self.0
    }
}

impl Deref for OrderedJsonMap {
    type Target = Map<String, Value>;

    fn deref(&self) -> &Map<String, Value> {
        &self.0
    }
}

impl DerefMut for OrderedJsonMap {
    fn deref_mut(&mut self) -> &mut Map<String, Value> {
        &mut self.0
    }
}

impl From<Value> for OrderedJsonValue {
    fn from(value: Value) -> Self {
        Self(value)
    }
}

impl From<Map<String, Value>> for OrderedJsonMap {
    fn from(map: Map<String, Value>) -> Self {
        Self(map)
    }
}

impl PartialEq for OrderedJsonValue {
    fn eq(&self, other: &Self) -> bool {
        value_eq(&self.0, &other.0)
    }
}

impl Eq for OrderedJsonValue {}

impl PartialEq for OrderedJsonMap {
    fn eq(&self, other: &Self) -> bool {
        map_eq(&self.0, &other.0)
    }
}

impl Eq for OrderedJsonMap {}

impl Hash for OrderedJsonValue {
    fn hash<H: Hasher>(&self, state: &mut H) {
        hash_value(&self.0, state)
    }
}

impl Hash for OrderedJsonMap {
    fn hash<H: Hasher>(&self, state: &mut H) {
        hash_map(&self.0, state)
    }
}

impl fmt::Debug for OrderedJsonValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl fmt::Debug for OrderedJsonMap {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl ShrinkToFit for OrderedJsonValue {
    fn shrink_to_fit(&mut self) {
        self.0.shrink_to_fit()
    }
}

impl ShrinkToFit for OrderedJsonMap {
    fn shrink_to_fit(&mut self) {
        // `shrink_to_fit` implements this for `Value` but not for `Map`.
        for value in self.0.values_mut() {
            value.shrink_to_fit();
        }
    }
}

impl Serialize for OrderedJsonValue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for OrderedJsonValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Value::deserialize(deserializer).map(Self)
    }
}

impl Serialize for OrderedJsonMap {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for OrderedJsonMap {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Map::deserialize(deserializer).map(Self)
    }
}

impl Encode for OrderedJsonValue {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        turbo_bincode::serde_self_describing::encode(&self.0, encoder)
    }
}

impl<Context> Decode<Context> for OrderedJsonValue {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        turbo_bincode::serde_self_describing::decode(decoder).map(Self)
    }
}

impl<'de, Context> BorrowDecode<'de, Context> for OrderedJsonValue {
    fn borrow_decode<D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        turbo_bincode::serde_self_describing::borrow_decode(decoder).map(Self)
    }
}

impl Encode for OrderedJsonMap {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        turbo_bincode::serde_self_describing::encode(&self.0, encoder)
    }
}

impl<Context> Decode<Context> for OrderedJsonMap {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        turbo_bincode::serde_self_describing::decode(decoder).map(Self)
    }
}

impl<'de, Context> BorrowDecode<'de, Context> for OrderedJsonMap {
    fn borrow_decode<D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        turbo_bincode::serde_self_describing::borrow_decode(decoder).map(Self)
    }
}

#[cfg(test)]
mod tests {
    use std::hash::BuildHasher;

    use rustc_hash::FxBuildHasher;
    use serde_json::json;

    use super::*;

    fn hash(value: &impl Hash) -> u64 {
        FxBuildHasher.hash_one(value)
    }

    #[test]
    fn value_equality_includes_key_order() {
        let a = OrderedJsonValue::from(json!({ "exports": { "import": "a", "default": "b" } }));
        let b = OrderedJsonValue::from(json!({ "exports": { "default": "b", "import": "a" } }));
        // serde_json ignores the order...
        assert_eq!(*a, *b);
        // ...the wrapper doesn't, also for nested objects.
        assert_ne!(a, b);
        assert_ne!(hash(&a), hash(&b));
        assert_eq!(a, a.clone());
        assert_eq!(hash(&a), hash(&a.clone()));
    }

    #[test]
    fn map_equality_includes_key_order() {
        let Value::Object(a) = json!({ "a": 1, "b": [{ "c": 1, "d": 2 }] }) else {
            unreachable!()
        };
        let Value::Object(b) = json!({ "a": 1, "b": [{ "d": 2, "c": 1 }] }) else {
            unreachable!()
        };
        let (a, b) = (OrderedJsonMap::from(a), OrderedJsonMap::from(b));
        assert_eq!(*a, *b);
        assert_ne!(a, b);
        assert_eq!(a, a.clone());
    }

    #[test]
    fn bincode_round_trip_keeps_key_order() {
        let value = OrderedJsonValue::from(json!({ "z": 1, "a": { "y": 2, "b": 3 } }));
        let buffer = turbo_bincode::turbo_bincode_encode(&value).unwrap();
        let decoded: OrderedJsonValue = turbo_bincode::turbo_bincode_decode(&buffer).unwrap();
        assert_eq!(decoded, value);
    }
}
