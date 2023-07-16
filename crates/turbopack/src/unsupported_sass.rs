//! TODO(WEB-741) Remove this file once Sass is supported.

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::{glob::Glob, FileSystemPath};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity},
    resolve::{
        parse::Request,
        plugin::{ResolvePlugin, ResolvePluginCondition},
        ResolveResultOption,
    },
};

/// Resolve plugins that warns when importing a sass file.
#[turbo_tasks::value]
pub(crate) struct UnsupportedSassResolvePlugin {
    root: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl UnsupportedSassResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>) -> Vc<Self> {
        UnsupportedSassResolvePlugin { root }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for UnsupportedSassResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<ResolvePluginCondition> {
        ResolvePluginCondition::new(self.root.root(), Glob::new("**/*.{sass,scss}".to_string()))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: Vc<FileSystemPath>,
        context: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let extension = fs_path.extension().await?;
        if ["sass", "scss"].iter().any(|ext| ext == &*extension) {
            UnsupportedSassModuleIssue { context, request }
                .cell()
                .emit();
        }

        Ok(ResolveResultOption::none())
    }
}

#[turbo_tasks::value(shared)]
struct UnsupportedSassModuleIssue {
    context: Vc<FileSystemPath>,
    request: Vc<Request>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedSassModuleIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("resolve".to_string())
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "Unsupported Sass request: {}",
            self.request.await?.request().as_deref().unwrap_or("N/A")
        )))
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.context
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        Vc::cell("Turbopack does not yet support importing Sass modules.".to_string())
    }
}
