use anyhow::{bail, Result};
use turbo_tasks::{primitives::StringVc, CompletionVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{
    DirectoryContentVc, FileContentVc, FileMetaVc, FileSystem, FileSystemPathVc, FileSystemVc,
    LinkContentVc,
};

#[turbo_tasks::value]
pub struct ServerFileSystem {}

#[turbo_tasks::value_impl]
impl ServerFileSystemVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        Self::cell(ServerFileSystem {})
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for ServerFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: FileSystemPathVc) -> Result<FileContentVc> {
        bail!("Reading is not possible from the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn read_link(&self, _fs_path: FileSystemPathVc) -> Result<LinkContentVc> {
        bail!("Reading is not possible from the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn read_dir(&self, _fs_path: FileSystemPathVc) -> Result<DirectoryContentVc> {
        bail!("Reading is not possible from the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPathVc, _content: FileContentVc) -> Result<CompletionVc> {
        bail!("Writing is not possible to the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn write_link(
        &self,
        _fs_path: FileSystemPathVc,
        _target: LinkContentVc,
    ) -> Result<CompletionVc> {
        bail!("Writing is not possible to the marker filesystem for the  server")
    }

    #[turbo_tasks::function]
    fn metadata(&self, _fs_path: FileSystemPathVc) -> Result<FileMetaVc> {
        bail!("Reading is not possible from the marker filesystem for the  server")
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ServerFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell("root of the server".to_string())
    }
}
