use std::{
    fmt::{Debug, Display},
    future::Future,
    num::{NonZeroU32, NonZeroU64},
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
    id::{ExecutionId, LocalTaskId, TASK_ID_MAX},
    manager::{
        ReadCellTracking, ReadTracking, SUPPRESS_EVENTUAL_CONSISTENCY_TOP_LEVEL_TASK_CHECK,
        TurboTasksApi, read_local_output, with_turbo_tasks,
    },
    registry::get_value_type,
    turbo_tasks,
};

/// Identifies a specific cell within a task: a [`ValueTypeId`] paired with a
/// sequentially-allocated index within that type.
///
/// Packed into a single [`NonZeroU32`]:
/// ```text
/// bits 31..=22 (10 bits): ValueTypeId logical value
/// bits 21..=0  (22 bits): cell index
/// ```
/// Because the `ValueTypeId` is always `>= 1`, the type is trivially non-zero
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Encode, Decode)]
pub struct CellId(NonZeroU32);

/// Number of low bits used for the cell index.
const CELL_INDEX_BITS: u32 = 22;
/// Mask selecting the cell index bits.
const CELL_INDEX_MASK: u32 = (1 << CELL_INDEX_BITS) - 1;

impl CellId {
    /// Maximum `ValueTypeId` logical value that fits in the 10-bit type field.
    pub const MAX_VALUE_TYPE_ID: u16 = (1 << (u32::BITS - CELL_INDEX_BITS)) as u16 - 1;
    /// Maximum cell index that fits in the 22-bit index field.
    pub const MAX_CELL_INDEX: u32 = CELL_INDEX_MASK;

    /// Packs a `type_id` and `index` into a single word.
    pub fn new(type_id: ValueTypeId, index: u32) -> Self {
        let type_id = *type_id;
        debug_assert!(
            type_id <= Self::MAX_VALUE_TYPE_ID,
            "ValueTypeId {} exceeds the {} cap packed into CellId",
            type_id,
            Self::MAX_VALUE_TYPE_ID,
        );
        debug_assert!(
            index <= Self::MAX_CELL_INDEX,
            "cell index {} exceeds the {} cap packed into CellId",
            index,
            Self::MAX_CELL_INDEX,
        );
        let packed = ((type_id as u32) << CELL_INDEX_BITS) | (index & CELL_INDEX_MASK);
        // SAFETY: `type_id >= 1`, so `packed >= (1 << CELL_INDEX_BITS) > 0`.
        CellId(unsafe { NonZeroU32::new_unchecked(packed) })
    }

    pub fn type_id(self) -> ValueTypeId {
        let type_id = (self.0.get() >> CELL_INDEX_BITS) as u16;
        // SAFETY: the high bits always hold a `ValueTypeId` of `1..=1023` by construction.
        unsafe { ValueTypeId::new_unchecked(type_id) }
    }

    pub fn index(self) -> u32 {
        self.0.get() & CELL_INDEX_MASK
    }

    /// The raw packed word, used by [`RawVc`] to pack a `TaskCell` into its u64.
    pub(crate) fn raw(self) -> u32 {
        self.0.get()
    }

    /// Reconstructs a `CellId` from a raw packed word produced by [`Self::raw`].
    ///
    /// # Safety
    ///
    /// `raw` must be a value previously returned by [`Self::raw`] (in
    /// particular, non-zero with a valid 10-bit type id in the high bits).
    pub(crate) unsafe fn from_raw(raw: u32) -> Self {
        debug_assert!(raw != 0);
        // SAFETY: the caller guarantees `raw` came from a valid `CellId`.
        CellId(unsafe { NonZeroU32::new_unchecked(raw) })
    }
}

impl Debug for CellId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CellId")
            .field("type_id", &self.type_id())
            .field("index", &self.index())
            .finish()
    }
}

