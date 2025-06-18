use anyhow::{Result, bail};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};

use crate::{FileContent, FileMeta, FileSystem, FileSystemPath, LinkContent, RawDirectoryContent};

/// A wrapper [FileSystem] which attaches a child [FileSystem] as a
/// "subdirectory" in the given root [FileSystem].
///
/// Caveat: The `child_path` itself is not visible as a directory entry.
#[turbo_tasks::value]
pub struct AttachedFileSystem {
    root_fs: ResolvedVc<Box<dyn FileSystem>>,
    // we turn this into a string because creating a FileSystemPath requires the filesystem which
    // we are creating (circular reference)
    child_path: RcStr,
    child_fs: ResolvedVc<Box<dyn FileSystem>>,
}

#[turbo_tasks::value_impl]
impl AttachedFileSystem {
    /// Create a new [AttachedFileSystem] which will have the `child_fs` as
    /// an invisible subdirectory of the `child_path`
    #[turbo_tasks::function]
    pub async fn new(
        child_path: FileSystemPath,
        child_fs: ResolvedVc<Box<dyn FileSystem>>,
    ) -> Result<Vc<Self>> {
        Ok(AttachedFileSystem {
            root_fs: child_path.fs,
            child_path: child_path.path.clone(),
            child_fs,
        }
        .cell())
    }

    /// Converts the given [FileSystemPath] to a path in this [FileSystem].
    ///
    /// The given path has to be inside of the root [FileSystem], the child
    /// [FileSystem] or this [AttachedFileSystem].
    #[turbo_tasks::function]
    pub async fn convert_path(
        self: ResolvedVc<Self>,
        contained_path: FileSystemPath,
    ) -> Result<Vc<FileSystemPath>> {
        let self_fs: ResolvedVc<Box<dyn FileSystem>> = ResolvedVc::upcast(self);
        let this = self.await?;

        match contained_path.fs {
            // already on this filesystem
            fs if fs == self_fs => Ok(contained_path.cell()),
            // in the root filesystem, just need to rebase on this filesystem
            fs if fs == this.root_fs => Ok(self.root().await?.join(&contained_path.path)?.cell()),
            // in the child filesystem, so we expand to the full path by appending to child_path
            fs if fs == this.child_fs => {
                Ok(self.child_path().await?.join(&contained_path.path)?.cell())
            }
            _ => bail!(
                "path {} not part of self, the root fs or the child fs",
                contained_path.value_to_string().await?
            ),
        }
    }

    /// Constructs a [FileSystemPath] of the attachment point referencing
    /// this [AttachedFileSystem]
    #[turbo_tasks::function]
    async fn child_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self.root().await?.join(&self.await?.child_path)?.cell())
    }

    /// Resolves the local path of the root or child filesystem from a path
    /// on the [AttachedFileSystem]
    #[turbo_tasks::function]
    pub async fn get_inner_fs_path(
        self: ResolvedVc<Self>,
        path: FileSystemPath,
    ) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let self_fs: ResolvedVc<Box<dyn FileSystem>> = ResolvedVc::upcast(self);

        if path.fs != self_fs {
            let self_fs_str = self_fs.to_string().await?;
            let path_fs_str = path.fs.to_string().await?;
            bail!(
                "path fs does not match (expected {}, got {})",
                self_fs_str,
                path_fs_str
            )
        }

        let child_path = self.child_path().await?;
        Ok(if let Some(inner_path) = child_path.get_path_to(&path) {
            this.child_fs.root().await?.join(inner_path)?.cell()
        } else {
            this.root_fs.root().await?.join(&path.path)?.cell()
        })
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for AttachedFileSystem {
    #[turbo_tasks::function(fs)]
    async fn read(self: Vc<Self>, path: FileSystemPath) -> Result<Vc<FileContent>> {
        Ok(self.get_inner_fs_path(path).await?.read())
    }

    #[turbo_tasks::function(fs)]
    async fn read_link(self: Vc<Self>, path: FileSystemPath) -> Result<Vc<LinkContent>> {
        Ok(self.get_inner_fs_path(path).await?.read_link())
    }

    #[turbo_tasks::function(fs)]
    async fn raw_read_dir(self: Vc<Self>, path: FileSystemPath) -> Result<Vc<RawDirectoryContent>> {
        Ok(self.get_inner_fs_path(path).await?.raw_read_dir())
    }

    #[turbo_tasks::function(fs)]
    async fn write(
        self: Vc<Self>,
        path: FileSystemPath,
        content: Vc<FileContent>,
    ) -> Result<Vc<()>> {
        Ok(self.get_inner_fs_path(path).await?.write(content))
    }

    #[turbo_tasks::function(fs)]
    async fn write_link(
        self: Vc<Self>,
        path: FileSystemPath,
        target: Vc<LinkContent>,
    ) -> Result<Vc<()>> {
        Ok(self.get_inner_fs_path(path).await?.write_link(target))
    }

    #[turbo_tasks::function]
    async fn metadata(self: Vc<Self>, path: FileSystemPath) -> Result<Vc<FileMeta>> {
        Ok(self.get_inner_fs_path(path).await?.metadata())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AttachedFileSystem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        let root_fs_str = self.root_fs.to_string().await?;
        let child_fs_str = self.child_fs.to_string().await?;
        Ok(Vc::cell(
            format!("{root_fs_str}-with-{child_fs_str}").into(),
        ))
    }
}
