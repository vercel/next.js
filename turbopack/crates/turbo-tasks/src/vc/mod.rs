pub(crate) mod cast;
mod cell_mode;
pub(crate) mod default;
mod local;
pub(crate) mod operation;
mod read;
pub(crate) mod resolved;
mod traits;

use std::{
    any::Any,
    fmt::Debug,
    future::{Future, IntoFuture},
    hash::{Hash, Hasher},
    marker::PhantomData,
    ops::Deref,
};

use anyhow::Result;
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use shrink_to_fit::ShrinkToFit;

pub use self::{
    cast::{VcCast, VcValueTraitCast, VcValueTypeCast},
    cell_mode::{VcCellCompareMode, VcCellKeyedCompareMode, VcCellMode, VcCellNewMode},
    default::ValueDefault,
    local::NonLocalValue,
    operation::{OperationValue, OperationVc},
    read::{ReadOwnedVcFuture, ReadVcFuture, VcDefaultRead, VcRead, VcTransparentRead},
    resolved::ResolvedVc,
    traits::{Dynamic, Upcast, UpcastStrict, VcValueTrait, VcValueType},
};
use crate::{
    CellId, RawVc,
    debug::{ValueDebug, ValueDebugFormat, ValueDebugFormatString},
    keyed::{KeyedAccess, KeyedEq},
    registry,
    trace::{TraceRawVcs, TraceRawVcsContext},
    vc::read::{ReadContainsKeyedVcFuture, ReadKeyedVcFuture},
};

type VcReadTarget<T> = <<T as VcValueType>::Read as VcRead<T>>::Target;

#[doc = include_str!("README.md")]
#[must_use]
#[derive(Serialize, Deserialize, Encode, Decode)]
#[serde(transparent, bound = "")]
#[bincode(bounds = "T: ?Sized")]
#[repr(transparent)]
pub struct Vc<T>
where
    T: ?Sized,
{
    pub(crate) node: RawVc,
    #[doc(hidden)]
    pub(crate) _t: PhantomData<T>,
}

/// This only exists to satisfy the Rust type system. However, this struct can
/// never actually be instantiated, as dereferencing a `Vc<T>` will result in a
/// linker error. See the implementation of `Deref` for `Vc<T>`.
pub struct VcDeref<T>
where
    T: ?Sized,
{
    _t: PhantomData<T>,
}

macro_rules! do_not_use_or_you_will_be_fired {
    ($($name:ident)*) => {
        impl<T> VcDeref<T>
        where
            T: ?Sized,
        {
            $(
                #[doc(hidden)]
                #[allow(unused)]
                #[allow(clippy::wrong_self_convention)]
                #[deprecated = "This is not the method you are looking for."]
                pub fn $name(self) {}
            )*
        }
    };
}

// Hide raw pointer methods on `Vc<T>`. This is an artifact of having
// implement `Deref<Target = *const T>` on `Vc<T>` for `arbitrary_self_types` to
// do its thing. This can be removed once the `Receiver` trait no longer depends
// on `Deref`.
do_not_use_or_you_will_be_fired!(
    add
    addr
    align_offset
    as_mut
    as_mut_ptr
    as_ptr
    as_ref
    as_uninit_mut
    as_uninit_ref
    as_uninit_slice
    as_uninit_slice_mut
    byte_add
    byte_offset
    byte_offset_from
    byte_sub
    cast
    cast_const
    cast_mut
    copy_from
    copy_from_nonoverlapping
    copy_to
    copy_to_nonoverlapping
    drop_in_place
    expose_addr
    from_bits
    get_unchecked
    get_unchecked_mut
    guaranteed_eq
    guaranteed_ne
    is_aligned
    is_aligned_to
    is_empty
    is_null
    len
    map_addr
    mask
    offset
    offset_from
    read
    read_unaligned
    read_volatile
    replace
    split_at_mut
    split_at_mut_unchecked
    sub
    sub_ptr
    swap
    to_bits
    to_raw_parts
    with_addr
    with_metadata_of
    wrapping_add
    wrapping_byte_add
    wrapping_byte_offset
    wrapping_byte_sub
    wrapping_offset
    wrapping_sub
    write
    write_bytes
    write_unaligned
    write_volatile
);

// Call this macro for all the applicable methods above:

