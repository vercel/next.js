use std::{
    borrow::{Borrow, Cow},
    error::Error,
    fmt::{self, Debug, Display},
    future::Future,
    hash::{BuildHasher, BuildHasherDefault, Hash},
    ops::Deref,
    pin::Pin,
    sync::Arc,
};

use anyhow::{Result, anyhow};
use auto_hash_map::AutoMap;
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use rustc_hash::FxHasher;
use smallvec::SmallVec;
use tracing::Span;
use turbo_bincode::{
    TurboBincodeDecode, TurboBincodeDecoder, TurboBincodeEncode, TurboBincodeEncoder,
    impl_decode_for_turbo_bincode_decode, impl_encode_for_turbo_bincode_encode, new_hash_encoder,
};
use turbo_rcstr::RcStr;
use turbo_tasks_hash::DeterministicHasher;

use crate::{
    CellId, RawVc, ReadCellOptions, ReadOutputOptions, ReadRef, SharedReference, TaskId, TaskIdSet,
    TaskPriority, TraitRef, TraitTypeId, TurboTasksCallApi, TurboTasksPanic, ValueTypeId,
    ValueTypePersistence, VcValueTrait, VcValueType,
    dyn_task_inputs::{DynTaskInputs, DynTaskInputsStorage},
    event::EventListener,
    macro_helpers::NativeFunction,
    manager::{TaskPersistence, TurboTasks},
    registry,
    task::shared_reference::TypedSharedReference,
    task_statistics::TaskStatisticsApi,
    turbo_tasks,
};

pub type TransientTaskRoot =
    Box<dyn Fn() -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> + Send + Sync>;

pub enum TransientTaskType {
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    ///
    /// Always active. Automatically scheduled.
    Root(TransientTaskRoot),

    // TODO implement these strongly consistency
    /// A single root task execution. It won't track dependencies.
    ///
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
    ///
    /// Active until done. Automatically scheduled.
    Once(Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>),
}

impl Debug for TransientTaskType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Root(_) => f.debug_tuple("Root").finish(),
            Self::Once(_) => f.debug_tuple("Once").finish(),
        }
    }
}

/// A normal task execution containing a native (rust) function. This type is passed into the
/// backend either to execute a function or to look up a cached result.
#[derive(Debug, Eq)]
pub struct CachedTaskType {
    pub native_fn: &'static NativeFunction,
    pub this: Option<RawVc>,
    pub arg: Box<dyn DynTaskInputs>,
}

impl CachedTaskType {
    /// Get the name of the function. Equivalent to the
    /// [`Display`]/[`ToString::to_string`] implementation, but does not allocate a [`String`].
    pub fn get_name(&self) -> &'static str {
        self.native_fn.ty.name
    }

    /// Encodes this task type directly to a hasher, avoiding buffer allocation.
    ///
    /// This uses the same encoding logic as [`TurboBincodeEncode`] but writes
    /// directly to a [`DeterministicHasher`] instead of a buffer.
    pub fn hash_encode<H: DeterministicHasher>(&self, hasher: &mut H) {
        Self::hash_encode_components(self.native_fn, self.this, &*self.arg, hasher);
    }
}

impl TurboBincodeEncode for CachedTaskType {
    fn encode(&self, encoder: &mut TurboBincodeEncoder) -> Result<(), EncodeError> {
        Encode::encode(&registry::get_function_id(self.native_fn), encoder)?;

        let (encode_arg_any, _) = self.native_fn.arg_meta.bincode;
        Encode::encode(&self.this, encoder)?;
        encode_arg_any(&*self.arg, encoder)?;

        Ok(())
    }
}

impl<Context> TurboBincodeDecode<Context> for CachedTaskType {
    fn decode(decoder: &mut TurboBincodeDecoder) -> Result<Self, DecodeError> {
        let native_fn = registry::get_native_function(Decode::decode(decoder)?);

        let (_, decode_arg_any) = native_fn.arg_meta.bincode;
        let this = Decode::decode(decoder)?;
        let arg = decode_arg_any(decoder)?;

        Ok(Self {
            native_fn,
            this,
            arg,
        })
    }
}

