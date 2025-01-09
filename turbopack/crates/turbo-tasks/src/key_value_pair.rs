use std::fmt::Debug;

pub trait KeyValuePair {
    type Key: Debug + Clone + PartialEq + Eq + std::hash::Hash;
    type Value: Debug + Clone + Default + PartialEq + Eq;
    type ValueRef<'l>: Debug + Copy + Clone + PartialEq + Eq + 'l
    where
        Self: 'l;
    fn key(&self) -> Self::Key;
    fn value(&self) -> Self::Value;
    fn value_ref(&self) -> Self::ValueRef<'_>;
    fn from_key_and_value(key: Self::Key, value: Self::Value) -> Self;
    fn into_key_and_value(self) -> (Self::Key, Self::Value);
}
