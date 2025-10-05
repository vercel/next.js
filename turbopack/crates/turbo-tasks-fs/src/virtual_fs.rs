use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ValueDefault, ValueToString, Vc};

use super::{FileContent, FileMeta, FileSystem, FileSystemPath, LinkContent};
use crate::RawDirectoryContent;

#[turbo_tasks::value]
pub struct VirtualFileSystem {
    pub name: RcStr,
}

impl VirtualFileSystem {
    /// Creates a new [`Vc<VirtualFileSystem>`].
    ///
    /// NOTE: This function is not a `turbo_tasks::function` to avoid instances
    /// being equivalent identity-wise. This ensures that a
    /// [`FileSystemPath`] created from this [`Vc<VirtualFileSystem>`]
    /// will never be equivalent, nor be interoperable, with a
    /// [`FileSystemPath`] created from another
    /// [`Vc<VirtualFileSystem>`].
    pub fn new() -> Vc<Self> {
        Self::cell(VirtualFileSystem {
            name: rcstr!("virtual file system"),
        })
    }

    /// Creates a new [`Vc<VirtualFileSystem>`] with a name.
    ///
    /// NOTE: This function is not a `turbo_tasks::function` to avoid instances
    /// being equivalent identity-wise. This ensures that a
    /// [`FileSystemPath`] created from this [`Vc<VirtualFileSystem>`]
    /// will never be equivalent, nor be interoperable, with a
    /// [`FileSystemPath`] created from another
    /// [`Vc<VirtualFileSystem>`].
    pub fn new_with_name(name: RcStr) -> Vc<Self> {
        Self::cell(VirtualFileSystem { name })
    }
}

impl ValueDefault for VirtualFileSystem {
    fn value_default() -> Vc<Self> {
        Self::new()
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for VirtualFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: FileSystemPath) -> Result<Vc<FileContent>> {
        bail!("Reading is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn read_link(&self, _fs_path: FileSystemPath) -> Result<Vc<LinkContent>> {
        bail!("Reading is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn raw_read_dir(&self, _fs_path: FileSystemPath) -> Result<Vc<RawDirectoryContent>> {
        bail!("Reading is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPath, _content: Vc<FileContent>) -> Result<Vc<()>> {
        bail!("Writing is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn write_link(&self, _fs_path: FileSystemPath, _target: Vc<LinkContent>) -> Result<Vc<()>> {
        bail!("Writing is not possible on the virtual file system")
    }

    #[turbo_tasks::function]
    fn metadata(&self, _fs_path: FileSystemPath) -> Result<Vc<FileMeta>> {
        bail!("Reading is not possible on the virtual file system")
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for VirtualFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.name.clone())
    }
}
