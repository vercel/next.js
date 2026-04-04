use std::{
    fmt::{Debug, Display},
    future::Future,
    pin::Pin,
    sync::Arc,
    task::{Poll, ready},
};

use anyhow::Result;
use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};

use crate::{
    CollectiblesSource, ReadCellOptions, ReadConsistency, ReadOutputOptions, ResolvedVc, TaskId,
    TaskPersistence, TraitTypeId, ValueTypeId, VcValueTrait,
    backend::TypedCellContent,
    event::EventListener,
    id::{ExecutionId, LocalTaskId},
    manager::{
        ReadCellTracking, ReadTracking, SUPPRESS_EVENTUAL_CONSISTENCY_TOP_LEVEL_TASK_CHECK,
        TurboTasksApi, read_local_output, with_turbo_tasks,
    },
    registry::get_value_type,
    turbo_tasks,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Encode, Decode)]
pub struct CellId {
    pub type_id: ValueTypeId,
    pub index: u32,
}

impl Display for CellId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}#{}", get_value_type(self.type_id).ty.name, self.index)
    }
}

/// A type-erased representation of [`Vc`].
///
/// Type erasure reduces the [monomorphization] (and therefore binary size and compilation time)
/// required to support [`Vc`].
///
/// This type is heavily used within the [`Backend`][crate::backend::Backend] trait, but should
/// otherwise be treated as an internal implementation detail of `turbo-tasks`.
///
/// [`Vc`]: crate::Vc
/// [monomorphization]: https://doc.rust-lang.org/book/ch10-01-syntax.html#performance-of-code-using-generics
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Encode, Decode)]
pub enum RawVc {
    /// The synchronous return value of a task (after argument resolution). This is the
    /// representation used by [`OperationVc`][crate::OperationVc].
    TaskOutput(TaskId),
    /// A pointer to a specific [`Vc::cell`][crate::Vc::cell] or `.cell()` call within a task. This
    /// is the representation used by [`ResolvedVc`].
    ///
    /// [`CellId`] contains the [`ValueTypeId`], which can be useful for efficient downcasting.
    TaskCell(TaskId, CellId),
    /// The synchronous return value of a local task. This is created when a function is called
    /// with unresolved arguments or more explicitly with
    /// [`#[turbo_tasks::function(local)]`][crate::function].
    ///
    /// Local outputs are only valid within the context of their parent "non-local" task. Turbo
    /// Task's APIs are designed to prevent escapes of local [`Vc`]s, but [`ExecutionId`] is used
    /// for a fallback runtime assertion.
    ///
    /// [`Vc`]: crate::Vc
    LocalOutput(ExecutionId, LocalTaskId, TaskPersistence),
}

impl Debug for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RawVc::TaskOutput(task_id) => f
                .debug_tuple("RawVc::TaskOutput")
                .field(&**task_id)
                .finish(),
            RawVc::TaskCell(task_id, cell_id) => f
                .debug_tuple("RawVc::TaskCell")
                .field(&**task_id)
                .field(&cell_id.to_string())
                .finish(),
            RawVc::LocalOutput(execution_id, local_task_id, task_persistence) => f
                .debug_tuple("RawVc::LocalOutput")
                .field(&**execution_id)
                .field(&**local_task_id)
                .field(task_persistence)
                .finish(),
        }
    }
}

impl Display for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RawVc::TaskOutput(task_id) => write!(f, "output of task {}", **task_id),
            RawVc::TaskCell(task_id, cell_id) => {
                write!(f, "{} of task {}", cell_id, **task_id)
            }
            RawVc::LocalOutput(execution_id, local_task_id, task_persistence) => write!(
                f,
                "output of local task {} ({}, {})",
                **local_task_id, **execution_id, task_persistence
            ),
        }
    }
}

impl RawVc {
    pub fn is_resolved(&self) -> bool {
        match self {
            RawVc::TaskOutput(..) => false,
            RawVc::TaskCell(..) => true,
            RawVc::LocalOutput(..) => false,
        }
    }

    pub fn is_local(&self) -> bool {
        match self {
            RawVc::TaskOutput(..) => false,
            RawVc::TaskCell(..) => false,
            RawVc::LocalOutput(..) => true,
        }
    }

    /// Returns `true` if the task this `RawVc` reads from cannot be serialized and will not be
    /// stored in the filesystem cache.
    ///
    /// See [`TaskPersistence`] for more details.
    pub fn is_transient(&self) -> bool {
        match self {
            RawVc::TaskOutput(task) | RawVc::TaskCell(task, ..) => task.is_transient(),
            RawVc::LocalOutput(_, _, persistence) => *persistence == TaskPersistence::Transient,
        }
    }

