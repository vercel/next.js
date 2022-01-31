use std::{fmt::Debug, fs, io, path::Path};

#[turbo_tasks::value_trait]
#[async_trait::async_trait]
pub trait FileSystem {
    async fn read(&self, path: PathInFileSystemRef) -> FileContentRef;
    async fn read_dir(&self, fs: FileSystemRef, path: PathInFileSystemRef) -> DirectoryContentRef;
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
        match fs::read(&full_path) {
            Ok(content) => FileContentRef::new(content),
            Err(_) => FileContentRef::not_found(),
        }
    }
    async fn read_dir(&self, fs: FileSystemRef, path: PathInFileSystemRef) -> DirectoryContentRef {
        let full_path = Path::new(&self.root).join(&path.get().path);
        let result = fs::read_dir(&full_path)
            .unwrap()
            .map(|res| {
                res.map(|e| {
                    let fs_path = FileSystemPathRef::new(
                        fs.clone(),
                        PathInFileSystemRef::new(
                            e.path()
                                .strip_prefix(&self.root)
                                .unwrap()
                                .to_str()
                                .unwrap()
                                .to_string(),
                        ),
                    );
                    let file_type = e.file_type().unwrap();
                    if file_type.is_file() {
                        DirectoryEntryRef::file(fs_path)
                    } else if file_type.is_dir() {
                        DirectoryEntryRef::directory(fs_path)
                    } else {
                        DirectoryEntryRef::other(fs_path)
                    }
                })
            })
            .collect::<Result<Vec<_>, io::Error>>()
            .unwrap();
        DirectoryContentRef::new(result)
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

impl FileSystemPathRef {
    pub async fn read(&self) -> FileContentRef {
        let this = &*self.get();
        this.fs.read(this.path.clone()).await
    }
    pub async fn read_dir(&self) -> DirectoryContentRef {
        let this = &*self.get();
        this.fs.read_dir(this.fs.clone(), this.path.clone()).await
    }
}

impl Debug for FileSystemPath {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FileSystemPath")
            .field("fs", &self.fs)
            .field("path", &self.path.get().path)
            .finish()
    }
}

#[turbo_tasks::value]
pub enum FileContent {
    Content(Vec<u8>),
    NotFound,
}

#[turbo_tasks::value_impl]
impl FileContent {
    #[turbo_tasks::constructor(!intern)]
    pub fn new(buffer: Vec<u8>) -> Self {
        FileContent::Content(buffer)
    }

    #[turbo_tasks::constructor]
    pub fn not_found() -> Self {
        FileContent::NotFound
    }
}

#[turbo_tasks::value]
pub enum DirectoryEntry {
    File(FileSystemPathRef),
    Directory(FileSystemPathRef),
    Other(FileSystemPathRef),
}

#[turbo_tasks::value_impl]
impl DirectoryEntry {
    #[turbo_tasks::constructor(!intern)]
    pub fn file(file: FileSystemPathRef) -> Self {
        DirectoryEntry::File(file)
    }
    #[turbo_tasks::constructor(!intern)]
    pub fn directory(directory: FileSystemPathRef) -> Self {
        DirectoryEntry::Directory(directory)
    }
    #[turbo_tasks::constructor(!intern)]
    pub fn other(other: FileSystemPathRef) -> Self {
        DirectoryEntry::Other(other)
    }
}

#[turbo_tasks::value]
pub enum DirectoryContent {
    Entries(Vec<DirectoryEntryRef>),
    NotFound,
}

#[turbo_tasks::value_impl]
impl DirectoryContent {
    #[turbo_tasks::constructor(!intern)]
    pub fn new(entries: Vec<DirectoryEntryRef>) -> Self {
        DirectoryContent::Entries(entries)
    }

    #[turbo_tasks::constructor]
    pub fn not_found() -> Self {
        DirectoryContent::NotFound
    }
}