#[doc(hidden)]
impl<T> Deref for VcDeref<T>
where
    T: ?Sized,
{
    // `*const T` or `*mut T` would be enough here, but from an abundance of
    // caution, we use `*const *mut *const T` to make sure there will never be an
    // applicable method.
    type Target = *const *mut *const T;

    fn deref(&self) -> &Self::Target {
        unsafe extern "C" {
            #[link_name = "\n\nERROR: you tried to dereference a `Vc<T>`\n"]
            fn trigger() -> !;
        }

        unsafe { trigger() };
    }
}

// This is the magic that makes `Vc<T>` accept `self: Vc<Self>` methods through
// `arbitrary_self_types`, while not allowing any other receiver type:
// * `Vc<T>` dereferences to `*const *mut *const T`, which means that it is valid under the
//   `arbitrary_self_types` rules.
// * `*const *mut *const T` is not a valid receiver for any attribute access on `T`, which means
//   that the only applicable items will be the methods declared on `self: Vc<Self>`.
//
// If we had used `type Target = T` instead, `vc_t.some_attr_defined_on_t` would
// have been accepted by the compiler.
#[doc(hidden)]
impl<T> Deref for Vc<T>
where
    T: ?Sized,
{
    type Target = VcDeref<T>;

    fn deref(&self) -> &Self::Target {
        unsafe extern "C" {
            #[link_name = "\n\nERROR: you tried to dereference a `Vc<T>`\n"]
            fn trigger() -> !;
        }

        unsafe { trigger() };
    }
}

impl<T> Copy for Vc<T> where T: ?Sized {}

impl<T> Clone for Vc<T>
where
    T: ?Sized,
{
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Hash for Vc<T>
where
    T: ?Sized,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.node.hash(state);
    }
}

impl<T> PartialEq<Vc<T>> for Vc<T>
where
    T: ?Sized,
{
    fn eq(&self, other: &Self) -> bool {
        self.node == other.node
    }
}

impl<T> Eq for Vc<T> where T: ?Sized {}

/// Generates an opaque debug representation of the [`Vc`] itself, but not the data inside of it.
///
/// This is implemented to allow types containing [`Vc`] to implement the synchronous [`Debug`]
/// trait, but in most cases users should use the [`ValueDebug`] implementation to get a string
/// representation of the contents of the cell.
impl<T> Debug for Vc<T>
where
    T: ?Sized,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("Vc").field(&self.node).finish()
    }
}

impl<T> Vc<T>
where
    T: VcValueType,
{
    // called by the `.cell()` method generated by the `#[turbo_tasks::value]` macro
    #[doc(hidden)]
    pub fn cell_private(mut inner: <T::Read as VcRead<T>>::Target) -> Self {
        // cell contents are immutable, so go ahead and shrink the cell's contents
        ShrinkToFit::shrink_to_fit(<T::Read as VcRead<T>>::target_to_value_mut_ref(&mut inner));
        <T::CellMode as VcCellMode<T>>::cell(inner)
    }
}

impl<T, Inner> Vc<T>
where
    T: VcValueType<Read = VcTransparentRead<T, Inner>>,
    Inner: Any + Send + Sync,
{
    pub fn cell(inner: Inner) -> Self {
        Self::cell_private(inner)
    }
}

