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
use serde::{Deserialize, Serialize};
use shrink_to_fit::ShrinkToFit;

pub use self::{
    cast::{VcCast, VcValueTraitCast, VcValueTypeCast},
    cell_mode::{VcCellMode, VcCellNewMode, VcCellSharedMode},
    default::ValueDefault,
    local::NonLocalValue,
    operation::{OperationValue, OperationVc},
    read::{ReadOwnedVcFuture, ReadVcFuture, VcDefaultRead, VcRead, VcTransparentRead},
    resolved::ResolvedVc,
    traits::{Dynamic, TypedForInput, Upcast, VcValueTrait, VcValueType},
};
use crate::{
    debug::{ValueDebug, ValueDebugFormat, ValueDebugFormatString},
    registry,
    trace::{TraceRawVcs, TraceRawVcsContext},
    CellId, RawVc, ResolveTypeError,
};

type VcReadTarget<T> = <<T as VcValueType>::Read as VcRead<T>>::Target;

/// A "Value Cell" (`Vc` for short) is a reference to a memoized computation result stored on the
/// heap or in persistent cache, depending on the Turbo Engine backend implementation.
///
/// In order to get a reference to the pointed value, you need to `.await` the [`Vc<T>`] to get a
/// [`ReadRef<T>`][`ReadRef`]:
///
/// ```
/// let some_vc: Vc<T>;
/// let some_ref: ReadRef<T> = some_vc.await?;
/// some_ref.some_method_on_t();
/// ```
///
/// `Vc`s are similar to a [`Future`] or a Promise with a few key differences:
///
/// - The value pointed to by a `Vc` can be invalidated by changing dependencies or cache evicted,
///   meaning that `await`ing a `Vc` multiple times can give different results. A [`ReadRef`] is
///   snapshot of the underlying cell at a point in time.
///
/// - Reading (`await`ing) `Vc`s causes the current task to be tracked a dependent of the `Vc`'s
///   task or task cell. When the read task or task cell changes, the current task may be
///   re-executed.
///
/// - `Vc` types are always [`Copy`]. Most [`Future`]s are not. This works because `Vc`s are
///   represented as a few ids or indicies into data structures managed by the `turbo-tasks`
///   framework. `Vc` types are not reference counted, but do support [tracing] for a hypothetical
///   (unimplemented) garbage collector.
///
/// - Unlike futures (but like promises), the work that a `Vc` represents [begins execution even if
///   the `Vc` is not `await`ed](#execution-model).
///
/// For a more in-depth explanation of the concepts behind value cells, [refer to the Turbopack
/// book][book-cells].
///
///
/// ## Subtypes
///
/// There are a couple of "subtypes" of `Vc`. These can both be cheaply converted back into a `Vc`.
///
/// - **[`ResolvedVc`]:** A reference to a cell constructed within a task, as part of a [`Vc::cell`]
///   or `value_type.cell()` constructor. As the cell has been constructed at least once, the
///   concrete type of the cell is known (allowing [downcasting][ResolvedVc::try_downcast]). This is
///   stored as a combination of a task id, a type id, and a cell id.
///
/// - **[`OperationVc`]:** The synchronous return value of a [`turbo_tasks::function`]. Internally,
///   this is stored using a task id. Exact type information of trait types (i.e. `Vc<Box<dyn
///   Trait>>`) is not known because the function may not have finished execution yet. Operations
///   must first be [`connected`][OperationVc::connect]ed before being read.
///
/// [`ResolvedVc`] is almost always preferred over the more awkward [`OperationVc`] API, but
/// [`OperationVc`] can be useful inside of [`State`] or when dealing with [collectibles].
///
/// In addition to these potentially-explicit representations of a `Vc`, there's another internal
/// representation of a `Vc`, known as a "Local `Vc`".
///
/// - **Local Operation or Cell:** Same as [`ResolvedVc`] or [`OperationVc`], but these values are
///   stored in task-local state that is freed after their parent non-local task exits. These values
///   are sometimes created when calling a [`turbo_tasks::function`] as an optimization. [Converting
///   a local `Vc` to a `ResolvedVc`][Vc::to_resolved] will construct a new
///   [non-local][NonLocalValue] cell.
///
/// These many representations are stored internally using a type-erased [`RawVc`]. Type erasure
/// reduces the [monomorphization] (and therefore binary size and compilation time) required to
/// support `Vc` and its subtypes.
///
/// <div class="warning">
/// <p>
/// Local <code>Vc</code>s are not valid outside of their parent task, so they must be implicitly
/// (e.g. as an argument or return type) or explicitly (e.g. via <a
/// href="#method.to_resolved"><code>Vc::to_resolved</code></a>) be converted to a non-local <a
/// href="struct.ResolvedVc.html"><code>ResolvedVc</code></a> or <a
/// href="struct.VcOperation.html"><code>VcOperation</code></a> before crossing task boundaries.
/// </p>
/// <p>
/// For this reason, <code>Vc</code> types (which are potentially local) will be disallowed as
/// fields in <a href="attr.value.html"><code>turbo_tasks::value</code></a>s in the future.
/// </p>
/// </div>
///
/// |                 | Representation?             | [Non-Local?] | Equality?               | Can be Downcast?           |
/// |-----------------|-----------------------------|--------------|-------------------------|----------------------------|
/// | [`Vc`]          | One of many                 | ⚠️  Maybe     | ❌ Not recommended      | ⚠️  After resolution        |
/// | [`ResolvedVc`]  | Task Id + Type Id + Cell Id | ✅ Yes       | ✅ Yes, [see docs][rvc] | ✅ [Yes, cheaply][resolve] |
/// | [`OperationVc`] | Task Id                     | ✅ Yes       | ✅ Yes, [see docs][ovc] | ⚠️  After resolution        |
///
/// [Non-Local]: NonLocalValue
/// [rvc]: ResolvedVc
/// [ovc]: ResolvedVc
/// [resolve]: ResolvedVc::try_downcast
///
/// See the documentation for [`ResolvedVc`] and [`OperationVc`] for more details about these
/// subtypes.
///
///
/// ## Execution Model
///
/// While task functions are expected to be side-effect free, their execution behavior is still
/// important for performance reasons, or to code using [collectibles] to represent issues or
/// side-effects.
///
/// Function calls are neither "eager", nor "lazy". Even if not awaited, they are guaranteed to
/// execute (potentially emitting collectibles) before the root task finishes or before the
/// completion of any strongly consistent read containing their call. However, the exact point when
/// that execution begins is an implementation detail. Functions may execute more than once due to
/// dirty task invalidation.
///
///
/// ## Equality & Hashing
///
/// Because `Vc`s can be equivalent but have different representation, it's not recommended to
/// compare `Vc`s by equality. Instead, you should convert a `Vc` to an explicit subtype first
/// (likely [`ResolvedVc`]). Future versions of `Vc` may not implement [`Eq`], [`PartialEq`], or
/// [`Hash`].
///
///
/// [tracing]: crate::trace::TraceRawVcs
/// [`ReadRef`]: crate::ReadRef
/// [`turbo_tasks::function`]: crate::function
/// [monomorphization]: https://doc.rust-lang.org/book/ch10-01-syntax.html#performance-of-code-using-generics
/// [`State`]: crate::State
/// [book-cells]: https://turbopack-rust-docs.vercel.sh/turbo-engine/cells.html
/// [collectibles]: CollectiblesSource
#[must_use]
#[derive(Serialize, Deserialize)]
#[serde(transparent, bound = "")]
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
        extern "C" {
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
        extern "C" {
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
        f.debug_struct("Vc").field("node", &self.node).finish()
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

impl<T, Inner, Repr> Vc<T>
where
    T: VcValueType<Read = VcTransparentRead<T, Inner, Repr>>,
    Inner: Any + Send + Sync,
    Repr: VcValueType,
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
            Ok(format!("{}#{}: {}", value_ty.name, index, task_id))
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
        T: Upcast<K>,
        K: VcValueTrait + ?Sized,
    {
        Vc {
            node: vc.node,
            _t: PhantomData,
        }
    }

    /// Resolve the reference until it points to a cell directly.
    ///
    /// Resolving will wait for task execution to be finished, so that the
    /// returned `Vc` points to a cell that stores a value.
    ///
    /// Resolving is necessary to compare identities of `Vc`s.
    ///
    /// This is async and will rethrow any fatal error that happened during task
    /// execution.
    pub async fn resolve(self) -> Result<Vc<T>> {
        Ok(Self {
            node: self.node.resolve().await?,
            _t: PhantomData,
        })
    }

    /// Resolve the reference until it points to a cell directly, and wrap the
    /// result in a [`ResolvedVc`], which strongly guarantees that the
    /// [`Vc`] was resolved.
    pub async fn to_resolved(self) -> Result<ResolvedVc<T>> {
        Ok(ResolvedVc {
            node: self.resolve().await?,
        })
    }

    /// Returns `true` if the reference is resolved.
    ///
    /// See also [`Vc::resolve`].
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

impl<T> Vc<T>
where
    T: VcValueTrait + ?Sized,
{
    /// Attempts to sidecast the given `Vc<Box<dyn T>>` to a `Vc<Box<dyn K>>`.
    /// This operation also resolves the `Vc`.
    ///
    /// Returns `None` if the underlying value type does not implement `K`.
    ///
    /// **Note:** if the trait T is required to implement K, use
    /// `Vc::upcast(vc).resolve()` instead. This provides stronger guarantees,
    /// removing the need for a `Result` return type.
    pub async fn try_resolve_sidecast<K>(vc: Self) -> Result<Option<Vc<K>>, ResolveTypeError>
    where
        K: VcValueTrait + ?Sized,
    {
        let raw_vc: RawVc = vc.node;
        let raw_vc = raw_vc
            .resolve_trait(<K as VcValueTrait>::get_trait_type_id())
            .await?;
        Ok(raw_vc.map(|raw_vc| Vc {
            node: raw_vc,
            _t: PhantomData,
        }))
    }

    /// Attempts to downcast the given `Vc<Box<dyn T>>` to a `Vc<K>`, where `K`
    /// is of the form `Box<dyn L>`, and `L` is a value trait.
    /// This operation also resolves the `Vc`.
    ///
    /// Returns `None` if the underlying value type is not a `K`.
    pub async fn try_resolve_downcast<K>(vc: Self) -> Result<Option<Vc<K>>, ResolveTypeError>
    where
        K: Upcast<T> + VcValueTrait + ?Sized,
    {
        let raw_vc: RawVc = vc.node;
        let raw_vc = raw_vc
            .resolve_trait(<K as VcValueTrait>::get_trait_type_id())
            .await?;
        Ok(raw_vc.map(|raw_vc| Vc {
            node: raw_vc,
            _t: PhantomData,
        }))
    }

    /// Attempts to downcast the given `Vc<Box<dyn T>>` to a `Vc<K>`, where `K`
    /// is a value type.
    /// This operation also resolves the `Vc`.
    ///
    /// Returns `None` if the underlying value type is not a `K`.
    pub async fn try_resolve_downcast_type<K>(vc: Self) -> Result<Option<Vc<K>>, ResolveTypeError>
    where
        K: Upcast<T> + VcValueType,
    {
        let raw_vc: RawVc = vc.node;
        let raw_vc = raw_vc
            .resolve_value(<K as VcValueType>::get_value_type_id())
            .await?;
        Ok(raw_vc.map(|raw_vc| Vc {
            node: raw_vc,
            _t: PhantomData,
        }))
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
    T: Upcast<Box<dyn ValueDebug>> + Send + Sync + ?Sized,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString {
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
                self.node.into_read().into()
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
    #[must_use]
    pub fn strongly_consistent(self) -> ReadVcFuture<T> {
        self.node.into_read().strongly_consistent().into()
    }

    /// Returns a untracked read of the value. This will not invalidate the current function when
    /// the read value changed.
    #[must_use]
    pub fn untracked(self) -> ReadVcFuture<T> {
        self.node.into_read().untracked().into()
    }

    /// Read the value with the hint that this is the final read of the value. This might drop the
    /// cell content. Future reads might need to recompute the value.
    #[must_use]
    pub fn final_read_hint(self) -> ReadVcFuture<T> {
        self.node.into_read().final_read_hint().into()
    }
}

impl<T> Vc<T>
where
    T: VcValueType,
    VcReadTarget<T>: Clone,
{
    /// Read the value and returns a owned version of it. It might clone the value.
    pub fn owned(self) -> ReadOwnedVcFuture<T> {
        let future: ReadVcFuture<T> = self.node.into_read().into();
        future.owned()
    }
}

impl<T> Unpin for Vc<T> where T: ?Sized {}

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
