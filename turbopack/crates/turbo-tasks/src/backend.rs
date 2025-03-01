use std::{
    borrow::Cow,
    fmt::{self, Debug, Display},
    future::Future,
    hash::{BuildHasherDefault, Hash},
    pin::Pin,
    time::Duration,
};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoMap;
use rustc_hash::FxHasher;
use tracing::Span;

pub use crate::id::BackendJobId;
use crate::{
    event::EventListener,
    magic_any::MagicAny,
    manager::{ReadConsistency, TurboTasksBackendApi},
    raw_vc::CellId,
    registry,
    task::shared_reference::TypedSharedReference,
    task_statistics::TaskStatisticsApi,
    triomphe_utils::unchecked_sidecast_triomphe_arc,
    FunctionId, RawVc, ReadCellOptions, ReadRef, SharedReference, TaskId, TaskIdSet, TraitRef,
    TraitTypeId, ValueTypeId, VcRead, VcValueTrait, VcValueType,
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
    pub fn_type: FunctionId,
    pub this: Option<RawVc>,
    pub arg: Box<dyn MagicAny>,
}

impl CachedTaskType {
    pub fn get_name(&self) -> &'static str {
        &registry::get_function(self.fn_type).name
    }
}

// Manual implementation is needed because of a borrow issue with `Box<dyn Trait>`:
// https://github.com/rust-lang/rust/issues/31740
impl PartialEq for CachedTaskType {
    #[expect(clippy::op_ref)]
    fn eq(&self, other: &Self) -> bool {
        self.fn_type == other.fn_type && self.this == other.this && &self.arg == &other.arg
    }
}

// Manual implementation because we have to have a manual `PartialEq` implementation, and clippy
// complains if we have a derived `Hash` impl, but manual `PartialEq` impl.
impl Hash for CachedTaskType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.fn_type.hash(state);
        self.this.hash(state);
        self.arg.hash(state);
    }
}

impl fmt::Display for CachedTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.get_name())
    }
}

mod ser {
    use std::any::Any;

    use serde::{
        de::{self},
        ser::{SerializeSeq, SerializeTuple},
        Deserialize, Deserializer, Serialize, Serializer,
    };

    use super::*;

    impl Serialize for TypedCellContent {
        fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let value_type = registry::get_value_type(self.0);
            let serializable = if let Some(value) = &self.1 .0 {
                value_type.any_as_serializable(&value.0)
            } else {
                None
            };
            let mut state = serializer.serialize_tuple(3)?;
            state.serialize_element(registry::get_value_type_global_name(self.0))?;
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
                    let value_type = seq
                        .next_element()?
                        .ok_or_else(|| de::Error::invalid_length(0, &self))?;
                    let value_type = registry::get_value_type_id_by_global_name(value_type)
                        .ok_or_else(|| de::Error::custom("Unknown value type"))?;
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
            fn_type: FunctionId,
            arg: Box<dyn MagicAny>,
        },
        Borrowed {
            fn_type: FunctionId,
            arg: &'a dyn MagicAny,
        },
    }

    impl Serialize for FunctionAndArg<'_> {
        fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let FunctionAndArg::Borrowed { fn_type, arg } = self else {
                unreachable!();
            };
            let mut state = serializer.serialize_seq(Some(2))?;
            state.serialize_element(&fn_type)?;
            let arg = *arg;
            let arg = registry::get_function(*fn_type).arg_meta.as_serialize(arg);
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
                    let fn_type = seq
                        .next_element()?
                        .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?;
                    let seed = registry::get_function(fn_type)
                        .arg_meta
                        .deserialization_seed();
                    let arg = seq
                        .next_element_seed(seed)?
                        .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                    Ok(FunctionAndArg::Owned { fn_type, arg })
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
            let CachedTaskType { fn_type, this, arg } = self;
            let mut s = serializer.serialize_tuple(2)?;
            s.serialize_element(&FunctionAndArg::Borrowed {
                fn_type: *fn_type,
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
                    let FunctionAndArg::Owned { fn_type, arg } = seq
                        .next_element()?
                        .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?
                    else {
                        unreachable!();
                    };
                    let this = seq
                        .next_element()?
                        .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                    Ok(CachedTaskType { fn_type, this, arg })
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
        let data = self.1 .0.ok_or_else(|| anyhow!("Cell is empty"))?;
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
        TypedCellContent(value.0, CellContent(Some(value.1)))
    }
}

impl TryFrom<TypedCellContent> for TypedSharedReference {
    type Error = TypedCellContent;

    fn try_from(content: TypedCellContent) -> Result<Self, TypedCellContent> {
        if let TypedCellContent(type_id, CellContent(Some(shared_reference))) = content {
            Ok(TypedSharedReference(type_id, shared_reference))
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

    /// Task-local state that stored inside of [`TurboTasksBackendApi`]. Constructed with
    /// [`Self::new_task_state`].
    ///
    /// This value that can later be written to or read from using
    /// [`crate::TurboTasksBackendApiExt::write_task_state`] or
    /// [`crate::TurboTasksBackendApiExt::read_task_state`]
    ///
    /// This data may be shared across multiple threads (must be `Sync`) in order to support
    /// detached futures ([`crate::TurboTasksApi::detached_for_testing`]) and [pseudo-tasks using
    /// `local` execution][crate::function]. A [`RwLock`][std::sync::RwLock] is used to provide
    /// concurrent access.
    type TaskState: Send + Sync + 'static;

    /// Constructs a new task-local [`Self::TaskState`] for the given `task_id`.
    ///
    /// If a task is re-executed (e.g. because it is invalidated), this function will be called
    /// again with the same [`TaskId`].
    ///
    /// This value can be written to or read from using
    /// [`crate::TurboTasksBackendApiExt::write_task_state`] and
    /// [`crate::TurboTasksBackendApiExt::read_task_state`]
    fn new_task_state(&self, task: TaskId) -> Self::TaskState;

    fn try_start_task_execution<'a>(
        &'a self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Option<TaskExecutionSpec<'a>>;

    fn task_execution_result(
        &self,
        task: TaskId,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn task_execution_completed(
        &self,
        task: TaskId,
        duration: Duration,
        memory_usage: usize,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        stateful: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> bool;

    fn run_backend_job<'a>(
        &'a self,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi<Self>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        consistency: ReadConsistency,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        consistency: ReadConsistency,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>>;

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        reader: TaskId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<TypedCellContent> {
        match self.try_read_task_cell_untracked(current_task, index, options, turbo_tasks)? {
            Ok(content) => Ok(content),
            Err(_) => Ok(TypedCellContent(index.type_id, CellContent(None))),
        }
    }

    fn read_task_collectibles(
        &self,
        task: TaskId,
        trait_id: TraitTypeId,
        reader: TaskId,
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
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

    fn get_or_create_transient_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

    /// For persistent tasks with associated [`NativeFunction`][turbo_tasks::NativeFunction]s,
    /// return the [`FunctionId`].
    fn try_get_function_id(&self, task_id: TaskId) -> Option<FunctionId>;

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: TaskId,
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
}
