use anyhow::{bail, Result};
use turbo_tasks::{primitives::StringVc, CompletionVc, ValueToString, ValueToStringVc};

use super::{
    DirectoryContentVc, FileContentVc, FileMetaVc, FileSystem, FileSystemPathVc, FileSystemVc,
    LinkContentVc,
};

#[turbo_tasks::value]
pub struct VirtualFileSystem;

impl VirtualFileSystemVc {
    /// Creates a new [`VirtualFileSystemVc`].
    ///
    /// NOTE: This function is not a `turbo_tasks::function` to avoid instances
    /// being equivalent identity-wise. This ensures that a [`FileSystemPathVc`]
    /// created from this [`VirtualFileSystemVc`] will never be equivalent,
    /// nor be interoperable, with a [`FileSystemPathVc`] created from another
    /// [`VirtualFileSystemVc`].
    pub fn new() -> Self {
        Self::cell(VirtualFileSystem)
    }
}

impl Default for VirtualFileSystemVc {
    fn default() -> Self {
        Self::new()
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for VirtualFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: FileSystemPathVc) -> Result<FileContentVc> {
        bail!("Reading is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn read_link(&self, _fs_path: FileSystemPathVc) -> Result<LinkContentVc> {
        bail!("Reading is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn read_dir(&self, _fs_path: FileSystemPathVc) -> Result<DirectoryContentVc> {
        bail!("Reading is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn track(&self, _fs_path: FileSystemPathVc) -> Result<CompletionVc> {
        bail!("Tracking is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPathVc, _content: FileContentVc) -> Result<CompletionVc> {
        bail!("Writing is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn write_link(
        &self,
        _fs_path: FileSystemPathVc,
        _target: LinkContentVc,
    ) -> Result<CompletionVc> {
        bail!("Writing is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn metadata(&self, _fs_path: FileSystemPathVc) -> Result<FileMetaVc> {
        bail!("Reading is not possible on the virtual file system")
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for VirtualFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell("virtual file system".to_string())
    }
}
