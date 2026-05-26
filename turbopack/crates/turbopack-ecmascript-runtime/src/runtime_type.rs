use serde::Deserialize;
use turbo_tasks::{IsTransient, TaskInput};

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Copy, Hash, TaskInput, IsTransient, Deserialize)]
pub enum RuntimeType {
    Development,
    Production,
    #[cfg(feature = "test")]
    /// Dummy runtime for snapshot tests.
    Dummy,
}
