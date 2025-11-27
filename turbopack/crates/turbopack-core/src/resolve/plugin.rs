use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystemPath, glob::Glob};

use crate::{
    reference_type::ReferenceType,
    resolve::{ResolveResultOption, parse::Request},
};

/// A condition which determines if the hooks of a resolve plugin gets called.
#[turbo_tasks::value]
pub struct AfterResolvePluginCondition {
    root: FileSystemPath,
    glob: ResolvedVc<Glob>,
}

#[turbo_tasks::value_impl]
impl AfterResolvePluginCondition {
    #[turbo_tasks::function]
    pub fn new(root: FileSystemPath, glob: ResolvedVc<Glob>) -> Vc<Self> {
        AfterResolvePluginCondition { root, glob }.cell()
    }

    #[turbo_tasks::function]
    pub async fn matches(&self, fs_path: FileSystemPath) -> Result<Vc<bool>> {
        let root = self.root.clone();
        let glob = self.glob.await?;

        let path = fs_path;

        if let Some(path) = root.get_path_to(&path)
            && glob.matches(path)
        {
            return Ok(Vc::cell(true));
        }

        Ok(Vc::cell(false))
    }
}

/// A condition which determines if the hooks of a resolve plugin gets called.
#[turbo_tasks::value]
pub enum BeforeResolvePluginCondition {
    Request(ResolvedVc<Glob>),
    Modules(FxHashSet<RcStr>),
}

#[turbo_tasks::value_impl]
impl BeforeResolvePluginCondition {
    #[turbo_tasks::function]
    pub async fn from_modules(modules: ResolvedVc<Vec<RcStr>>) -> Result<Vc<Self>> {
        Ok(BeforeResolvePluginCondition::Modules(modules.await?.iter().cloned().collect()).cell())
    }

    #[turbo_tasks::function]
    pub fn from_request_glob(glob: ResolvedVc<Glob>) -> Vc<Self> {
        BeforeResolvePluginCondition::Request(glob).cell()
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePluginCondition {
    #[turbo_tasks::function]
    pub async fn matches(&self, request: Vc<Request>) -> Result<Vc<bool>> {
        Ok(Vc::cell(match self {
            BeforeResolvePluginCondition::Request(glob) => match request.await?.request() {
                Some(request) => glob.await?.matches(request.as_str()),
                None => false,
            },
            BeforeResolvePluginCondition::Modules(modules) => {
                if let Request::Module { module, .. } = &*request.await? {
                    modules.iter().any(|m| module.is_match(m))
                } else {
                    false
                }
            }
        }))
    }
}

#[turbo_tasks::value_trait]
pub trait BeforeResolvePlugin {
    #[turbo_tasks::function]
    fn before_resolve_condition(self: Vc<Self>) -> Vc<BeforeResolvePluginCondition>;

    #[turbo_tasks::function]
    fn before_resolve(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        reference_type: ReferenceType,
        request: Vc<Request>,
    ) -> Vc<ResolveResultOption>;
}

#[turbo_tasks::value_trait]
pub trait AfterResolvePlugin {
    /// A condition which determines if the hooks gets called.
    #[turbo_tasks::function]
    fn after_resolve_condition(self: Vc<Self>) -> Vc<AfterResolvePluginCondition>;

    /// This hook gets called when a full filepath has been resolved and the
    /// condition matches. If a value is returned it replaces the resolve
    /// result.
    #[turbo_tasks::function]
    fn after_resolve(
        self: Vc<Self>,
        fs_path: FileSystemPath,
        lookup_path: FileSystemPath,
        reference_type: ReferenceType,
        request: Vc<Request>,
    ) -> Vc<ResolveResultOption>;
}
