use std::{
    ffi::OsStr,
    path::{Component, Path},
};

use turbo_tasks_fs::DiskWatcherPathMatcher;

/// Matches anything inside of a `node_modules` directory.
///
/// Package managers churn `node_modules` heavily while the dev server is running. More aggressively
/// batching these may reduce system load during an installation.
#[turbo_tasks::value(shared)]
pub struct NodeModulesPathMatcher;

#[turbo_tasks::value_impl]
impl DiskWatcherPathMatcher for NodeModulesPathMatcher {
    fn match_path(&self, path: &Path) -> bool {
        path.components()
            .any(|component| component == Component::Normal(OsStr::new("node_modules")))
    }
}
