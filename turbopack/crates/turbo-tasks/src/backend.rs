use std::{
    borrow::Cow,
    fmt::{self, Debug, Display, Write},
    future::Future,
    hash::BuildHasherDefault,
    pin::Pin,
    sync::Arc,
    time::Duration,
};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoMap;
use rustc_hash::FxHasher;
use tracing::Span;

pub use crate::id::{BackendJobId, ExecutionId};
use crate::{
    event::EventListener,
    magic_any::MagicAny,
    manager::{ReadConsistency, TurboTasksBackendApi},
    raw_vc::CellId,
    registry,
    task::shared_reference::TypedSharedReference,
    trait_helpers::{get_trait_method, has_trait, traits},
    triomphe_utils::unchecked_sidecast_triomphe_arc,
    FunctionId, RawVc, ReadRef, SharedReference, TaskId, TaskIdSet, TaskPersistence, TraitRef,
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

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum CachedTaskType {
    /// A normal task execution a native (rust) function
    Native {
        fn_type: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
    },

    /// A resolve task, which resolves arguments and calls the function with
    /// resolve arguments. The inner function call will do a cache lookup.
    ResolveNative {
        fn_type: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
    },

    /// A trait method resolve task. It resolves the first (`self`) argument and
    /// looks up the trait method on that value. Then it calls that method.
    /// The method call will do a cache lookup and might resolve arguments
    /// before.
    ResolveTrait {
        trait_type: TraitTypeId,
        method_name: Cow<'static, str>,
        this: RawVc,
        arg: Box<dyn MagicAny>,
    },
}

impl Display for CachedTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.get_name())
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
                    write!(formatter, "a valid CachedTaskType")
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
            match self {
                CachedTaskType::Native { fn_type, this, arg } => {
                    let mut s = serializer.serialize_tuple(5)?;
                    s.serialize_element::<u8>(&0)?;
                    s.serialize_element(&FunctionAndArg::Borrowed {
                        fn_type: *fn_type,
                        arg: &**arg,
                    })?;
                    s.serialize_element(this)?;
                    s.serialize_element(&())?;
                    s.serialize_element(&())?;
                    s.end()
                }
                CachedTaskType::ResolveNative { fn_type, this, arg } => {
                    let mut s = serializer.serialize_tuple(5)?;
                    s.serialize_element::<u8>(&1)?;
                    s.serialize_element(&FunctionAndArg::Borrowed {
                        fn_type: *fn_type,
                        arg: &**arg,
                    })?;
                    s.serialize_element(this)?;
                    s.serialize_element(&())?;
                    s.serialize_element(&())?;
                    s.end()
                }
                CachedTaskType::ResolveTrait {
                    trait_type,
                    method_name,
                    this,
                    arg,
                } => {
                    let mut s = serializer.serialize_tuple(5)?;
                    s.serialize_element::<u8>(&2)?;
                    s.serialize_element(trait_type)?;
                    s.serialize_element(method_name)?;
                    s.serialize_element(this)?;
                    let arg = if let Some(method) =
                        registry::get_trait(*trait_type).methods.get(method_name)
                    {
                        method.arg_serializer.as_serialize(&**arg)
                    } else {
                        return Err(serde::ser::Error::custom("Method not found"));
                    };
                    s.serialize_element(arg)?;
                    s.end()
                }
            }
        }
    }

    impl<'de> Deserialize<'de> for CachedTaskType {
        fn deserialize<D: ser::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
            struct Visitor;
            impl<'de> serde::de::Visitor<'de> for Visitor {
                type Value = CachedTaskType;

                fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                    write!(formatter, "a valid CachedTaskType")
                }

                fn visit_seq<A>(self, mut seq: A) -> std::result::Result<Self::Value, A::Error>
                where
                    A: serde::de::SeqAccess<'de>,
                {
                    let kind = seq
                        .next_element::<u8>()?
                        .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?;
                    match kind {
                        0 => {
                            let FunctionAndArg::Owned { fn_type, arg } = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?
                            else {
                                unreachable!();
                            };
                            let this = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(2, &self))?;
                            let () = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(3, &self))?;
                            let () = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(4, &self))?;
                            Ok(CachedTaskType::Native { fn_type, this, arg })
                        }
                        1 => {
                            let FunctionAndArg::Owned { fn_type, arg } = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?
                            else {
                                unreachable!();
                            };
                            let this = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(2, &self))?;
                            let () = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(3, &self))?;
                            let () = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(4, &self))?;
                            Ok(CachedTaskType::ResolveNative { fn_type, this, arg })
                        }
                        2 => {
                            let trait_type = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                            let method_name = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(2, &self))?;
                            let this = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(3, &self))?;
                            let Some(method) =
                                registry::get_trait(trait_type).methods.get(&method_name)
                            else {
                                return Err(serde::de::Error::custom("Method not found"));
                            };
                            let arg = seq
                                .next_element_seed(method.arg_deserializer)?
                                .ok_or_else(|| serde::de::Error::invalid_length(4, &self))?;
                            Ok(CachedTaskType::ResolveTrait {
                                trait_type,
                                method_name,
                                this,
                                arg,
                            })
                        }
                        _ => Err(serde::de::Error::custom("Invalid variant")),
                    }
                }
            }
            deserializer.deserialize_tuple(5, Visitor)
        }
    }
}