impl_encode_for_turbo_bincode_encode!(CachedTaskType);
impl_decode_for_turbo_bincode_decode!(CachedTaskType);
impl_borrow_decode!(CachedTaskType);

/// A reference-counted pointer to a [`CachedTaskType`] using `triomphe::Arc`.
///
/// `triomphe::Arc` saves one `usize` per allocation (no weak count) and avoids the weak-count
/// CAS in `drop_slow` compared to `std::sync::Arc`. We never need `Weak<CachedTaskType>`, so
/// the trade-off is favorable.
#[derive(Clone, Debug, Hash, PartialEq, Eq)]
pub struct CachedTaskTypeArc(pub triomphe::Arc<CachedTaskType>);

impl CachedTaskTypeArc {
    pub fn new(value: CachedTaskType) -> Self {
        Self(triomphe::Arc::new(value))
    }

    pub fn count(&self) -> usize {
        triomphe::Arc::count(&self.0)
    }
}

impl AsRef<CachedTaskType> for CachedTaskTypeArc {
    fn as_ref(&self) -> &CachedTaskType {
        &self.0
    }
}

impl Deref for CachedTaskTypeArc {
    type Target = CachedTaskType;
    #[inline]
    fn deref(&self) -> &CachedTaskType {
        &self.0
    }
}

impl Borrow<CachedTaskType> for CachedTaskTypeArc {
    #[inline]
    fn borrow(&self) -> &CachedTaskType {
        &self.0
    }
}

impl Display for CachedTaskTypeArc {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl Encode for CachedTaskTypeArc {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        <CachedTaskType as Encode>::encode(self, encoder)
    }
}

impl<Context> Decode<Context> for CachedTaskTypeArc {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self::new(<CachedTaskType as Decode<Context>>::decode(
            decoder,
        )?))
    }
}

impl<'de, Context> bincode::BorrowDecode<'de, Context> for CachedTaskTypeArc {
    fn borrow_decode<D: bincode::de::BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        Ok(Self::new(<CachedTaskType as bincode::BorrowDecode<
            'de,
            Context,
        >>::borrow_decode(decoder)?))
    }
}

// Manual implementation is needed because of a borrow issue with `Box<dyn Trait>`:
// https://github.com/rust-lang/rust/issues/31740
impl PartialEq for CachedTaskType {
    #[expect(clippy::op_ref)]
    fn eq(&self, other: &Self) -> bool {
        self.native_fn == other.native_fn && self.this == other.this && &self.arg == &other.arg
    }
}

// Manual implementation because we have to have a manual `PartialEq` implementation, and clippy
// complains if we have a derived `Hash` impl, but manual `PartialEq` impl.
impl Hash for CachedTaskType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.native_fn.hash(state);
        self.this.hash(state);
        self.arg.hash(state);
    }
}

impl Display for CachedTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.get_name())
    }
}

impl CachedTaskType {
    /// Compute the hash of a task type from its individual components, matching the Hash impl.
    /// This avoids constructing a full CachedTaskType just to compute the hash.
    pub fn hash_from_components(
        hasher: &impl BuildHasher,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> u64 {
        use std::hash::Hasher;
        let mut state = hasher.build_hasher();
        native_fn.hash(&mut state);
        this.hash(&mut state);
        arg.hash(&mut state);
        state.finish()
    }

    /// Compute the deterministic hash for backing storage from components.
    ///
    /// This mirrors the logic in [`CachedTaskType::hash_encode`] but works with
    /// borrowed components, avoiding the need to construct a full [`CachedTaskType`].
    pub fn hash_encode_components<H: DeterministicHasher>(
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
        hasher: &mut H,
    ) {
        let fn_id = registry::get_function_id(native_fn);
        {
            let mut encoder = new_hash_encoder(hasher);
            Encode::encode(&fn_id, &mut encoder).expect("fn_id encoding should not fail");
            Encode::encode(&this, &mut encoder).expect("this encoding should not fail");
        }
        (native_fn.arg_meta.hash_encode)(arg, hasher);
    }

    /// Check equality of components against this CachedTaskType.
    pub fn eq_components(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> bool {
        std::ptr::eq(self.native_fn, native_fn) && self.this == this && &*self.arg == arg
    }
}

pub struct TaskExecutionSpec<'a> {
    pub future: Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'a>>,
    pub span: Span,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Default)]
