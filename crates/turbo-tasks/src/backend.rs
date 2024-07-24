use std::{
    any::Any,
    borrow::Cow,
    fmt::{self, Debug, Display, Write},
    future::Future,
    hash::BuildHasherDefault,
    pin::Pin,
    sync::Arc,
    time::Duration,
};

use anyhow::{anyhow, bail, Result};
use auto_hash_map::AutoMap;
use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};
use tracing::Span;

pub use crate::id::{BackendJobId, ExecutionId};
use crate::{
    event::EventListener,
    magic_any::MagicAny,
    manager::TurboTasksBackendApi,
    raw_vc::CellId,
    registry,
    trait_helpers::{get_trait_method, has_trait, traits},
    FunctionId, RawVc, ReadRef, SharedReference, TaskId, TaskIdProvider, TaskIdSet, TraitRef,
    TraitTypeId, ValueTypeId, VcValueTrait, VcValueType,
};

pub enum TaskType {
    /// Tasks that only exist for a certain operation and
    /// won't persist between sessions
    Transient(TransientTaskType),

    /// Tasks that can persist between sessions and potentially
    /// shared globally
    Persistent(PersistentTaskType),
}

type TransientTaskRoot =
    Box<dyn Fn() -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> + Send + Sync>;

pub enum TransientTaskType {
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    /// Always active. Automatically scheduled.
    Root(TransientTaskRoot),

    // TODO implement these strongly consistency
    /// A single root task execution. It won't track dependencies.
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
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
pub enum PersistentTaskType {
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

impl Display for PersistentTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.get_name())
    }
}

mod ser {
    use serde::{
        ser::{SerializeSeq, SerializeTuple},
        Deserialize, Deserializer, Serialize, Serializer,
    };

    use super::*;

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

    impl<'a> Serialize for FunctionAndArg<'a> {
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
                    write!(formatter, "a valid PersistentTaskType")
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

    impl Serialize for PersistentTaskType {
        fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
        where
            S: ser::Serializer,
        {
            match self {
                PersistentTaskType::Native { fn_type, this, arg } => {
                    let mut s = serializer.serialize_seq(Some(3))?;
                    s.serialize_element::<u8>(&0)?;
                    s.serialize_element(&FunctionAndArg::Borrowed {
                        fn_type: *fn_type,
                        arg,
                    })?;
                    s.serialize_element(this)?;
                    s.end()
                }
                PersistentTaskType::ResolveNative { fn_type, this, arg } => {
                    let mut s = serializer.serialize_seq(Some(3))?;
                    s.serialize_element::<u8>(&1)?;
                    s.serialize_element(&FunctionAndArg::Borrowed {
                        fn_type: *fn_type,
                        arg,
                    })?;
                    s.serialize_element(this)?;
                    s.end()
                }
                PersistentTaskType::ResolveTrait {
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
                        method.arg_serializer.as_serialize(arg)
                    } else {
                        return Err(serde::ser::Error::custom("Method not found"));
                    };
                    s.serialize_element(arg)?;
                    s.end()
                }
            }
        }
    }

    impl<'de> Deserialize<'de> for PersistentTaskType {
        fn deserialize<D: ser::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
            #[derive(Deserialize)]
            enum VariantKind {
                Native,
                ResolveNative,
                ResolveTrait,
            }
            struct Visitor;
            impl<'de> serde::de::Visitor<'de> for Visitor {
                type Value = PersistentTaskType;

                fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                    write!(formatter, "a valid PersistentTaskType")
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
                            Ok(PersistentTaskType::Native { fn_type, this, arg })
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
                            Ok(PersistentTaskType::ResolveNative { fn_type, this, arg })
                        }
                        2 => {
                            let trait_type = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?;
                            let method_name = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                            let this = seq
                                .next_element()?
                                .ok_or_else(|| serde::de::Error::invalid_length(2, &self))?;
                            let Some(method) =
                                registry::get_trait(trait_type).methods.get(&method_name)
                            else {
                                return Err(serde::de::Error::custom("Method not found"));
                            };
                            let arg = seq
                                .next_element_seed(method.arg_deserializer)?
                                .ok_or_else(|| serde::de::Error::invalid_length(3, &self))?;
                            Ok(PersistentTaskType::ResolveTrait {
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
            deserializer.deserialize_seq(Visitor)
        }
    }
}

impl PersistentTaskType {
    /// Returns the name of the function in the code. Trait methods are
    /// formatted as `TraitName::method_name`.
    ///
    /// Equivalent to [`ToString::to_string`], but potentially more efficient as
    /// it can return a `&'static str` in many cases.
    pub fn get_name(&self) -> Cow<'static, str> {
        match self {
            PersistentTaskType::Native {
                fn_type: native_fn,
                this: _,
                arg: _,
            }
            | PersistentTaskType::ResolveNative {
                fn_type: native_fn,
                this: _,
                arg: _,
            } => Cow::Borrowed(&registry::get_function(*native_fn).name),
            PersistentTaskType::ResolveTrait {
                trait_type: trait_id,
                method_name: fn_name,
                this: _,
                arg: _,
            } => format!("{}::{}", registry::get_trait(*trait_id).name, fn_name).into(),
        }
    }
}

pub struct TaskExecutionSpec<'a> {
    pub future: Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'a>>,
    pub span: Span,
}

