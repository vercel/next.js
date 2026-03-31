use anyhow::{Result, bail};
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::{
    FileContent, FileMeta, FileSystem, FileSystemPath, LinkContent, RawDirectoryContent,
};

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("root-of-the-server")]
pub struct ServerFileSystem {}

#[turbo_tasks::value_impl]
impl ServerFileSystem {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        Self::cell(ServerFileSystem {})
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for ServerFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: FileSystemPath) -> Result<Vc<FileContent>> {
        bail!("Reading is not possible from the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn read_link(&self, _fs_path: FileSystemPath) -> Result<Vc<LinkContent>> {
        bail!("Reading is not possible from the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn raw_read_dir(&self, _fs_path: FileSystemPath) -> Result<Vc<RawDirectoryContent>> {
        bail!("Reading is not possible from the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPath, _content: Vc<FileContent>) -> Result<Vc<()>> {
        bail!("Writing is not possible to the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn write_link(&self, _fs_path: FileSystemPath, _target: Vc<LinkContent>) -> Result<Vc<()>> {
        bail!("Writing is not possible to the marker filesystem for the server")
    }

    #[turbo_tasks::function]
    fn metadata(&self, _fs_path: FileSystemPath) -> Result<Vc<FileMeta>> {
        bail!("Reading is not possible from the marker filesystem for the server")
    }
}
