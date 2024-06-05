use anyhow::{bail, Result};
use auto_hash_map::AutoMap;
use turbo_tasks::{Completion, RcStr, ValueToString, Vc};

use crate::{
    DirectoryContent, DirectoryEntry, FileContent, FileMeta, FileSystem, FileSystemPath,
    LinkContent,
};

/// A wrapper [FileSystem] which attaches a child [FileSystem] as a
/// "subdirectory" in the given root [FileSystem].
///
/// Caveat: The `child_path` itself is not visible as a directory entry.
#[turbo_tasks::value]
pub struct AttachedFileSystem {
    root_fs: Vc<Box<dyn FileSystem>>,
    // we turn this into a string because creating a FileSystemPath requires the filesystem which
    // we are creating (circular reference)
    child_path: RcStr,
    child_fs: Vc<Box<dyn FileSystem>>,
}

#[turbo_tasks::value_impl]
impl AttachedFileSystem {
    /// Create a new [AttachedFileSystem] which will have the `child_fs` as
    /// an invisible subdirectory of the `child_path`
    #[turbo_tasks::function]
    pub async fn new(
        child_path: Vc<FileSystemPath>,
        child_fs: Vc<Box<dyn FileSystem>>,
    ) -> Result<Vc<Self>> {
        let child_path = child_path.await?;

        Ok(AttachedFileSystem {
            root_fs: child_path.fs,
            child_path: child_path.path.clone(),
            child_fs,
        }
        .cell())
    }

    /// Converts the given [Vc<FileSystemPath>] to a path in this [FileSystem].
    ///
    /// The given path has to be inside of the root [FileSystem], the child
    /// [FileSystem] or this [AttachedFileSystem].
    #[turbo_tasks::function]
    pub async fn convert_path(
        self: Vc<Self>,
        contained_path_vc: Vc<FileSystemPath>,
    ) -> Result<Vc<FileSystemPath>> {
        let contained_path = contained_path_vc.await?;
        let self_fs: Vc<Box<dyn FileSystem>> = Vc::upcast(self);
        let this = self.await?;

        match contained_path.fs {
            // already on this filesystem
            fs if fs == self_fs => Ok(contained_path_vc),
            // in the root filesystem, just need to rebase on this filesystem
            fs if fs == this.root_fs => Ok(self
                .root()
                .resolve()
                .await?
                .join(contained_path.path.clone())),
            // in the child filesystem, so we expand to the full path by appending to child_path
            fs if fs == this.child_fs => Ok(self
                .child_path()
                .resolve()
                .await?
                .join(contained_path.path.clone())),
            _ => bail!(
                "path {} not part of self, the root fs or the child fs",
                contained_path_vc.to_string().await?
            ),
        }
    }

    /// Constructs a [Vc<FileSystemPath>] of the attachment point referencing
    /// this [AttachedFileSystem]
    #[turbo_tasks::function]
    async fn child_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self
            .root()
            .resolve()
            .await?
            .join(self.await?.child_path.clone()))
    }

    /// Resolves the local path of the root or child filesystem from a path
    /// on the [AttachedFileSystem]
    #[turbo_tasks::function]
    pub async fn get_inner_fs_path(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
    ) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let path = path.await?;
        let self_fs: Vc<Box<dyn FileSystem>> = Vc::upcast(self);

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
            this.child_fs
                .root()
                .resolve()
                .await?
                .join(inner_path.into())
        } else {
            this.root_fs.root().resolve().await?.join(path.path.clone())
        })
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for AttachedFileSystem {
    #[turbo_tasks::function]
    fn read(self: Vc<Self>, path: Vc<FileSystemPath>) -> Vc<FileContent> {
        self.get_inner_fs_path(path).read()
    }

    #[turbo_tasks::function]
    fn read_link(self: Vc<Self>, path: Vc<FileSystemPath>) -> Vc<LinkContent> {
        self.get_inner_fs_path(path).read_link()
    }

    #[turbo_tasks::function]
    async fn read_dir(self: Vc<Self>, path: Vc<FileSystemPath>) -> Result<Vc<DirectoryContent>> {
        let dir_content = self.get_inner_fs_path(path).read_dir().await?;
        let entries = match &*dir_content {
            DirectoryContent::Entries(e) => e,
            DirectoryContent::NotFound => return Ok(DirectoryContent::not_found()),
        };

        let mut converted_entries = AutoMap::with_capacity(entries.len());
        for (name, entry) in entries {
            use DirectoryEntry::*;

            let entry = match *entry {
                File(path) => File(self.convert_path(path)),
                Directory(path) => Directory(self.convert_path(path)),
                Symlink(path) => Symlink(self.convert_path(path)),
                Other(path) => Other(self.convert_path(path)),
                Error => Error,
            };

            converted_entries.insert(name.clone(), entry);
        }

        Ok(DirectoryContent::new(converted_entries))
    }

    #[turbo_tasks::function]
    fn track(self: Vc<Self>, path: Vc<FileSystemPath>) -> Vc<Completion> {
        self.get_inner_fs_path(path).track()
    }

    #[turbo_tasks::function]
    fn write(self: Vc<Self>, path: Vc<FileSystemPath>, content: Vc<FileContent>) -> Vc<Completion> {
        self.get_inner_fs_path(path).write(content)
    }

    #[turbo_tasks::function]
    fn write_link(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        target: Vc<LinkContent>,
    ) -> Vc<Completion> {
        self.get_inner_fs_path(path).write_link(target)
    }

    #[turbo_tasks::function]
    fn metadata(self: Vc<Self>, path: Vc<FileSystemPath>) -> Vc<FileMeta> {
        self.get_inner_fs_path(path).metadata()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AttachedFileSystem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        let root_fs_str = self.root_fs.to_string().await?;
        let child_fs_str = self.child_fs.to_string().await?;
        Ok(Vc::cell(
            format!("{}-with-{}", root_fs_str, child_fs_str).into(),
        ))
    }
}