// TODO technically CellContent is already indexed by the ValueTypeId, so we
// don't need to store it here
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CellContent(pub Option<SharedReference>);

impl Display for CellContent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.0 {
            None => write!(f, "empty"),
            Some(content) => Display::fmt(content, f),
        }
    }
}

impl CellContent {
    pub fn cast<T: Any + VcValueType>(self) -> Result<ReadRef<T>> {
        let data = self.0.ok_or_else(|| anyhow!("Cell is empty"))?;
        let data = data
            .downcast()
            .map_err(|_err| anyhow!("Unexpected type in cell"))?;
        Ok(ReadRef::new_arc(data))
    }

    /// # Safety
    ///
    /// The caller must ensure that the CellContent contains a vc that
    /// implements T.
    pub fn cast_trait<T>(self) -> Result<TraitRef<T>>
    where
        T: VcValueTrait + ?Sized,
    {
        let shared_reference = self.0.ok_or_else(|| anyhow!("Cell is empty"))?;
        if shared_reference.0.is_none() {
            bail!("Cell content is untyped");
        }
        Ok(
            // Safety: We just checked that the content is typed.
            TraitRef::new(shared_reference),
        )
    }

    pub fn try_cast<T: Any + VcValueType>(self) -> Option<ReadRef<T>> {
        Some(ReadRef::new_arc(self.0?.downcast().ok()?))
    }
}

pub type TaskCollectiblesMap = AutoMap<RawVc, i32, BuildHasherDefault<FxHasher>, 1>;

pub trait Backend: Sync + Send {
    #[allow(unused_variables)]
    fn initialize(&mut self, task_id_provider: &dyn TaskIdProvider) {}

    #[allow(unused_variables)]
    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    #[allow(unused_variables)]
    fn stop(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    #[allow(unused_variables)]
    fn idle_start(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>);

    fn invalidate_tasks(&self, tasks: &[TaskId], turbo_tasks: &dyn TurboTasksBackendApi<Self>);
    fn invalidate_tasks_set(&self, tasks: &TaskIdSet, turbo_tasks: &dyn TurboTasksBackendApi<Self>);

    fn get_task_description(&self, task: TaskId) -> String;

    type ExecutionScopeFuture<T: Future<Output = Result<()>> + Send + 'static>: Future<Output = Result<()>>
        + Send
        + 'static;

    fn execution_scope<T: Future<Output = Result<()>> + Send + 'static>(
        &self,
        task: TaskId,
        future: T,
    ) -> Self::ExecutionScopeFuture<T>;

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
        cell_counters: AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
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
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>>;

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<CellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<CellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<CellContent> {
        match self.try_read_task_cell_untracked(current_task, index, turbo_tasks)? {
            Ok(content) => Ok(content),
            Err(_) => Ok(CellContent(None)),
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
        task_type: PersistentTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

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

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

    fn dispose_root_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>);
}

impl PersistentTaskType {
    pub async fn run_resolve_native<B: Backend + 'static>(
        fn_id: FunctionId,
        mut this: Option<RawVc>,
        arg: &dyn MagicAny,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        if let Some(this) = this.as_mut() {
            *this = this.resolve().await?;
        }
        let arg = registry::get_function(fn_id).arg_meta.resolve(arg).await?;
        Ok(if let Some(this) = this {
            turbo_tasks.this_call(fn_id, this, arg)
        } else {
            turbo_tasks.native_call(fn_id, arg)
        })
    }

    pub async fn resolve_trait_method(
        trait_type: TraitTypeId,
        name: Cow<'static, str>,
        this: RawVc,
    ) -> Result<FunctionId> {
        let CellContent(Some(SharedReference(Some(value_type), _))) = this.into_read().await?
        else {
            bail!("Cell is empty or untyped");
        };
        Self::resolve_trait_method_from_value(trait_type, value_type, name)
    }

    pub async fn run_resolve_trait<B: Backend + 'static>(
        trait_type: TraitTypeId,
        name: Cow<'static, str>,
        this: RawVc,
        arg: &dyn MagicAny,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        let this = this.resolve().await?;
        let CellContent(Some(SharedReference(this_ty, _))) = this.into_read().await? else {
            bail!("Cell is empty");
        };
        let Some(this_ty) = this_ty else {
            bail!("Cell is untyped");
        };

        let native_fn = Self::resolve_trait_method_from_value(trait_type, this_ty, name)?;
        let arg = registry::get_function(native_fn)
            .arg_meta
            .resolve(arg)
            .await?;
        Ok(turbo_tasks.dynamic_this_call(native_fn, this, arg))
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
            PersistentTaskType::Native {
                fn_type: *MOCK_FUNC_TASK_FUNCTION_ID,
                this: None,
                arg: Box::new(()),
            }
            .get_name(),
            "mock_func_task",
        );
        assert_eq!(
            PersistentTaskType::ResolveTrait {
                trait_type: *MOCKTRAIT_TRAIT_TYPE_ID,
                method_name: "mock_method_task".into(),
                this: RawVc::TaskOutput(unsafe { TaskId::new_unchecked(1) }),
                arg: Box::new(()),
            }
            .get_name(),
            "MockTrait::mock_method_task",
        );
    }
}