impl Display for CellId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}#{}",
            get_value_type(self.type_id()).ty.name,
            self.index()
        )
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
/// # Representation
///
/// `RawVc` is one of three logical variants (see [`RawVcUnpacked`]) bit-packed
/// into a single [`NonZeroU64`].
///
/// Bit 31 is the discriminator between a local output and a task variant; the
/// two task variants are then told apart by whether the [`CellId`] field (the
/// high 32 bits) is zero — which is unambiguous because every `CellId` is
/// non-zero.
///
/// ```text
/// bit31 = 1                  LocalOutput: 1<<31 | transient(1) | ExecutionId(16) << 1 | LocalTaskId(32) << 32
/// bit31 = 0, bits32..63 == 0 TaskOutput:  TaskId(31)
/// bit31 = 0, bits32..63 != 0 TaskCell:    TaskId(31) | CellId(32) << 32
/// ```
/// [`Vc`]: crate::Vc
/// [monomorphization]: https://doc.rust-lang.org/book/ch10-01-syntax.html#performance-of-code-using-generics
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Encode, Decode)]
pub struct RawVc(NonZeroU64);

/// The unpacked form of [`RawVc`], produced by [`RawVc::unpack`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RawVcUnpacked {
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

/// Bit 31 discriminates `LocalOutput` (set) from the task variants (clear).
/// It is free for the task variants because a `TaskId` is only 31 bits
/// (`bits 0..=30`) and the `CellId` lives in the high 32 bits (`32..=63`).
const RAW_VC_LOCAL_FLAG: u64 = 1 << 31;

/// Mask of the `TaskId` value inside `TaskOutput` / `TaskCell` (bits `0..=30`).
///
/// This equals `TASK_ID_MAX` because a `TaskId` is `2^31 - 1`, so its max value
/// is also the mask of its bits. TaskId is a u32 so this cast is safe.
const RAW_VC_TASK_MASK: u64 = TASK_ID_MAX as u64;
/// Shift of the packed `CellId` word inside `TaskCell`. A zero high word means
/// `TaskOutput`; a non-zero one means `TaskCell`.
const RAW_VC_CELL_SHIFT: u64 = 32;

/// `LocalOutput` field layout (the `RAW_VC_LOCAL_FLAG` bit is always set).
const RAW_VC_LOCAL_TRANSIENT_SHIFT: u64 = 0;
const RAW_VC_LOCAL_EXECUTION_SHIFT: u64 = 1;
const RAW_VC_LOCAL_TASK_SHIFT: u64 = 32;

impl RawVc {
    /// Packs the synchronous return value of a task. The word is simply the
    /// `TaskId` value: bit 31 clear (a task variant) and the cell field zero
    /// (no cell).
    pub fn task_output(task: TaskId) -> Self {
        let task = *task as u64;
        debug_assert!(task <= RAW_VC_TASK_MASK, "TaskId exceeds 31 bits");
        Self::from_bits(task)
    }

    /// Packs a pointer to a specific cell within a task: the `TaskId` in the low
    /// bits and the non-zero `CellId` in the high 32 bits.
    pub fn task_cell(task: TaskId, cell: CellId) -> Self {
        let task = *task as u64;
        debug_assert!(task <= RAW_VC_TASK_MASK, "TaskId exceeds 31 bits");
        let cell = cell.raw() as u64;
        Self::from_bits(task | (cell << RAW_VC_CELL_SHIFT))
    }

    /// Packs the synchronous return value of a local task, marked by bit 31.
    pub fn local_output(
        execution_id: ExecutionId,
        local_task_id: LocalTaskId,
        persistence: TaskPersistence,
    ) -> Self {
        let transient = (persistence == TaskPersistence::Transient) as u64;
        let execution_id = *execution_id as u64;
        let local_task_id = *local_task_id as u64;
        Self::from_bits(
            RAW_VC_LOCAL_FLAG
                | (transient << RAW_VC_LOCAL_TRANSIENT_SHIFT)
                | (execution_id << RAW_VC_LOCAL_EXECUTION_SHIFT)
                | (local_task_id << RAW_VC_LOCAL_TASK_SHIFT),
        )
    }

