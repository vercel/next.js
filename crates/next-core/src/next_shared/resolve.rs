use anyhow::Result;
use async_trait::async_trait;
use phf::phf_map;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    diagnostics::DiagnosticExt,
    file_source::FileSource,
    issue::{Issue, IssueSeverity, IssueStage, StyledString},
    reference_type::ReferenceType,
    resolve::{
        ExternalTraced, ExternalType, ResolveResult, ResolveResultItem, ResolveResultOption,
        parse::Request,
        pattern::Pattern,
        plugin::{
            AfterResolvePlugin, AfterResolvePluginCondition, BeforeResolvePlugin,
            BeforeResolvePluginCondition,
        },
    },
};

use crate::{next_server::ServerContextType, next_telemetry::ModuleFeatureTelemetry};

// Set of the features we want to track, following existing references in
// webpack/plugins/telemetry-plugin.
static FEATURE_MODULES: phf::Map<&'static str, &'static [&'static str]> = phf_map! {
    "next" => &[
        "/image",
        "/future/image",
        "/legacy/image",
        "/script",
        "/dynamic",
        "/font/google",
        "/font/local",
    ],
    "@next/font" => &["/google", "/local"],
};

#[turbo_tasks::value(shared)]
pub struct InvalidImportModuleIssue {
    // TODO(PACK-4879): The filepath is incorrect and there should be a fine grained source
    // location pointing at the import/require
    pub file_path: FileSystemPath,
    pub messages: Vec<RcStr>,
    pub skip_context_message: bool,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for InvalidImportModuleIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Invalid import")))
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let mut messages = self.messages.clone();
        if !self.skip_context_message {
            //[TODO]: how do we get the import trace?
            messages.push(
                format!(
                    "The error was caused by importing '{}'",
                    self.file_path.path
                )
                .into(),
            );
        }

        Ok(Some(StyledString::Line(
            messages
                .iter()
                .map(|v| StyledString::Text(format!("{v}\n").into()))
                .collect::<Vec<StyledString>>(),
        )))
    }
}

#[turbo_tasks::value]
pub(crate) struct NextExternalResolvePlugin {
    condition: ResolvedVc<AfterResolvePluginCondition>,
}

