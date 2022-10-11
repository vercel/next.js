use anyhow::{anyhow, Result};
use turbo_tasks::{primitives::StringVc, CompletionVc};
use turbo_tasks_fs::{
    DirectoryContentVc, FileContentVc, FileSystem, FileSystemPathVc, FileSystemVc,
};

#[turbo_tasks::value]
pub struct DevServerFileSystem {}

#[turbo_tasks::value_impl]
impl DevServerFileSystemVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        Self::cell(DevServerFileSystem {})
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for DevServerFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: FileSystemPathVc) -> Result<FileContentVc> {
        Err(anyhow!(
            "Reading is not possible from the virtual filesystem for the dev server"
        ))
    }

    #[turbo_tasks::function]
    fn read_dir(&self, _fs_path: FileSystemPathVc) -> Result<DirectoryContentVc> {
        Err(anyhow!(
            "Reading is not possible from the virtual filesystem for the dev server"
        ))
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPathVc, _content: FileContentVc) -> Result<CompletionVc> {
        Err(anyhow!(
            "Writing is not possible to the virtual filesystem for the dev server"
        ))
    }

    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell("root of the dev server".to_string())
    }
}
