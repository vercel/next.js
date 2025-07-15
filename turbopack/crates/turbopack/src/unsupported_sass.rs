//! TODO(WEB-741) Remove this file once Sass is supported.

use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystemPath, glob::Glob};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::ReferenceType,
    resolve::{
        ResolveResultOption,
        parse::Request,
        plugin::{AfterResolvePlugin, AfterResolvePluginCondition},
    },
};

/// Resolve plugins that warns when importing a sass file.
#[turbo_tasks::value]
pub(crate) struct UnsupportedSassResolvePlugin {
    root: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl UnsupportedSassResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: FileSystemPath) -> Vc<Self> {
        UnsupportedSassResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for UnsupportedSassResolvePlugin {
    #[turbo_tasks::function]
    async fn after_resolve_condition(&self) -> Result<Vc<AfterResolvePluginCondition>> {
        Ok(AfterResolvePluginCondition::new(
            self.root.root().owned().await?,
            Glob::new("**/*.{sass,scss}".into()),
        ))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: FileSystemPath,
        lookup_path: FileSystemPath,
        _reference_type: ReferenceType,
        request: ResolvedVc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let extension = fs_path.extension();
        if ["sass", "scss"].contains(&extension) {
            UnsupportedSassModuleIssue {
                file_path: lookup_path,
                request,
            }
            .resolved_cell()
            .emit();
        }

        Ok(ResolveResultOption::none())
    }
}

#[turbo_tasks::value(shared)]
struct UnsupportedSassModuleIssue {
    // TODO(PACK-4879): The `file_path` is incorrect for this issue and we should supply
    // detailed source information.
    file_path: FileSystemPath,
    request: ResolvedVc<Request>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedSassModuleIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Text(
            format!(
                "Unsupported Sass request: {}",
                self.request.await?.request().unwrap_or(rcstr!("N/A"))
            )
            .into(),
        )
        .cell())
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file_path.clone().cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(rcstr!(
                "Turbopack does not yet support importing Sass modules."
            ))
            .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Unsupported.cell()
    }
}
