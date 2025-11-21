use turbo_tasks::TaskInput;

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Copy, Hash, TaskInput)]
pub enum RuntimeType {
    Development,
    Production,
    #[cfg(feature = "test")]
    /// Dummy runtime for snapshot tests.
    Dummy,
}
