use std::fmt::Debug;

pub trait KeyValuePair {
    type Type: Debug + Copy + Clone + PartialEq + Eq + std::hash::Hash;
    type Key: Debug + Clone + PartialEq + Eq + std::hash::Hash;
    type Value: Debug + Clone + Default + PartialEq + Eq;
    type ValueRef<'l>: Debug + Copy + Clone + PartialEq + Eq + 'l
    where
        Self: 'l;
    type ValueRefMut<'l>: Debug + PartialEq + Eq + 'l
    where
        Self: 'l;
    fn ty(&self) -> Self::Type;
    fn key(&self) -> Self::Key;
    fn value(&self) -> Self::Value;
    fn value_ref(&self) -> Self::ValueRef<'_>;
    fn value_mut(&mut self) -> Self::ValueRefMut<'_>;
    fn from_key_and_value(key: Self::Key, value: Self::Value) -> Self;
    fn into_key_and_value(self) -> (Self::Key, Self::Value);
}
