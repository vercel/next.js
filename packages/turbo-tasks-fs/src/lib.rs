use std::{fs, path::Path};

#[turbo_tasks::value_trait]
#[async_trait::async_trait]
pub trait FileSystem {
    async fn read(&self, path: PathInFileSystemRef) -> FileContentRef;
}

#[derive(Debug)]
#[turbo_tasks::value(FileSystem)]
pub struct DiskFileSystem {
    pub name: String,
    pub root: String,
}

#[turbo_tasks::value_impl]
impl DiskFileSystem {
    #[turbo_tasks::constructor]
    pub fn new(name: String, root: String) -> Self {
        Self {
            name,
            root: root.into(),
        }
    }
}

#[turbo_tasks::value_impl]
#[async_trait::async_trait]
impl FileSystem for DiskFileSystem {
    async fn read(&self, path: PathInFileSystemRef) -> FileContentRef {
        let full_path = Path::new(&self.root).join(&path.get().path);
        FileContentRef::new(fs::read(&full_path).unwrap())
    }
}

#[turbo_tasks::value]
pub struct PathInFileSystem {
    pub path: String,
}

#[turbo_tasks::value_impl]
impl PathInFileSystem {
    #[turbo_tasks::constructor]
    pub fn new(path: String) -> Self {
        Self { path }
    }
}

#[turbo_tasks::value]
pub struct FileSystemPath {
    pub fs: FileSystemRef,
    pub path: PathInFileSystemRef,
}

#[turbo_tasks::value_impl]
impl FileSystemPath {
    #[turbo_tasks::constructor]
    pub fn new(fs: FileSystemRef, path: PathInFileSystemRef) -> Self {
        Self { fs, path }
    }
}

#[turbo_tasks::function]
pub async fn read(path: FileSystemPathRef) -> FileContentRef {
    let path = &*path.get();
    path.fs.read(path.path.clone()).await
}

#[turbo_tasks::value]
pub struct FileContent {
    pub buffer: Vec<u8>,
}

#[turbo_tasks::value_impl]
impl FileContent {
    #[turbo_tasks::constructor(!intern)]
    pub fn new(buffer: Vec<u8>) -> Self {
        Self { buffer }
    }
}
