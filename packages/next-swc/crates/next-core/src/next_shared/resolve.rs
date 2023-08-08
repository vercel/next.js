use std::collections::{HashMap, HashSet};

use anyhow::Result;
use lazy_static::lazy_static;
use turbo_tasks::Vc;
use turbo_tasks_fs::glob::Glob;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::{
        diagnostics::DiagnosticExt,
        issue::{unsupported_module::UnsupportedModuleIssue, IssueExt},
        resolve::{
            parse::Request,
            pattern::Pattern,
            plugin::{ResolvePlugin, ResolvePluginCondition},
            ResolveResult, ResolveResultItem, ResolveResultOption,
        },
    },
};

use crate::next_telemetry::ModuleFeatureTelemetry;

lazy_static! {
    static ref UNSUPPORTED_PACKAGES: HashSet<&'static str> = ["@vercel/og"].into();
    static ref UNSUPPORTED_PACKAGE_PATHS: HashSet<(&'static str, &'static str)> = [].into();
    // Set of the features we want to track, following existing references in webpack/plugins/telemetry-plugin.
    static ref FEATURE_MODULES: HashMap<&'static str, Vec<&'static str>> = HashMap::from([
        (
            "next",
            vec![
                "/image",
                "/future/image",
                "/legacy/image",
                "/script",
                "/dynamic",
                "/font/google",
                "/font/local"
            ]
        ),
        ("@next", vec!["/font/google", "/font/local"])
    ]);
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
        ResolvePluginCondition::new(self.root.root(), Glob::new("**".to_string()))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        _fs_path: Vc<FileSystemPath>,
        file_path: Vc<FileSystemPath>,
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
                    file_path,
                    package: module.into(),
                    package_path: None,
                }
                .cell()
                .emit();
            }

            if let Pattern::Constant(path) = path {
                if UNSUPPORTED_PACKAGE_PATHS.contains(&(module, path)) {
                    UnsupportedModuleIssue {
                        file_path,
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

#[turbo_tasks::value]
pub(crate) struct NextExternalResolvePlugin {
    root: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextExternalResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>) -> Vc<Self> {
        NextExternalResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for NextExternalResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<ResolvePluginCondition> {
        ResolvePluginCondition::new(
            self.root.root(),
            Glob::new(
                "**/next/dist/**/*.{external,shared-runtime,runtime.dev,runtime.prod}.js"
                    .to_string(),
            ),
        )
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        _fs_path: Vc<FileSystemPath>,
        _context: Vc<FileSystemPath>,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        Ok(Vc::cell(Some(
            ResolveResult::primary(ResolveResultItem::OriginalReferenceExternal).into(),
        )))
    }
}

/// A resolver plugin tracks the usage of certain import paths, emit
/// telemetry events if there is a match.
#[turbo_tasks::value]
pub(crate) struct ModuleFeatureReportResolvePlugin {
    root: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl ModuleFeatureReportResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>) -> Vc<Self> {
        ModuleFeatureReportResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for ModuleFeatureReportResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<ResolvePluginCondition> {
        ResolvePluginCondition::new(self.root.root(), Glob::new("**".to_string()))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        _fs_path: Vc<FileSystemPath>,
        _context: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        if let Request::Module {
            module,
            path,
            query: _,
        } = &*request.await?
        {
            let feature_module = FEATURE_MODULES.get(module.as_str());
            if let Some(feature_module) = feature_module {
                let sub_path = feature_module
                    .iter()
                    .find(|sub_path| path.is_match(sub_path));

                if let Some(sub_path) = sub_path {
                    ModuleFeatureTelemetry::new(format!("{}{}", module, sub_path), 1)
                        .cell()
                        .emit();
                }
            }
        }

        Ok(ResolveResultOption::none())
    }
}
