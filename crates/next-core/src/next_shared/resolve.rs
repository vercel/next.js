use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    file_source::FileSource,
    issue::{Issue, IssueSeverity, IssueStage, StyledString},
    reference_type::ReferenceType,
    resolve::{
        ExternalTraced, ExternalType, ResolveResult, ResolveResultItem, ResolveResultOption,
        parse::Request,
        plugin::{AfterResolvePlugin, AfterResolvePluginCondition},
    },
};

use crate::next_server::ServerContextType;

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
