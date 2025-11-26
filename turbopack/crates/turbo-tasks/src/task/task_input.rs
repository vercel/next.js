use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Debug,
    future::Future,
    hash::Hash,
    sync::Arc,
    time::Duration,
};

use anyhow::Result;
use either::Either;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;

use crate::{
    MagicAny, ReadRef, ResolvedVc, TaskId, TransientInstance, TransientValue, ValueTypeId, Vc,
    trace::TraceRawVcs,
};

/// Trait to implement in order for a type to be accepted as a
/// [`#[turbo_tasks::function]`][crate::function] argument.
///
/// Serialization must be deterministic and compatible with `eq` comparisons.  If two `TaskInputs`
/// compare equal they must also serialize to the same bytes.
pub trait TaskInput: Send + Sync + Clone + Debug + PartialEq + Eq + Hash + TraceRawVcs {
    fn resolve_input(&self) -> impl Future<Output = Result<Self>> + Send + '_ {
        async { Ok(self.clone()) }
    }
    fn is_resolved(&self) -> bool {
        true
    }
    fn is_transient(&self) -> bool;
}

macro_rules! impl_task_input {
    ($($t:ty),*) => {
        $(
            impl TaskInput for $t {
                fn is_transient(&self) -> bool {
                    false
                }
            }
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
    ValueTypeId,
    Duration,
    String
}

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

    async fn resolve_input(&self) -> Result<Self> {
        let mut resolved = Vec::with_capacity(self.len());
        for value in self {
            resolved.push(value.resolve_input().await?);
        }
        Ok(resolved)
    }
}

impl<T> TaskInput for Box<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        self.as_ref().is_resolved()
    }

    fn is_transient(&self) -> bool {
        self.as_ref().is_transient()
    }

    async fn resolve_input(&self) -> Result<Self> {
        Ok(Box::new(Box::pin(self.as_ref().resolve_input()).await?))
    }
}

impl<T> TaskInput for Arc<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        self.as_ref().is_resolved()
    }

    fn is_transient(&self) -> bool {
        self.as_ref().is_transient()
    }

    async fn resolve_input(&self) -> Result<Self> {
        Ok(Arc::new(Box::pin(self.as_ref().resolve_input()).await?))
    }
}

impl<T> TaskInput for ReadRef<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        Self::as_raw_ref(self).is_resolved()
    }

    fn is_transient(&self) -> bool {
        Self::as_raw_ref(self).is_transient()
    }

    async fn resolve_input(&self) -> Result<Self> {
        Ok(ReadRef::new_owned(
            Box::pin(Self::as_raw_ref(self).resolve_input()).await?,
        ))
    }
}

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

    async fn resolve_input(&self) -> Result<Self> {
        match self {
            Some(value) => Ok(Some(value.resolve_input().await?)),
            None => Ok(None),
        }
    }
}

impl<T> TaskInput for Vc<T>
where
    T: Send + Sync + ?Sized,
{
    fn is_resolved(&self) -> bool {
        Vc::is_resolved(*self)
    }

    fn is_transient(&self) -> bool {
        self.node.is_transient()
    }

    async fn resolve_input(&self) -> Result<Self> {
        Vc::resolve(*self).await
    }
}

// `TaskInput` isn't needed/used for a bare `ResolvedVc`, as we'll expose `ResolvedVc` arguments as
// `Vc`, but it is useful for structs that contain `ResolvedVc` and want to derive `TaskInput`.
impl<T> TaskInput for ResolvedVc<T>
where
    T: Send + Sync + ?Sized,
{
    fn is_resolved(&self) -> bool {
        true
    }

    fn is_transient(&self) -> bool {
        self.node.is_transient()
    }

    async fn resolve_input(&self) -> Result<Self> {
        Ok(*self)
    }
}

impl<T> TaskInput for TransientValue<T>
where
    T: MagicAny + Clone + Debug + Hash + Eq + TraceRawVcs + 'static,
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
    T: Sync + Send + TraceRawVcs + 'static,
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

impl<L, R> TaskInput for Either<L, R>
where
    L: TaskInput,
    R: TaskInput,
{
    fn resolve_input(&self) -> impl Future<Output = Result<Self>> + Send + '_ {
        self.as_ref().map_either(
            |l| async move { anyhow::Ok(Either::Left(l.resolve_input().await?)) },
            |r| async move { anyhow::Ok(Either::Right(r.resolve_input().await?)) },
        )
    }

    fn is_resolved(&self) -> bool {
        self.as_ref()
            .either(TaskInput::is_resolved, TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.as_ref()
            .either(TaskInput::is_transient, TaskInput::is_transient)
    }
}

