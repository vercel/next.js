use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};

use crate::{
    reference_type::ReferenceType,
    resolve::{parse::Request, ResolveResultOption},
};

/// A condition which determines if the hooks of a resolve plugin gets called.
#[turbo_tasks::value]
pub struct AfterResolvePluginCondition {
    root: ResolvedVc<FileSystemPath>,
    glob: ResolvedVc<Glob>,
}

#[turbo_tasks::value_impl]
impl AfterResolvePluginCondition {
    #[turbo_tasks::function]
    pub fn new(root: ResolvedVc<FileSystemPath>, glob: ResolvedVc<Glob>) -> Vc<Self> {
        AfterResolvePluginCondition { root, glob }.cell()
    }

    #[turbo_tasks::function]
    pub async fn matches(&self, fs_path: Vc<FileSystemPath>) -> Result<Vc<bool>> {
        let root = self.root.await?;
        let glob = self.glob.await?;

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
pub enum BeforeResolvePluginCondition {
    Request(ResolvedVc<Glob>),
    Modules(ResolvedVc<Vec<RcStr>>),
}

#[turbo_tasks::value_impl]
impl BeforeResolvePluginCondition {
    #[turbo_tasks::function]
    pub fn from_modules(modules: ResolvedVc<Vec<RcStr>>) -> Vc<Self> {
        BeforeResolvePluginCondition::Modules(modules).cell()
    }

    #[turbo_tasks::function]
    pub fn from_request_glob(glob: ResolvedVc<Glob>) -> Vc<Self> {
        BeforeResolvePluginCondition::Request(glob).cell()
    }
}

impl BeforeResolvePluginCondition {
    pub async fn matches(&self, request: Vc<Request>) -> Result<bool> {
        Ok(match self {
            BeforeResolvePluginCondition::Request(glob) => match request.await?.request() {
                Some(request) => glob.await?.execute(request.as_str()),
                None => false,
            },
            BeforeResolvePluginCondition::Modules(modules) => {
                if let Request::Module { module, .. } = &*request.await? {
                    modules.await?.contains(module)
                } else {
                    false
                }
            }
        })
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