    pub(crate) fn into_read(self, is_serializable_cell_content: bool) -> ReadRawVcFuture {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self, Some(is_serializable_cell_content))
    }

    pub(crate) fn into_read_with_unknown_is_serializable_cell_content(self) -> ReadRawVcFuture {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self, None)
    }

    /// See [`crate::Vc::to_resolved`].
    pub(crate) fn resolve(self) -> ResolveRawVcFuture {
        ResolveRawVcFuture::new(self)
    }

    /// Convert a potentially local `RawVc` into a non-local `RawVc`. This is a subset of resolution
    /// resolution, because the returned `RawVc` can be a `TaskOutput`.
    pub(crate) async fn to_non_local(self) -> Result<RawVc> {
        Ok(match self {
            RawVc::LocalOutput(execution_id, local_task_id, ..) => {
                let tt = turbo_tasks();
                let local_output = read_local_output(&*tt, execution_id, local_task_id).await?;
                debug_assert!(
                    !matches!(local_output, RawVc::LocalOutput(_, _, _)),
                    "a LocalOutput cannot point at other LocalOutputs"
                );
                local_output
            }
            non_local => non_local,
        })
    }

    pub(crate) fn connect(&self) {
        let RawVc::TaskOutput(task_id) = self else {
            panic!("RawVc::connect() must only be called on a RawVc::TaskOutput");
        };
        let tt = turbo_tasks();
        tt.connect_task(*task_id);
    }

    pub fn try_get_task_id(&self) -> Option<TaskId> {
        match self {
            RawVc::TaskOutput(t) | RawVc::TaskCell(t, ..) => Some(*t),
            RawVc::LocalOutput(..) => None,
        }
    }

    pub fn try_get_type_id(&self) -> Option<ValueTypeId> {
        match self {
            RawVc::TaskCell(_, CellId { type_id, .. }) => Some(*type_id),
            RawVc::TaskOutput(..) | RawVc::LocalOutput(..) => None,
        }
    }

    /// For a cell that's already resolved, synchronously check if it implements a trait using the
    /// type information in `RawVc::TaskCell` (we don't actually need to read the cell!).
    pub(crate) fn resolved_has_trait(&self, trait_id: TraitTypeId) -> bool {
        match self {
            RawVc::TaskCell(_task_id, cell_id) => {
                get_value_type(cell_id.type_id).has_trait(&trait_id)
            }
            _ => unreachable!("resolved_has_trait must be called with a RawVc::TaskCell"),
        }
    }

    /// For a cell that's already resolved, synchronously check if it is a given type using the type
    /// information in `RawVc::TaskCell` (we don't actually need to read the cell!).
    pub(crate) fn resolved_is_type(&self, type_id: ValueTypeId) -> bool {
        match self {
            RawVc::TaskCell(_task_id, cell_id) => cell_id.type_id == type_id,
            _ => unreachable!("resolved_is_type must be called with a RawVc::TaskCell"),
        }
    }
}

/// This implementation of `CollectiblesSource` assumes that `self` is a `RawVc::TaskOutput`.
impl CollectiblesSource for RawVc {
    fn peek_collectibles<T: VcValueTrait + ?Sized>(self) -> AutoSet<ResolvedVc<T>> {
        let RawVc::TaskOutput(task_id) = self else {
            panic!(
                "<RawVc as CollectiblesSource>::peek_collectibles() must only be called on a \
                 RawVc::TaskOutput"
            );
        };
        let tt = turbo_tasks();
        let map = tt.read_task_collectibles(task_id, T::get_trait_type_id());
        map.into_iter()
            .filter_map(|(raw, count)| (count > 0).then_some(raw.try_into().unwrap()))
            .collect()
    }

    fn take_collectibles<T: VcValueTrait + ?Sized>(self) -> AutoSet<ResolvedVc<T>> {
        let RawVc::TaskOutput(task_id) = self else {
            panic!(
                "<RawVc as CollectiblesSource>::take_collectibles() must only be called on a \
                 RawVc::TaskOutput"
            );
        };
        let tt = turbo_tasks();
        let map = tt.read_task_collectibles(task_id, T::get_trait_type_id());
        tt.unemit_collectibles(T::get_trait_type_id(), &map);
        map.into_iter()
            .filter_map(|(raw, count)| (count > 0).then_some(raw.try_into().unwrap()))
            .collect()
    }

    fn drop_collectibles<T: VcValueTrait + ?Sized>(self) {
        let RawVc::TaskOutput(task_id) = self else {
            panic!(
                "<RawVc as CollectiblesSource>::drop_collectibles() must only be called on a \
                 RawVc::TaskOutput"
            );
        };
        let tt = turbo_tasks();
        let map = tt.read_task_collectibles(task_id, T::get_trait_type_id());
        tt.unemit_collectibles(T::get_trait_type_id(), &map);
    }
}

