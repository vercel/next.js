use serde::Deserialize;

#[turbo_tasks::value(shared, task_input)]
#[derive(Debug, Clone, Copy, Hash, Deserialize)]
pub enum RuntimeType {
    Development,
    Production,
    #[cfg(feature = "test")]
    /// Dummy runtime for snapshot tests.
    Dummy,
}