pub struct CellContent(pub Option<SharedReference>);
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TypedCellContent(pub ValueTypeId, pub CellContent);

impl Display for CellContent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.0 {
            None => write!(f, "empty"),
            Some(content) => Display::fmt(content, f),
        }
    }
}

impl TypedCellContent {
    pub fn cast<T: VcValueType>(self) -> Result<ReadRef<T>> {
        let data = self.1.0.ok_or_else(|| anyhow!("Cell is empty"))?;
        let data = data
            .downcast::<T>()
            .map_err(|_err| anyhow!("Unexpected type in cell"))?;
        Ok(ReadRef::new_arc(data))
    }

    /// # Safety
    ///
    /// The caller must ensure that the TypedCellContent contains a vc
    /// that implements T.
    pub fn cast_trait<T>(self) -> Result<TraitRef<T>>
    where
        T: VcValueTrait + ?Sized,
    {
        let shared_reference = self
            .1
            .0
            .ok_or_else(|| anyhow!("Cell is empty"))?
            .into_typed(self.0);
        Ok(
            // Safety: It is a TypedSharedReference
            TraitRef::new(shared_reference),
        )
    }

    pub fn into_untyped(self) -> CellContent {
        self.1
    }

    pub fn encode(&self, enc: &mut TurboBincodeEncoder) -> Result<(), EncodeError> {
        let Self(type_id, content) = self;
        let value_type = registry::get_value_type(*type_id);
        type_id.encode(enc)?;
        if let ValueTypePersistence::Persistable(encode_fn, _) = value_type.persistence {
            if let Some(reference) = &content.0 {
                true.encode(enc)?;
                encode_fn(&*reference.0, enc)?;
                Ok(())
            } else {
                false.encode(enc)?;
                Ok(())
            }
        } else {
            Ok(())
        }
    }

    pub fn decode(dec: &mut TurboBincodeDecoder) -> Result<Self, DecodeError> {
        let type_id = ValueTypeId::decode(dec)?;
        let value_type = registry::get_value_type(type_id);
        if let ValueTypePersistence::Persistable(_, decode_fn) = value_type.persistence {
            let is_some = bool::decode(dec)?;
            if is_some {
                let reference = decode_fn(dec)?;
                return Ok(TypedCellContent(type_id, CellContent(Some(reference))));
            }
        }
        Ok(TypedCellContent(type_id, CellContent(None)))
    }
}

impl From<TypedSharedReference> for TypedCellContent {
    fn from(value: TypedSharedReference) -> Self {
        TypedCellContent(value.type_id, CellContent(Some(value.reference)))
    }
}

impl TryFrom<TypedCellContent> for TypedSharedReference {
    type Error = TypedCellContent;

    fn try_from(content: TypedCellContent) -> Result<Self, TypedCellContent> {
        if let TypedCellContent(type_id, CellContent(Some(reference))) = content {
            Ok(TypedSharedReference { type_id, reference })
        } else {
            Err(content)
        }
    }
}

impl CellContent {
    pub fn into_typed(self, type_id: ValueTypeId) -> TypedCellContent {
        TypedCellContent(type_id, self)
    }
}

impl From<SharedReference> for CellContent {
    fn from(value: SharedReference) -> Self {
        CellContent(Some(value))
    }
}

impl From<Option<SharedReference>> for CellContent {
    fn from(value: Option<SharedReference>) -> Self {
        CellContent(value)
    }
}

impl TryFrom<CellContent> for SharedReference {
    type Error = CellContent;