impl<K, V> TaskInput for BTreeMap<K, V>
where
    K: TaskInput + Ord,
    V: TaskInput,
{
    async fn resolve_input(&self) -> Result<Self> {
        let mut new_map = BTreeMap::new();
        for (k, v) in self {
            new_map.insert(
                TaskInput::resolve_input(k).await?,
                TaskInput::resolve_input(v).await?,
            );
        }
        Ok(new_map)
    }

    fn is_resolved(&self) -> bool {
        self.iter()
            .all(|(k, v)| TaskInput::is_resolved(k) && TaskInput::is_resolved(v))
    }

    fn is_transient(&self) -> bool {
        self.iter()
            .any(|(k, v)| TaskInput::is_transient(k) || TaskInput::is_transient(v))
    }
}

impl<T> TaskInput for BTreeSet<T>
where
    T: TaskInput + Ord,
{
    async fn resolve_input(&self) -> Result<Self> {
        let mut new_map = BTreeSet::new();
        for value in self {
            new_map.insert(TaskInput::resolve_input(value).await?);
        }
        Ok(new_map)
    }

    fn is_resolved(&self) -> bool {
        self.iter().all(TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.iter().any(TaskInput::is_transient)
    }
}

macro_rules! tuple_impls {
    ( $( $name:ident )+ ) => {
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
            async fn resolve_input(&self) -> Result<Self> {
                let ($($name,)+) = self;
                Ok(($($name.resolve_input().await?,)+))
            }
        }
    };
}

// Implement `TaskInput` for all tuples of 1 to 12 elements.
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
    use turbo_rcstr::rcstr;
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
        #[derive(
            Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs,
        )]
        struct NoFields;

        assert_task_input(NoFields);
        Ok(())
    }

    #[test]
    fn test_one_unnamed_field() -> Result<()> {
        #[derive(
            Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs,
        )]
        struct OneUnnamedField(u32);

        assert_task_input(OneUnnamedField(42));
        Ok(())
    }

    #[test]
    fn test_multiple_unnamed_fields() -> Result<()> {
        #[derive(
            Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs,
        )]
        struct MultipleUnnamedFields(u32, RcStr);

        assert_task_input(MultipleUnnamedFields(42, rcstr!("42")));
        Ok(())
    }

    #[test]
    fn test_one_named_field() -> Result<()> {
        #[derive(
            Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs,
        )]
        struct OneNamedField {
            named: u32,
        }

        assert_task_input(OneNamedField { named: 42 });
        Ok(())
    }

    #[test]
    fn test_multiple_named_fields() -> Result<()> {
        #[derive(
            Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs,
        )]
        struct MultipleNamedFields {
            named: u32,
            other: RcStr,
        }

        assert_task_input(MultipleNamedFields {
            named: 42,
            other: rcstr!("42"),
        });
        Ok(())
    }

    #[test]
    fn test_generic_field() -> Result<()> {
        #[derive(
            Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs,
        )]
        struct GenericField<T>(T);

        assert_task_input(GenericField(42));
        assert_task_input(GenericField(rcstr!("42")));
        Ok(())
    }

    #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs)]
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
        #[derive(
            Clone, TaskInput, PartialEq, Eq, Hash, Debug, Serialize, Deserialize, TraceRawVcs,
        )]
        enum MultipleVariants {
            Variant1,
            Variant2,
        }

        assert_task_input(MultipleVariants::Variant2);
        Ok(())
    }

    #[derive(Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs)]
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
            other: rcstr!("42"),
        });
        Ok(())
    }

    #[test]
    fn test_nested_variants() -> Result<()> {
        #[derive(
            Clone, TaskInput, Eq, PartialEq, Hash, Debug, Serialize, Deserialize, TraceRawVcs,
        )]
        enum NestedVariants {
            Variant1,
            Variant2(MultipleVariantsAndHeterogeneousFields),
            Variant3 { named: OneVariant },
            Variant4(OneVariant, RcStr),
            Variant5 { named: OneVariant, other: RcStr },
        }

        assert_task_input(NestedVariants::Variant5 {
            named: OneVariant::Variant,
            other: rcstr!("42"),
        });
        assert_task_input(NestedVariants::Variant2(
            MultipleVariantsAndHeterogeneousFields::Variant5 {
                named: 42,
                other: rcstr!("42"),
            },
        ));
        Ok(())
    }
}
