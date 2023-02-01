use anyhow::Result;
use turbo_tasks::primitives::BoolVc;
use turbo_tasks_fs::{glob::GlobVc, FileSystemPathVc};

use crate::resolve::{parse::RequestVc, ResolveResultOptionVc};

/// A condition which determines if the hooks of a resolve plugin gets called.
#[turbo_tasks::value]
pub struct ResolvePluginCondition {
    root: FileSystemPathVc,
    glob: GlobVc,
}

#[turbo_tasks::value_impl]
impl ResolvePluginConditionVc {
    #[turbo_tasks::function]
    pub fn new(root: FileSystemPathVc, glob: GlobVc) -> Self {
        ResolvePluginCondition { root, glob }.cell()
    }

    #[turbo_tasks::function]
    pub(super) async fn matches(self, fs_path: FileSystemPathVc) -> Result<BoolVc> {
        let this = self.await?;
        let root = this.root.await?;
        let glob = this.glob.await?;

        let path = fs_path.await?;

        if let Some(path) = root.get_path_to(&path) {
            if glob.execute(path) {
                return Ok(BoolVc::cell(true));
            }
        }

        Ok(BoolVc::cell(false))
    }
}

#[turbo_tasks::value_trait]
pub trait ResolvePlugin {
    /// A condition which determines if the hooks gets called.
    fn condition(&self) -> ResolvePluginConditionVc;

    /// This hook gets called when a full filepath has been resolved and the
    /// condition matches. If a value is returned it replaces the resolve
    /// result.
    fn after_resolve(&self, fs_path: FileSystemPathVc, request: RequestVc)
        -> ResolveResultOptionVc;
}
