use std::collections::{HashMap, HashSet};

use anyhow::Result;
use lazy_static::lazy_static;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::{
        diagnostics::DiagnosticExt,
        file_source::FileSource,
        issue::{unsupported_module::UnsupportedModuleIssue, IssueExt},
        reference_type::ReferenceType,
        resolve::{
            parse::Request,
            pattern::Pattern,
            plugin::{ResolvePlugin, ResolvePluginCondition},
            ResolveResult, ResolveResultItem, ResolveResultOption,
        },
    },
};

use crate::{next_server::ServerContextType, next_telemetry::ModuleFeatureTelemetry};

lazy_static! {
    static ref UNSUPPORTED_PACKAGES: HashSet<&'static str> = [].into();
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
        _reference_type: Value<ReferenceType>,
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
            Glob::new("**/next/dist/**/*.{external,runtime.dev,runtime.prod}.js".to_string()),
        )
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: Vc<FileSystemPath>,
        _context: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let raw_fs_path = &*fs_path.await?;
        let path = raw_fs_path.path.to_string();
        // Find the starting index of 'next/dist' and slice from that point. It should
        // always be found since the glob pattern above is specific enough.
        let starting_index = path.find("next/dist").unwrap();
        // Replace '/esm/' with '/' to match the CJS version of the file.
        let modified_path = &path[starting_index..].replace("/esm/", "/");
        Ok(Vc::cell(Some(
            ResolveResult::primary(ResolveResultItem::OriginalReferenceTypeExternal(
                modified_path.to_string(),
            ))
            .into(),
        )))
    }
}

#[turbo_tasks::value]
pub(crate) struct NextNodeSharedRuntimeResolvePlugin {
    root: Vc<FileSystemPath>,
    context: ServerContextType,
}

#[turbo_tasks::value_impl]
impl NextNodeSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>, context: Value<ServerContextType>) -> Vc<Self> {
        let context = context.into_value();
        NextNodeSharedRuntimeResolvePlugin { root, context }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for NextNodeSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<ResolvePluginCondition> {
        ResolvePluginCondition::new(
            self.root.root(),
            Glob::new("**/next/dist/**/*.shared-runtime.js".to_string()),
        )
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: Vc<FileSystemPath>,
        _context: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let stem = fs_path.file_stem().await?;
        let stem = stem.as_deref().unwrap_or_default();
        let stem = stem.replace(".shared-runtime", "");

        let resource_request = format!(
            "next/dist/server/future/route-modules/{}/vendored/contexts/{}.js",
            match self.context {
                ServerContextType::Pages { .. } => "pages",
                ServerContextType::AppRoute { .. } => "app-route",
                ServerContextType::AppSSR { .. } | ServerContextType::AppRSC { .. } => "app-page",
                _ => "unknown",
            },
            stem
        );

        let raw_fs_path = &*fs_path.await?;
        let path = raw_fs_path.path.to_string();

        // Find the starting index of 'next/dist' and slice from that point. It should
        // always be found since the glob pattern above is specific enough.
        let starting_index = path.find("next/dist").unwrap();

        let (base, _) = path.split_at(starting_index);

        let new_path = fs_path.root().join(format!("{base}/{resource_request}"));

        Ok(Vc::cell(Some(
            ResolveResult::source(Vc::upcast(FileSource::new(new_path))).into(),
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
        _reference_type: Value<ReferenceType>,
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

#[turbo_tasks::value]
pub(crate) struct NextSharedRuntimeResolvePlugin {
    root: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>) -> Vc<Self> {
        NextSharedRuntimeResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for NextSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<ResolvePluginCondition> {
        ResolvePluginCondition::new(
            self.root.root(),
            Glob::new("**/next/dist/esm/**/*.shared-runtime.js".to_string()),
        )
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: Vc<FileSystemPath>,
        _context: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let raw_fs_path = &*fs_path.await?;
        let modified_path = raw_fs_path.path.replace("next/dist/esm/", "next/dist/");
        let new_path = fs_path.root().join(modified_path);
        Ok(Vc::cell(Some(
            ResolveResult::source(Vc::upcast(FileSource::new(new_path))).into(),
        )))
    }
}
