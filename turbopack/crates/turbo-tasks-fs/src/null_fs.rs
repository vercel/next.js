//! [`NullFileSystem`], a filesystem where every path is empty/not-found.

use turbo_rcstr::rcstr;
use turbo_tasks::{ValueToString, Vc};

use crate::{
    FileContent, FileMeta, FileSystem, FileSystemPath, LinkContent, RawDirectoryContent,
    WriteLinkContent,
};

#[derive(ValueToString)]
#[value_to_string("null")]
#[turbo_tasks::value(shared)]
pub struct NullFileSystem;

#[turbo_tasks::value_impl]
impl FileSystem for NullFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: FileSystemPath) -> Vc<FileContent> {
        FileContent::NotFound.cell()
    }

    #[turbo_tasks::function]
    fn read_link(&self, _fs_path: FileSystemPath) -> Vc<LinkContent> {
        LinkContent::Invalid {
            reason: rcstr!("the filesystem does not support symbolic links"),
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn is_junction_point(&self, _fs_path: FileSystemPath) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    fn raw_read_dir(&self, _fs_path: FileSystemPath) -> Vc<RawDirectoryContent> {
        RawDirectoryContent::not_found()
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPath, _content: Vc<FileContent>) {}

    #[turbo_tasks::function]
    fn write_link(&self, _fs_path: FileSystemPath, _target: Vc<WriteLinkContent>) {}

    #[turbo_tasks::function]
    fn metadata(&self, _fs_path: FileSystemPath) -> Vc<FileMeta> {
        FileMeta::default().cell()
    }
}
