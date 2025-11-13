use std::{fmt::Debug, hash::Hash, marker::PhantomData};

use anyhow::Result;
use auto_hash_map::AutoSet;
use serde::{Deserialize, Serialize};
pub use turbo_tasks_macros::OperationValue;

use crate::{
    CollectiblesSource, RawVc, ReadVcFuture, ResolvedVc, TaskInput, UpcastStrict, Vc, VcValueTrait,
    VcValueType, marker_trait::impl_auto_marker_trait, trace::TraceRawVcs,
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
#[repr(transparent)]
pub struct OperationVc<T>
where
    T: ?Sized,
{
    pub(crate) node: Vc<T>,
}

impl<T: ?Sized> OperationVc<T> {
    /// Called by the `#[turbo_tasks::function]` macro.
    ///
    /// The macro ensures that the `Vc` is not a local task and it points to a single operation.
    #[doc(hidden)]
    #[deprecated = "This is an internal function. Use #[turbo_tasks::function(operation)] instead."]
    pub fn cell_private(node: Vc<T>) -> Self {
        debug_assert!(
            matches!(node.node, RawVc::TaskOutput(..)),
            "OperationVc::cell_private must be called on the immediate return value of a task \
             function"
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
        T: UpcastStrict<K>,
        K: VcValueTrait + ?Sized,
    {
        OperationVc {
            node: Vc::upcast(vc.node),
        }
    }

    /// [Connects the `OperationVc`][Self::connect] and [resolves][Vc::to_resolved] the reference
    /// until it points to a cell directly in a [strongly
    /// consistent][crate::ReadConsistency::Strong] way.
    ///
    /// Resolving will wait for task execution to be finished, so that the returned [`ResolvedVc`]
    /// points to a cell that stores a value.
    ///
    /// Resolving is necessary to compare identities of [`Vc`]s.
    ///
    /// This is async and will rethrow any fatal error that happened during task execution.
    pub async fn resolve_strongly_consistent(self) -> Result<ResolvedVc<T>> {
        Ok(ResolvedVc {
            node: Vc {
                node: self.connect().node.resolve_strongly_consistent().await?,
                _t: PhantomData,
            },
        })
    }

    /// [Connects the `OperationVc`][Self::connect] and returns a [strongly
    /// consistent][crate::ReadConsistency::Strong] read of the value.
    ///
    /// This ensures that all internal tasks are finished before the read is returned.
    #[must_use]
    pub fn read_strongly_consistent(self) -> ReadVcFuture<T>
    where
        T: VcValueType,
    {
        self.connect().node.into_read().strongly_consistent().into()
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

// NOTE: This uses the default implementation of `is_resolved` which returns `true` because we don't
// want `OperationVc` arguments to get resolved when passed to a `#[turbo_tasks::function]`.
impl<T> TaskInput for OperationVc<T>
where
    T: ?Sized + Send + Sync,
{
    fn is_transient(&self) -> bool {
        self.node.is_transient()
    }
}

impl<T> TryFrom<RawVc> for OperationVc<T>
where
    T: ?Sized,
{
    type Error = anyhow::Error;

    fn try_from(raw: RawVc) -> Result<Self> {
        if !matches!(raw, RawVc::TaskOutput(..)) {
            anyhow::bail!("Given RawVc {raw:?} is not a TaskOutput");
        }
        Ok(Self {
            node: Vc::from(raw),
        })
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
    fn drop_collectibles<Vt: VcValueTrait>(self) {
        self.node.node.drop_collectibles::<Vt>();
    }

    fn take_collectibles<Vt: VcValueTrait>(self) -> AutoSet<ResolvedVc<Vt>> {
        self.node.node.take_collectibles()
    }

    fn peek_collectibles<Vt: VcValueTrait>(self) -> AutoSet<ResolvedVc<Vt>> {
        self.node.node.peek_collectibles()
    }
}

/// Indicates that a type does not contain any instances of [`Vc`] or [`ResolvedVc`]. It may contain
/// [`OperationVc`].
///
/// # Safety
///
/// This trait is marked as unsafe. You should not derive it yourself, but instead you should rely
/// on [`#[derive(OperationValue)]`][macro@OperationValue] to do it for you.
pub unsafe trait OperationValue {}

unsafe impl<T: ?Sized + Send> OperationValue for OperationVc<T> {}

impl_auto_marker_trait!(OperationValue);