impl<T> Vc<T>
where
    T: ?Sized,
{
    /// Returns a debug identifier for this `Vc`.
    pub async fn debug_identifier(vc: Self) -> Result<String> {
        let resolved = vc.resolve().await?;
        let raw_vc: RawVc = resolved.node;
        if let RawVc::TaskCell(task_id, CellId { type_id, index }) = raw_vc {
            let value_ty = registry::get_value_type(type_id);
            Ok(format!("{}#{}: {}", value_ty.ty.name, index, task_id))
        } else {
            unreachable!()
        }
    }

    /// Returns the `RawVc` corresponding to this `Vc`.
    pub fn into_raw(vc: Self) -> RawVc {
        vc.node
    }

    /// Upcasts the given `Vc<T>` to a `Vc<Box<dyn K>>`.
    ///
    /// This is also available as an `Into`/`From` conversion.
    #[inline(always)]
    pub fn upcast<K>(vc: Self) -> Vc<K>
    where
        T: UpcastStrict<K>,
        K: VcValueTrait + ?Sized,
    {
        Self::upcast_non_strict(vc)
    }

    /// Upcasts the given `Vc<T>` to a `Vc<Box<dyn K>>`
    ///
    /// This has a loose type constraint which would allow upcasting to the same type, prefer using
    /// [`Vc::upcast`] when possible.  This is useful for extension traits and other more generic
    /// usecases.
    ///
    /// # Example
    /// ```rust
    /// // In generic code where T might be the same as K
    /// fn process_foo(vc: ResolvedVc<impl Upcast<Box<dyn MyTrait>>>) -> Vc<Foo> {
    ///    let my_trait: ResolvedVc<Box<dyn MyTrait>> = Vc::upcast_non_strict(vc);
    ///    my_trait.do_something()
    /// }
    /// ```
    /// Using generics you could allow users to pass any compatible type, but if you specified
    /// `UpcastStrict<...>` instead of `Upcast<...>` you would disallow calling this function if you
    /// already had a `ResolvedVc<Box<dyn MyTrait>>`. So this function has a looser type constraint
    /// to make these functions easier to write and use.
    #[inline(always)]
    pub fn upcast_non_strict<K>(vc: Self) -> Vc<K>
    where
        T: Upcast<K>,
        K: VcValueTrait + ?Sized,
    {
        Vc {
            node: vc.node,
            _t: PhantomData,
        }
    }
    /// Runs the operation, but ignores the returned Vc. Use that when only interested in running
    /// the task for side effects.
    pub async fn as_side_effect(self) -> Result<()> {
        self.node.resolve().await?;
        Ok(())
    }

    /// Do not use this: Use [`Vc::to_resolved`] instead. If you must have a resolved [`Vc`] type
    /// and not a [`ResolvedVc`] type, simply deref the result of [`Vc::to_resolved`].
    pub async fn resolve(self) -> Result<Vc<T>> {
        Ok(Self {
            node: self.node.resolve().await?,
            _t: PhantomData,
        })
    }

    /// Resolve the reference until it points to a cell directly, and wrap the
    /// result in a [`ResolvedVc`], which statically guarantees that the
    /// [`Vc`] was resolved.
    pub async fn to_resolved(self) -> Result<ResolvedVc<T>> {
        Ok(ResolvedVc {
            node: self.resolve().await?,
        })
    }

    /// Returns `true` if the reference is resolved, meaning the underlying [`RawVc`] uses the
    /// [`RawVc::TaskCell`] representation.
    ///
    /// If you need resolved [`Vc`] value, it's typically better to use the [`ResolvedVc`] type to
    /// enforce your requirements statically instead of dynamically at runtime.
    ///
    /// See also [`ResolvedVc::to_resolved`] and [`RawVc::is_resolved`].
    pub fn is_resolved(self) -> bool {
        self.node.is_resolved()
    }

    /// Returns `true` if the `Vc` was by a local function call (e.g. one who's arguments were not
    /// fully resolved) and has not yet been resolved.
    ///
    /// Aside from differences in caching, a function's behavior should not be changed by using
    /// local or non-local cells, so this function is mostly useful inside tests and internally in
    /// turbo-tasks.
    pub fn is_local(self) -> bool {
        self.node.is_local()
    }

    /// Do not use this: Use [`OperationVc::resolve_strongly_consistent`] instead.
    #[cfg(feature = "non_operation_vc_strongly_consistent")]
    pub async fn resolve_strongly_consistent(self) -> Result<Self> {
        Ok(Self {
            node: self.node.resolve_strongly_consistent().await?,
            _t: PhantomData,
        })
    }
}

impl<T> From<RawVc> for Vc<T>
where
    T: ?Sized,
{
    fn from(node: RawVc) -> Self {
        Self {
            node,
            _t: PhantomData,
        }
    }
}

impl<T> TraceRawVcs for Vc<T>
where
    T: ?Sized,
{
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.node, trace_context);
    }
}

impl<T> ValueDebugFormat for Vc<T>
where
    T: UpcastStrict<Box<dyn ValueDebug>> + Send + Sync + ?Sized,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        ValueDebugFormatString::Async(Box::pin(async move {
            Ok({
                let vc_value_debug = Vc::upcast::<Box<dyn ValueDebug>>(*self);
                vc_value_debug.dbg_depth(depth).await?.to_string()
            })
        }))
    }
}

