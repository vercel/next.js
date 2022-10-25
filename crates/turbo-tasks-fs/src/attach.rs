use std::collections::HashMap;

use anyhow::{bail, Result};
use turbo_tasks::{primitives::StringVc, CompletionVc, ValueToString, ValueToStringVc};

use crate::{
    DirectoryContent, DirectoryContentVc, DirectoryEntry, FileContentVc, FileMetaVc, FileSystem,
    FileSystemPathVc, FileSystemVc, LinkContentVc,
};

/// A wrapper [FileSystem] which attaches a child [FileSystem] as a
/// "subdirectory" in the given root [FileSystem].
///
/// Caveat: The `child_path` itself is not visible as a directory entry.
#[turbo_tasks::value]
pub struct AttachedFileSystem {
    root_fs: FileSystemVc,
    // we turn this into a string because creating a FileSystemPath requires the filesystem which
    // we are creating (circular reference)
    child_path: String,
    child_fs: FileSystemVc,
}

#[turbo_tasks::value_impl]
impl AttachedFileSystemVc {
    /// Create a new [AttachedFileSystem] which will have the `child_fs` as
    /// an invisible subdirectory of the `child_path`
    #[turbo_tasks::function]
    pub async fn new(child_path: FileSystemPathVc, child_fs: FileSystemVc) -> Result<Self> {
        let child_path = child_path.await?;

        Ok(AttachedFileSystem {
            root_fs: child_path.fs,
            child_path: child_path.path.clone(),
            child_fs,
        }
        .cell())
    }

    /// Converts the given [FileSystemPathVc] to a path in this [FileSystem].
    ///
    /// The given path has to be inside of the root [FileSystem], the child
    /// [FileSystem] or this [AttachedFileSystem].
    #[turbo_tasks::function]
    pub async fn convert_path(
        self,
        contained_path_vc: FileSystemPathVc,
    ) -> Result<FileSystemPathVc> {
        let contained_path = contained_path_vc.await?;
        let self_fs: FileSystemVc = self.into();
        let this = self.await?;

        match contained_path.fs {
            // already on this filesystem
            fs if fs == self_fs => Ok(contained_path_vc),
            // in the root filesystem, just need to rebase on this filesystem
            fs if fs == this.root_fs => Ok(self.root().join(&contained_path.path)),
            // in the child filesystem, so we expand to the full path by appending to child_path
            fs if fs == this.child_fs => Ok(self.child_path().join(&contained_path.path)),
            _ => bail!(
                "path {} not part of self, the root fs or the child fs",
                contained_path_vc.to_string().await?
            ),
        }
    }

    /// Constructs a [FileSystemPathVc] of the attachment point referencing this
    /// [AttachedFileSystem]
    #[turbo_tasks::function]
    async fn child_path(self) -> Result<FileSystemPathVc> {
        Ok(self.root().join(&self.await?.child_path))
    }

    /// Resolves the local path of the root or child filesystem from a path
    /// on the [AttachedFileSystem]
    #[turbo_tasks::function]
    pub async fn get_inner_fs_path(self, path: FileSystemPathVc) -> Result<FileSystemPathVc> {
        let this = self.await?;
        let path = path.await?;
        let self_fs: FileSystemVc = self.into();

        if path.fs != self_fs {
            bail!(
                "path fs does not match (expected {}, got {})",
                self_fs.to_string().await?,
                path.fs.to_string().await?
            )
        }

        let child_path = self.child_path().await?;
        Ok(if let Some(inner_path) = child_path.get_path_to(&path) {
            this.child_fs.root().join(inner_path)
        } else {
            this.root_fs.root().join(&path.path)
        })
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for AttachedFileSystem {
    #[turbo_tasks::function]
    fn read(self_vc: AttachedFileSystemVc, path: FileSystemPathVc) -> FileContentVc {
        self_vc.get_inner_fs_path(path).read()
    }

    #[turbo_tasks::function]
    fn read_link(self_vc: AttachedFileSystemVc, path: FileSystemPathVc) -> LinkContentVc {
        self_vc.get_inner_fs_path(path).read_link()
    }

    #[turbo_tasks::function]
    async fn read_dir(
        self_vc: AttachedFileSystemVc,
        path: FileSystemPathVc,
    ) -> Result<DirectoryContentVc> {
        let dir_content = self_vc.get_inner_fs_path(path).read_dir().await?;
        let entries = match &*dir_content {
            DirectoryContent::Entries(e) => e,
            DirectoryContent::NotFound => return Ok(DirectoryContentVc::not_found()),
        };

        let mut converted_entries = HashMap::with_capacity(entries.len());
        for (name, entry) in entries {
            use DirectoryEntry::*;

            let entry = match *entry {
                File(path) => File(self_vc.convert_path(path)),
                Directory(path) => Directory(self_vc.convert_path(path)),
                Symlink(path) => Symlink(self_vc.convert_path(path)),
                Other(path) => Other(self_vc.convert_path(path)),
                Error => Error,
            };

            converted_entries.insert(name.clone(), entry);
        }

        Ok(DirectoryContentVc::new(converted_entries))
    }

    #[turbo_tasks::function]
    fn write(
        self_vc: AttachedFileSystemVc,
        path: FileSystemPathVc,
        content: FileContentVc,
    ) -> CompletionVc {
        self_vc.get_inner_fs_path(path).write(content)
    }

    #[turbo_tasks::function]
    fn write_link(
        self_vc: AttachedFileSystemVc,
        path: FileSystemPathVc,
        target: LinkContentVc,
    ) -> CompletionVc {
        self_vc.get_inner_fs_path(path).write_link(target)
    }

    #[turbo_tasks::function]
    fn metadata(self_vc: AttachedFileSystemVc, path: FileSystemPathVc) -> FileMetaVc {
        self_vc.get_inner_fs_path(path).metadata()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AttachedFileSystem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{}-with-{}",
            self.root_fs.to_string().await?,
            self.child_fs.to_string().await?
        )))
    }
}
