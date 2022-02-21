#![feature(trivial_bounds)]
#![feature(hash_drain_filter)]
#![feature(into_future)]

mod invalidator_map;

use std::{
    fmt::{self, Debug},
    fs,
    io::{self, ErrorKind},
    path::{Path, PathBuf, MAIN_SEPARATOR},
    sync::{mpsc::channel, Arc, Mutex},
    thread,
    time::Duration,
};

use anyhow::Context;
use async_std::task::block_on;
use invalidator_map::InvalidatorMap;
use notify::{watcher, DebouncedEvent, RecommendedWatcher, RecursiveMode, Watcher};
use threadpool::ThreadPool;
use turbo_tasks::Task;

#[turbo_tasks::value_trait]
pub trait FileSystem {
    fn read(&self, fs_path: FileSystemPathRef) -> FileContentRef;
    fn read_dir(&self, fs_path: FileSystemPathRef) -> DirectoryContentRef;
    fn parent_path(&self, fs_path: FileSystemPathRef) -> FileSystemPathRef;
    fn write(&self, from: FileSystemPathRef, content: FileContentRef);
}

#[turbo_tasks::value(FileSystem)]
pub struct DiskFileSystem {
    pub name: String,
    pub root: String,
    #[trace_ignore]
    invalidators: Arc<InvalidatorMap>,
    #[trace_ignore]
    dir_invalidators: Arc<InvalidatorMap>,
    #[trace_ignore]
    #[allow(dead_code)] // it's never read, but reference is kept for Drop
    watcher: RecommendedWatcher,
    #[trace_ignore]
    pool: Mutex<ThreadPool>,
}

fn path_to_key(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
}

#[turbo_tasks::value_impl]
impl DiskFileSystem {
    #[turbo_tasks::constructor(intern)]
    pub fn new(name: String, root: String) -> Self {
        let pool = Mutex::new(ThreadPool::new(30));
        let mut invalidators = Arc::new(InvalidatorMap::new());
        let mut dir_invalidators = Arc::new(InvalidatorMap::new());
        // Create a channel to receive the events.
        let (tx, rx) = channel();
        // Create a watcher object, delivering debounced events.
        // The notification back-end is selected based on the platform.
        let mut watcher = watcher(tx, Duration::from_millis(20)).unwrap();
        // Add a path to be watched. All files and directories at that path and
        // below will be monitored for changes.
        watcher
            .watch(root.clone(), RecursiveMode::Recursive)
            .unwrap();

        let instance = Self {
            name,
            root: root.clone(),
            invalidators: invalidators.clone(),
            dir_invalidators: dir_invalidators.clone(),
            watcher,
            pool,
        };
        thread::spawn(move || {
            fn invalidate_path(invalidators: &mut Arc<InvalidatorMap>, path: &Path) {
                if let Some(invalidator) = invalidators.lock().unwrap().remove(&path_to_key(path)) {
                    invalidator.invalidate()
                }
            }
            fn invalidate_path_and_children(invalidators: &mut Arc<InvalidatorMap>, path: &Path) {
                let path_key = path_to_key(path);
                for (_, invalidator) in invalidators
                    .lock()
                    .unwrap()
                    .drain_filter(|key, _| key.starts_with(&path_key))
                {
                    invalidator.invalidate()
                }
            }
            loop {
                let event = rx.recv();
                match event {
                    Ok(DebouncedEvent::Write(path)) => {
                        invalidate_path(&mut invalidators, path.as_path());
                    }
                    Ok(DebouncedEvent::Create(path)) | Ok(DebouncedEvent::Remove(path)) => {
                        invalidate_path_and_children(&mut invalidators, path.as_path());
                        invalidate_path_and_children(&mut dir_invalidators, path.as_path());
                        if let Some(parent) = path.parent() {
                            invalidate_path(&mut dir_invalidators, parent);
                        }
                    }
                    Ok(DebouncedEvent::Rename(source, destination)) => {
                        invalidate_path_and_children(&mut invalidators, source.as_path());
                        if let Some(parent) = source.parent() {
                            invalidate_path_and_children(&mut dir_invalidators, parent);
                        }
                        invalidate_path_and_children(&mut invalidators, destination.as_path());
                        if let Some(parent) = destination.parent() {
                            invalidate_path_and_children(&mut dir_invalidators, parent);
                        }
                    }
                    Ok(DebouncedEvent::Rescan) => {
                        invalidate_path_and_children(
                            &mut invalidators,
                            PathBuf::from(&root).as_path(),
                        );
                        invalidate_path_and_children(
                            &mut dir_invalidators,
                            PathBuf::from(&root).as_path(),
                        );
                    }
                    Ok(DebouncedEvent::Error(err, path)) => {
                        println!("watch error ({:?}): {:?} ", path, err);
                        match path {
                            Some(path) => {
                                invalidate_path_and_children(&mut invalidators, path.as_path());
                                invalidate_path_and_children(&mut dir_invalidators, path.as_path());
                            }
                            None => {
                                invalidate_path_and_children(
                                    &mut invalidators,
                                    PathBuf::from(&root).as_path(),
                                );
                                invalidate_path_and_children(
                                    &mut dir_invalidators,
                                    PathBuf::from(&root).as_path(),
                                );
                            }
                        }
                    }
                    Ok(DebouncedEvent::Chmod(_))
                    | Ok(DebouncedEvent::NoticeRemove(_))
                    | Ok(DebouncedEvent::NoticeWrite(_)) => {
                        // ignored
                    }
                    Err(_) => {
                        // Sender has been disconnected
                        // which means DiskFileSystem has been dropped
                        // exit thread
                        break;
                    }
                }
            }
        });
        instance
    }

