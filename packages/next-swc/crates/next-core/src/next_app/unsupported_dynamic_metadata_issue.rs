use anyhow::Result;
use turbo_tasks::{TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::{
    core::issue::{Issue, IssueSeverity},
    ecmascript::utils::FormatIter,
};

#[turbo_tasks::value(shared)]
pub struct UnsupportedDynamicMetadataIssue {
    pub app_dir: Vc<FileSystemPath>,
    pub files: Vec<Vc<FileSystemPath>>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedDynamicMetadataIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("unsupported".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.app_dir
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        Vc::cell(
            "Dynamic metadata from filesystem is currently not supported in Turbopack".to_string(),
        )
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        let mut files = self
            .files
            .iter()
            .map(|file| file.to_string())
            .try_join()
            .await?;
        files.sort();
        Ok(Vc::cell(format!(
            "The following files were found in the app directory, but are not supported by \
             Turbopack. They are ignored:\n{}",
            FormatIter(|| files.iter().flat_map(|file| vec!["\n- ", file]))
        )))
    }
}
