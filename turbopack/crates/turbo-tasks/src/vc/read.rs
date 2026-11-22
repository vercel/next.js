use std::{
    any::Any,
    hash::{BuildHasher, Hash},
    marker::PhantomData,
    mem::ManuallyDrop,
    pin::Pin,
    task::Poll,
};

use anyhow::Result;
use futures::Future;
use pin_project_lite::pin_project;
use rustc_hash::FxBuildHasher;

use super::traits::VcValueType;
use crate::{
    CellId, MappedReadRef, ReadRawVcFuture, ReadRef, TaskId, VcCast, VcValueTrait,
    VcValueTraitCast, VcValueTypeCast,
    keyed::{KeyedAccess, KeyedEq},
    manager::ProvisionalReadDependency,
    vc::{keyed_read_ref::KeyedReadRef, lazy_read_ref::LazyReadRef},
};

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

    /// Convert a reference to a value to a reference to the target type.
    fn value_to_target_ref(value: &T) -> &Self::Target;

    /// Convert a value to the target type.
    fn value_to_target(value: T) -> Self::Target;

    /// Convert the target type to the value.
    fn target_to_value(target: Self::Target) -> T;

    /// Convert a reference to a target type to a reference to a value.
    fn target_to_value_ref(target: &Self::Target) -> &T;

    /// Convert a mutable reference to a target type to a reference to a value.
    fn target_to_value_mut_ref(target: &mut Self::Target) -> &mut T;
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

    fn value_to_target_ref(value: &T) -> &Self::Target {
        value
    }

    fn value_to_target(value: T) -> Self::Target {
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
}

/// Representation for `#[turbo_tasks::value(transparent)]` types, where reads
/// return a reference to the target type.
pub struct VcTransparentRead<T, Target> {
    _phantom: PhantomData<(T, Target)>,
}

impl<T, Target> VcRead<T> for VcTransparentRead<T, Target>
where
    T: VcValueType,
    Target: Any + Send + Sync,
{
    type Target = Target;

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
}

#[must_use]
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
    /// Do not use this: Use
    /// [`OperationVc::read_strongly_consistent`](crate::OperationVc::read_strongly_consistent)
    /// instead.
    pub(crate) fn strongly_consistent(mut self) -> Self {
        self.raw = self.raw.strongly_consistent();
        self
    }

    /// Returns a untracked read of the value. This will not invalidate the current function when
    /// the read value changed.
    pub fn untracked(mut self) -> Self {
        self.raw = self.raw.untracked();
        self
    }

    /// Read the value with the hint that this is the final read of the value. This might drop the
    /// cell content. Future reads might need to recompute the value.
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
    /// Read the value and returns a owned version of it. It might clone the value.
    pub fn owned(self) -> ReadOwnedVcFuture<T> {
        ReadOwnedVcFuture { future: self }
    }
}

impl<T> ReadVcFuture<T, VcValueTypeCast<T>>
where
    T: VcValueType,
    VcReadTarget<T>: KeyedEq,
{
    /// Read the value and selects a keyed value from it. Only depends on the used key instead of
    /// the full value.
    pub fn get<'l, Q>(mut self, key: &'l Q) -> ReadKeyedVcFuture<'l, T, Q>
    where
        Q: Hash + ?Sized,
        VcReadTarget<T>: KeyedAccess<Q>,
    {
        self.raw = self.raw.track_with_key(FxBuildHasher.hash_one(key));
        ReadKeyedVcFuture { future: self, key }
    }

    /// Read the value and checks if it contains the given key. Only depends on the used key instead
    /// of the full value.
    ///
    /// Note: This is also invalidated when the value of the key changes, not only when the presence
    /// of the key changes.
    pub fn contains_key<'l, Q>(mut self, key: &'l Q) -> ReadContainsKeyedVcFuture<'l, T, Q>
    where
        Q: Hash + ?Sized,
        VcReadTarget<T>: KeyedAccess<Q>,
    {
        self.raw = self.raw.track_with_key(FxBuildHasher.hash_one(key));
        ReadContainsKeyedVcFuture { future: self, key }
    }

    /// Read the value once for many synchronous keyed accesses via the returned
    /// [`KeyedReadRef`]. See [`Vc::keyed_reader`](crate::Vc::keyed_reader).
    ///
    /// Only exposed as `Vc::keyed_reader`, so it can't be combined with builder options like
    /// `untracked()` that conflict with the dependency it registers.
    pub(crate) fn read_keyed_reader(self) -> ReadKeyedReaderVcFuture<T> {
        ReadKeyedReaderVcFuture {
            read: CancelableDependencyRead::new(self.raw),
            _phantom: PhantomData,
        }
    }
}

