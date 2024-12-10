use std::{fmt::Debug, hash::Hash};

use auto_hash_map::AutoSet;
use serde::{Deserialize, Serialize};

use crate::{
    marker_trait::impl_auto_marker_trait, trace::TraceRawVcs, CollectiblesSource, RawVc, TaskInput,
    Upcast, Vc, VcValueTrait,
};

/// A "subtype" (can be converted via [`.connect()`]) of [`Vc`] that
/// represents a specific call (with arguments) to [a task][macro@crate::function].
///
/// Unlike [`Vc`], `OperationVc`:
///
/// - Does not potentially refer to task-local information, meaning that it implements
///   [`NonLocalValue`], and can be used in any [`#[turbo_tasks::value]`][macro@crate::value].
///
/// - Has only one potential internal representation, meaning that it has a saner equality
///   definition.
///
/// - Can be [reconnected][OperationVc::connect] to the strongly-consistent compilation graph after
///   being placed inside of a [`State`].
///
/// - Makes sense with [collectibles][`CollectiblesSource`], as it represents a function call, and
///   only function calls can have issues or side-effects.
///
///
/// ## Equality & Hashing
///
/// Equality between two `OperationVc`s means that both have an identical in-memory representation
/// and point to the same task function call. The implementation of [`Hash`] has similar behavior.
///
/// If [connected] and then `.await`ed at the same time, both would likely resolve to the same
/// [`ReadRef`], though it is possible that they may not if the task or cell is invalidated between
/// `.await`s.
///
/// Because equality is a synchronous operation that cannot read the cell contents, even if the
/// `OperationVc`s are not equal, it is possible that if `.await`ed, both `OperationVc`s could point
/// to the same or equal values.
///
/// [`.connect()`]: OperationVc::connect
/// [reconnected]: OperationVc::connect
/// [connected]: OperationVc::connect
/// [`NonLocalValue`]: crate::NonLocalValue
/// [`State`]: crate::State
/// [`ReadRef`]: crate::ReadRef
#[must_use]
pub struct OperationVc<T>
where
    T: ?Sized,
{
    pub(crate) node: Vc<T>,
}

impl<T: ?Sized> OperationVc<T> {
    /// Creates a new `OperationVc` from a `Vc`.
    ///
    /// The caller must ensure that the `Vc` is not a local task and it points to a a single
    /// operation.
    ///
    /// **This API is a placeholder and will likely be removed soon** in favor of a future API that
    /// uses macros and static (compile-time) assertions in place of runtime assertions.
    pub fn new(node: Vc<T>) -> Self {
        // TODO to avoid this runtime check, we should mark functions with `(operation)` and return
        // a OperationVc directly
        assert!(
            matches!(node.node, RawVc::TaskOutput(..)),
            "OperationVc::new must be called on the immediate return value of a task function"
        );
        Self { node }
    }

    /// Marks this operation's underlying function call as a child of the current task, and returns
    /// a [`Vc`] that can be [resolved][Vc::to_resolved] or read with `.await?`.
    ///
    /// By marking this function call as a child of the current task, turbo-tasks will re-run tasks
    /// as-needed to achieve strong consistency at the root of the function call tree. This explicit
    /// operation is needed as `OperationVc` types can be stored outside of the call graph as part
    /// of [`State`][crate::State]s.
    pub fn connect(self) -> Vc<T> {
        self.node.node.connect();
        self.node
    }

    /// Returns the `RawVc` corresponding to this `Vc`.
    pub fn into_raw(vc: Self) -> RawVc {
        vc.node.node
    }

    /// Upcasts the given `OperationVc<T>` to a `OperationVc<Box<dyn K>>`.
    ///
    /// This is also available as an `Into`/`From` conversion.
    #[inline(always)]
    pub fn upcast<K>(vc: Self) -> OperationVc<K>
    where
        T: Upcast<K>,
        K: VcValueTrait + ?Sized,
    {
        OperationVc {
            node: Vc::upcast(vc.node),
        }
    }
}

impl<T> Copy for OperationVc<T> where T: ?Sized {}

impl<T> Clone for OperationVc<T>
where
    T: ?Sized,
{
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Hash for OperationVc<T>
where
    T: ?Sized,
{
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.node.hash(state);
    }
}

impl<T> PartialEq<OperationVc<T>> for OperationVc<T>
where
    T: ?Sized,
{
    fn eq(&self, other: &Self) -> bool {
        self.node == other.node
    }
}

impl<T> Eq for OperationVc<T> where T: ?Sized {}

impl<T> Debug for OperationVc<T>
where
    T: ?Sized,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OperationVc")
            .field("node", &self.node.node)
            .finish()
    }
}

impl<T> TaskInput for OperationVc<T> where T: ?Sized + Send + Sync {}

impl<T> From<RawVc> for OperationVc<T>
where
    T: ?Sized,
{
    fn from(raw: RawVc) -> Self {
        Self {
            node: Vc::from(raw),
        }
    }
}

impl<T> Serialize for OperationVc<T>
where
    T: ?Sized,
{
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.node.serialize(serializer)
    }
}

impl<'de, T> Deserialize<'de> for OperationVc<T>
where
    T: ?Sized,
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(OperationVc {
            node: Vc::deserialize(deserializer)?,
        })
    }
}

impl<T> TraceRawVcs for OperationVc<T>
where
    T: ?Sized,
{
    fn trace_raw_vcs(&self, trace_context: &mut crate::trace::TraceRawVcsContext) {
        self.node.trace_raw_vcs(trace_context);
    }
}

impl<T> CollectiblesSource for OperationVc<T>
where
    T: ?Sized,
{
    fn take_collectibles<Vt: VcValueTrait>(self) -> AutoSet<Vc<Vt>> {
        self.node.node.take_collectibles()
    }

    fn peek_collectibles<Vt: VcValueTrait>(self) -> AutoSet<Vc<Vt>> {
        self.node.node.peek_collectibles()
    }
}

/// Indicates that a type does not contain any instances of [`Vc`] or
/// [`ResolvedVc`][crate::ResolvedVc]. It may contain [`OperationVc`].
///
/// # Safety
///
/// This trait is marked as unsafe. You should not derive it yourself, but instead you should rely
/// on [`#[derive(OperationValue)]`][macro@OperationValue] to do it for you.
pub unsafe trait OperationValue {}

unsafe impl<T: ?Sized + Send> OperationValue for OperationVc<T> {}

impl_auto_marker_trait!(OperationValue);

pub use turbo_tasks_macros::OperationValue;
