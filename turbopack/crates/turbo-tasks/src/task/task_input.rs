use std::{any::Any, fmt::Debug, hash::Hash};

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::{
    MagicAny, RcStr, ResolvedVc, TaskId, TransientInstance, TransientValue, Value, ValueTypeId, Vc,
};

/// Trait to implement in order for a type to be accepted as a
/// [`#[turbo_tasks::function]`][crate::function] argument.
///
/// See also [`ConcreteTaskInput`].
#[async_trait]
pub trait TaskInput: Send + Sync + Clone + Debug + PartialEq + Eq + Hash {
    async fn resolve(&self) -> Result<Self> {
        Ok(self.clone())
    }
    fn is_resolved(&self) -> bool {
        true
    }
    fn is_transient(&self) -> bool {
        false
    }
}

macro_rules! impl_task_input {
    ($($t:ty),*) => {
        $(
            #[async_trait]
            impl TaskInput for $t {}
        )*
    };
}

impl_task_input! {
    (),
    bool,
    u8,
    u16,
    u32,
    i32,
    u64,
    usize,
    RcStr,
    TaskId,
    ValueTypeId
}

#[async_trait]
impl<T> TaskInput for Vec<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        self.iter().all(TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.iter().any(TaskInput::is_transient)
    }

    async fn resolve(&self) -> Result<Self> {
        let mut resolved = Vec::with_capacity(self.len());
        for value in self {
            resolved.push(value.resolve().await?);
        }
        Ok(resolved)
    }
}

#[async_trait]
impl<T> TaskInput for Option<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        match self {
            Some(value) => value.is_resolved(),
            None => true,
        }
    }

    fn is_transient(&self) -> bool {
        match self {
            Some(value) => value.is_transient(),
            None => false,
        }
    }

    async fn resolve(&self) -> Result<Self> {
        match self {
            Some(value) => Ok(Some(value.resolve().await?)),
            None => Ok(None),
        }
    }
}

#[async_trait]
impl<T> TaskInput for Vc<T>
where
    T: Send,
{
    fn is_resolved(&self) -> bool {
        Vc::is_resolved(*self)
    }

    fn is_transient(&self) -> bool {
        self.node.get_task_id().is_transient()
    }

    async fn resolve(&self) -> Result<Self> {
        Vc::resolve(*self).await
    }
}

impl<T> TaskInput for ResolvedVc<T>
where
    T: Send,
{
    fn is_resolved(&self) -> bool {
        true
    }

    fn is_transient(&self) -> bool {
        self.node.node.get_task_id().is_transient()
    }
}

impl<T> TaskInput for Value<T>
where
    T: Any
        + std::fmt::Debug
        + Clone
        + std::hash::Hash
        + Eq
        + Send
        + Sync
        + Serialize
        + for<'de> Deserialize<'de>
        + 'static,
{
    fn is_resolved(&self) -> bool {
        true
    }

    fn is_transient(&self) -> bool {
        false
    }
}

impl<T> TaskInput for TransientValue<T>
where
    T: MagicAny + Clone + Debug + Hash + Eq + 'static,
{
    fn is_transient(&self) -> bool {
        true
    }
}

impl<T> Serialize for TransientValue<T>
where
    T: MagicAny + Clone + 'static,
{
    fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Err(serde::ser::Error::custom(
            "cannot serialize transient task inputs",
        ))
    }
}

impl<'de, T> Deserialize<'de> for TransientValue<T>
where
    T: MagicAny + Clone + 'static,
{
    fn deserialize<D>(_deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Err(serde::de::Error::custom(
            "cannot deserialize transient task inputs",
        ))
    }
}

impl<T> TaskInput for TransientInstance<T>
where
    T: Sync + Send + 'static,
{
    fn is_transient(&self) -> bool {
        true
    }
}

impl<T> Serialize for TransientInstance<T> {
    fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Err(serde::ser::Error::custom(
            "cannot serialize transient task inputs",
        ))
    }
}

impl<'de, T> Deserialize<'de> for TransientInstance<T> {
    fn deserialize<D>(_deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Err(serde::de::Error::custom(
            "cannot deserialize transient task inputs",
        ))
    }
}

