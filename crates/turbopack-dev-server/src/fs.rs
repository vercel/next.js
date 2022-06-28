use anyhow::{anyhow, Result};
use turbo_tasks::{primitives::StringVc, CompletionVc};
use turbo_tasks_fs::{
    DirectoryContentVc, FileContentVc, FileSystem, FileSystemPathVc, FileSystemVc,
};

#[turbo_tasks::value(FileSystem)]
pub struct DevServerFileSystem {}

#[turbo_tasks::value_impl]
impl DevServerFileSystemVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        Self::slot(DevServerFileSystem {})
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
    async fn parent_path(&self, fs_path: FileSystemPathVc) -> Result<FileSystemPathVc> {
        let fs_path_value = fs_path.await?;
        if fs_path_value.path.is_empty() {
            return Ok(fs_path);
        }
        let mut p: String = fs_path_value.path.clone();
        match str::rfind(&p, '/') {
            Some(index) => p.replace_range(index.., ""),
            None => p.clear(),
        }
        Ok(FileSystemPathVc::new(fs_path_value.fs, &p))
    }

    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::slot("root of the dev server".to_string())
    }
}