    fn try_from(content: CellContent) -> Result<Self, CellContent> {
        if let CellContent(Some(shared_reference)) = content {
            Ok(shared_reference)
        } else {
            Err(content)
        }
    }
}

pub type TaskCollectiblesMap = AutoMap<RawVc, i32, BuildHasherDefault<FxHasher>, 1>;

/// A 128-bit content hash stored as little-endian bytes.
///
/// Using a byte array rather than `u128` keeps the alignment at 1 byte, which avoids padding
/// in structures such as `AutoMap`/`LazyField` enums that would otherwise grow to accommodate
/// `u128`'s 16-byte alignment requirement.
pub type CellHash = [u8; 16];

// Structurally and functionally similar to Cow<&'static, str> but explicitly notes the importance
// of non-static strings potentially containing PII (Personal Identifiable Information).
#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub enum TurboTasksExecutionErrorMessage {
    PIISafe(#[bincode(with = "turbo_bincode::owned_cow")] Cow<'static, str>),
    NonPIISafe(String),
}

impl Display for TurboTasksExecutionErrorMessage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TurboTasksExecutionErrorMessage::PIISafe(msg) => write!(f, "{msg}"),
            TurboTasksExecutionErrorMessage::NonPIISafe(msg) => write!(f, "{msg}"),
        }
    }
}

#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub struct TurboTasksError {
    pub message: TurboTasksExecutionErrorMessage,
    pub source: Option<TurboTasksExecutionError>,
}

/// Error context indicating that a task's execution failed. Stores a `task_id` and a reference to
/// the `TurboTasksCallApi` so that the task name can be resolved lazily at display time (via
/// [`TurboTasksCallApi::get_task_name`]) rather than eagerly at error creation time.
#[derive(Clone)]
pub struct TurboTaskContextError {
    pub turbo_tasks: Arc<dyn TurboTasksCallApi>,
    pub task_id: TaskId,
    pub source: Option<TurboTasksExecutionError>,
}

impl PartialEq for TurboTaskContextError {
    fn eq(&self, other: &Self) -> bool {
        self.task_id == other.task_id && self.source == other.source
    }
}
impl Eq for TurboTaskContextError {}

impl Encode for TurboTaskContextError {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        Encode::encode(&self.task_id, encoder)?;
        Encode::encode(&self.source, encoder)?;
        Ok(())
    }
}

impl<Context> Decode<Context> for TurboTaskContextError {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let task_id = Decode::decode(decoder)?;
        let source = Decode::decode(decoder)?;
        let turbo_tasks = turbo_tasks();
        Ok(Self {
            turbo_tasks,
            task_id,
            source,
        })
    }
}

impl_borrow_decode!(TurboTaskContextError);

impl Debug for TurboTaskContextError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TurboTaskContextError")
            .field("task_id", &self.task_id)
            .field("source", &self.source)
            .finish()
    }
}

/// Error context for a local task that failed. Unlike [`TurboTaskContextError`],
/// this stores the task name directly since local tasks don't have a [`TaskId`].
#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub struct TurboTaskLocalContextError {
    pub name: RcStr,
    pub source: Option<TurboTasksExecutionError>,
}

#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub enum TurboTasksExecutionError {
    Panic(Arc<TurboTasksPanic>),
    Error(Arc<TurboTasksError>),
    TaskContext(Arc<TurboTaskContextError>),
    LocalTaskContext(Arc<TurboTaskLocalContextError>),
}

impl TurboTasksExecutionError {
    /// Wraps this error in a [`TaskContext`](TurboTasksExecutionError::TaskContext) layer
    /// identifying the normal task that encountered the error.
    pub fn with_task_context(
        self,
        task_id: TaskId,
        turbo_tasks: Arc<dyn TurboTasksCallApi>,
    ) -> Self {
        TurboTasksExecutionError::TaskContext(Arc::new(TurboTaskContextError {
            task_id,
            turbo_tasks,
            source: Some(self),
        }))
    }