impl CachedTaskType {
    /// Returns the name of the function in the code. Trait methods are
    /// formatted as `TraitName::method_name`.
    ///
    /// Equivalent to [`ToString::to_string`], but potentially more efficient as
    /// it can return a `&'static str` in many cases.
    pub fn get_name(&self) -> Cow<'static, str> {
        match self {
            Self::Native {
                fn_type: native_fn,
                this: _,
                arg: _,
            } => Cow::Borrowed(&registry::get_function(*native_fn).name),
            Self::ResolveNative {
                fn_type: native_fn,
                this: _,
                arg: _,
            } => format!("*{}", registry::get_function(*native_fn).name).into(),
            Self::ResolveTrait {
                trait_type: trait_id,
                method_name: fn_name,
                this: _,
                arg: _,
            } => format!("*{}::{}", registry::get_trait(*trait_id).name, fn_name).into(),
        }
    }

    pub fn try_get_function_id(&self) -> Option<FunctionId> {
        match self {
            Self::Native { fn_type, .. } | Self::ResolveNative { fn_type, .. } => Some(*fn_type),
            Self::ResolveTrait { .. } => None,
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
    /// `local_cells`][crate::function]. A [`RwLock`][std::sync::RwLock] is used to provide
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
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<TypedCellContent> {
        match self.try_read_task_cell_untracked(current_task, index, turbo_tasks)? {
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
}

impl CachedTaskType {
    pub async fn run_resolve_native<B: Backend + 'static>(
        fn_id: FunctionId,
        mut this: Option<RawVc>,
        arg: &dyn MagicAny,
        persistence: TaskPersistence,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        if let Some(this) = this.as_mut() {
            *this = this.resolve().await?;
        }
        let arg = registry::get_function(fn_id).arg_meta.resolve(arg).await?;
        Ok(if let Some(this) = this {
            turbo_tasks.this_call(fn_id, this, arg, persistence)
        } else {
            turbo_tasks.native_call(fn_id, arg, persistence)
        })
    }

    pub async fn resolve_trait_method(
        trait_type: TraitTypeId,
        name: Cow<'static, str>,
        this: RawVc,
    ) -> Result<FunctionId> {
        let TypedCellContent(value_type, _) = this.into_read().await?;
        Self::resolve_trait_method_from_value(trait_type, value_type, name)
    }

    pub async fn run_resolve_trait<B: Backend + 'static>(
        trait_type: TraitTypeId,
        name: Cow<'static, str>,
        this: RawVc,
        arg: &dyn MagicAny,
        persistence: TaskPersistence,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        let this = this.resolve().await?;
        let TypedCellContent(this_ty, _) = this.into_read().await?;

        let native_fn = Self::resolve_trait_method_from_value(trait_type, this_ty, name)?;
        let arg = registry::get_function(native_fn)
            .arg_meta
            .resolve(arg)
            .await?;
        Ok(turbo_tasks.dynamic_this_call(native_fn, this, arg, persistence))
    }

    /// Shared helper used by [`Self::resolve_trait_method`] and
    /// [`Self::run_resolve_trait`].
    fn resolve_trait_method_from_value(
        trait_type: TraitTypeId,
        value_type: ValueTypeId,
        name: Cow<'static, str>,
    ) -> Result<FunctionId> {
        match get_trait_method(trait_type, value_type, name) {
            Ok(native_fn) => Ok(native_fn),
            Err(name) => {
                if !has_trait(value_type, trait_type) {
                    let traits = traits(value_type).iter().fold(String::new(), |mut out, t| {
                        let _ = write!(out, " {}", t);
                        out
                    });
                    Err(anyhow!(
                        "{} doesn't implement {} (only{})",
                        registry::get_value_type(value_type),
                        registry::get_trait(trait_type),
                        traits,
                    ))
                } else {
                    Err(anyhow!(
                        "{} implements trait {}, but method {} is missing",
                        registry::get_value_type(value_type),
                        registry::get_trait(trait_type),
                        name
                    ))
                }
            }
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{self as turbo_tasks, Vc};

    #[turbo_tasks::function]
    fn mock_func_task() -> Vc<()> {
        Vc::cell(())
    }

    #[turbo_tasks::value_trait]
    trait MockTrait {
        fn mock_method_task() -> Vc<()>;
    }

    #[test]
    fn test_get_name() {
        crate::register();
        assert_eq!(
            CachedTaskType::Native {
                fn_type: *MOCK_FUNC_TASK_FUNCTION_ID,
                this: None,
                arg: Box::new(()),
            }
            .get_name(),
            "mock_func_task",
        );
        assert_eq!(
            CachedTaskType::ResolveTrait {
                trait_type: *MOCKTRAIT_TRAIT_TYPE_ID,
                method_name: "mock_method_task".into(),
                this: RawVc::TaskOutput(unsafe { TaskId::new_unchecked(1) }),
                arg: Box::new(()),
            }
            .get_name(),
            "*MockTrait::mock_method_task",
        );
    }
}
