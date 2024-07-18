//! Runtime helpers for [turbo-tasks-macro].
pub use async_trait::async_trait;
pub use once_cell::sync::{Lazy, OnceCell};
pub use serde;
pub use tracing;

pub use super::{
    magic_any::MagicAny,
    manager::{find_cell_by_type, notify_scheduled_tasks, spawn_detached},
};
use crate::debug::ValueDebugFormatString;

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

#[macro_export]
macro_rules! stringify_path {
    ($path:path) => {
        stringify!($path)
    };
}