    #[inline]
    fn from_bits(bits: u64) -> Self {
        // SAFETY: every constructor produces a non-zero word — the task variants
        // carry a `TaskId >= 1` in the low bits, and `LocalOutput` always sets
        // `RAW_VC_LOCAL_FLAG`.
        RawVc(unsafe { NonZeroU64::new_unchecked(bits) })
    }

    #[inline]
    fn bits(self) -> u64 {
        self.0.get()
    }

    /// The high 32 bits — the `CellId` slot. Zero for `TaskOutput`, the non-zero
    /// packed `CellId` for `TaskCell`, and the `LocalTaskId` for `LocalOutput`.
    #[inline]
    fn cell_word(self) -> u32 {
        (self.bits() >> RAW_VC_CELL_SHIFT) as u32
    }

    /// True for `TaskCell`: a task variant (bit 31 clear) whose cell field is
    /// non-zero.
    #[inline]
    fn is_task_cell(self) -> bool {
        !self.is_local_output() && self.cell_word() != 0
    }

    /// True for `TaskOutput`: a task variant (bit 31 clear) whose cell field is
    /// zero.
    #[inline]
    fn is_task_output(self) -> bool {
        !self.is_local_output() && self.cell_word() == 0
    }

    /// Reads the `TaskId` from a `TaskOutput` / `TaskCell` word.
    ///
    /// Produces a garbage value if this is a `LocalOutput` word
    #[inline]
    fn read_task_id(self) -> TaskId {
        let id = (self.bits() & RAW_VC_TASK_MASK) as u32;
        // SAFETY: a non-zero `TaskId` was packed in by construction.
        unsafe { TaskId::new_unchecked(id) }
    }

    /// Reads the [`CellId`] from a `TaskCell` word.
    ///
    /// Produces a garbage value if this is a `LocalOutput` or `TaskOutput` word
    #[inline]
    fn read_cell(self) -> CellId {
        // SAFETY: a valid packed `CellId` was stored in the high 32 bits.
        unsafe { CellId::from_raw(self.cell_word()) }
    }

    /// Unpacks into the logical [`RawVcUnpacked`] enum for matching.
    pub fn unpack(self) -> RawVcUnpacked {
        if self.is_local_output() {
            let (execution_id, local_task_id, persistence) = self.decode_local_output();
            RawVcUnpacked::LocalOutput(execution_id, local_task_id, persistence)
        } else {
            let task_id = self.read_task_id();
            let cell_word = self.cell_word();
            if cell_word != 0 {
                RawVcUnpacked::TaskCell(task_id, unsafe { CellId::from_raw(self.cell_word()) })
            } else {
                RawVcUnpacked::TaskOutput(task_id)
            }
        }
    }

    /// Returns the [`TaskId`] if this is a `TaskOutput`, otherwise `None`.
    ///
    /// Prefer this over [`unpack`][Self::unpack] when a caller only cares about
    /// the `TaskOutput` case: it reads just the discriminator and the task bits.
    pub fn as_task_output(self) -> Option<TaskId> {
        self.is_task_output().then(|| self.read_task_id())
    }

    /// Returns the `(TaskId, CellId)` pair if this is a `TaskCell`, otherwise
    /// `None`.
    ///
    /// Prefer this over [`unpack`][Self::unpack] when a caller only cares about
    /// the `TaskCell` case: it reads just the discriminator, the task bits, and
    /// the cell bits.
    pub fn as_task_cell(self) -> Option<(TaskId, CellId)> {
        self.is_task_cell()
            .then(|| (self.read_task_id(), self.read_cell()))
    }

    /// Returns the `(ExecutionId, LocalTaskId, TaskPersistence)` triple if this
    /// is a `LocalOutput`, otherwise `None`.
    ///
    /// Prefer this over [`unpack`][Self::unpack] when a caller only cares about
    /// the `LocalOutput` case.
    pub fn as_local_output(self) -> Option<(ExecutionId, LocalTaskId, TaskPersistence)> {
        self.is_local_output().then(|| self.decode_local_output())
    }

