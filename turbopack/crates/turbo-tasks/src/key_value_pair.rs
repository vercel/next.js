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
    fn from_key_and_value_ref(key: Self::Key, value_ref: Self::ValueRef<'_>) -> Self;
    fn into_key_and_value(self) -> (Self::Key, Self::Value);
}

/// Derives the [`KeyValuePair`][trait@KeyValuePair] trait for a enum. Each variant need to
/// have a `value` field which becomes part of the value enum and all remaining fields become
/// part of the key.
///
/// Assuming the enum is called `Abc` it exposes `AbcKey` and `AbcValue` types for it too. The
/// key enum will have [`Debug`], [`Clone`], [`PartialEq`], [`Eq`], and [`Hash`] derived. The
/// value enum will have [`Debug`] and [`Clone`] derived. It's expected that all fields
/// implement these traits.
pub use turbo_tasks_macros::KeyValuePair;