macro_rules! tuple_impls {
    ( $( $name:ident )+ ) => {
        #[async_trait]
        impl<$($name: TaskInput),+> TaskInput for ($($name,)+)
        where $($name: TaskInput),+
        {
            #[allow(non_snake_case)]
            fn is_resolved(&self) -> bool {
                let ($($name,)+) = self;
                $($name.is_resolved() &&)+ true
            }

            #[allow(non_snake_case)]
            fn is_transient(&self) -> bool {
                let ($($name,)+) = self;
                $($name.is_transient() ||)+ false
            }

            #[allow(non_snake_case)]
            async fn resolve(&self) -> Result<Self> {
                let ($($name,)+) = self;
                Ok(($($name.resolve().await?,)+))
            }
        }
    };
}

// Implement `TaskInput` for all tuples of 1 to 16 elements.
tuple_impls! { A }
tuple_impls! { A B }
tuple_impls! { A B C }
tuple_impls! { A B C D }
tuple_impls! { A B C D E }
tuple_impls! { A B C D E F }
tuple_impls! { A B C D E F G }
tuple_impls! { A B C D E F G H }
tuple_impls! { A B C D E F G H I }
tuple_impls! { A B C D E F G H I J }
tuple_impls! { A B C D E F G H I J K }
tuple_impls! { A B C D E F G H I J K L }

#[cfg(test)]
mod tests {
    use turbo_tasks_macros::TaskInput;

    use super::*;
    // This is necessary for the derive macro to work, as its expansion refers to
    // the crate name directly.
    use crate as turbo_tasks;

    fn assert_task_input<T>(_: T)
    where
        T: TaskInput,
    {
    }

    #[test]
    fn test_no_fields() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
        struct NoFields;

        assert_task_input(NoFields);
        Ok(())
    }

    #[test]
    fn test_one_unnamed_field() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
        struct OneUnnamedField(u32);

        assert_task_input(OneUnnamedField(42));
        Ok(())
    }

    #[test]
    fn test_multiple_unnamed_fields() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
        struct MultipleUnnamedFields(u32, RcStr);

        assert_task_input(MultipleUnnamedFields(42, "42".into()));
        Ok(())
    }

    #[test]
    fn test_one_named_field() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
        struct OneNamedField {
            named: u32,
        }

        assert_task_input(OneNamedField { named: 42 });
        Ok(())
    }

    #[test]
    fn test_multiple_named_fields() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
        struct MultipleNamedFields {
            named: u32,
            other: RcStr,
        }

        assert_task_input(MultipleNamedFields {
            named: 42,
            other: "42".into(),
        });
        Ok(())
    }

    #[test]
    fn test_generic_field() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
        struct GenericField<T>(T);

        assert_task_input(GenericField(42));
        assert_task_input(GenericField(RcStr::from("42")));
        Ok(())
    }

    #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
    enum OneVariant {
        Variant,
    }

    #[test]
    fn test_one_variant() -> Result<()> {
        assert_task_input(OneVariant::Variant);
        Ok(())
    }

    #[test]
    fn test_multiple_variants() -> Result<()> {
        #[derive(Clone, TaskInput, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
        enum MultipleVariants {
            Variant1,
            Variant2,
        }

        assert_task_input(MultipleVariants::Variant2);
        Ok(())
    }

    #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
    enum MultipleVariantsAndHeterogeneousFields {
        Variant1,
        Variant2(u32),
        Variant3 { named: u32 },
        Variant4(u32, RcStr),
        Variant5 { named: u32, other: RcStr },
    }

    #[test]
    fn test_multiple_variants_and_heterogeneous_fields() -> Result<()> {
        assert_task_input(MultipleVariantsAndHeterogeneousFields::Variant5 {
            named: 42,
            other: "42".into(),
        });
        Ok(())
    }

    #[test]
    fn test_nested_variants() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize)]
        enum NestedVariants {
            Variant1,
            Variant2(MultipleVariantsAndHeterogeneousFields),
            Variant3 { named: OneVariant },
            Variant4(OneVariant, RcStr),
            Variant5 { named: OneVariant, other: RcStr },
        }

        assert_task_input(NestedVariants::Variant5 {
            named: OneVariant::Variant,
            other: "42".into(),
        });
        assert_task_input(NestedVariants::Variant2(
            MultipleVariantsAndHeterogeneousFields::Variant5 {
                named: 42,
                other: "42".into(),
            },
        ));
        Ok(())
    }
}