/// Polls a pending [`EventListener`] slot. Returns [`Poll::Pending`] if the event has not yet
/// fired. On [`Poll::Ready`], clears the slot so it is not polled again.
fn poll_listener(
    listener: &mut Option<EventListener>,
    cx: &mut std::task::Context<'_>,
) -> Poll<()> {
    if let Some(l) = listener {
        ready!(Pin::new(l).poll(cx));
        *listener = None;
    }
    Poll::Ready(())
}

/// Wraps `f` in a scope that suppresses the eventual-consistency top-level task assertion,
/// but only when `strongly_consistent` is `true` and debug assertions are enabled.
///
/// This is needed because a strongly-consistent read of a `TaskOutput` is not a single atomic
/// operation — inner reads switch to eventual consistency after the first output is resolved —
/// which would otherwise trigger the assertion in top-level tasks.
fn suppress_top_level_task_check<R>(strongly_consistent: bool, f: impl FnOnce() -> R) -> R {
    if cfg!(debug_assertions) && strongly_consistent {
        // Temporarily suppress the top-level task check
        SUPPRESS_EVENTUAL_CONSISTENCY_TOP_LEVEL_TASK_CHECK.sync_scope(true, f)
    } else {
        f()
    }
}

#[must_use]
pub struct ResolveRawVcFuture {
    current: RawVc,
    read_output_options: ReadOutputOptions,
    /// This flag is redundant with `read_output_options`, but `read_output_options` is mutated
    /// during the resolve. This flag indicates that the initial read was strongly consistent.
    strongly_consistent: bool,
    listener: Option<EventListener>,
}

impl ResolveRawVcFuture {
    fn new(vc: RawVc) -> Self {
        ResolveRawVcFuture {
            current: vc,
            read_output_options: ReadOutputOptions::default(),
            strongly_consistent: false,
            listener: None,
        }
    }

    pub fn strongly_consistent(mut self) -> Self {
        self.strongly_consistent = true;
        self.read_output_options.consistency = ReadConsistency::Strong;
        self
    }

    /// Track task output reads with a specific key (forwarded from
    /// [`ReadRawVcFuture::track_with_key`]).
    pub(crate) fn track_with_key(mut self) -> Self {
        self.read_output_options.tracking = ReadTracking::Tracked;
        self
    }

    /// Do not track task output reads as dependencies (forwarded from
    /// [`ReadRawVcFuture::untracked`]).
    pub(crate) fn untracked(mut self) -> Self {
        self.read_output_options.tracking = ReadTracking::TrackOnlyError;
        self
    }
}

impl Future for ResolveRawVcFuture {
    type Output = Result<RawVc>;

    #[inline(never)]
    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        // SAFETY: we are not moving self
        let this = unsafe { self.get_unchecked_mut() };

        let poll_fn = |tt: &Arc<dyn TurboTasksApi>| -> Poll<Self::Output> {
            'outer: loop {
                ready!(poll_listener(&mut this.listener, cx));
                let listener = match this.current {
                    RawVc::TaskOutput(task) => {
                        let read_result = tt.try_read_task_output(task, this.read_output_options);
                        match read_result {
                            Ok(Ok(vc)) => {
                                // turbo-tasks-backend doesn't currently have any sort of
                                // "transaction" or global lock mechanism to group together chains
                                // of `TaskOutput`/`TaskCell` reads.
                                //
                                // If we ignore the theoretical TOCTOU issues, we no longer need to
                                // read strongly consistent, as any Vc returned from the first task
                                // will be inside of the scope of the first task. So it's already
                                // strongly consistent.
                                this.read_output_options.consistency = ReadConsistency::Eventual;
                                this.current = vc;
                                continue 'outer;
                            }
                            Ok(Err(listener)) => listener,
                            Err(err) => return Poll::Ready(Err(err)),
                        }
                    }
                    RawVc::TaskCell(_, _) => return Poll::Ready(Ok(this.current)),
                    RawVc::LocalOutput(execution_id, local_task_id, ..) => {
                        debug_assert_eq!(
                            this.read_output_options.consistency,
                            ReadConsistency::Eventual
                        );
                        let read_result = tt.try_read_local_output(execution_id, local_task_id);
                        match read_result {
                            Ok(Ok(vc)) => {
                                this.current = vc;
                                continue 'outer;
                            }
                            Ok(Err(listener)) => listener,
                            Err(err) => return Poll::Ready(Err(err)),
                        }
                    }
                };
                this.listener = Some(listener);
            }
        };

        // HACK: Temporarily suppress top-level task check if doing strongly consistent read.
        //
        // This masks a bug: There's an unlikely TOCTOU race condition in `poll_fn`. Because the
        // strongly consistent read isn't a single atomic operation, any inner `TaskOutput` or
        // `TaskCell` could get mutated after the strongly consistent read of the outer
        // `TaskOutput`.
        suppress_top_level_task_check(this.strongly_consistent, || with_turbo_tasks(poll_fn))
    }
}