    /// Decodes the fields of a `LocalOutput` word. Only valid when
    /// [`RAW_VC_LOCAL_FLAG`] is set.
    fn decode_local_output(self) -> (ExecutionId, LocalTaskId, TaskPersistence) {
        let bits = self.bits();
        let persistence = if (bits >> RAW_VC_LOCAL_TRANSIENT_SHIFT) & 1 == 1 {
            TaskPersistence::Transient
        } else {
            TaskPersistence::Persistent
        };
        let execution_id = ((bits >> RAW_VC_LOCAL_EXECUTION_SHIFT) & 0xFFFF) as u16;
        let local_task_id = ((bits >> RAW_VC_LOCAL_TASK_SHIFT) & 0xFFFF_FFFF) as u32;
        // SAFETY: non-zero `ExecutionId`/`LocalTaskId` were packed in.
        (
            unsafe { ExecutionId::new_unchecked(execution_id) },
            unsafe { LocalTaskId::new_unchecked(local_task_id) },
            persistence,
        )
    }
}

impl Debug for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.unpack() {
            RawVcUnpacked::TaskOutput(task_id) => {
                f.debug_tuple("RawVc::TaskOutput").field(&*task_id).finish()
            }
            RawVcUnpacked::TaskCell(task_id, cell_id) => f
                .debug_tuple("RawVc::TaskCell")
                .field(&*task_id)
                .field(&cell_id.to_string())
                .finish(),
            RawVcUnpacked::LocalOutput(execution_id, local_task_id, task_persistence) => f
                .debug_tuple("RawVc::LocalOutput")
                .field(&*execution_id)
                .field(&*local_task_id)
                .field(&task_persistence)
                .finish(),
        }
    }
}

impl Display for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.unpack() {
            RawVcUnpacked::TaskOutput(task_id) => write!(f, "output of task {}", *task_id),
            RawVcUnpacked::TaskCell(task_id, cell_id) => {
                write!(f, "{} of task {}", cell_id, *task_id)
            }
            RawVcUnpacked::LocalOutput(execution_id, local_task_id, task_persistence) => write!(
                f,
                "output of local task {} ({}, {})",
                *local_task_id, *execution_id, task_persistence
            ),
        }
    }
}

impl RawVc {
    pub fn is_resolved(&self) -> bool {
        self.is_task_cell()
    }

    pub fn is_local_output(&self) -> bool {
        self.bits() & RAW_VC_LOCAL_FLAG != 0
    }

    /// Returns `true` if the task this `RawVc` reads from cannot be serialized and will not be
    /// stored in the filesystem cache.
    ///
    /// See [`TaskPersistence`] for more details.
    pub fn is_transient(&self) -> bool {
        if self.is_local_output() {
            // LocalOutput: the transient flag is stored as a bit.
            (self.bits() >> RAW_VC_LOCAL_TRANSIENT_SHIFT) & 1 == 1
        } else {
            // TaskOutput / TaskCell: transience is a property of the TaskId value.
            self.read_task_id().is_transient()
        }
    }

