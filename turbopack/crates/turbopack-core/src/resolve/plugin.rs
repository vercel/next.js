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
    /// Matches the glob against the resolved path relative to `root`. A `root` of `None` matches
    /// resolved paths on any filesystem, relative to that filesystem's root.
    Glob {
        root: Option<FileSystemPath>,
        glob: ReadRef<Glob>,
    },
    /// Like [AfterResolvePluginCondition::Glob], but also matches module requests (e.g. `pkg` or
    /// `pkg/subpath`) for any of `modules`, independent of the resolved path. This allows plugins
    /// to handle packages that resolve to a path outside of the glob, e.g. a symlinked package
    /// that resolves to its real path outside of `node_modules`.
    GlobOrModules {
        root: Option<FileSystemPath>,
        glob: ReadRef<Glob>,
        modules: ReadRef<Vec<RcStr>>,
    },
    // these variants are used by utoo
    Always,
    Never,
}

#[turbo_tasks::value_impl]
impl AfterResolvePluginCondition {
    #[turbo_tasks::function]
    pub async fn new_with_glob(
        root: Option<FileSystemPath>,
        glob: ResolvedVc<Glob>,
    ) -> Result<Vc<Self>> {
        let glob = glob.await?;
        Ok(AfterResolvePluginCondition::Glob { root, glob }.cell())
    }

    #[turbo_tasks::function]
    pub async fn new_with_glob_or_modules(
        root: Option<FileSystemPath>,
        glob: ResolvedVc<Glob>,
        modules: ResolvedVc<Vec<RcStr>>,
    ) -> Result<Vc<Self>> {
        let glob = glob.await?;
        let modules = modules.await?;
        Ok(AfterResolvePluginCondition::GlobOrModules {
            root,
            glob,
            modules,
        }
        .cell())
    }
}

impl AfterResolvePluginCondition {
    /// Test whether `fs_path` matches this condition. This ignores the `modules` of
    /// [AfterResolvePluginCondition::GlobOrModules], use [Self::matches_resolved] to take the
    /// request into account.
    pub fn matches(&self, fs_path: &FileSystemPath) -> bool {
        match self {
            AfterResolvePluginCondition::Glob { root, glob }
            | AfterResolvePluginCondition::GlobOrModules { root, glob, .. } => {
                let path = match root {
                    Some(root) => root.get_path_to(fs_path),
                    None => Some(&*fs_path.path),
                };
                path.is_some_and(|p| glob.matches(p))
            }
            AfterResolvePluginCondition::Always => true,
            AfterResolvePluginCondition::Never => false,
        }
    }

    /// Test whether `request` resolving to `fs_path` matches this condition.
    pub fn matches_resolved(&self, fs_path: &FileSystemPath, request: &Request) -> bool {
        if self.matches(fs_path) {
            return true;
        }
        match self {
            AfterResolvePluginCondition::GlobOrModules { modules, .. } => {
                if let Request::Module { module, .. } = request {
                    modules.iter().any(|m| module.is_match(m))
                } else {
                    false
                }
            }
            _ => false,
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