    async fn execute<T: Send + 'static>(&self, func: impl FnOnce() -> T + Send + 'static) -> T {
        let (tx, rx) = async_std::channel::bounded(1);
        {
            self.pool.lock().unwrap().execute(move || {
                block_on(tx.send(func())).unwrap();
            });
        }
        rx.recv().await.unwrap()
    }
}

impl fmt::Debug for DiskFileSystem {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "name: {}, root: {}", self.name, self.root)
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for DiskFileSystem {
    async fn read(&self, fs_path: FileSystemPathRef) -> FileContentRef {
        let full_path = Path::new(&self.root).join(
            &fs_path
                .get()
                .await
                .path
                .replace("/", &MAIN_SEPARATOR.to_string()),
        );
        {
            let invalidator = Task::get_invalidator();
            self.invalidators
                .insert(path_to_key(full_path.as_path()), invalidator);
        }
        match self.execute(move || fs::read(&full_path)).await {
            Ok(content) => FileContent::new(content),
            Err(_) => FileContent::not_found(),
        }
        .into()
    }
    async fn read_dir(&self, fs_path: FileSystemPathRef) -> DirectoryContentRef {
        let fs_path = fs_path.await;
        let full_path =
            Path::new(&self.root).join(&fs_path.path.replace("/", &MAIN_SEPARATOR.to_string()));
        {
            let invalidator = Task::get_invalidator();
            self.dir_invalidators
                .insert(path_to_key(full_path.as_path()), invalidator);
        }
        let result = self
            .execute(move || fs::read_dir(&full_path).unwrap())
            .await
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
        let full_path = Path::new(&self.root).join(
            &fs_path
                .get()
                .await
                .path
                .replace("/", &MAIN_SEPARATOR.to_string()),
        );
        let content = content.await;
        let old_content = fs_path.read().await;
        if *content != *old_content {
            self.execute(move || match &*content {
                FileContent::Content(buffer) => {
                    // println!("write {} bytes to {}", buffer.len(), full_path.display());
                    fs::write(full_path.clone(), buffer)
                        .with_context(|| format!("failed to write to {}", full_path.display()))
                        .unwrap();
                }
                FileContent::NotFound => {
                    // println!("remove {}", full_path.display());
                    match fs::remove_file(full_path) {
                        Ok(_) => {}
                        Err(err) if err.kind() == ErrorKind::NotFound => {}
                        Err(err) => {
                            panic!("{}", err);
                        }
                    }
                }
            })
            .await
        }
    }
    async fn parent_path(&self, fs_path: FileSystemPathRef) -> FileSystemPathRef {
        let fs_path = fs_path.await;
        let mut p: String = fs_path.path.clone();
        match str::rfind(&p, '/') {
            Some(index) => p.replace_range(index.., ""),
            None => p.clear(),
        }
        FileSystemPathRef::new(fs_path.fs.clone(), p)
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
    let fs_path = &*fs_path.await;
    let old_base = &*old_base.await;
    let new_base = &*new_base.await;
    FileSystemPathRef::new(
        new_base.fs.clone(),
        [new_base.path.as_str(), &fs_path.path[old_base.path.len()..]].concat(),
    )
}

#[turbo_tasks::value_impl]
impl FileSystemPathRef {
    pub async fn read(self) -> FileContentRef {
        let this = self.get().await;
        this.fs.read(self)
    }

    pub async fn read_dir(self) -> DirectoryContentRef {
        let this = self.get().await;
        this.fs.read_dir(self)
    }

    pub async fn write(self, content: FileContentRef) {
        let this = self.get().await;
        this.fs.write(self, content)
    }

    pub async fn parent(self) -> FileSystemPathRef {
        let this = self.get().await;
        this.fs.parent_path(self)
    }
}

impl FileSystemPathRef {
    pub fn rebase(
        fs_path: FileSystemPathRef,
        old_base: FileSystemPathRef,
        new_base: FileSystemPathRef,
    ) -> FileSystemPathRef {
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