    pub(crate) fn into_read(self) -> ReadRawVcFuture {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self)
    }

    /// See [`crate::Vc::to_resolved`].
    pub(crate) fn resolve(self) -> ResolveRawVcFuture {
        ResolveRawVcFuture::new(self)
    }

    /// Convert a potentially local `RawVc` into a non-local `RawVc`. This is a subset of resolution
    /// resolution, because the returned `RawVc` can be a `TaskOutput`.
    pub async fn to_non_local(self) -> Result<RawVc> {
        let Some((execution_id, local_task_id, ..)) = self.as_local_output() else {
            return Ok(self);
        };
        let tt = turbo_tasks();
        let local_output = read_local_output(&*tt, execution_id, local_task_id).await?;
        debug_assert!(
            !local_output.is_local_output(),
            "a LocalOutput cannot point at other LocalOutputs"
        );
        Ok(local_output)
    }

    /// Convert a potentially local `RawVc` into a non-local `RawVc`. This is a subset of resolution
    /// resolution, because the returned `RawVc` can be a `TaskOutput`.
    ///
    /// 'unchecked' because the caller must have already confirmed that the local tasks were already
    /// completed
    pub(crate) fn to_non_local_unchecked_sync(self, tt: &dyn TurboTasksApi) -> Result<RawVc> {
        let Some((execution_id, local_task_id, ..)) = self.as_local_output() else {
            return Ok(self);
        };
        let local_output = match tt.try_read_local_output(execution_id, local_task_id)? {
            Ok(raw_vc) => raw_vc,
            Err(_event_listener) => unreachable!("local output is not ready yet"),
        };
        debug_assert!(
            !local_output.is_local_output(),
            "a LocalOutput cannot point at other LocalOutputs"
        );
        Ok(local_output)
    }

    pub(crate) fn connect(&self) {
        let Some(task_id) = self.as_task_output() else {
            panic!("RawVc::connect() must only be called on a RawVc::TaskOutput");
        };
        let tt = turbo_tasks();
        tt.connect_task(task_id);
    }

    pub fn try_get_task_id(&self) -> Option<TaskId> {
        (!self.is_local_output()).then(|| self.read_task_id())
    }

    pub fn try_get_type_id(&self) -> Option<ValueTypeId> {
        self.is_task_cell().then(|| self.read_cell().type_id())
    }

    /// For a cell that's already resolved, synchronously check if it implements a trait using the
    /// type information in `RawVc::TaskCell` (we don't actually need to read the cell!).
    pub(crate) fn resolved_has_trait(&self, trait_id: TraitTypeId) -> bool {
        debug_assert!(
            self.is_task_cell(),
            "resolved_has_trait must be called with a RawVc::TaskCell"
        );
        get_value_type(self.read_cell().type_id()).has_trait(&trait_id)
    }

    /// For a cell that's already resolved, synchronously check if it is a given type using the type
    /// information in `RawVc::TaskCell` (we don't actually need to read the cell!).
    pub(crate) fn resolved_is_type(&self, type_id: ValueTypeId) -> bool {
        debug_assert!(
            self.is_task_cell(),
            "resolved_is_type must be called with a RawVc::TaskCell"
        );
        self.read_cell().type_id() == type_id
    }
}

