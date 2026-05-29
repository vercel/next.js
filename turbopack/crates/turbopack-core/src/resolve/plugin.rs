use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystemPath, glob::Glob};

use crate::{
    reference_type::ReferenceType,
    resolve::{ResolveResultOption, parse::Request},
};

/// A condition which determines if the hooks of a resolve plugin gets called.
///
/// The glob is read at construction time and stored as a `ReadRef`, so `matches` is a pure
/// sync function. `serialization = "skip"` because serializing a `ReadRef` is wasteful and
/// recomputing this is very cheap.
#[turbo_tasks::value(serialization = "skip")]
pub enum AfterResolvePluginCondition {
    Glob {
        root: FileSystemPath,
        glob: ReadRef<Glob>,
    },
    // these variants are used by utoo
    Always,
    Never,
}

#[turbo_tasks::value_impl]
impl AfterResolvePluginCondition {
    #[turbo_tasks::function]
    pub async fn new_with_glob(root: FileSystemPath, glob: ResolvedVc<Glob>) -> Result<Vc<Self>> {
        let glob = glob.await?;
        Ok(AfterResolvePluginCondition::Glob { root, glob }.cell())
    }
}

impl AfterResolvePluginCondition {
    /// Test whether `fs_path` matches this condition.
    pub fn matches(&self, fs_path: &FileSystemPath) -> bool {
        match self {
            AfterResolvePluginCondition::Glob { root, glob } => {
                root.get_path_to(fs_path).is_some_and(|p| glob.matches(p))
            }
            AfterResolvePluginCondition::Always => true,
            AfterResolvePluginCondition::Never => false,
        }
    }
}

/// A condition which determines if the hooks of a resolve plugin gets called.
#[turbo_tasks::value(shared, serialization = "skip")]
pub enum BeforeResolvePluginCondition {
    Request(ReadRef<Glob>),
    Modules(ReadRef<Vec<RcStr>>),
    // These are used by utoo
    Always,
    Never,
}

#[turbo_tasks::value_impl]
impl BeforeResolvePluginCondition {
    #[turbo_tasks::function]
    pub async fn from_modules(modules: ResolvedVc<Vec<RcStr>>) -> Result<Vc<Self>> {
        Ok(BeforeResolvePluginCondition::Modules(modules.await?).cell())
    }

    #[turbo_tasks::function]
    pub async fn from_request_glob(glob: ResolvedVc<Glob>) -> Result<Vc<Self>> {
        Ok(BeforeResolvePluginCondition::Request(glob.await?).cell())
    }
}

impl BeforeResolvePluginCondition {
    /// Test whether `request` matches this condition.
    pub fn matches(&self, request: &Request) -> bool {
        match self {
            BeforeResolvePluginCondition::Request(glob) => match request.request() {
                Some(request) => glob.matches(request.as_str()),
                None => false,
            },
            BeforeResolvePluginCondition::Modules(modules) => {
                if let Request::Module { module, .. } = request {
                    modules.iter().any(|m| module.is_match(m))
                } else {
                    false
                }
            }
            BeforeResolvePluginCondition::Always => true,
            BeforeResolvePluginCondition::Never => false,
        }
    }
}

#[turbo_tasks::value_trait]
pub trait BeforeResolvePlugin {
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition>;

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
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition>;

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
