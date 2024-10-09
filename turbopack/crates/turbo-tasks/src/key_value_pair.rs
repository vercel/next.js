use std::fmt::Debug;

pub trait KeyValuePair {
    type Key: Debug + Clone + PartialEq + Eq + std::hash::Hash;
    type Value: Debug + Clone + Default + PartialEq + Eq;
    fn key(&self) -> Self::Key;
    fn value(&self) -> Self::Value;
    fn from_key_and_value(key: Self::Key, value: Self::Value) -> Self;
    fn into_key_and_value(self) -> (Self::Key, Self::Value);
}