impl<T> ReadVcFuture<T, VcValueTypeCast<T>>
where
    T: VcValueType,
{
    /// Read the value via the returned [`LazyReadRef`]. See
    /// [`Vc::lazy_reader`](crate::Vc::lazy_reader).
    ///
    /// Only exposed as `Vc::lazy_reader`, so it can't be combined with builder options like
    /// `untracked()`: an untracked read has no dependency to cancel.
    pub(crate) fn read_lazy_reader(self) -> ReadLazyReaderVcFuture<T> {
        ReadLazyReaderVcFuture {
            read: CancelableDependencyRead::new(self.raw),
            _phantom: PhantomData,
        }
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

/// The dependency a successful [`CancelableDependencyRead`] hands over: the cell that was read and
/// its registered [`ProvisionalReadDependency`].
type HandedOverDependency = (TaskId, CellId, ProvisionalReadDependency);

/// The shared read of [`ReadKeyedReaderVcFuture`] and [`ReadLazyReaderVcFuture`]: reads the cell
/// with a separate provisional ([`CellKeyKind::Provisional`](crate::CellKeyKind::Provisional))
/// dependency that the resulting [`KeyedReadRef`] narrows, or the resulting [`LazyReadRef`]
/// cancels, when it's dropped.
struct CancelableDependencyRead {
    raw: ReadRawVcFuture,
    /// The [`CellKeyKind::Provisional`](crate::CellKeyKind::Provisional) dependency, registered as
    /// alive in the execution that created this. `None` if the read isn't tracked that way (no
    /// current task), once it was handed to the resulting ref, or once this was polled in a
    /// different execution (then the registration is never released).
    dependency: Option<ProvisionalReadDependency>,
}

impl CancelableDependencyRead {
    fn new(mut raw: ReadRawVcFuture) -> Self {
        let dependency = ProvisionalReadDependency::new_for_current_task();
        if let Some(dependency) = &dependency {
            raw.set_track_provisional(dependency.id);
            // Counted until the resulting ref (or the future, when it doesn't complete) is
            // dropped within this execution.
            dependency.register_alive_ref();
        }
        Self { raw, dependency }
    }

    /// On success, hands the registered dependency (with the cell that was read) over to the
    /// caller, which must release it.
    fn poll<T: VcValueType>(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Result<(ReadRef<T>, Option<HandedOverDependency>)>> {
        let in_creating_execution = self
            .dependency
            .as_ref()
            .is_some_and(|dependency| dependency.is_current_execution());
        if self.dependency.is_some() && !in_creating_execution {
            // Polled in a different task execution than the one that created it. That's a leak:
            // the creating execution keeps counting this future as alive (the registration is
            // never released, even when this is moved back later) and panics when it completes.
            // The id belongs to the creating execution and could collide with an id of this one,
            // so this read is tracked as a normal full dependency and never narrowed or canceled.
            self.raw.set_track_full();
            self.dependency = None;
        }
        let content = match std::task::ready!(Pin::new(&mut self.raw).poll(cx)) {
            Ok(content) => content,
            Err(err) => {
                // Only `Some` in the creating execution.
                if let Some(dependency) = self.dependency.take() {
                    dependency.release_alive_ref();
                }
                return Poll::Ready(Err(err));
            }
        };
        let dependency = self.dependency.take().map(|dependency| {
            let Some((task, index)) = self.raw.resolved_cell() else {
                unreachable!("a successful read is always resolved to a cell")
            };
            (task, index, dependency)
        });
        match VcValueTypeCast::<T>::cast(content) {
            Ok(read_ref) => Poll::Ready(Ok((read_ref, dependency))),
            Err(err) => {
                if let Some((_, _, dependency)) = dependency {
                    dependency.release_alive_ref();
                }
                Poll::Ready(Err(err))
            }
        }
    }
}

impl Drop for CancelableDependencyRead {
    fn drop(&mut self) {
        // Not completed (e.g. never awaited or cancelled). Dropping it within the creating
        // execution is fine. A `CellKeyKind::Provisional` dependency it might have registered is
        // converted to a normal dependency when the execution completes. Dropping it elsewhere
        // keeps it counted as leaked.
        if let Some(dependency) = self.dependency.take()
            && dependency.is_current_execution()
        {
            dependency.release_alive_ref();
        }
    }
}

/// A future returned by [`Vc::keyed_reader`](crate::Vc::keyed_reader).
#[must_use]
pub struct ReadKeyedReaderVcFuture<T>
where
    T: VcValueType,
    VcReadTarget<T>: KeyedEq,
{
    read: CancelableDependencyRead,
    _phantom: PhantomData<fn() -> T>,
}

impl<T> Future for ReadKeyedReaderVcFuture<T>
where
    T: VcValueType,
    VcReadTarget<T>: KeyedEq,
{
    type Output = Result<KeyedReadRef<T>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        let (read_ref, dependency) = std::task::ready!(self.get_mut().read.poll(cx))?;
        Poll::Ready(Ok(KeyedReadRef::new(read_ref, dependency)))
    }
}

/// A future returned by [`Vc::lazy_reader`](crate::Vc::lazy_reader).
#[must_use]
pub struct ReadLazyReaderVcFuture<T>
where
    T: VcValueType,
{
    read: CancelableDependencyRead,
    _phantom: PhantomData<fn() -> T>,
}

impl<T> Future for ReadLazyReaderVcFuture<T>
where
    T: VcValueType,
{
    type Output = Result<LazyReadRef<T>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        let (read_ref, dependency) = std::task::ready!(self.get_mut().read.poll(cx))?;
        Poll::Ready(Ok(LazyReadRef::new(read_ref, dependency)))
    }
}

pin_project! {
    pub struct ReadKeyedVcFuture<'l, T, Q>
    where
        T: VcValueType,
        Q: ?Sized,
        VcReadTarget<T>: KeyedAccess<Q>,

    {
        #[pin]
        future: ReadVcFuture<T, VcValueTypeCast<T>>,
        key: &'l Q,
    }
}

impl<'l, T, Q> Future for ReadKeyedVcFuture<'l, T, Q>
where
    T: VcValueType,
    Q: ?Sized,
    VcReadTarget<T>: KeyedAccess<Q>,
{
    type Output = Result<Option<MappedReadRef<T, <VcReadTarget<T> as KeyedAccess<Q>>::Value>>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        // Safety: We never move the contents of `self`
        let this = self.project();
        match this.future.poll(cx) {
            Poll::Ready(Ok(result)) => {
                let mapped_read_ref = if let Some(value) = (*result).get(this.key) {
                    let ptr = value as *const _;
                    Some(unsafe { MappedReadRef::new(result.into_raw_arc(), ptr) })
                } else {
                    None
                };
                Poll::Ready(Ok(mapped_read_ref))
            }
            Poll::Ready(Err(err)) => Poll::Ready(Err(err)),
            Poll::Pending => Poll::Pending,
        }
    }
}

pin_project! {
    pub struct ReadContainsKeyedVcFuture<'l, T, Q>
    where
        T: VcValueType,
        Q: ?Sized,
        VcReadTarget<T>: KeyedAccess<Q>,
    {
        #[pin]
        future: ReadVcFuture<T, VcValueTypeCast<T>>,
        key: &'l Q,
    }
}

impl<'l, T, Q> Future for ReadContainsKeyedVcFuture<'l, T, Q>
where
    T: VcValueType,
    Q: ?Sized,
    VcReadTarget<T>: KeyedAccess<Q>,
{
    type Output = Result<bool>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        // Safety: We never move the contents of `self`
        let this = self.project();
        match this.future.poll(cx) {
            Poll::Ready(Ok(result)) => {
                let result = (*result).contains_key(this.key);
                Poll::Ready(Ok(result))
            }
            Poll::Ready(Err(err)) => Poll::Ready(Err(err)),
            Poll::Pending => Poll::Pending,
        }
    }
}
