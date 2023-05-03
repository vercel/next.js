//! TODO(WEB-741) Remove this file once Sass is supported.

use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::{glob::GlobVc, FileSystemPathVc};
use turbopack_core::{
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    resolve::{
        parse::RequestVc,
        plugin::{ResolvePlugin, ResolvePluginConditionVc, ResolvePluginVc},
        ResolveResultOptionVc,
    },
};

/// Resolve plugins that warns when importing a sass file.
#[turbo_tasks::value]
pub(crate) struct UnsupportedSassResolvePlugin {
    root: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl UnsupportedSassResolvePluginVc {
    #[turbo_tasks::function]
    pub fn new(root: FileSystemPathVc) -> Self {
        UnsupportedSassResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for UnsupportedSassResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> ResolvePluginConditionVc {
        ResolvePluginConditionVc::new(self.root.root(), GlobVc::new("**/*.{sass,scss}"))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: FileSystemPathVc,
        context: FileSystemPathVc,
        request: RequestVc,
    ) -> Result<ResolveResultOptionVc> {
        let extension = fs_path.extension().await?;
        if ["sass", "scss"].iter().any(|ext| ext == &*extension) {
            UnsupportedSassModuleIssue { context, request }
                .cell()
                .as_issue()
                .emit();
        }

        Ok(ResolveResultOptionVc::none())
    }
}

#[turbo_tasks::value(shared)]
struct UnsupportedSassModuleIssue {
    context: FileSystemPathVc,
    request: RequestVc,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedSassModuleIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("resolve".to_string())
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "Unsupported Sass request: {}",
            self.request.await?.request().as_deref().unwrap_or("N/A")
        )))
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        StringVc::cell("Turbopack does not yet support importing Sass modules.".to_string())
    }
}
