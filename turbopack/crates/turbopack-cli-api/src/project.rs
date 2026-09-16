//! `Project` / `ProjectContainer` / `ProjectOptions` — the project model for the CLI.
//!
//! `ProjectContainer` is a long-lived handle with internally-mutable
//! `options_state: State<Option<ProjectOptions>>`. Because `State` is a tracked turbo-tasks
//! dependency, an update that mutates it correctly invalidates the derived work, so
//! config changes are reactive with no process restart.
//! `Project` is the immutable snapshot derived from the current options.

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, OperationValue, OperationVc, State, Vc, trace::TraceRawVcs};
use turbopack_cli_core::entry::EntryRequest;

/// Stored inside the container's `State`, so it is a plain derive-only value (not a
/// `#[turbo_tasks::value]`).
#[derive(
    Debug,
    Clone,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
    Encode,
    Decode,
)]
pub struct ProjectOptions {
    /// Absolute path to the project root (the chroot root of the project filesystem).
    pub root_path: RcStr,
    /// Entry module requests (relative to root).
    pub entries: Vec<EntryRequest>,
    /// Output directory (relative to root).
    pub dist_dir: RcStr,
}

/// The immutable per-snapshot project derived from the container's current options.
#[turbo_tasks::value]
pub struct Project {
    pub root_path: RcStr,
    pub entries: Vec<EntryRequest>,
    pub dist_dir: RcStr,
}

/// Long-lived handle. Identity is stable across config changes; only the `options_state`
/// mutates.
#[turbo_tasks::value]
pub struct ProjectContainer {
    options_state: State<Option<ProjectOptions>>,
}

#[turbo_tasks::value_impl]
impl ProjectContainer {
    #[turbo_tasks::function(operation, root)]
    pub fn new_operation() -> Vc<Self> {
        ProjectContainer {
            options_state: State::new(None),
        }
        .cell()
    }

    /// Derive the immutable `Project` from the current options. Reads `options_state.get()`
    /// (a *tracked* read). This is the subscription that makes `project_update` reactive.
    #[turbo_tasks::function]
    pub async fn project(&self) -> Result<Vc<Project>> {
        let options = self.options_state.get();
        let options = options
            .as_ref()
            .context("ProjectContainer must be initialized before use")?;
        Ok(Project {
            root_path: options.root_path.clone(),
            entries: options.entries.clone(),
            dist_dir: options.dist_dir.clone(),
        }
        .cell())
    }
}

impl ProjectContainer {
    /// Set the initial options. Not a `#[turbo_tasks::function]` (must not be memoized): it
    /// mutates the tracked `State`. Uses a strongly-consistent read of the operation, which
    /// is the only kind of read allowed at the top level.
    pub async fn initialize(this_op: OperationVc<Self>, options: ProjectOptions) -> Result<()> {
        let this = this_op.read_strongly_consistent().await?;
        this.options_state.set(Some(options));
        Ok(())
    }
}