impl Unpin for ResolveRawVcFuture {}

#[must_use]
pub struct ReadRawVcFuture {
    /// Phase 1: resolves the [`RawVc`] pointer chain to a [`RawVc::TaskCell`].
    resolve: ResolveRawVcFuture,
    /// Phase 2: options for the cell read once we have a [`RawVc::TaskCell`].
    read_cell_options: ReadCellOptions,
    /// If `true`, the `is_serializable_cell_content` flag in `read_cell_options` is unknown at
    /// construction time and must be determined lazily from the type registry once we reach the
    /// [`RawVc::TaskCell`].
    is_serializable_cell_content_unknown: bool,
    /// Phase 2: the resolved task and cell identity, set when phase 1 completes.
    resolved: Option<(TaskId, CellId)>,
    /// Phase 2: listener for the cell read wait.
    listener: Option<EventListener>,
}

impl ReadRawVcFuture {
    pub(crate) fn new(vc: RawVc, is_serializable_cell_content: Option<bool>) -> Self {
        ReadRawVcFuture {
            resolve: ResolveRawVcFuture::new(vc),
            read_cell_options: ReadCellOptions {
                is_serializable_cell_content: is_serializable_cell_content.unwrap_or(false),
                ..Default::default()
            },
            is_serializable_cell_content_unknown: is_serializable_cell_content.is_none(),
            resolved: None,
            listener: None,
        }
    }

    /// Make reads strongly consistent.
    pub fn strongly_consistent(mut self) -> Self {
        self.resolve = self.resolve.strongly_consistent();
        self
    }

    /// Track the value as a dependency with an key.
    pub fn track_with_key(mut self, key: u64) -> Self {
        self.resolve = self.resolve.track_with_key();
        self.read_cell_options.tracking = ReadCellTracking::Tracked { key: Some(key) };
        self
    }

    /// This will not track the value as dependency, but will still track the error as dependency,
    /// if there is an error.
    ///
    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub fn untracked(mut self) -> Self {
        self.resolve = self.resolve.untracked();
        self.read_cell_options.tracking = ReadCellTracking::TrackOnlyError;
        self
    }

    /// Hint that this is the final read of the cell content.
    pub fn final_read_hint(mut self) -> Self {
        self.read_cell_options.final_read_hint = true;
        self
    }
}

impl Future for ReadRawVcFuture {
    type Output = Result<TypedCellContent>;

    #[inline(never)]
    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        // SAFETY: we are not moving self
        let this = unsafe { self.get_unchecked_mut() };

        // --- Phase 1: resolve the RawVc pointer chain to a TaskCell ---
        //
        // `ResolveRawVcFuture` is `Unpin`, so `Pin::new` is safe.
        // It handles `with_turbo_tasks` and `suppress_top_level_task_check` internally.
        if this.resolved.is_none() {
            match ready!(Pin::new(&mut this.resolve).poll(cx)) {
                Err(err) => return Poll::Ready(Err(err)),
                Ok(RawVc::TaskCell(task, index)) => {
                    this.resolved = Some((task, index));
                }
                Ok(_) => unreachable!("ResolveRawVcFuture always resolves to a TaskCell"),
            }
        }

        // --- Phase 2: read the cell content ---
        //
        // At this point `this.resolved` is `Some((task, index))`.
        let (task, index) = this.resolved.unwrap();

        // Lazily resolve `is_serializable_cell_content` from the type registry on the first
        // entry into phase 2, then clear the flag so subsequent polls skip this lookup.
        if this.is_serializable_cell_content_unknown {
            this.read_cell_options.is_serializable_cell_content =
                get_value_type(index.type_id).bincode.is_some();
            this.is_serializable_cell_content_unknown = false;
        }

        let poll_fn = |tt: &Arc<dyn TurboTasksApi>| -> Poll<Self::Output> {
            loop {
                ready!(poll_listener(&mut this.listener, cx));
                let listener = match tt.try_read_task_cell(task, index, this.read_cell_options) {
                    Ok(Ok(content)) => return Poll::Ready(Ok(content)),
                    Ok(Err(listener)) => listener,
                    Err(err) => return Poll::Ready(Err(err)),
                };
                this.listener = Some(listener);
            }
        };

        // Phase 2 must also suppress the top-level task check when phase 1 was
        // strongly-consistent. The suppression from `ResolveRawVcFuture::poll` only lasts for
        // the duration of that individual `poll` call and does not carry over to subsequent calls
        // or to this phase.
        suppress_top_level_task_check(this.resolve.strongly_consistent, || {
            with_turbo_tasks(poll_fn)
        })
    }
}

impl Unpin for ReadRawVcFuture {}