    /// Wraps this error in a [`LocalTaskContext`](TurboTasksExecutionError::LocalTaskContext) layer
    /// identifying the local task that encountered the error.
    pub fn with_local_task_context(self, name: String) -> Self {
        TurboTasksExecutionError::LocalTaskContext(Arc::new(TurboTaskLocalContextError {
            name: RcStr::from(name),
            source: Some(self),
        }))
    }
}

impl Error for TurboTasksExecutionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            TurboTasksExecutionError::Panic(_panic) => None,
            TurboTasksExecutionError::Error(error) => {
                error.source.as_ref().map(|s| s as &dyn Error)
            }
            TurboTasksExecutionError::TaskContext(context_error) => {
                context_error.source.as_ref().map(|s| s as &dyn Error)
            }
            TurboTasksExecutionError::LocalTaskContext(context_error) => {
                context_error.source.as_ref().map(|s| s as &dyn Error)
            }
        }
    }
}

impl Display for TurboTasksExecutionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TurboTasksExecutionError::Panic(panic) => write!(f, "{}", panic),
            TurboTasksExecutionError::Error(error) => {
                write!(f, "{}", error.message)
            }
            TurboTasksExecutionError::TaskContext(context_error) => {
                let task_id = context_error.task_id;
                let name = context_error.turbo_tasks.get_task_name(task_id);
                if cfg!(feature = "task_id_details") {
                    write!(f, "Execution of {name} ({}) failed", task_id)
                } else {
                    write!(f, "Execution of {name} failed")
                }
            }
            TurboTasksExecutionError::LocalTaskContext(context_error) => {
                write!(f, "Execution of {} failed", context_error.name)
            }
        }
    }
}

impl<'l> From<&'l (dyn std::error::Error + 'static)> for TurboTasksExecutionError {
    fn from(err: &'l (dyn std::error::Error + 'static)) -> Self {
        if let Some(err) = err.downcast_ref::<TurboTasksExecutionError>() {
            return err.clone();
        }
        let message = err.to_string();
        let source = err.source().map(|source| source.into());

        TurboTasksExecutionError::Error(Arc::new(TurboTasksError {
            message: TurboTasksExecutionErrorMessage::NonPIISafe(message),
            source,
        }))
    }
}

impl From<anyhow::Error> for TurboTasksExecutionError {
    fn from(err: anyhow::Error) -> Self {
        let current: &(dyn std::error::Error + 'static) = err.as_ref();
        current.into()
    }
}

pub enum VerificationMode {
    EqualityCheck,
    Skip,
}

pub trait Backend: Sized + Sync + Send {
    #[allow(unused_variables)]
    fn startup(&self, turbo_tasks: &TurboTasks<Self>) {}

    #[allow(unused_variables)]
    fn stop(&self, turbo_tasks: &TurboTasks<Self>) {}
    #[allow(unused_variables)]
    fn stopping(&self, turbo_tasks: &TurboTasks<Self>) {}

    #[allow(unused_variables)]
    fn idle_start(&self, turbo_tasks: &TurboTasks<Self>) {}
    #[allow(unused_variables)]
    fn idle_end(&self, turbo_tasks: &TurboTasks<Self>) {}

    fn invalidate_task(&self, task: TaskId, turbo_tasks: &TurboTasks<Self>);

    fn invalidate_tasks(&self, tasks: &[TaskId], turbo_tasks: &TurboTasks<Self>);
    fn invalidate_tasks_set(&self, tasks: &TaskIdSet, turbo_tasks: &TurboTasks<Self>);

    fn invalidate_serialization(&self, _task: TaskId, _turbo_tasks: &TurboTasks<Self>) {}

    fn try_start_task_execution<'a>(
        &'a self,
        task: TaskId,
        priority: TaskPriority,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Option<TaskExecutionSpec<'a>>;

    fn task_execution_canceled(&self, task: TaskId, turbo_tasks: &TurboTasks<Self>);

