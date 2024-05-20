use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};

use crate::{
    reference_type::ReferenceType,
    resolve::{parse::Request, ResolveResultOption},
};

/// A condition which determines if the hooks of a resolve plugin gets called.
#[turbo_tasks::value]
pub struct AfterResolvePluginCondition {
    root: Vc<FileSystemPath>,
    glob: Vc<Glob>,
}

#[turbo_tasks::value_impl]
impl AfterResolvePluginCondition {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>, glob: Vc<Glob>) -> Vc<Self> {
        AfterResolvePluginCondition { root, glob }.cell()
    }

    #[turbo_tasks::function]
    pub async fn matches(self: Vc<Self>, fs_path: Vc<FileSystemPath>) -> Result<Vc<bool>> {
        let this = self.await?;
        let root = this.root.await?;
        let glob = this.glob.await?;

        let path = fs_path.await?;

        if let Some(path) = root.get_path_to(&path) {
            if glob.execute(path) {
                return Ok(Vc::cell(true));
            }
        }

        Ok(Vc::cell(false))
    }
}

/// A condition which determines if the hooks of a resolve plugin gets called.
#[turbo_tasks::value]
pub struct BeforeResolvePluginCondition {
    glob: Vc<Glob>,
}

#[turbo_tasks::value_impl]
impl BeforeResolvePluginCondition {
    #[turbo_tasks::function]
    pub fn new(glob: Vc<Glob>) -> Vc<Self> {
        BeforeResolvePluginCondition { glob }.cell()
    }

    #[turbo_tasks::function]
    pub async fn matches(self: Vc<Self>, request: Vc<Request>) -> Result<Vc<bool>> {
        Ok(Vc::cell(match request.await?.request() {
            Some(request) => {
                let this = self.await?;
                let glob = this.glob.await?;
                glob.execute(&request)
            }
            None => false,
        }))
    }
}

#[turbo_tasks::value_trait]
pub trait BeforeResolvePlugin {
    fn before_resolve_condition(self: Vc<Self>) -> Vc<BeforeResolvePluginCondition>;

    fn before_resolve(
        self: Vc<Self>,
        lookup_path: Vc<FileSystemPath>,
        reference_type: Value<ReferenceType>,
        request: Vc<Request>,
    ) -> Vc<ResolveResultOption>;
}

#[turbo_tasks::value_trait]
pub trait AfterResolvePlugin {
    /// A condition which determines if the hooks gets called.
    fn after_resolve_condition(self: Vc<Self>) -> Vc<AfterResolvePluginCondition>;

    /// This hook gets called when a full filepath has been resolved and the
    /// condition matches. If a value is returned it replaces the resolve
    /// result.
    fn after_resolve(
        self: Vc<Self>,
        fs_path: Vc<FileSystemPath>,
        lookup_path: Vc<FileSystemPath>,
        reference_type: Value<ReferenceType>,
        request: Vc<Request>,
    ) -> Vc<ResolveResultOption>;
}
