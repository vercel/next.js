use anyhow::Result;
use lazy_static::lazy_static;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};
use turbopack_core::{
    diagnostics::DiagnosticExt,
    file_source::FileSource,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::ReferenceType,
    resolve::{
        parse::Request,
        plugin::{
            AfterResolvePlugin, AfterResolvePluginCondition, BeforeResolvePlugin,
            BeforeResolvePluginCondition,
        },
        ExternalTraced, ExternalType, ResolveResult, ResolveResultItem, ResolveResultOption,
    },
};

use crate::{next_server::ServerContextType, next_telemetry::ModuleFeatureTelemetry};

lazy_static! {
    // Set of the features we want to track, following existing references in webpack/plugins/telemetry-plugin.
    static ref FEATURE_MODULES: FxHashMap<&'static str, Vec<&'static str>> = FxHashMap::from_iter([
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

#[turbo_tasks::value(shared)]
pub struct InvalidImportModuleIssue {
    pub file_path: ResolvedVc<FileSystemPath>,
    pub messages: Vec<RcStr>,
    pub skip_context_message: bool,
}

#[turbo_tasks::value_impl]
impl Issue for InvalidImportModuleIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.into()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Resolve.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Invalid import".into()).cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        let raw_context = &*self.file_path.await?;

        let mut messages = self.messages.clone();

        if !self.skip_context_message {
            //[TODO]: how do we get the import trace?
            messages
                .push(format!("The error was caused by importing '{}'", raw_context.path).into());
        }

        Ok(Vc::cell(Some(
            StyledString::Line(
                messages
                    .iter()
                    .map(|v| StyledString::Text(format!("{}\n", v).into()))
                    .collect::<Vec<StyledString>>(),
            )
            .resolved_cell(),
        )))
    }
}

/// A resolver plugin emits an error when specific context imports
/// specified import requests. It doesn't detect if the import is correctly
/// alised or not unlike webpack-config does; Instead it should be correctly
/// configured when each context sets up its resolve options.
#[turbo_tasks::value]
pub(crate) struct InvalidImportResolvePlugin {
    root: ResolvedVc<FileSystemPath>,
    invalid_import: RcStr,
    message: Vec<RcStr>,
}

#[turbo_tasks::value_impl]
impl InvalidImportResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(
        root: ResolvedVc<FileSystemPath>,
        invalid_import: RcStr,
        message: Vec<RcStr>,
    ) -> Vc<Self> {
        InvalidImportResolvePlugin {
            root,
            invalid_import,
            message,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for InvalidImportResolvePlugin {
    #[turbo_tasks::function]
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        BeforeResolvePluginCondition::from_modules(Vc::cell(vec![self.invalid_import.clone()]))
    }

    #[turbo_tasks::function]
    fn before_resolve(
        &self,
        lookup_path: ResolvedVc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        _request: Vc<Request>,
    ) -> Vc<ResolveResultOption> {
        InvalidImportModuleIssue {
            file_path: lookup_path,
            messages: self.message.clone(),
            // styled-jsx specific resolve error has its own message
            skip_context_message: self.invalid_import == "styled-jsx",
        }
        .resolved_cell()
        .emit();

        ResolveResultOption::some(
            ResolveResult::primary(ResolveResultItem::Error(ResolvedVc::cell(
                self.message.join("\n").into(),
            )))
            .cell(),
        )
    }
}

/// Returns a resolve plugin if context have imports to `client-only`.
/// Only the contexts that alises `client-only` to
/// `next/dist/compiled/client-only/error` should use this.
pub(crate) fn get_invalid_client_only_resolve_plugin(
    root: ResolvedVc<FileSystemPath>,
) -> Vc<InvalidImportResolvePlugin> {
    InvalidImportResolvePlugin::new(
        *root,
        "client-only".into(),
        vec![
            "'client-only' cannot be imported from a Server Component module. It should only be \
             used from a Client Component."
                .into(),
        ],
    )
}

/// Returns a resolve plugin if context have imports to `server-only`.
/// Only the contexts that alises `server-only` to
/// `next/dist/compiled/server-only/index` should use this.
pub(crate) fn get_invalid_server_only_resolve_plugin(
    root: ResolvedVc<FileSystemPath>,
) -> Vc<InvalidImportResolvePlugin> {
    InvalidImportResolvePlugin::new(
        *root,
        "server-only".into(),
        vec![
            "'server-only' cannot be imported from a Client Component module. It should only be \
             used from a Server Component."
                .into(),
        ],
    )
}

/// Returns a resolve plugin if context have imports to `styled-jsx`.
pub(crate) fn get_invalid_styled_jsx_resolve_plugin(
    root: ResolvedVc<FileSystemPath>,
) -> Vc<InvalidImportResolvePlugin> {
    InvalidImportResolvePlugin::new(
        *root,
        "styled-jsx".into(),
        vec![
            "'client-only' cannot be imported from a Server Component module. It should only be \
             used from a Client Component."
                .into(),
            "The error was caused by using 'styled-jsx'. It only works in a Client Component but \
             none of its parents are marked with \"use client\", so they're Server Components by \
             default."
                .into(),
        ],
    )
}

#[turbo_tasks::value]
pub(crate) struct NextExternalResolvePlugin {
    project_path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextExternalResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(project_path: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        NextExternalResolvePlugin { project_path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for NextExternalResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        AfterResolvePluginCondition::new(
            self.project_path.root(),
            Glob::new("**/next/dist/**/*.{external,runtime.dev,runtime.prod}.js".into()),
        )
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: Vc<FileSystemPath>,
        _lookup_path: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let path = fs_path.await?.path.to_string();
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
            })
            .resolved_cell(),
        )))
    }
}

