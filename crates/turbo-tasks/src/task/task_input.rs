use std::{
    any::{type_name, Any},
    marker::PhantomData,
    sync::Arc,
};

use anyhow::{anyhow, bail, Result};

use super::concrete_task_input::TransientSharedValue;
use crate::{
    magic_any::MagicAny, ConcreteTaskInput, RawVc, RcStr, SharedValue, TaskId, TransientInstance,
    TransientValue, TypedForInput, Value, ValueTypeId, Vc, VcValueType,
};

/// Trait to implement in order for a type to be accepted as a
/// `turbo_tasks::function` argument.
///
/// See also [`ConcreteTaskInput`].
pub trait TaskInput: Send + Sync + Clone {
    fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self>;
    fn into_concrete(self) -> ConcreteTaskInput;
}

impl TaskInput for ConcreteTaskInput {
    fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self> {
        Ok(input.clone())
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        self
    }
}

impl TaskInput for RcStr {
    fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self> {
        match input {
            ConcreteTaskInput::String(s) => Ok(s.clone()),
            _ => bail!("invalid task input type, expected String"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::String(self)
    }
}

impl TaskInput for bool {
    fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self> {
        match input {
            ConcreteTaskInput::Bool(b) => Ok(*b),
            _ => bail!("invalid task input type, expected Bool"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::Bool(self)
    }
}

impl<T> TaskInput for Vec<T>
where
    T: TaskInput,
{
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::List(list) => Ok(list
                .iter()
                .map(|i| <T as TaskInput>::try_from_concrete(i))
                .collect::<Result<Vec<_>, _>>()?),
            _ => bail!("invalid task input type, expected List"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::List(
            self.into_iter()
                .map(|i| <T as TaskInput>::into_concrete(i))
                .collect::<Vec<_>>(),
        )
    }
}

impl TaskInput for u8 {
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::U8(value) => Ok(*value),
            _ => bail!("invalid task input type, expected U8"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::U8(self)
    }
}

impl TaskInput for u16 {
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::U16(value) => Ok(*value),
            _ => bail!("invalid task input type, expected U16"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::U16(self)
    }
}

impl TaskInput for u32 {
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::U32(value) => Ok(*value),
            _ => bail!("invalid task input type, expected U32"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::U32(self)
    }
}

impl TaskInput for i32 {
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::I32(value) => Ok(*value),
            _ => bail!("invalid task input type, expected I32"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::I32(self)
    }
}

impl TaskInput for u64 {
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::U64(value) => Ok(*value),
            _ => bail!("invalid task input type, expected U64"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::U64(self)
    }
}

impl TaskInput for usize {
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::Usize(value) => Ok(*value),
            _ => bail!("invalid task input type, expected Usize"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::Usize(self)
    }
}

impl TaskInput for ValueTypeId {
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::U32(value) => Ok(ValueTypeId::from(*value)),
            _ => bail!("invalid task input type, expected ValueTypeId"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::U32(*self)
    }
}

impl TaskInput for TaskId {
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::U32(value) => Ok(TaskId::from(*value)),
            _ => bail!("invalid task input type, expected TaskId"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::U32(*self)
    }
}

impl<T> TaskInput for Option<T>
where
    T: TaskInput,
{
    fn try_from_concrete(value: &ConcreteTaskInput) -> Result<Self> {
        match value {
            ConcreteTaskInput::Nothing => Ok(None),
            _ => Ok(Some(<T as TaskInput>::try_from_concrete(value)?)),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        match self {
            None => ConcreteTaskInput::Nothing,
            Some(value) => <T as TaskInput>::into_concrete(value),
        }
    }
}

impl<T> TaskInput for Vc<T>
where
    T: Send,
{
    fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self> {
        match input {
            ConcreteTaskInput::TaskCell(task, index) => Ok(Vc {
                node: RawVc::TaskCell(*task, *index),
                _t: PhantomData,
            }),
            ConcreteTaskInput::TaskOutput(task) => Ok(Vc {
                node: RawVc::TaskOutput(*task),
                _t: PhantomData,
            }),
            _ => bail!("invalid task input type, expected RawVc"),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        match self.node {
            RawVc::TaskCell(task, index) => ConcreteTaskInput::TaskCell(task, index),
            RawVc::TaskOutput(task) => ConcreteTaskInput::TaskOutput(task),
        }
    }
}

impl<T> TaskInput for Value<T>
where
    T: Any
        + std::fmt::Debug
        + Clone
        + std::hash::Hash
        + Eq
        + Ord
        + Send
        + Sync
        + VcValueType
        + TypedForInput
        + 'static,
{
    fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self> {
        match input {
            ConcreteTaskInput::SharedValue(value) => {
                let v = value.1.downcast_ref::<T>().ok_or_else(|| {
                    anyhow!(
                        "invalid task input type, expected {} got {:?}",
                        type_name::<T>(),
                        value.1,
                    )
                })?;
                Ok(Value::new(v.clone()))
            }
            _ => bail!("invalid task input type, expected {}", type_name::<T>()),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        let raw_value: T = self.into_value();
        ConcreteTaskInput::SharedValue(SharedValue(
            Some(T::get_value_type_id()),
            Arc::new(raw_value),
        ))
    }
}

impl<T> TaskInput for TransientValue<T>
where
    T: MagicAny + Clone + 'static,
{
    fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self> {
        match input {
            ConcreteTaskInput::TransientSharedValue(value) => {
                let v = value.0.downcast_ref::<T>().ok_or_else(|| {
                    anyhow!(
                        "invalid task input type, expected {} got {:?}",
                        type_name::<T>(),
                        value.0,
                    )
                })?;
                Ok(TransientValue::new(v.clone()))
            }
            _ => bail!("invalid task input type, expected {}", type_name::<T>()),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        let raw_value: T = self.into_value();
        ConcreteTaskInput::TransientSharedValue(TransientSharedValue(Arc::new(raw_value)))
    }
}

impl<T> TaskInput for TransientInstance<T>
where
    T: Send + Sync + 'static,
{
    fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self> {
        match input {
            ConcreteTaskInput::SharedReference(reference) => {
                if let Ok(i) = reference.clone().try_into() {
                    Ok(i)
                } else {
                    bail!(
                        "invalid task input type, expected {} got {:?}",
                        type_name::<T>(),
                        reference.0,
                    )
                }
            }
            _ => bail!("invalid task input type, expected {}", type_name::<T>()),
        }
    }

    fn into_concrete(self) -> ConcreteTaskInput {
        ConcreteTaskInput::SharedReference(self.into())
    }
}

macro_rules! tuple_impls {
    ( $( $name:ident )+ ) => {
        impl<$($name: TaskInput),+> TaskInput for ($($name,)+)
        {
            #[allow(non_snake_case)]
            fn try_from_concrete(input: &ConcreteTaskInput) -> Result<Self> {
                match input {
                    ConcreteTaskInput::List(value) => {
                        let mut iter = value.iter();
                        $(
                            let $name = iter.next().ok_or_else(|| anyhow!("missing tuple element"))?;
                            let $name = TaskInput::try_from_concrete($name)?;
                        )+
                        Ok(($($name,)+))
                    }
                    _ => bail!("invalid task input type, expected list"),
                }
            }

            #[allow(non_snake_case)]
            fn into_concrete(self) -> ConcreteTaskInput {
                let ($($name,)+) = self;
                let ($($name,)+) = ($($name.into_concrete(),)+);
                ConcreteTaskInput::List(vec![ $($name,)+ ])
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
    use turbo_tasks_macros::TaskInput;

    use super::*;
    // This is necessary for the derive macro to work, as its expansion refers to
    // the crate name directly.
    use crate as turbo_tasks;

    fn conversion<T>(t: T) -> Result<T>
    where
        T: TaskInput,
    {
        TaskInput::try_from_concrete(&TaskInput::into_concrete(t))
    }

    macro_rules! test_conversion {
        ($input:expr) => {
            assert_eq!(conversion($input)?, $input);
        };
    }

    #[test]
    fn test_no_fields() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
        struct NoFields;

        test_conversion!(NoFields);
        Ok(())
    }

    #[test]
    fn test_one_unnamed_field() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
        struct OneUnnamedField(u32);

        test_conversion!(OneUnnamedField(42));
        Ok(())
    }

    #[test]
    fn test_multiple_unnamed_fields() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
        struct MultipleUnnamedFields(u32, RcStr);

        test_conversion!(MultipleUnnamedFields(42, "42".into()));
        Ok(())
    }

    #[test]
    fn test_one_named_field() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
        struct OneNamedField {
            named: u32,
        }

        test_conversion!(OneNamedField { named: 42 });
        Ok(())
    }

    #[test]
    fn test_multiple_named_fields() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
        struct MultipleNamedFields {
            named: u32,
            other: RcStr,
        }

        test_conversion!(MultipleNamedFields {
            named: 42,
            other: "42".into()
        });
        Ok(())
    }

    #[test]
    fn test_generic_field() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
        struct GenericField<T>(T);

        test_conversion!(GenericField(42));
        test_conversion!(GenericField(RcStr::from("42")));
        Ok(())
    }

    #[test]
    fn test_no_variant() -> Result<()> {
        // This can't actually be tested at runtime because such an enum can't be
        // constructed. However, the macro expansion is tested.
        #[derive(Clone, TaskInput)]
        enum NoVariants {}
        Ok(())
    }

    #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
    enum OneVariant {
        Variant,
    }

    #[test]
    fn test_one_variant() -> Result<()> {
        test_conversion!(OneVariant::Variant);
        Ok(())
    }

    #[test]
    fn test_multiple_variants() -> Result<()> {
        #[derive(Clone, TaskInput, PartialEq, Eq, Debug)]
        enum MultipleVariants {
            Variant1,
            Variant2,
        }

        test_conversion!(MultipleVariants::Variant2);
        Ok(())
    }

    #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
    enum MultipleVariantsAndHeterogeneousFields {
        Variant1,
        Variant2(u32),
        Variant3 { named: u32 },
        Variant4(u32, RcStr),
        Variant5 { named: u32, other: RcStr },
    }

    #[test]
    fn test_multiple_variants_and_heterogeneous_fields() -> Result<()> {
        test_conversion!(MultipleVariantsAndHeterogeneousFields::Variant5 {
            named: 42,
            other: "42".into()
        });
        Ok(())
    }

    #[test]
    fn test_nested_variants() -> Result<()> {
        #[derive(Clone, TaskInput, Eq, PartialEq, Debug)]
        enum NestedVariants {
            Variant1,
            Variant2(MultipleVariantsAndHeterogeneousFields),
            Variant3 { named: OneVariant },
            Variant4(OneVariant, RcStr),
            Variant5 { named: OneVariant, other: RcStr },
        }

        test_conversion!(NestedVariants::Variant5 {
            named: OneVariant::Variant,
            other: "42".into()
        });
        test_conversion!(NestedVariants::Variant2(
            MultipleVariantsAndHeterogeneousFields::Variant5 {
                named: 42,
                other: "42".into()
            }
        ));
        Ok(())
    }
}
