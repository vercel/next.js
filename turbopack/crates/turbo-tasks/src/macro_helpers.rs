//! Runtime helpers for [turbo-tasks-macro].

pub use async_trait::async_trait;
pub use once_cell::sync::{Lazy, OnceCell};
pub use serde;
pub use shrink_to_fit;
pub use tracing;

use crate::{
    debug::ValueDebugFormatString, task::TaskOutput, NonLocalValue, RawVc, TaskInput,
    TaskPersistence, Vc,
};
pub use crate::{
    magic_any::MagicAny,
    manager::{find_cell_by_type, notify_scheduled_tasks, spawn_detached_for_testing},
    native_function::{downcast_args_owned, downcast_args_ref, FunctionMeta, NativeFunction},
};

#[inline(never)]
pub async fn value_debug_format_field(value: ValueDebugFormatString<'_>) -> String {
    match value.try_to_value_debug_string().await {
        Ok(result) => match result.await {
            Ok(result) => result.to_string(),
            Err(err) => format!("{0:?}", err),
        },
        Err(err) => format!("{0:?}", err),
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