/// This implementation of `CollectiblesSource` assumes that `self` is a `RawVc::TaskOutput`.
impl CollectiblesSource for RawVc {
    fn peek_collectibles<T: VcValueTrait + ?Sized>(self) -> AutoSet<ResolvedVc<T>> {
        let Some(task_id) = self.as_task_output() else {
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
        let Some(task_id) = self.as_task_output() else {
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
        let Some(task_id) = self.as_task_output() else {
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
                let listener = match this.current.unpack() {
                    RawVcUnpacked::TaskOutput(task) => {
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
                    RawVcUnpacked::TaskCell(_, _) => return Poll::Ready(Ok(this.current)),
                    RawVcUnpacked::LocalOutput(execution_id, local_task_id, ..) => {
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
    read_cell_options: ReadCellOptions,
    state: ReadRawVcState,
}

/// Phase 1 and phase 2 of [`ReadRawVcFuture`] use disjoint sets of fields. Storing them in an
/// enum keeps the future smaller than holding both sets simultaneously.
enum ReadRawVcState {
    /// Phase 1: resolves the [`RawVc`] pointer chain to a [`RawVc::TaskCell`].
    Resolving(ResolveRawVcFuture),
    /// Phase 2: the resolved task/cell identity plus a listener for the cell read wait.
    Reading {
        task: TaskId,
        index: CellId,
        /// Whether phase 1 was a strongly-consistent read. Needed here to re-apply
        /// [`suppress_top_level_task_check`] in phase 2. Lives in this variant (rather than the
        /// outer struct) so it can share padding with the other `Reading` fields — keeping
        /// `Reading` no larger than `Resolving`, and the whole future 8 bytes smaller.
        strongly_consistent: bool,
        listener: Option<EventListener>,
    },
}

impl ReadRawVcFuture {
    pub(crate) fn new(vc: RawVc) -> Self {
        ReadRawVcFuture {
            read_cell_options: ReadCellOptions::default(),
            state: ReadRawVcState::Resolving(ResolveRawVcFuture::new(vc)),
        }
    }

    fn map_resolve(mut self, f: impl FnOnce(ResolveRawVcFuture) -> ResolveRawVcFuture) -> Self {
        match self.state {
            ReadRawVcState::Resolving(resolve) => {
                self.state = ReadRawVcState::Resolving(f(resolve));
            }
            ReadRawVcState::Reading { .. } => {
                unreachable!("builder methods are only called before polling");
            }
        }
        self
    }

    /// Make reads strongly consistent.
    pub fn strongly_consistent(self) -> Self {
        self.map_resolve(|r| r.strongly_consistent())
    }

    /// Track the value as a dependency with an key.
    pub fn track_with_key(mut self, key: u64) -> Self {
        self.read_cell_options.tracking = ReadCellTracking::Tracked { key: Some(key) };
        self.map_resolve(|r| r.track_with_key())
    }

    /// This will not track the value as dependency, but will still track the error as dependency,
    /// if there is an error.
    ///
    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub fn untracked(mut self) -> Self {
        self.read_cell_options.tracking = ReadCellTracking::TrackOnlyError;
        self.map_resolve(|r| r.untracked())
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
        if let ReadRawVcState::Resolving(resolve) = &mut this.state {
            let strongly_consistent = resolve.strongly_consistent;
            match ready!(Pin::new(resolve).poll(cx)) {
                Err(err) => return Poll::Ready(Err(err)),
                Ok(resolved) => {
                    let Some((task, index)) = resolved.as_task_cell() else {
                        unreachable!("ResolveRawVcFuture always resolves to a TaskCell")
                    };
                    this.state = ReadRawVcState::Reading {
                        task,
                        index,
                        strongly_consistent,
                        listener: None,
                    };
                }
            }
        }

        // --- Phase 2: read the cell content ---
        let ReadRawVcState::Reading {
            task,
            index,
            strongly_consistent,
            listener,
        } = &mut this.state
        else {
            unreachable!("phase 1 transitioned to Reading above");
        };
        let task = *task;
        let index = *index;
        let read_cell_options = this.read_cell_options;

        let poll_fn = |tt: &Arc<dyn TurboTasksApi>| -> Poll<Self::Output> {
            loop {
                ready!(poll_listener(listener, cx));
                let new_listener = match tt.try_read_task_cell(task, index, read_cell_options) {
                    Ok(Ok(content)) => return Poll::Ready(Ok(content)),
                    Ok(Err(l)) => l,
                    Err(err) => return Poll::Ready(Err(err)),
                };
                *listener = Some(new_listener);
            }
        };

        // Phase 2 must also suppress the top-level task check when phase 1 was
        // strongly-consistent. The suppression from `ResolveRawVcFuture::poll` only lasts for
        // the duration of that individual `poll` call and does not carry over to subsequent calls
        // or to this phase.
        suppress_top_level_task_check(*strongly_consistent, || with_turbo_tasks(poll_fn))
    }
}

impl Unpin for ReadRawVcFuture {}

#[cfg(test)]
mod tests {
    use super::*;

    /// `CellId` must pack into 4 bytes and keep its niche so `Option<CellId>`
    /// stays 4 bytes — this is the whole point of [`RawVc`] shrinking.
    #[test]
    fn cell_id_is_four_bytes() {
        assert_eq!(size_of::<CellId>(), 4);
        assert_eq!(size_of::<Option<CellId>>(), 4);
    }

    /// Packing and unpacking a `(type_id, index)` pair must round-trip across
    /// the full range of both fields, including the boundary values.
    #[test]
    fn cell_id_pack_unpack_round_trip() {
        let type_ids = [1u16, 2, 100, CellId::MAX_VALUE_TYPE_ID];
        let indices = [0u32, 1, 12345, CellId::MAX_CELL_INDEX];
        for &raw_ty in &type_ids {
            // SAFETY: all test values are >= 1.
            let type_id = unsafe { ValueTypeId::new_unchecked(raw_ty) };
            for &index in &indices {
                let cell = CellId::new(type_id, index);
                assert_eq!(cell.type_id(), type_id, "type_id round-trip for {raw_ty}");
                assert_eq!(cell.index(), index, "index round-trip for {index}");
            }
        }
    }

    /// Distinct `(type_id, index)` pairs must pack to distinct words — the
    /// packing is a bijection, which is what lets us derive `Eq`/`Hash`.
    #[test]
    fn cell_id_packing_is_bijective() {
        // SAFETY: ids are >= 1.
        let a = CellId::new(unsafe { ValueTypeId::new_unchecked(1) }, 0);
        let b = CellId::new(unsafe { ValueTypeId::new_unchecked(1) }, 1);
        let c = CellId::new(unsafe { ValueTypeId::new_unchecked(2) }, 0);
        assert_ne!(a, b);
        assert_ne!(a, c);
        assert_ne!(b, c);
    }

    /// `RawVc` must pack into 8 bytes and keep its niche.
    #[test]
    fn raw_vc_is_eight_bytes() {
        assert_eq!(size_of::<RawVc>(), 8);
        assert_eq!(size_of::<Option<RawVc>>(), 8);
    }

    /// Every variant must round-trip through pack → `unpack()` across the full
    /// range of each packed field, including boundary values and both
    /// persistence states. This is the core correctness property of the
    /// bit-packing.
    #[test]
    fn raw_vc_pack_unpack_round_trip() {
        // SAFETY: all ids below are >= 1 and within their bit budgets.
        let tasks = [
            1u32,
            2,
            crate::TRANSIENT_TASK_BIT - 1,
            crate::TRANSIENT_TASK_BIT,
            TASK_ID_MAX,
        ];
        for &t in &tasks {
            let task = unsafe { TaskId::new_unchecked(t) };

            // TaskOutput
            let vc = RawVc::task_output(task);
            assert_eq!(vc.unpack(), RawVcUnpacked::TaskOutput(task));
            assert!(!vc.is_resolved() && !vc.is_local_output());
            assert_eq!(vc.is_transient(), task.is_transient());
            assert_eq!(vc.try_get_task_id(), Some(task));
            // single-arm accessors
            assert_eq!(vc.as_task_output(), Some(task));
            assert_eq!(vc.as_task_cell(), None);
            assert_eq!(vc.as_local_output(), None);

            // TaskCell, across CellId boundaries
            for cell in [
                CellId::new(unsafe { ValueTypeId::new_unchecked(1) }, 0),
                CellId::new(
                    unsafe { ValueTypeId::new_unchecked(CellId::MAX_VALUE_TYPE_ID) },
                    CellId::MAX_CELL_INDEX,
                ),
            ] {
                let vc = RawVc::task_cell(task, cell);
                assert_eq!(vc.unpack(), RawVcUnpacked::TaskCell(task, cell));
                assert!(vc.is_resolved());
                assert_eq!(vc.try_get_task_id(), Some(task));
                assert_eq!(vc.try_get_type_id(), Some(cell.type_id()));
                // single-arm accessors
                assert_eq!(vc.as_task_cell(), Some((task, cell)));
                assert_eq!(vc.as_task_output(), None);
                assert_eq!(vc.as_local_output(), None);
            }
        }

        // LocalOutput, both persistence states and boundary ids
        for persistence in [TaskPersistence::Persistent, TaskPersistence::Transient] {
            for (e, l) in [(1u16, 1u32), (u16::MAX, u32::MAX)] {
                let exec = unsafe { ExecutionId::new_unchecked(e) };
                let local = unsafe { LocalTaskId::new_unchecked(l) };
                let vc = RawVc::local_output(exec, local, persistence);
                assert_eq!(
                    vc.unpack(),
                    RawVcUnpacked::LocalOutput(exec, local, persistence)
                );
                assert!(vc.is_local_output());
                assert_eq!(vc.is_transient(), persistence == TaskPersistence::Transient);
                assert_eq!(vc.try_get_task_id(), None);
                // single-arm accessors
                assert_eq!(vc.as_local_output(), Some((exec, local, persistence)));
                assert_eq!(vc.as_task_output(), None);
                assert_eq!(vc.as_task_cell(), None);
            }
        }
    }

    /// The discriminator relies on the cell field being zero for `TaskOutput`
    /// and non-zero for `TaskCell`. A `TaskOutput` and a `TaskCell` that share
    /// the same `TaskId` must still be told apart, and a `LocalOutput` whose
    /// `LocalTaskId` populates the high bits (the cell-field region) must remain
    /// a `LocalOutput` because bit 31 wins.
    #[test]
    fn raw_vc_discriminator_is_unambiguous() {
        // SAFETY: all ids are >= 1.
        let task = unsafe { TaskId::new_unchecked(123) };
        let cell = CellId::new(unsafe { ValueTypeId::new_unchecked(1) }, 0);

        let output = RawVc::task_output(task);
        let task_cell = RawVc::task_cell(task, cell);
        assert!(output.is_task_output() && !output.is_task_cell() && !output.is_local_output());
        assert!(
            task_cell.is_task_cell() && !task_cell.is_task_output() && !task_cell.is_local_output()
        );
        // Same TaskId, different variants, distinct words.
        assert_ne!(output, task_cell);
        assert_eq!(output.read_task_id(), task_cell.read_task_id());

        // A LocalOutput with a max LocalTaskId fills the high 32 bits; it must
        // not be misread as a TaskCell.
        let local = RawVc::local_output(
            unsafe { ExecutionId::new_unchecked(u16::MAX) },
            unsafe { LocalTaskId::new_unchecked(u32::MAX) },
            TaskPersistence::Persistent,
        );
        assert!(local.is_local_output() && !local.is_task_cell() && !local.is_task_output());
    }

    #[test]
    #[cfg(debug_assertions)]
    #[should_panic(expected = "TaskId exceeds 31 bits")]
    fn task_output_panics_on_out_of_range_task_id() {
        // `TASK_ID_MAX + 1` is the first value that sets bit 31.
        // SAFETY: non-zero.
        let task = unsafe { TaskId::new_unchecked(TASK_ID_MAX + 1) };
        let _ = RawVc::task_output(task);
    }

    #[test]
    #[cfg(debug_assertions)]
    #[should_panic(expected = "TaskId exceeds 31 bits")]
    fn task_cell_panics_on_out_of_range_task_id() {
        // SAFETY: non-zero.
        let task = unsafe { TaskId::new_unchecked(TASK_ID_MAX + 1) };
        let cell = CellId::new(unsafe { ValueTypeId::new_unchecked(1) }, 0);
        let _ = RawVc::task_cell(task, cell);
    }

    #[test]
    #[cfg(debug_assertions)]
    #[should_panic(expected = "exceeds")]
    fn cell_id_panics_on_out_of_range_type_id() {
        // SAFETY: `MAX_VALUE_TYPE_ID + 1` is non-zero.
        let type_id = unsafe { ValueTypeId::new_unchecked(CellId::MAX_VALUE_TYPE_ID + 1) };
        let _ = CellId::new(type_id, 0);
    }
    #[test]
    #[cfg(debug_assertions)]
    #[should_panic(expected = "exceeds")]
    fn cell_id_panics_on_out_of_range_index() {
        let type_id = unsafe { ValueTypeId::new_unchecked(1) };
        let _ = CellId::new(type_id, CellId::MAX_CELL_INDEX + 1);
    }
}