macro_rules! into_future {
    ($ty:ty) => {
        impl<T> IntoFuture for $ty
        where
            T: VcValueType,
        {
            type Output = <ReadVcFuture<T> as Future>::Output;
            type IntoFuture = ReadVcFuture<T>;
            fn into_future(self) -> Self::IntoFuture {
                self.node.into_read(T::has_serialization()).into()
            }
        }
    };
}

into_future!(Vc<T>);
into_future!(&Vc<T>);
into_future!(&mut Vc<T>);

impl<T> Vc<T>
where
    T: VcValueType,
{
    /// Do not use this: Use [`OperationVc::read_strongly_consistent`] instead.
    #[cfg(feature = "non_operation_vc_strongly_consistent")]
    pub fn strongly_consistent(self) -> ReadVcFuture<T> {
        self.node
            .into_read(T::has_serialization())
            .strongly_consistent()
            .into()
    }

    /// Returns a untracked read of the value. This will not invalidate the current function when
    /// the read value changed.
    pub fn untracked(self) -> ReadVcFuture<T> {
        self.node
            .into_read(T::has_serialization())
            .untracked()
            .into()
    }

    /// Read the value with the hint that this is the final read of the value. This might drop the
    /// cell content. Future reads might need to recompute the value.
    pub fn final_read_hint(self) -> ReadVcFuture<T> {
        self.node
            .into_read(T::has_serialization())
            .final_read_hint()
            .into()
    }
}

impl<T> Vc<T>
where
    T: VcValueType,
    VcReadTarget<T>: Clone,
{
    /// Read the value and returns a owned version of it. It might clone the value.
    pub fn owned(self) -> ReadOwnedVcFuture<T> {
        let future: ReadVcFuture<T> = self.node.into_read(T::has_serialization()).into();
        future.owned()
    }
}

impl<T> Vc<T>
where
    T: VcValueType,
    VcReadTarget<T>: KeyedEq,
{
    /// Read the value and selects a keyed value from it. Only depends on the used key instead of
    /// the full value.
    pub fn get<'l, Q>(self, key: &'l Q) -> ReadKeyedVcFuture<'l, T, Q>
    where
        Q: Hash + ?Sized,
        VcReadTarget<T>: KeyedAccess<Q>,
    {
        let future: ReadVcFuture<T> = self.node.into_read(T::has_serialization()).into();
        future.get(key)
    }

    /// Read the value and checks if it contains the given key. Only depends on the used key instead
    /// of the full value.
    pub fn contains_key<'l, Q>(self, key: &'l Q) -> ReadContainsKeyedVcFuture<'l, T, Q>
    where
        Q: Hash + ?Sized,
        VcReadTarget<T>: KeyedAccess<Q>,
    {
        let future: ReadVcFuture<T> = self.node.into_read(T::has_serialization()).into();
        future.contains_key(key)
    }
}

impl<T> Unpin for Vc<T> where T: ?Sized {}

impl<T> Vc<T>
where
    T: VcValueTrait + ?Sized,
{
    /// Converts this trait vc into a trait reference.
    ///
    /// The signature is similar to [`IntoFuture::into_future`], but we don't want trait vcs to
    /// have the same future-like semantics as value vcs when it comes to producing refs. This
    /// behavior is rarely needed, so in most cases, `.await`ing a trait vc is a mistake.
    pub fn into_trait_ref(self) -> ReadVcFuture<T, VcValueTraitCast<T>> {
        self.node
            .into_read_with_unknown_is_serializable_cell_content()
            .into()
    }
}

impl<T> Default for Vc<T>
where
    T: ValueDefault,
{
    fn default() -> Self {
        T::value_default()
    }
}

pub trait OptionVcExt<T>
where
    T: VcValueType,
{
    fn to_resolved(self) -> impl Future<Output = Result<Option<ResolvedVc<T>>>> + Send;
}

impl<T> OptionVcExt<T> for Option<Vc<T>>
where
    T: VcValueType,
{
    async fn to_resolved(self) -> Result<Option<ResolvedVc<T>>> {
        if let Some(vc) = self {
            Ok(Some(vc.to_resolved().await?))
        } else {
            Ok(None)
        }
    }
}