#[turbo_tasks::value_impl]
impl NextExternalResolvePlugin {
    #[turbo_tasks::function]
    pub async fn new(project_path: FileSystemPath) -> Result<Vc<Self>> {
        let condition = AfterResolvePluginCondition::new_with_glob(
            project_path.root().owned().await?,
            Glob::new(
                rcstr!("**/next/dist/**/*.{external,runtime.dev,runtime.prod}.js"),
                GlobOptions::default(),
            ),
        )
        .to_resolved()
        .await?;
        Ok(NextExternalResolvePlugin { condition }.cell())
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for NextExternalResolvePlugin {
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        *self.condition
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        self: Vc<Self>,
        fs_path: FileSystemPath,
        _lookup_path: FileSystemPath,
        _reference_type: ReferenceType,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let path = fs_path.path.to_string();
        // Find the starting index of 'next/dist' and slice from that point. It should
        // always be found since the glob pattern above is specific enough.
        let starting_index = path.find("next/dist").unwrap();
        let specifier = &path[starting_index..];
        // Replace '/esm/' with '/' to match the CJS version of the file.
        let specifier: RcStr = specifier.replace("/esm/", "/").into();

        Ok(Vc::cell(Some(
            ResolveResult::primary(ResolveResultItem::External {
                name: specifier.clone(),
                ty: ExternalType::CommonJs,
                traced: ExternalTraced::Traced,
                target: None,
            })
            .resolved_cell(),
        )))
    }
}

#[turbo_tasks::value]
pub(crate) struct NextNodeSharedRuntimeResolvePlugin {
    server_context_type: ServerContextType,
    condition: ResolvedVc<AfterResolvePluginCondition>,
}

#[turbo_tasks::value_impl]
impl NextNodeSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    pub async fn new(
        root: FileSystemPath,
        server_context_type: ServerContextType,
    ) -> Result<Vc<Self>> {
        let condition = AfterResolvePluginCondition::new_with_glob(
            root.root().owned().await?,
            Glob::new(
                rcstr!("**/next/dist/**/*.shared-runtime.js"),
                GlobOptions::default(),
            ),
        )
        .to_resolved()
        .await?;
        Ok(NextNodeSharedRuntimeResolvePlugin {
            server_context_type,
            condition,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for NextNodeSharedRuntimeResolvePlugin {
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        *self.condition
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: FileSystemPath,
        _lookup_path: FileSystemPath,
        _reference_type: ReferenceType,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let stem = fs_path.file_stem();
        let stem = stem.unwrap_or_default();
        let stem = stem.replace(".shared-runtime", "");

        let resource_request = format!(
            "next/dist/server/route-modules/{}/vendored/contexts/{}.js",
            match self.server_context_type {
                ServerContextType::AppRoute { .. } => "app-route",
                ServerContextType::AppSSR { .. } | ServerContextType::AppRSC { .. } => "app-page",
                // Use default pages context for all other contexts.
                _ => "pages",
            },
            stem
        );

        let raw_fs_path = fs_path.clone();
        let path = raw_fs_path.path.to_string();

        // Find the starting index of 'next/dist' and slice from that point. It should
        // always be found since the glob pattern above is specific enough.
        let starting_index = path.find("next/dist").unwrap();

        let (base, _) = path.split_at(starting_index);

        let new_path = fs_path
            .root()
            .await?
            .join(&format!("{base}/{resource_request}"))?;

        Ok(Vc::cell(Some(
            ResolveResult::source(ResolvedVc::upcast(
                FileSource::new(new_path).to_resolved().await?,
            ))
            .resolved_cell(),
        )))
    }
}

/// A resolver plugin tracks the usage of certain import paths, emit
/// telemetry events if there is a match.
#[turbo_tasks::value]
pub(crate) struct ModuleFeatureReportResolvePlugin {
    condition: ResolvedVc<BeforeResolvePluginCondition>,
}

#[turbo_tasks::value_impl]
impl ModuleFeatureReportResolvePlugin {
    #[turbo_tasks::function]
    pub async fn new(_root: FileSystemPath) -> Result<Vc<Self>> {
        let condition = BeforeResolvePluginCondition::from_modules(Vc::cell(
            FEATURE_MODULES
                .keys()
                .map(|k| (*k).into())
                .collect::<Vec<RcStr>>(),
        ))
        .to_resolved()
        .await?;
        Ok(ModuleFeatureReportResolvePlugin { condition }.cell())
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for ModuleFeatureReportResolvePlugin {
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        *self.condition
    }

    #[turbo_tasks::function]
    async fn before_resolve(
        self: Vc<Self>,
        _lookup_path: FileSystemPath,
        _reference_type: ReferenceType,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        if let Request::Module {
            module: Pattern::Constant(module),
            path,
            query: _,
            fragment: _,
        } = &*request.await?
        {
            let feature_module = FEATURE_MODULES.get(module.as_str());
            if let Some(feature_module) = feature_module {
                let sub_path = feature_module
                    .iter()
                    .find(|sub_path| path.is_match(sub_path));

                if let Some(sub_path) = sub_path {
                    // This is not accurate. we only emit one diagnostic per request not per import
                    ModuleFeatureTelemetry::new(format!("{module}{sub_path}").into(), 1)
                        .resolved_cell()
                        .emit();
                }
            }
        }

        Ok(ResolveResultOption::none())
    }
}

#[turbo_tasks::value]
pub(crate) struct NextSharedRuntimeResolvePlugin {
    condition: ResolvedVc<AfterResolvePluginCondition>,
}

#[turbo_tasks::value_impl]
impl NextSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    pub async fn new(root: FileSystemPath) -> Result<Vc<Self>> {
        let condition = AfterResolvePluginCondition::new_with_glob(
            root.root().owned().await?,
            Glob::new(
                rcstr!("**/next/dist/esm/**/*.shared-runtime.js"),
                GlobOptions::default(),
            ),
        )
        .to_resolved()
        .await?;
        Ok(NextSharedRuntimeResolvePlugin { condition }.cell())
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for NextSharedRuntimeResolvePlugin {
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        *self.condition
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        self: Vc<Self>,
        fs_path: FileSystemPath,
        _lookup_path: FileSystemPath,
        _reference_type: ReferenceType,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let raw_fs_path = fs_path.clone();
        let modified_path = raw_fs_path.path.replace("next/dist/esm/", "next/dist/");
        let new_path = fs_path.root().await?.join(&modified_path)?;
        Ok(Vc::cell(Some(
            ResolveResult::source(ResolvedVc::upcast(
                FileSource::new(new_path).to_resolved().await?,
            ))
            .resolved_cell(),
        )))
    }
}