#[turbo_tasks::value]
pub(crate) struct NextNodeSharedRuntimeResolvePlugin {
    root: ResolvedVc<FileSystemPath>,
    server_context_type: ServerContextType,
}

#[turbo_tasks::value_impl]
impl NextNodeSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(
        root: ResolvedVc<FileSystemPath>,
        server_context_type: Value<ServerContextType>,
    ) -> Vc<Self> {
        let server_context_type = server_context_type.into_value();
        NextNodeSharedRuntimeResolvePlugin {
            root,
            server_context_type,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for NextNodeSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        AfterResolvePluginCondition::new(
            self.root.root(),
            Glob::new("**/next/dist/**/*.shared-runtime.js".into()),
        )
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: Vc<FileSystemPath>,
        _lookup_path: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let stem = fs_path.file_stem().await?;
        let stem = stem.as_deref().unwrap_or_default();
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

        let raw_fs_path = &*fs_path.await?;
        let path = raw_fs_path.path.to_string();

        // Find the starting index of 'next/dist' and slice from that point. It should
        // always be found since the glob pattern above is specific enough.
        let starting_index = path.find("next/dist").unwrap();

        let (base, _) = path.split_at(starting_index);

        let new_path = fs_path
            .root()
            .join(format!("{base}/{resource_request}").into());

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
    root: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl ModuleFeatureReportResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        ModuleFeatureReportResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for ModuleFeatureReportResolvePlugin {
    #[turbo_tasks::function]
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        BeforeResolvePluginCondition::from_modules(Vc::cell(
            FEATURE_MODULES
                .keys()
                .map(|k| (*k).into())
                .collect::<Vec<RcStr>>(),
        ))
    }

    #[turbo_tasks::function]
    async fn before_resolve(
        &self,
        _lookup_path: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        if let Request::Module {
            module,
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
                    ModuleFeatureTelemetry::new(format!("{}{}", module, sub_path).into(), 1)
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
    root: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl NextSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        NextSharedRuntimeResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for NextSharedRuntimeResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        AfterResolvePluginCondition::new(
            self.root.root(),
            Glob::new("**/next/dist/esm/**/*.shared-runtime.js".into()),
        )
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: Vc<FileSystemPath>,
        _lookup_path: Vc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        _request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let raw_fs_path = &*fs_path.await?;
        let modified_path = raw_fs_path.path.replace("next/dist/esm/", "next/dist/");
        let new_path = fs_path.root().join(modified_path.into());
        Ok(Vc::cell(Some(
            ResolveResult::source(ResolvedVc::upcast(
                FileSource::new(new_path).to_resolved().await?,
            ))
            .resolved_cell(),
        )))
    }
}
