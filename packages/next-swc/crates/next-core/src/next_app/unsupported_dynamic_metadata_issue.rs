use anyhow::Result;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_binding::turbopack::{
    core::issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    ecmascript::utils::FormatIter,
};

#[turbo_tasks::value(shared)]
pub struct UnsupportedDynamicMetadataIssue {
    pub app_dir: FileSystemPathVc,
    pub files: Vec<FileSystemPathVc>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedDynamicMetadataIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("unsupported".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.app_dir
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell(
            "Dynamic metadata from filesystem is currently not supported in Turbopack".to_string(),
        )
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        let mut files = self
            .files
            .iter()
            .map(|file| file.to_string())
            .try_join()
            .await?;
        files.sort();
        Ok(StringVc::cell(format!(
            "The following files were found in the app directory, but are not supported by \
             Turbopack. They are ignored:\n{}",
            FormatIter(|| files.iter().flat_map(|file| vec!["\n- ", file]))
        )))
    }
}
