use anyhow::{bail, Result};
use auto_hash_map::AutoMap;
use include_dir::{Dir, DirEntry};
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ValueToString, Vc};

use crate::{
    File, FileContent, FileMeta, FileSystem, FileSystemPath, LinkContent, RawDirectoryContent,
    RawDirectoryEntry,
};

#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
pub struct EmbeddedFileSystem {
    name: RcStr,
    #[turbo_tasks(trace_ignore)]
    dir: &'static Dir<'static>,
}

impl EmbeddedFileSystem {
    pub(super) fn new(name: RcStr, dir: &'static Dir<'static>) -> Vc<EmbeddedFileSystem> {
        EmbeddedFileSystem { name, dir }.cell()
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for EmbeddedFileSystem {
    #[turbo_tasks::function]
    async fn read(&self, path: Vc<FileSystemPath>) -> Result<Vc<FileContent>> {
        let file = match self.dir.get_file(&path.await?.path) {
            Some(file) => file,
            None => return Ok(FileContent::NotFound.cell()),
        };

        Ok(File::from(file.contents()).into())
    }

    #[turbo_tasks::function]
    fn read_link(&self, _path: Vc<FileSystemPath>) -> Vc<LinkContent> {
        LinkContent::NotFound.cell()
    }

    #[turbo_tasks::function]
    async fn raw_read_dir(&self, path: Vc<FileSystemPath>) -> Result<Vc<RawDirectoryContent>> {
        let path_str = &path.await?.path;
        let dir = match (path_str.as_str(), self.dir.get_dir(path_str)) {
            ("", _) => self.dir,
            (_, Some(dir)) => dir,
            (_, None) => return Ok(RawDirectoryContent::NotFound.cell()),
        };

        let mut converted_entries = AutoMap::new();
        for e in dir.entries() {
            let entry_name: RcStr = e
                .path()
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into();

            converted_entries.insert(
                entry_name,
                match e {
                    DirEntry::Dir(_) => RawDirectoryEntry::Directory,
                    DirEntry::File(_) => RawDirectoryEntry::File,
                },
            );
        }

        Ok(RawDirectoryContent::new(converted_entries))
    }

    #[turbo_tasks::function]
    fn track(&self, _path: Vc<FileSystemPath>) -> Vc<Completion> {
        Completion::immutable()
    }

    #[turbo_tasks::function]
    fn write(&self, _path: Vc<FileSystemPath>, _content: Vc<FileContent>) -> Result<Vc<()>> {
        bail!("Writing is not possible to the embedded filesystem")
    }

    #[turbo_tasks::function]
    fn write_link(&self, _path: Vc<FileSystemPath>, _target: Vc<LinkContent>) -> Result<Vc<()>> {
        bail!("Writing is not possible to the embedded filesystem")
    }

    #[turbo_tasks::function]
    async fn metadata(&self, path: Vc<FileSystemPath>) -> Result<Vc<FileMeta>> {
        if self.dir.get_entry(&path.await?.path).is_none() {
            bail!("path not found, can't read metadata");
        }

        Ok(FileMeta::default().cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EmbeddedFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.name.clone())
    }
}
