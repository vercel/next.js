//! TODO(WEB-741) Remove this file once Sass is supported.

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::ReferenceType,
    resolve::{
        parse::Request,
        plugin::{AfterResolvePlugin, AfterResolvePluginCondition},
        ResolveResultOption,
    },
};

/// Resolve plugins that warns when importing a sass file.
#[turbo_tasks::value]
pub(crate) struct UnsupportedSassResolvePlugin {
    root: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl UnsupportedSassResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        UnsupportedSassResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for UnsupportedSassResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        AfterResolvePluginCondition::new(self.root.root(), Glob::new("**/*.{sass,scss}".into()))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: ResolvedVc<FileSystemPath>,
        lookup_path: ResolvedVc<FileSystemPath>,
        _reference_type: Value<ReferenceType>,
        request: ResolvedVc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let extension = fs_path.extension().await?;
        if ["sass", "scss"].iter().any(|ext| *ext == &**extension) {
            UnsupportedSassModuleIssue {
                file_path: lookup_path,
                request,
            }
            .cell()
            .emit();
        }

        Ok(ResolveResultOption::none())
    }
}

#[turbo_tasks::value(shared)]
struct UnsupportedSassModuleIssue {
    file_path: ResolvedVc<FileSystemPath>,
    request: ResolvedVc<Request>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedSassModuleIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Text(
            format!(
                "Unsupported Sass request: {}",
                self.request.await?.request().as_deref().unwrap_or("N/A")
            )
            .into(),
        )
        .cell())
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text("Turbopack does not yet support importing Sass modules.".into())
                .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Unsupported.cell()
    }
}