    /// Called when a task's execution finishes.
    ///
    /// Returns `Some(priority)` if the task was invalidated again while executing and must be
    /// re-run. The caller is responsible for re-scheduling the task at the returned priority
    /// (typically lower than the priority of the just-finished run).
    fn task_execution_completed(
        &self,
        task: TaskId,
        result: Result<RawVc, TurboTasksExecutionError>,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        #[cfg(feature = "verify_determinism")] stateful: bool,
        has_invalidator: bool,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Option<TaskPriority>;

    type BackendJob: Send + 'static;

    fn run_backend_job<'a>(
        &'a self,
        job: Self::BackendJob,
        turbo_tasks: &'a TurboTasks<Self>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

    /// INVALIDATION: Be careful with this, when reader is None, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: Option<TaskId>,
        options: ReadOutputOptions,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Result<Result<RawVc, EventListener>>;

    /// INVALIDATION: Be careful with this, when reader is None, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        reader: Option<TaskId>,
        options: ReadCellOptions,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell(
        &self,
        current_task: TaskId,
        index: CellId,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Result<TypedCellContent>;

    /// INVALIDATION: Be careful with this, when reader is None, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn read_task_collectibles(
        &self,
        task: TaskId,
        trait_id: TraitTypeId,
        reader: Option<TaskId>,
        turbo_tasks: &TurboTasks<Self>,
    ) -> TaskCollectiblesMap;

    fn emit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        task: TaskId,
        turbo_tasks: &TurboTasks<Self>,
    );

    fn unemit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        count: u32,
        task: TaskId,
        turbo_tasks: &TurboTasks<Self>,
    );

    fn update_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        updated_key_hashes: Option<SmallVec<[u64; 2]>>,
        content_hash: Option<CellHash>,
        verification_mode: VerificationMode,
        turbo_tasks: &TurboTasks<Self>,
    );

    fn get_or_create_task(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &mut dyn DynTaskInputsStorage,
        parent_task: Option<TaskId>,
        persistence: TaskPersistence,
        turbo_tasks: &TurboTasks<Self>,
    ) -> TaskId;

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: Option<TaskId>,
        turbo_tasks: &TurboTasks<Self>,
    );

    fn mark_own_task_as_finished(&self, _task: TaskId, _turbo_tasks: &TurboTasks<Self>) {
        // Do nothing by default
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &TurboTasks<Self>,
    ) -> TaskId;

    fn dispose_root_task(&self, task: TaskId, turbo_tasks: &TurboTasks<Self>);

    fn task_statistics(&self) -> &TaskStatisticsApi;

    fn is_tracking_dependencies(&self) -> bool;

    /// Returns a human-readable name for the given task. Used by error display formatting
    /// to lazily resolve task names instead of storing them eagerly in error objects.
    fn get_task_name(&self, task: TaskId, turbo_tasks: &TurboTasks<Self>) -> String;
}

#[cfg(test)]
mod cached_task_type_tests {
    use std::{collections::hash_map::RandomState, hash::BuildHasher};

    use crate::{
        RawVc, TaskId,
        backend::CachedTaskType,
        dyn_task_inputs::DynTaskInputs,
        macro_helpers::{ArgMeta, NativeFunction, into_task_fn},
    };

    // Two distinct static NativeFunctions for testing pointer-based identity.
    //
    // NativeFunction uses pointer-based Hash/Eq (via `turbo_registry!`), so each
    // static gets a unique address that serves as its identity.
    fn dummy_fn_a() {}
    fn dummy_fn_b() {}

    static FN_A: NativeFunction = NativeFunction::new(
        "dummy_fn_a",
        "dummy_fn_a",
        ArgMeta::new::<(i32,)>(),
        &into_task_fn(dummy_fn_a),
        false,
        false,
    );

    static FN_B: NativeFunction = NativeFunction::new(
        "dummy_fn_b",
        "dummy_fn_b",
        ArgMeta::new::<(i32,)>(),
        &into_task_fn(dummy_fn_b),
        false,
        false,
    );

