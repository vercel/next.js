use anyhow::{bail, Result};
use include_dir::{Dir, DirEntry};
use turbo_tasks::{
    primitives::StringVc, CompletionVc, TransientInstance, ValueToString, ValueToStringVc,
};

use crate::{
    DirectoryContent, DirectoryContentVc, DirectoryEntry, File, FileContent, FileContentVc,
    FileMeta, FileMetaVc, FileSystem, FileSystemPathVc, FileSystemVc, LinkContent, LinkContentVc,
};

#[turbo_tasks::value(serialization = "none")]
pub struct EmbeddedFileSystem {
    name: String,
    #[turbo_tasks(trace_ignore)]
    dir: TransientInstance<&'static Dir<'static>>,
}

#[turbo_tasks::value_impl]
impl EmbeddedFileSystemVc {
    #[turbo_tasks::function]
    pub(super) fn new(
        name: String,
        dir: TransientInstance<&'static Dir<'static>>,
    ) -> EmbeddedFileSystemVc {
        EmbeddedFileSystem { name, dir }.cell()
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for EmbeddedFileSystem {
    #[turbo_tasks::function]
    async fn read(&self, path: FileSystemPathVc) -> Result<FileContentVc> {
        let file = match self.dir.get_file(&path.await?.path) {
            Some(file) => file,
            None => return Ok(FileContent::NotFound.cell()),
        };

        Ok(File::from(file.contents()).into())
    }

    #[turbo_tasks::function]
    fn read_link(&self, _path: FileSystemPathVc) -> LinkContentVc {
        LinkContent::NotFound.cell()
    }

    #[turbo_tasks::function]
    async fn read_dir(&self, path: FileSystemPathVc) -> Result<DirectoryContentVc> {
        let path_str = &path.await?.path;
        let dir = match (path_str.as_str(), self.dir.get_dir(path_str)) {
            ("", _) => *self.dir,
            (_, Some(dir)) => dir,
            (_, None) => return Ok(DirectoryContent::NotFound.cell()),
        };

        let entries = dir
            .entries()
            .iter()
            .map(|e| {
                let entry_name = e.path().file_name().unwrap_or_default().to_string_lossy();
                let entry_path = path.join(&entry_name);

                (
                    entry_name.to_string(),
                    match e {
                        DirEntry::Dir(_) => DirectoryEntry::Directory(entry_path),
                        DirEntry::File(_) => DirectoryEntry::File(entry_path),
                    },
                )
            })
            .collect();

        Ok(DirectoryContentVc::new(entries))
    }

    #[turbo_tasks::function]
    fn write(&self, _path: FileSystemPathVc, _content: FileContentVc) -> Result<CompletionVc> {
        bail!("Writing is not possible to the embedded filesystem")
    }

    #[turbo_tasks::function]
    fn write_link(&self, _path: FileSystemPathVc, _target: LinkContentVc) -> Result<CompletionVc> {
        bail!("Writing is not possible to the embedded filesystem")
    }

    #[turbo_tasks::function]
    async fn metadata(&self, path: FileSystemPathVc) -> Result<FileMetaVc> {
        if self.dir.get_entry(&path.await?.path).is_none() {
            bail!("path not found, can't read metadata");
        }

        Ok(FileMeta::default().cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EmbeddedFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(self.name.clone())
    }
}
