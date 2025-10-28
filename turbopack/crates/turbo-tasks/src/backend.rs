use std::{
    borrow::Cow,
    error::Error,
    fmt::{self, Debug, Display},
    future::Future,
    hash::{BuildHasherDefault, Hash},
    pin::Pin,
    sync::Arc,
    time::Duration,
};

use anyhow::{Result, anyhow};
use auto_hash_map::AutoMap;
use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};
use tracing::Span;
use turbo_rcstr::RcStr;

use crate::{
    RawVc, ReadCellOptions, ReadOutputOptions, ReadRef, SharedReference, TaskId, TaskIdSet,
    TraitRef, TraitTypeId, TurboTasksPanic, ValueTypeId, VcRead, VcValueTrait, VcValueType,
    event::EventListener, macro_helpers::NativeFunction, magic_any::MagicAny,
    manager::TurboTasksBackendApi, raw_vc::CellId, registry,
    task::shared_reference::TypedSharedReference, task_statistics::TaskStatisticsApi,
    triomphe_utils::unchecked_sidecast_triomphe_arc,
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
    pub arg: Box<dyn MagicAny>,
}

impl CachedTaskType {
    /// Get the name of the function from the registry. Equivalent to the
    /// [`Display`]/[`ToString::to_string`] implementation, but does not allocate a [`String`].
    pub fn get_name(&self) -> &'static str {
        self.native_fn.name
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

mod ser {
    use std::any::Any;

    use serde::{
        Deserialize, Deserializer, Serialize, Serializer,
        de::{self},
        ser::{SerializeSeq, SerializeTuple},
    };

    use super::*;

    impl Serialize for TypedCellContent {
        fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let value_type = registry::get_value_type(self.0);
            let serializable = if let Some(value) = &self.1.0 {
                value_type.any_as_serializable(&value.0)
            } else {
                None
            };
            let mut state = serializer.serialize_tuple(3)?;
            state.serialize_element(&self.0)?;
            if let Some(serializable) = serializable {
                state.serialize_element(&true)?;
                state.serialize_element(serializable)?;
            } else {
                state.serialize_element(&false)?;
                state.serialize_element(&())?;
            }
            state.end()
        }
    }

    impl<'de> Deserialize<'de> for TypedCellContent {
        fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
        where
            D: Deserializer<'de>,
        {
            struct Visitor;

            impl<'de> serde::de::Visitor<'de> for Visitor {
                type Value = TypedCellContent;

                fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                    write!(formatter, "a valid TypedCellContent")
                }

                fn visit_seq<A>(self, mut seq: A) -> std::result::Result<Self::Value, A::Error>
                where
                    A: de::SeqAccess<'de>,
                {
                    let value_type: ValueTypeId = seq
                        .next_element()?
                        .ok_or_else(|| de::Error::invalid_length(0, &self))?;
                    let has_value: bool = seq
                        .next_element()?
                        .ok_or_else(|| de::Error::invalid_length(1, &self))?;
                    if has_value {
                        let seed = registry::get_value_type(value_type)
                            .get_any_deserialize_seed()
                            .ok_or_else(|| {
                                de::Error::custom("Value type doesn't support deserialization")
                            })?;
                        let value = seq
                            .next_element_seed(seed)?
                            .ok_or_else(|| de::Error::invalid_length(2, &self))?;
                        let arc = triomphe::Arc::<dyn Any + Send + Sync>::from(value);
                        Ok(TypedCellContent(
                            value_type,
                            CellContent(Some(SharedReference(arc))),
                        ))
                    } else {
                        let () = seq
                            .next_element()?
                            .ok_or_else(|| de::Error::invalid_length(2, &self))?;
                        Ok(TypedCellContent(value_type, CellContent(None)))
                    }
                }
            }

            deserializer.deserialize_tuple(2, Visitor)
        }
    }

    enum FunctionAndArg<'a> {
        Owned {
            native_fn: &'static NativeFunction,
            arg: Box<dyn MagicAny>,
        },
        Borrowed {
            native_fn: &'static NativeFunction,
            arg: &'a dyn MagicAny,
        },
    }

    impl Serialize for FunctionAndArg<'_> {
        fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let FunctionAndArg::Borrowed { native_fn, arg } = self else {
                unreachable!();
            };
            let mut state = serializer.serialize_seq(Some(2))?;
            state.serialize_element(&registry::get_function_id(native_fn))?;
            let arg = *arg;
            let arg = native_fn.arg_meta.as_serialize(arg);
            state.serialize_element(arg)?;
            state.end()
        }
    }

    impl<'de> Deserialize<'de> for FunctionAndArg<'de> {
        fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
            struct Visitor;
            impl<'de> serde::de::Visitor<'de> for Visitor {
                type Value = FunctionAndArg<'de>;

                fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                    write!(formatter, "a valid FunctionAndArg")
                }

                fn visit_seq<A>(self, mut seq: A) -> std::result::Result<Self::Value, A::Error>
                where
                    A: serde::de::SeqAccess<'de>,
                {
                    let fn_id = seq
                        .next_element()?
                        .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?;
                    let native_fn = registry::get_native_function(fn_id);
                    let seed = native_fn.arg_meta.deserialization_seed();
                    let arg = seq
                        .next_element_seed(seed)?
                        .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                    Ok(FunctionAndArg::Owned { native_fn, arg })
                }
            }
            deserializer.deserialize_seq(Visitor)
        }
    }

    impl Serialize for CachedTaskType {
        fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
        where
            S: ser::Serializer,
        {
            let CachedTaskType {
                native_fn,
                this,
                arg,
            } = self;
            let mut s = serializer.serialize_tuple(2)?;
            s.serialize_element(&FunctionAndArg::Borrowed {
                native_fn,
                arg: &**arg,
            })?;
            s.serialize_element(this)?;
            s.end()
        }
    }

    impl<'de> Deserialize<'de> for CachedTaskType {
        fn deserialize<D: ser::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
            struct Visitor;
            impl<'de> serde::de::Visitor<'de> for Visitor {
                type Value = CachedTaskType;

                fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                    write!(formatter, "a valid PersistentTaskType")
                }

                fn visit_seq<A>(self, mut seq: A) -> std::result::Result<Self::Value, A::Error>
                where
                    A: serde::de::SeqAccess<'de>,
                {
                    let FunctionAndArg::Owned { native_fn, arg } = seq
                        .next_element()?
                        .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?
                    else {
                        unreachable!();
                    };
                    let this = seq
                        .next_element()?
                        .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                    Ok(CachedTaskType {
                        native_fn,
                        this,
                        arg,
                    })
                }
            }
            deserializer.deserialize_tuple(2, Visitor)
        }
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
            .downcast::<<T::Read as VcRead<T>>::Repr>()
            .map_err(|_err| anyhow!("Unexpected type in cell"))?;
        // SAFETY: `T` and `T::Read::Repr` must have equivalent memory representations,
        // guaranteed by the unsafe implementation of `VcValueType`.
        let data = unsafe { unchecked_sidecast_triomphe_arc(data) };
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

