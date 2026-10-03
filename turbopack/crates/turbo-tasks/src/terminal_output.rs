use std::sync::Arc;

use anyhow::Result;
use tokio::task_local;

/// An embedder-owned terminal destination. It accepts bytes without waiting for
/// the terminal to display them, and never becomes part of a cached task input.
pub type TerminalOutput = Arc<dyn Fn(u8, Vec<u8>) -> Result<()> + Send + Sync>;

task_local! {
    static INITIAL_OUTPUT: Option<TerminalOutput>;
}

pub fn current_terminal_output() -> Option<TerminalOutput> {
    INITIAL_OUTPUT
        .try_with(Clone::clone)
        .ok()
        .flatten()
        .or_else(|| crate::manager::try_turbo_tasks().and_then(|tasks| tasks.terminal_output()))
}

/// Associate an engine with its embedder's output destination during creation.
pub fn with_terminal_output<T>(output: Option<TerminalOutput>, f: impl FnOnce() -> T) -> T {
    INITIAL_OUTPUT.sync_scope(output, f)
}
