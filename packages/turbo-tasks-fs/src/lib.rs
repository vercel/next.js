#![feature(trivial_bounds)]

use std::{
    collections::HashMap,
    fmt::Debug,
    fs,
    future::Future,
    io::{self, ErrorKind},
    ops::Add,
    path::Path,
};

use anyhow::Context;
use turbo_tasks::Task;

#[turbo_tasks::value_trait]
#[async_trait::async_trait]
pub trait FileSystem {
    async fn read(&self, fs_path: FileSystemPathRef) -> FileContentRef;
    async fn read_dir(&self, fs_path: FileSystemPathRef) -> DirectoryContentRef;
    async fn write(&self, from: FileSystemPathRef, content: FileContentRef);
}

#[derive(Debug)]
#[turbo_tasks::value(FileSystem)]
pub struct DiskFileSystem {
    pub name: String,
    pub root: String,
    pub invalidators: HashMap<String, String>,
}

#[turbo_tasks::value_impl]
impl DiskFileSystem {
    #[turbo_tasks::constructor(intern)]
    pub fn new(name: String, root: String) -> Self {
        Self {
            name,
            root: root.into(),
            invalidators: HashMap::new(),
        }
    }
}

#[turbo_tasks::value_impl]
#[async_trait::async_trait]
impl FileSystem for DiskFileSystem {
    async fn read(&self, fs_path: FileSystemPathRef) -> FileContentRef {
        let full_path = Path::new(&self.root).join(&fs_path.get().path);
        match fs::read(&full_path) {
            Ok(content) => FileContentRef::new(content),
            Err(_) => FileContentRef::not_found(),
        }
    }
    async fn read_dir(&self, fs_path: FileSystemPathRef) -> DirectoryContentRef {
        let fs_path = fs_path.get();
        let full_path = Path::new(&self.root).join(&fs_path.path);
        let result = fs::read_dir(&full_path)
            .unwrap()
            .map(|res| {
                res.map(|e| {
                    let fs_path = FileSystemPathRef::new(
                        fs_path.fs.clone(),
                        e.path()
                            .strip_prefix(&self.root)
                            .unwrap()
                            .to_str()
                            .unwrap()
                            .to_string(),
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
    async fn write(&self, fs_path: FileSystemPathRef, content: FileContentRef) {
        let full_path = Path::new(&self.root).join(&fs_path.get().path);
        match &*content.get() {
            FileContent::Content(buffer) => {
                fs::write(full_path, buffer)
                    .with_context(|| format!("failed to write to {}", fs_path.get().path))
                    .unwrap();
            }
            FileContent::NotFound => match fs::remove_file(full_path) {
                Ok(_) => {}
                Err(err) if err.kind() == ErrorKind::NotFound => {}
                Err(err) => {
                    panic!("{}", err);
                }
            },
        }
        Task::side_effect();
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
pub struct FileSystemPath {
    pub fs: FileSystemRef,
    pub path: String,
}

#[turbo_tasks::value_impl]
impl FileSystemPath {
    #[turbo_tasks::constructor(intern)]
    pub fn new(fs: FileSystemRef, path: String) -> Self {
        Self { fs, path }
    }
}

#[turbo_tasks::function]
pub async fn rebase(
    fs_path: FileSystemPathRef,
    old_base: FileSystemPathRef,
    new_base: FileSystemPathRef,
) -> FileSystemPathRef {
    let fs_path = &*fs_path.get();
    let old_base = &*old_base.get();
    let new_base = &*new_base.get();
    FileSystemPathRef::new(
        fs_path.fs.clone(),
        [new_base.path.as_str(), &fs_path.path[old_base.path.len()..]].concat(),
    )
}

impl FileSystemPathRef {
    pub fn read(self) -> impl Future<Output = FileContentRef> {
        let this = self.get();
        this.fs.read(self)
    }
    pub fn read_dir(self) -> impl Future<Output = DirectoryContentRef> {
        let this = self.get();
        this.fs.read_dir(self)
    }
    pub fn write(self, content: FileContentRef) -> impl Future<Output = ()> {
        let this = self.get();
        this.fs.write(self, content)
    }
    pub fn rebase(
        fs_path: FileSystemPathRef,
        old_base: FileSystemPathRef,
        new_base: FileSystemPathRef,
    ) -> impl Future<Output = FileSystemPathRef> {
        rebase(fs_path, old_base, new_base)
    }
}

#[derive(PartialEq, Eq)]
#[turbo_tasks::value]
pub enum FileContent {
    Content(Vec<u8>),
    NotFound,
}

#[turbo_tasks::value_impl]
impl FileContent {
    #[turbo_tasks::constructor(compare_enum: Content)]
    pub fn new(buffer: Vec<u8>) -> Self {
        FileContent::Content(buffer)
    }

    pub fn is_content(&self, buffer: &Vec<u8>) -> bool {
        match self {
            FileContent::Content(buf) => buf == buffer,
            _ => false,
        }
    }

    #[turbo_tasks::constructor(compare_enum: NotFound)]
    pub fn not_found() -> Self {
        FileContent::NotFound
    }
}

#[derive(PartialEq, Eq)]
#[turbo_tasks::value]
pub enum DirectoryEntry {
    File(FileSystemPathRef),
    Directory(FileSystemPathRef),
    Other(FileSystemPathRef),
}

#[turbo_tasks::value_impl]
impl DirectoryEntry {
    #[turbo_tasks::constructor(compare_enum: File)]
    pub fn file(file: FileSystemPathRef) -> Self {
        DirectoryEntry::File(file)
    }
    #[turbo_tasks::constructor(compare_enum: Directory)]
    pub fn directory(directory: FileSystemPathRef) -> Self {
        DirectoryEntry::Directory(directory)
    }
    #[turbo_tasks::constructor(compare_enum: Other)]
    pub fn other(other: FileSystemPathRef) -> Self {
        DirectoryEntry::Other(other)
    }
}

#[derive(PartialEq, Eq)]
#[turbo_tasks::value]
pub enum DirectoryContent {
    Entries(Vec<DirectoryEntryRef>),
    NotFound,
}

#[turbo_tasks::value_impl]
impl DirectoryContent {
    #[turbo_tasks::constructor(compare_enum: Entries)]
    pub fn new(entries: Vec<DirectoryEntryRef>) -> Self {
        DirectoryContent::Entries(entries)
    }

    #[turbo_tasks::constructor(compare_enum: NotFound)]
    pub fn not_found() -> Self {
        DirectoryContent::NotFound
    }
}
