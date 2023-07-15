use std::collections::HashSet;

use anyhow::Result;
use lazy_static::lazy_static;
use turbo_tasks::Vc;
use turbo_tasks_fs::glob::Glob;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::{
        issue::unsupported_module::UnsupportedModuleIssue,
        resolve::{
            parse::Request,
            pattern::Pattern,
            plugin::{ResolvePlugin, ResolvePluginCondition},
            ResolveResultOption,
        },
    },
};

lazy_static! {
    static ref UNSUPPORTED_PACKAGES: HashSet<&'static str> = ["@vercel/og"].into();
    static ref UNSUPPORTED_PACKAGE_PATHS: HashSet<(&'static str, &'static str)> = [].into();
}

#[turbo_tasks::value]
pub(crate) struct UnsupportedModulesResolvePlugin {
    root: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl UnsupportedModulesResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>) -> Vc<Self> {
        UnsupportedModulesResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for UnsupportedModulesResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<ResolvePluginCondition> {
        ResolvePluginCondition::new(self.root.root(), Glob::new("**"))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        _fs_path: Vc<FileSystemPath>,
        context: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        if let Request::Module {
            module,
            path,
            query: _,
        } = &*request.await?
        {
            // Warn if the package is known not to be supported by Turbopack at the moment.
            if UNSUPPORTED_PACKAGES.contains(module.as_str()) {
                UnsupportedModuleIssue {
                    context,
                    package: module.into(),
                    package_path: None,
                }
                .cell()
                .emit();
            }

            if let Pattern::Constant(path) = path {
                if UNSUPPORTED_PACKAGE_PATHS.contains(&(module, path)) {
                    UnsupportedModuleIssue {
                        context,
                        package: module.into(),
                        package_path: Some(path.to_owned()),
                    }
                    .cell()
                    .emit();
                }
            }
        }

        Ok(ResolveResultOption::none())
    }
}