    /// Build a `u64` hash for a `CachedTaskType` using its `Hash` impl and a `RandomState`.
    fn hash_task(rs: &RandomState, task: &CachedTaskType) -> u64 {
        rs.hash_one(task)
    }

    /// Build an arg `Box<dyn DynTaskInputs>` for `(i32,)`.
    fn make_arg(value: i32) -> Box<dyn DynTaskInputs> {
        Box::new((value,))
    }

    /// Build a `Some(RawVc::TaskOutput(..))` this value.
    fn make_this(id: u32) -> Option<RawVc> {
        Some(RawVc::task_output(
            TaskId::new(id).expect("non-zero task id"),
        ))
    }

    // -----------------------------------------------------------------------
    // 1. hash_from_components matches Hash impl on CachedTaskType
    // -----------------------------------------------------------------------

    #[test]
    fn hash_from_components_matches_hash_impl_no_this() {
        let rs = RandomState::new();
        let arg = make_arg(42);
        let task = CachedTaskType {
            native_fn: &FN_A,
            this: None,
            arg: make_arg(42),
        };
        let expected = hash_task(&rs, &task);
        let actual = CachedTaskType::hash_from_components(&rs, &FN_A, None, &*arg);
        assert_eq!(actual, expected);
    }

    #[test]
    fn hash_from_components_matches_hash_impl_with_this() {
        let rs = RandomState::new();
        let this = make_this(1);
        let arg = make_arg(99);
        let task = CachedTaskType {
            native_fn: &FN_A,
            this,
            arg: make_arg(99),
        };
        let expected = hash_task(&rs, &task);
        let actual = CachedTaskType::hash_from_components(&rs, &FN_A, this, &*arg);
        assert_eq!(actual, expected);
    }

    // -----------------------------------------------------------------------
    // 2. eq_components returns true when all components match
    // -----------------------------------------------------------------------

    #[test]
    fn eq_components_returns_true_when_all_match() {
        let task = CachedTaskType {
            native_fn: &FN_A,
            this: None,
            arg: make_arg(7),
        };
        assert!(task.eq_components(&FN_A, None, &(7i32,)));
    }

    #[test]
    fn eq_components_returns_true_with_matching_this() {
        let this = make_this(1);
        let task = CachedTaskType {
            native_fn: &FN_A,
            this,
            arg: make_arg(7),
        };
        assert!(task.eq_components(&FN_A, this, &(7i32,)));
    }

    // -----------------------------------------------------------------------
    // 3. eq_components returns false when native_fn differs
    // -----------------------------------------------------------------------

    #[test]
    fn eq_components_returns_false_when_native_fn_differs() {
        let task = CachedTaskType {
            native_fn: &FN_A,
            this: None,
            arg: make_arg(7),
        };
        // FN_B is a different static, so ptr::eq will be false
        assert!(!task.eq_components(&FN_B, None, &(7i32,)));
    }

    // -----------------------------------------------------------------------
    // 4. eq_components returns false when `this` differs
    // -----------------------------------------------------------------------

    #[test]
    fn eq_components_returns_false_when_this_differs() {
        let task = CachedTaskType {
            native_fn: &FN_A,
            this: None,
            arg: make_arg(7),
        };
        // Task has this=None, but we check with Some(...)
        assert!(!task.eq_components(&FN_A, make_this(1), &(7i32,)));
    }

    #[test]
    fn eq_components_returns_false_when_this_has_different_task_id() {
        let task = CachedTaskType {
            native_fn: &FN_A,
            this: make_this(1),
            arg: make_arg(7),
        };
        assert!(!task.eq_components(&FN_A, make_this(2), &(7i32,)));
    }

    // -----------------------------------------------------------------------
    // 5. eq_components returns false when arg differs
    // -----------------------------------------------------------------------

    #[test]
    fn eq_components_returns_false_when_arg_differs() {
        let task = CachedTaskType {
            native_fn: &FN_A,
            this: None,
            arg: make_arg(1),
        };
        // Same function and this, but different arg value
        assert!(!task.eq_components(&FN_A, None, &(2i32,)));
    }
}
