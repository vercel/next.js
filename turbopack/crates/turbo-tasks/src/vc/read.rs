use std::{any::Any, marker::PhantomData, mem::ManuallyDrop, pin::Pin, task::Poll};

use anyhow::Result;
use futures::Future;

use super::traits::VcValueType;
use crate::{ReadRawVcFuture, ReadRef, VcCast, VcValueTrait, VcValueTraitCast, VcValueTypeCast};

type VcReadTarget<T> = <<T as VcValueType>::Read as VcRead<T>>::Target;

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

    /// Convert a value to the target type.
    fn value_to_target(value: T) -> Self::Target;

    /// Convert the value type to the repr.
    fn value_to_repr(value: T) -> Self::Repr;

    /// Convert the target type to the value.
    fn target_to_value(target: Self::Target) -> T;

    /// Convert a reference to a target type to a reference to a value.
    fn target_to_value_ref(target: &Self::Target) -> &T;

    /// Convert a mutable reference to a target type to a reference to a value.
    fn target_to_value_mut_ref(target: &mut Self::Target) -> &mut T;

    /// Convert the target type to the repr.
    fn target_to_repr(target: Self::Target) -> Self::Repr;

    /// Convert a reference to a repr type to a reference to a value.
    fn repr_to_value_ref(repr: &Self::Repr) -> &T;
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

    fn value_to_target(value: T) -> Self::Target {
        value
    }

    fn value_to_repr(value: T) -> Self::Repr {
        value
    }

    fn target_to_value(target: Self::Target) -> T {
        target
    }

    fn target_to_value_ref(target: &Self::Target) -> &T {
        target
    }

    fn target_to_value_mut_ref(target: &mut Self::Target) -> &mut T {
        target
    }

    fn target_to_repr(target: Self::Target) -> Self::Repr {
        target
    }

    fn repr_to_value_ref(repr: &Self::Repr) -> &T {
        repr
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

    fn value_to_target(value: T) -> Self::Target {
        // Safety: see `Self::value_to_target_ref` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<T>, Self::Target>(&ManuallyDrop::new(value))
        }
    }

    fn value_to_repr(value: T) -> Self::Repr {
        // Safety: see `Self::value_to_target_ref` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<T>, Self::Repr>(&ManuallyDrop::new(value))
        }
    }

    fn target_to_value(target: Self::Target) -> T {
        // Safety: see `Self::value_to_target_ref` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<Self::Target>, T>(&ManuallyDrop::new(target))
        }
    }

    fn target_to_value_ref(target: &Self::Target) -> &T {
        // Safety: see `Self::value_to_target_ref` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<&Self::Target>, &T>(&ManuallyDrop::new(target))
        }
    }

    fn target_to_value_mut_ref(target: &mut Self::Target) -> &mut T {
        // Safety: see `Self::value_to_target_ref` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<&mut Self::Target>, &mut T>(&ManuallyDrop::new(
                target,
            ))
        }
    }

    fn target_to_repr(target: Self::Target) -> Self::Repr {
        // Safety: see `Self::value_to_target_ref` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<Self::Target>, Self::Repr>(&ManuallyDrop::new(
                target,
            ))
        }
    }

    fn repr_to_value_ref(repr: &Self::Repr) -> &T {
        // Safety: see `Self::value_to_target_ref` above.
        unsafe {
            std::mem::transmute_copy::<ManuallyDrop<&Self::Repr>, &T>(&ManuallyDrop::new(repr))
        }
    }
}

pub struct ReadVcFuture<T, Cast = VcValueTypeCast<T>>
where
    T: ?Sized,
    Cast: VcCast,
{
    raw: ReadRawVcFuture,
    _phantom_t: PhantomData<T>,
    _phantom_cast: PhantomData<Cast>,
}

impl<T, Cast> ReadVcFuture<T, Cast>
where
    T: ?Sized,
    Cast: VcCast,
{
    pub fn strongly_consistent(mut self) -> Self {
        self.raw = self.raw.strongly_consistent();
        self
    }

    pub fn untracked(mut self) -> Self {
        self.raw = self.raw.untracked();
        self
    }

    pub fn final_read_hint(mut self) -> Self {
        self.raw = self.raw.final_read_hint();
        self
    }
}

impl<T> ReadVcFuture<T, VcValueTypeCast<T>>
where
    T: VcValueType,
    VcReadTarget<T>: Clone,
{
    pub fn owned(self) -> ReadOwnedVcFuture<T> {
        ReadOwnedVcFuture { future: self }
    }
}

impl<T> From<ReadRawVcFuture> for ReadVcFuture<T, VcValueTypeCast<T>>
where
    T: VcValueType,
{
    fn from(raw: ReadRawVcFuture) -> Self {
        Self {
            raw,
            _phantom_t: PhantomData,
            _phantom_cast: PhantomData,
        }
    }
}

impl<T> From<ReadRawVcFuture> for ReadVcFuture<T, VcValueTraitCast<T>>
where
    T: VcValueTrait + ?Sized,
{
    fn from(raw: ReadRawVcFuture) -> Self {
        Self {
            raw,
            _phantom_t: PhantomData,
            _phantom_cast: PhantomData,
        }
    }
}

impl<T, Cast> Future for ReadVcFuture<T, Cast>
where
    T: ?Sized,
    Cast: VcCast,
{
    type Output = Result<Cast::Output>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        // Safety: We never move the contents of `self`
        let raw = unsafe { self.map_unchecked_mut(|this| &mut this.raw) };
        Poll::Ready(std::task::ready!(raw.poll(cx)).and_then(Cast::cast))
    }
}

pub struct ReadOwnedVcFuture<T>
where
    T: VcValueType,
    VcReadTarget<T>: Clone,
{
    future: ReadVcFuture<T, VcValueTypeCast<T>>,
}

impl<T> Future for ReadOwnedVcFuture<T>
where
    T: VcValueType,
    VcReadTarget<T>: Clone,
{
    type Output = Result<VcReadTarget<T>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        // Safety: We never move the contents of `self`
        let future = unsafe { self.map_unchecked_mut(|this| &mut this.future) };
        match future.poll(cx) {
            Poll::Ready(Ok(result)) => Poll::Ready(Ok(ReadRef::into_owned(result))),
            Poll::Ready(Err(err)) => Poll::Ready(Err(err)),
            Poll::Pending => Poll::Pending,
        }
    }
}
