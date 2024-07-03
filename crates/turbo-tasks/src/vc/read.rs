use std::{any::Any, marker::PhantomData, mem::ManuallyDrop};

use super::traits::VcValueType;

/// Trait that controls [`crate::Vc`]'s read representation.
///
/// Has two implementations:
/// * [`VcDefaultRead`]
/// * [`VcTransparentRead`]
///
/// This trait must remain sealed within this crate.
pub trait VcRead<T>
where
    T: VcValueType,
{
    /// The read target type. This is the type that will be returned when
    /// `.await`ing a `Vc` of a value type.
    ///
    /// For instance, the target of `.await`ing a `Vc<Completion>` will be a
    /// `Completion`. When using `#[turbo_tasks::value(transparent)]`, the
    /// target will be different than the value type.
    type Target;

    /// The representation type. This is what will be used to
    /// serialize/deserialize the value, and this determines the
    /// type that the value will be upcasted to for storage.
    ///
    /// For instance, when storing generic collection types such as
    /// `Vec<Vc<ValueType>>`, we first cast them to a shared `Vec<Vc<()>>`
    /// type instead, which has an equivalent memory representation to any
    /// `Vec<Vc<T>>` type. This allows sharing implementations of methods and
    /// traits between all `Vec<Vc<T>>`.
    type Repr: VcValueType;

    /// Convert a reference to a value to a reference to the target type.
    fn value_to_target_ref(value: &T) -> &Self::Target;

    /// Convert the target type to the repr.
    fn target_to_repr(target: Self::Target) -> Self::Repr;

    /// Convert a reference to a target type to a reference to a value.
    fn target_to_value_ref(target: &Self::Target) -> &T;
}

/// Representation for standard `#[turbo_tasks::value]`, where a read return a
/// reference to the value type[]
pub struct VcDefaultRead<T> {
    _phantom: PhantomData<T>,
}

impl<T> VcRead<T> for VcDefaultRead<T>
where
    T: VcValueType,
{
    type Target = T;
    type Repr = T;

    fn value_to_target_ref(value: &T) -> &Self::Target {
        value
    }

    fn target_to_repr(target: Self::Target) -> T {
        target
    }

    fn target_to_value_ref(target: &Self::Target) -> &T {
        target
    }
}

/// Representation for `#[turbo_tasks::value(transparent)]` types, where reads
/// return a reference to the target type.
pub struct VcTransparentRead<T, Target, Repr> {
    _phantom: PhantomData<(T, Target, Repr)>,
}

impl<T, Target, Repr> VcRead<T> for VcTransparentRead<T, Target, Repr>
where
    T: VcValueType,
    Target: Any + Send + Sync,
    Repr: VcValueType,
{
    type Target = Target;
    type Repr = Repr;

    fn value_to_target_ref(value: &T) -> &Self::Target {
        // Safety: the `VcValueType` implementor must guarantee that both `T` and
        // `Target` are #[repr(transparent)]. This is guaranteed by the
        // `#[turbo_tasks::value(transparent)]` macro.
        // We can't use `std::mem::transmute` here as it doesn't support generic types.
        // See https://users.rust-lang.org/t/transmute-doesnt-work-on-generic-types/87272/9
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<&T>, &Self::Target>(&ManuallyDrop::new(value))
        }
    }

    fn target_to_repr(target: Self::Target) -> Self::Repr {
        // Safety: see `Self::value_to_target` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<Self::Target>, Self::Repr>(&ManuallyDrop::new(
                target,
            ))
        }
    }

    fn target_to_value_ref(target: &Self::Target) -> &T {
        // Safety: see `Self::value_to_target` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<&Self::Target>, &T>(&ManuallyDrop::new(target))
        }
    }
}
