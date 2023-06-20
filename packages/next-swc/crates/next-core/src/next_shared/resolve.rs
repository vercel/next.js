use std::collections::HashSet;

use anyhow::Result;
use lazy_static::lazy_static;
use turbo_tasks_fs::glob::GlobVc;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::core::{
        issue::unsupported_module::UnsupportedModuleIssue,
        resolve::{
            parse::{Request, RequestVc},
            pattern::Pattern,
            plugin::{ResolvePlugin, ResolvePluginConditionVc, ResolvePluginVc},
            ResolveResultOptionVc,
        },
    },
};

lazy_static! {
    static ref UNSUPPORTED_PACKAGES: HashSet<&'static str> = ["@vercel/og"].into();
    static ref UNSUPPORTED_PACKAGE_PATHS: HashSet<(&'static str, &'static str)> = [].into();
}

#[turbo_tasks::value]
pub(crate) struct UnsupportedModulesResolvePlugin {
    root: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl UnsupportedModulesResolvePluginVc {
    #[turbo_tasks::function]
    pub fn new(root: FileSystemPathVc) -> Self {
        UnsupportedModulesResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for UnsupportedModulesResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> ResolvePluginConditionVc {
        ResolvePluginConditionVc::new(self.root.root(), GlobVc::new("**"))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        _fs_path: FileSystemPathVc,
        context: FileSystemPathVc,
        request: RequestVc,
    ) -> Result<ResolveResultOptionVc> {
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
                .as_issue()
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
                    .as_issue()
                    .emit();
                }
            }
        }

        Ok(ResolveResultOptionVc::none())
    }
}
