//! Runtime helpers for [turbo-tasks-macro].

use std::ptr::DynMetadata;

pub use async_trait::async_trait;
pub use once_cell::sync::{Lazy, OnceCell};
pub use serde;
pub use shrink_to_fit;
pub use tracing;

use crate::{
    FxDashMap, NonLocalValue, RawVc, TaskInput, TaskPersistence, ValueTypeId, Vc, VcValueTrait,
    debug::ValueDebugFormatString, task::TaskOutput,
};
pub use crate::{
    magic_any::MagicAny,
    manager::{find_cell_by_type, notify_scheduled_tasks, spawn_detached_for_testing},
    native_function::{FunctionMeta, NativeFunction, downcast_args_owned, downcast_args_ref},
};

#[inline(never)]
pub async fn value_debug_format_field(value: ValueDebugFormatString<'_>) -> String {
    match value.try_to_value_debug_string().await {
        Ok(result) => match result.await {
            Ok(result) => result.to_string(),
            Err(err) => format!("{err:?}"),
        },
        Err(err) => format!("{err:?}"),
    }
}

pub fn get_non_local_persistence_from_inputs(inputs: &impl TaskInput) -> TaskPersistence {
    if inputs.is_transient() {
        TaskPersistence::Transient
    } else {
        TaskPersistence::Persistent
    }
}

pub fn get_non_local_persistence_from_inputs_and_this(
    this: RawVc,
    inputs: &impl TaskInput,
) -> TaskPersistence {
    if this.is_transient() || inputs.is_transient() {
        TaskPersistence::Transient
    } else {
        TaskPersistence::Persistent
    }
}

pub fn assert_returns_non_local_value<ReturnType, Rv>()
where
    ReturnType: TaskOutput<Return = Vc<Rv>>,
    Rv: NonLocalValue + Send,
{
}

pub fn assert_argument_is_non_local_value<Argument: NonLocalValue>() {}

#[macro_export]
macro_rules! stringify_path {
    ($path:path) => {
        stringify!($path)
    };
}

/// Rexport std::ptr::metadata so not every crate needs to enable the feature when they use our
/// macros.
#[inline(always)]
pub fn metadata<T: ?Sized>(ptr: *const T) -> <T as std::ptr::Pointee>::Metadata {
    // Ideally we would just `pub use std::ptr::metadata;` but this doesn't seem to work.
    std::ptr::metadata(ptr)
}

/// A registry of all the impl vtables for a given VcValue trait
/// This is constructed in the macro gencode and populated by the registry.
#[derive(Default)]
pub struct VTableRegistry<T: ?Sized> {
    map: FxDashMap<ValueTypeId, std::ptr::DynMetadata<T>>,
}

impl<T: ?Sized> VTableRegistry<T> {
    pub fn new() -> Self {
        Self {
            map: FxDashMap::default(),
        }
    }

    pub(crate) fn register(&self, id: ValueTypeId, vtable: std::ptr::DynMetadata<T>) {
        let prev = self.map.insert(id, vtable);
        debug_assert!(prev.is_none(), "{id} was already registered");
    }

    pub(crate) fn get(&self, id: ValueTypeId) -> DynMetadata<T> {
        *self.map.get(&id).unwrap().value()
    }
}

pub fn register_trait_impl<V: 'static + ?Sized, T: VcValueTrait<ValueTrait = V>>(
    id: ValueTypeId,
    metadata: std::ptr::DynMetadata<V>,
) {
    <T as VcValueTrait>::get_impl_vtables().register(id, metadata);
}