// Structurally and functionally similar to Cow<&'static, str> but explicitly notes the importance
// of non-static strings potentially containing PII (Personal Identifiable Information).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum TurboTasksExecutionErrorMessage {
    PIISafe(Cow<'static, str>),
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TurboTasksError {
    pub message: TurboTasksExecutionErrorMessage,
    pub source: Option<TurboTasksExecutionError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TurboTaskContextError {
    pub task: RcStr,
    pub source: Option<TurboTasksExecutionError>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum TurboTasksExecutionError {
    Panic(Arc<TurboTasksPanic>),
    Error(Arc<TurboTasksError>),
    TaskContext(Arc<TurboTaskContextError>),
}

impl TurboTasksExecutionError {
    pub fn with_task_context(&self, task: impl Display) -> Self {
        TurboTasksExecutionError::TaskContext(Arc::new(TurboTaskContextError {
            task: RcStr::from(task.to_string()),
            source: Some(self.clone()),
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
        }
    }
}

impl Display for TurboTasksExecutionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TurboTasksExecutionError::Panic(panic) => write!(f, "{}", &panic),
            TurboTasksExecutionError::Error(error) => {
                write!(f, "{}", error.message)
            }
            TurboTasksExecutionError::TaskContext(context_error) => {
                write!(f, "Execution of {} failed", context_error.task)
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

pub trait Backend: Sync + Send {
    #[allow(unused_variables)]
    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    #[allow(unused_variables)]
    fn stop(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}
    #[allow(unused_variables)]
    fn stopping(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    #[allow(unused_variables)]
    fn idle_start(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}
    #[allow(unused_variables)]
    fn idle_end(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>);

    fn invalidate_tasks(&self, tasks: &[TaskId], turbo_tasks: &dyn TurboTasksBackendApi<Self>);
    fn invalidate_tasks_set(&self, tasks: &TaskIdSet, turbo_tasks: &dyn TurboTasksBackendApi<Self>);

    fn invalidate_serialization(
        &self,
        _task: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
    }

    fn get_task_description(&self, task: TaskId) -> String;

    fn try_start_task_execution<'a>(
        &'a self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Option<TaskExecutionSpec<'a>>;

    fn task_execution_canceled(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>);

    fn task_execution_completed(
        &self,
        task: TaskId,
        duration: Duration,
        memory_usage: usize,
        result: Result<RawVc, TurboTasksExecutionError>,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        stateful: bool,
        has_invalidator: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> bool;

    type BackendJob: Send + 'static;

    fn run_backend_job<'a>(
        &'a self,
        job: Self::BackendJob,
        turbo_tasks: &'a dyn TurboTasksBackendApi<Self>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

    /// INVALIDATION: Be careful with this, when reader is None, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: Option<TaskId>,
        options: ReadOutputOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>>;

    /// INVALIDATION: Be careful with this, when reader is None, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        reader: Option<TaskId>,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell(
        &self,
        current_task: TaskId,
        index: CellId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<TypedCellContent> {
        match self.try_read_task_cell(current_task, index, None, options, turbo_tasks)? {
            Ok(content) => Ok(content),
            Err(_) => Ok(TypedCellContent(index.type_id, CellContent(None))),
        }
    }

    /// INVALIDATION: Be careful with this, when reader is None, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn read_task_collectibles(
        &self,
        task: TaskId,
        trait_id: TraitTypeId,
        reader: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskCollectiblesMap;

    fn emit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn unemit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        count: u32,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn update_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn get_or_create_persistent_task(
        &self,
        task_type: CachedTaskType,
        parent_task: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

    fn get_or_create_transient_task(
        &self,
        task_type: CachedTaskType,
        parent_task: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn mark_own_task_as_finished(
        &self,
        _task: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        // Do nothing by default
    }

    fn set_own_task_aggregation_number(
        &self,
        _task: TaskId,
        _aggregation_number: u32,
        _turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        // Do nothing by default
    }

    fn mark_own_task_as_session_dependent(
        &self,
        _task: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        // Do nothing by default
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

    fn dispose_root_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>);

    fn task_statistics(&self) -> &TaskStatisticsApi;

    fn is_tracking_dependencies(&self) -> bool;
}
