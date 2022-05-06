#![feature(trivial_bounds)]
#![feature(hash_drain_filter)]
#![feature(into_future)]
#![feature(iter_advance_by)]

pub mod glob;
mod invalidator_map;
mod read_glob;
pub mod util;

use read_glob::read_glob;
pub use read_glob::{ReadGlobResult, ReadGlobResultVc};
use serde::{Deserialize, Serialize};

use std::{
    collections::{HashMap, HashSet},
    fmt::{self, Debug, Display},
    fs::{self, create_dir_all},
    io::{ErrorKind, Read, Write},
    mem::take,
    path::{Path, PathBuf, MAIN_SEPARATOR},
    sync::{
        mpsc::{channel, RecvError, TryRecvError},
        Arc, Mutex, MutexGuard,
    },
    thread::{self, sleep},
    time::Duration,
};

use anyhow::{anyhow, bail, Context, Result};
use async_std::task::block_on;
use glob::GlobVc;
use invalidator_map::InvalidatorMap;
use json::{parse, JsonValue};
use notify::{watcher, DebouncedEvent, RecommendedWatcher, RecursiveMode, Watcher};
use threadpool::ThreadPool;
use turbo_tasks::{trace::TraceRawVcs, CompletionVc, Invalidator, ValueToString, Vc};
use util::{join_path, normalize_path};

#[turbo_tasks::value_trait]
pub trait FileSystem {
    fn read(&self, fs_path: FileSystemPathVc) -> FileContentVc;
    fn read_dir(&self, fs_path: FileSystemPathVc) -> DirectoryContentVc;
    fn parent_path(&self, fs_path: FileSystemPathVc) -> FileSystemPathVc;
    fn write(&self, fs_path: FileSystemPathVc, content: FileContentVc) -> CompletionVc;
    fn to_string(&self) -> Vc<String>;
}

#[turbo_tasks::value(slot: new, serialization: none, FileSystem)]
pub struct DiskFileSystem {
    pub name: String,
    pub root: String,
    #[trace_ignore]
    invalidators: Arc<InvalidatorMap>,
    #[trace_ignore]
    dir_invalidators: Arc<InvalidatorMap>,
    #[trace_ignore]
    #[allow(dead_code)] // it's never read, but reference is kept for Drop
    watcher: Mutex<Option<RecommendedWatcher>>,
    #[trace_ignore]
    pool: Mutex<ThreadPool>,
}

impl DiskFileSystem {
    pub fn start_watching(&self) -> Result<()> {
        let mut watcher_guard = self.watcher.lock().unwrap();
        if watcher_guard.is_some() {
            return Ok(());
        }
        let invalidators = self.invalidators.clone();
        let dir_invalidators = self.dir_invalidators.clone();
        let root = self.root.clone();
        // Create a channel to receive the events.
        let (tx, rx) = channel();
        println!("start watcher {}...", root);
        // Create a watcher object, delivering debounced events.
        // The notification back-end is selected based on the platform.
        let mut watcher = watcher(tx, Duration::from_millis(1))?;
        // Add a path to be watched. All files and directories at that path and
        // below will be monitored for changes.
        watcher.watch(&root, RecursiveMode::Recursive)?;

        println!("watching {}...", root);

        // We need to invalidate all reads that happened before watching
        // Best is to start_watching before starting to read
        for (_, invalidator) in take(&mut *invalidators.lock().unwrap()).into_iter() {
            invalidator.invalidate();
        }
        for (_, invalidator) in take(&mut *dir_invalidators.lock().unwrap()).into_iter() {
            invalidator.invalidate();
        }

        watcher_guard.replace(watcher);

        thread::spawn(move || {
            let mut batched_invalidate_path = HashSet::new();
            let mut batched_invalidate_path_dir = HashSet::new();
            let mut batched_invalidate_path_and_children = HashSet::new();
            let mut batched_invalidate_path_and_children_dir = HashSet::new();

            'outer: loop {
                let mut event = rx.recv().map_err(|e| match e {
                    RecvError => TryRecvError::Disconnected,
                });
                loop {
                    match event {
                        Ok(DebouncedEvent::Write(path)) => {
                            batched_invalidate_path.insert(path_to_key(&path));
                        }
                        Ok(DebouncedEvent::Create(path)) | Ok(DebouncedEvent::Remove(path)) => {
                            batched_invalidate_path_and_children.insert(path_to_key(&path));
                            batched_invalidate_path_and_children_dir.insert(path_to_key(&path));
                            if let Some(parent) = path.parent() {
                                batched_invalidate_path_dir.insert(path_to_key(&parent));
                            }
                        }
                        Ok(DebouncedEvent::Rename(source, destination)) => {
                            batched_invalidate_path_and_children.insert(path_to_key(&source));
                            if let Some(parent) = source.parent() {
                                batched_invalidate_path_dir.insert(path_to_key(&parent));
                            }
                            batched_invalidate_path_and_children.insert(path_to_key(&destination));
                            if let Some(parent) = destination.parent() {
                                batched_invalidate_path_dir.insert(path_to_key(&parent));
                            }
                        }
                        Ok(DebouncedEvent::Rescan) => {
                            batched_invalidate_path_and_children
                                .insert(path_to_key(&PathBuf::from(&root)));
                            batched_invalidate_path_and_children_dir
                                .insert(path_to_key(&PathBuf::from(&root)));
                        }
                        Ok(DebouncedEvent::Error(err, path)) => {
                            println!("watch error ({:?}): {:?} ", path, err);
                            match path {
                                Some(path) => {
                                    batched_invalidate_path_and_children.insert(path_to_key(&path));
                                    batched_invalidate_path_and_children_dir
                                        .insert(path_to_key(&path));
                                }
                                None => {
                                    batched_invalidate_path_and_children
                                        .insert(path_to_key(&PathBuf::from(&root)));
                                    batched_invalidate_path_and_children_dir
                                        .insert(path_to_key(&PathBuf::from(&root)));
                                }
                            }
                        }
                        Ok(DebouncedEvent::Chmod(_))
                        | Ok(DebouncedEvent::NoticeRemove(_))
                        | Ok(DebouncedEvent::NoticeWrite(_)) => {
                            // ignored
                        }
                        Err(TryRecvError::Disconnected) => {
                            // Sender has been disconnected
                            // which means DiskFileSystem has been dropped
                            // exit thread
                            break 'outer;
                        }
                        Err(TryRecvError::Empty) => {
                            break;
                        }
                    }
                    event = rx.try_recv();
                }
                fn invalidate_path(
                    invalidators: &mut MutexGuard<HashMap<String, Invalidator>>,
                    paths: impl Iterator<Item = String>,
                ) {
                    for path in paths {
                        if let Some(invalidator) = invalidators.remove(&path) {
                            invalidator.invalidate()
                        }
                    }
                }
                fn invalidate_path_and_children_execute(
                    invalidators: &mut MutexGuard<HashMap<String, Invalidator>>,
                    paths: &mut HashSet<String>,
                ) {
                    for (_, invalidator) in invalidators.drain_filter(|key, _| {
                        paths.iter().any(|path_key| key.starts_with(path_key))
                    }) {
                        invalidator.invalidate()
                    }
                    paths.clear()
                }
                {
                    let mut invalidators = invalidators.lock().unwrap();
                    invalidate_path(&mut invalidators, batched_invalidate_path.drain());
                    invalidate_path_and_children_execute(
                        &mut invalidators,
                        &mut batched_invalidate_path_and_children,
                    );
                }
                {
                    let mut dir_invalidators = dir_invalidators.lock().unwrap();
                    invalidate_path(&mut dir_invalidators, batched_invalidate_path_dir.drain());
                    invalidate_path_and_children_execute(
                        &mut dir_invalidators,
                        &mut batched_invalidate_path_and_children,
                    );
                }
            }
        });
        Ok(())
    }

    pub fn stop_watching(&self) {
        if let Some(watcher) = self.watcher.lock().unwrap().take() {
            drop(watcher);
            // thread will detect the stop because the channel is disconnected
        }
    }
}

fn path_to_key(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
}

#[turbo_tasks::value_impl]
impl DiskFileSystemVc {
    #[turbo_tasks::function]
    pub fn new(name: String, root: String) -> Result<Self> {
        let pool = Mutex::new(ThreadPool::new(30));
        // create the directory for the filesystem on disk, if it doesn't exist
        create_dir_all(&root)?;

        let instance = DiskFileSystem {
            name,
            root,
            invalidators: Arc::new(InvalidatorMap::new()),
            dir_invalidators: Arc::new(InvalidatorMap::new()),
            watcher: Mutex::new(None),
            pool,
        };

        Ok(Self::slot(instance))
    }
}

impl DiskFileSystem {
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

fn with_retry<T>(func: impl Fn() -> Result<T, std::io::Error>) -> Result<T, std::io::Error> {
    fn can_retry(err: &std::io::Error) -> bool {
        matches!(
            err.kind(),
            ErrorKind::PermissionDenied | ErrorKind::WouldBlock
        )
    }
    let mut result = func();
    if let Err(e) = &result {
        if can_retry(e) {
            for i in 0..10 {
                sleep(Duration::from_millis(10 + i * 100));
                result = func();
                match &result {
                    Ok(_) => break,
                    Err(e) => {
                        if !can_retry(e) {
                            break;
                        }
                    }
                }
            }
        }
    }
    result
}

impl fmt::Debug for DiskFileSystem {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "name: {}, root: {}", self.name, self.root)
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for DiskFileSystem {
    #[turbo_tasks::function]
    async fn read(&self, fs_path: FileSystemPathVc) -> Result<FileContentVc> {
        let full_path = Path::new(&self.root).join(
            &fs_path
                .await?
                .path
                .replace("/", &MAIN_SEPARATOR.to_string()),
        );
        {
            let invalidator = turbo_tasks::get_invalidator();
            self.invalidators
                .insert(path_to_key(full_path.as_path()), invalidator);
        }
        Ok(match self
            .execute(move || with_retry(move || File::from_path(&full_path)))
            .await
        {
            Ok(file) => FileContent::new(file),
            Err(_) => FileContent::NotFound,
        }
        .into())
    }
    #[turbo_tasks::function]
    async fn read_dir(&self, fs_path: FileSystemPathVc) -> Result<DirectoryContentVc> {
        let fs_path = fs_path.await?;
        let full_path =
            Path::new(&self.root).join(&fs_path.path.replace("/", &MAIN_SEPARATOR.to_string()));
        {
            let invalidator = turbo_tasks::get_invalidator();
            self.dir_invalidators
                .insert(path_to_key(full_path.as_path()), invalidator);
        }
        let result = self
            .execute({
                let full_path = full_path.clone();
                move || with_retry(move || fs::read_dir(&full_path))
            })
            .await;
        Ok(match result {
            Ok(res) => DirectoryContentVc::new(
                res.filter_map(|e| -> Option<Result<(String, DirectoryEntry)>> {
                    match e {
                        Ok(e) => {
                            let path = e.path();
                            let filename = path.file_name()?.to_str()?.to_string();
                            let path_to_root = path.strip_prefix(&self.root).ok()?.to_str()?;
                            let path_to_root = if MAIN_SEPARATOR != '/' {
                                path_to_root.replace(MAIN_SEPARATOR, "/")
                            } else {
                                path_to_root.to_string()
                            };
                            Some(Ok((filename, {
                                let fs_path = FileSystemPathVc::new(fs_path.fs, &path_to_root);
                                let file_type = match e.file_type() {
                                    Err(e) => {
                                        return Some(Err(e.into()));
                                    }
                                    Ok(t) => t,
                                };
                                if file_type.is_file() {
                                    DirectoryEntry::File(fs_path).into()
                                } else if file_type.is_dir() {
                                    DirectoryEntry::Directory(fs_path).into()
                                } else {
                                    DirectoryEntry::Other(fs_path).into()
                                }
                            })))
                        }
                        Err(err) => Some(Err::<_, anyhow::Error>(err.into()).context(anyhow!(
                            "Error reading directory item in {}",
                            full_path.display()
                        ))),
                    }
                })
                .collect::<Result<HashMap<String, _>>>()?,
            ),
            Err(_) => DirectoryContentVc::not_found(),
        })
    }
    #[turbo_tasks::function]
    #[allow(unreachable_code)]
    async fn write(
        &self,
        fs_path: FileSystemPathVc,
        content: FileContentVc,
    ) -> Result<CompletionVc> {
        let full_path = Path::new(&self.root).join(
            &fs_path
                .await?
                .path
                .replace("/", &MAIN_SEPARATOR.to_string()),
        );
        let content = content.await?;
        let old_content = fs_path.read().await?;
        if *content != *old_content {
            let create_directory = *old_content == FileContent::NotFound;
            self.execute(move || match &*content {
                FileContent::Content(file) => {
                    if create_directory {
                        if let Some(parent) = full_path.parent() {
                            with_retry(move || fs::create_dir_all(parent)).with_context(|| {
                                format!(
                                    "failed to create directory {} for write to {}",
                                    parent.display(),
                                    full_path.display()
                                )
                            })?;
                        }
                    }
                    // println!("write {} bytes to {}", buffer.len(), full_path.display());
                    with_retry(|| {
                        fs::File::create(&full_path)
                            .and_then(|mut f| f.write_all(&file.content))
                            .and_then(|_| {
                                #[cfg(target_family = "unix")]
                                {
                                    return fs::set_permissions(
                                        &full_path,
                                        file.meta.permissions.into(),
                                    );
                                }
                                return Ok(());
                            })
                    })
                    .with_context(|| format!("failed to write to {}", full_path.display()))
                }
                FileContent::NotFound => {
                    // println!("remove {}", full_path.display());
                    with_retry(|| fs::remove_file(&full_path)).or_else(|err| {
                        if err.kind() == ErrorKind::NotFound {
                            Ok(())
                        } else {
                            Err(err).context(anyhow!("removing {} failed", full_path.display()))
                        }
                    })
                }
            })
            .await?;
        }
        Ok(CompletionVc::new())
    }
    #[turbo_tasks::function]
    async fn parent_path(&self, fs_path: FileSystemPathVc) -> Result<FileSystemPathVc> {
        let fs_path_value = fs_path.await?;
        if fs_path_value.path.is_empty() {
            return Ok(fs_path);
        }
        let mut p: String = fs_path_value.path.clone();
        match str::rfind(&p, '/') {
            Some(index) => p.replace_range(index.., ""),
            None => p.clear(),
        }
        Ok(FileSystemPathVc::new(fs_path_value.fs, &p))
    }
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<String> {
        Vc::slot(self.name.clone())
    }
}

#[turbo_tasks::value]
#[derive(Debug, PartialEq, Eq)]
pub struct FileSystemPath {
    pub fs: FileSystemVc,
    pub path: String,
}

impl FileSystemPath {
    pub fn is_inside(&self, context: &FileSystemPath) -> bool {
        self.fs == context.fs && self.path.starts_with(&context.path)
    }

    pub fn is_root(&self) -> bool {
        self.path.is_empty()
    }

    pub fn get_path_to<'a>(&self, inner: &'a FileSystemPath) -> Option<&'a str> {
        if self.fs != inner.fs {
            return None;
        }
        let path = inner.path.strip_prefix(&self.path)?;
        if self.path.is_empty() {
            Some(path)
        } else if path.starts_with('/') {
            Some(&path[1..])
        } else {
            None
        }
    }

    pub fn get_relative_path_to(&self, other: &FileSystemPath) -> Option<String> {
        if self.fs != other.fs {
            return None;
        }
        let mut self_segments = self.path.split('/').peekable();
        let mut other_segments = other.path.split('/').peekable();
        while self_segments.peek() == other_segments.peek() {
            self_segments.next();
            if other_segments.next().is_none() {
                return Some(".".to_string());
            }
        }
        let mut result = Vec::new();
        if self_segments.peek().is_none() {
            result.push(".");
        } else {
            while self_segments.next().is_some() {
                result.push("..");
            }
        }
        while let Some(segment) = other_segments.next() {
            result.push(segment);
        }
        Some(result.join("/"))
    }
}

#[turbo_tasks::value_impl]
impl FileSystemPathVc {
    #[turbo_tasks::function]
    pub fn new(fs: FileSystemVc, path: &str) -> Result<Self> {
        if let Some(path) = normalize_path(path) {
            Ok(FileSystemPathVc::new_normalized(fs, path))
        } else {
            bail!(
                "FileSystemPathVc::new(fs, \"{}\") leaves the filesystem root",
                path
            );
        }
    }

    #[turbo_tasks::function]
    pub fn new_normalized(fs: FileSystemVc, path: String) -> Self {
        Self::slot(FileSystemPath { fs, path })
    }

    #[turbo_tasks::function]
    pub async fn join(self, path: &str) -> Result<Self> {
        let this = self.await?;
        if let Some(path) = join_path(&this.path, path) {
            Ok(Self::new_normalized(this.fs, path))
        } else {
            bail!(
                "FileSystemPathVc(\"{}\").join(\"{}\") leaves the filesystem root",
                this.path,
                path
            );
        }
    }

    #[turbo_tasks::function]
    pub async fn try_join(self, path: &str) -> Result<Vc<Option<Self>>> {
        let this = self.await?;
        if let Some(path) = join_path(&this.path, path) {
            Ok(Vc::slot(Some(Self::new_normalized(this.fs, path))))
        } else {
            Ok(Vc::slot(None))
        }
    }

    #[turbo_tasks::function]
    pub async fn try_join_inside(self, path: &str) -> Result<Vc<Option<Self>>> {
        let this = self.await?;
        if let Some(path) = join_path(&this.path, path) {
            if path.starts_with(&this.path) {
                return Ok(Vc::slot(Some(Self::new_normalized(this.fs, path))));
            }
        }
        Ok(Vc::slot(None))
    }

    #[turbo_tasks::function]
    pub async fn read_glob(self, glob: GlobVc, include_dot_files: bool) -> ReadGlobResultVc {
        read_glob(self, glob, include_dot_files)
    }

    #[turbo_tasks::function]
    pub async fn root(self) -> Result<Self> {
        let fs = self.await?.fs;
        Ok(Self::new_normalized(fs, "".to_string()))
    }

    #[turbo_tasks::function]
    pub async fn fs(self) -> Result<FileSystemVc> {
        Ok(self.await?.fs)
    }
}

impl Display for FileSystemPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.path)
    }
}

#[turbo_tasks::function]
pub async fn rebase(
    fs_path: FileSystemPathVc,
    old_base: FileSystemPathVc,
    new_base: FileSystemPathVc,
) -> Result<FileSystemPathVc> {
    let fs_path = &*fs_path.await?;
    let old_base = &*old_base.await?;
    let new_base = &*new_base.await?;
    let new_path;
    if old_base.path.is_empty() {
        if new_base.path.is_empty() {
            new_path = fs_path.path.clone();
        } else {
            new_path = [new_base.path.as_str(), "/", &fs_path.path].concat();
        }
    } else {
        let base_path = [&old_base.path, "/"].concat();
        if !fs_path.path.starts_with(&base_path) {
            bail!(
                "rebasing {} from {} onto {} doesn't work because it's not part of the source path",
                fs_path.to_string(),
                old_base.to_string(),
                new_base.to_string()
            );
        }
        if new_base.path.is_empty() {
            new_path = [&fs_path.path[base_path.len()..]].concat();
        } else {
            new_path = [new_base.path.as_str(), &fs_path.path[old_base.path.len()..]].concat();
        }
    }
    Ok(FileSystemPathVc::new(new_base.fs, &new_path))
}

#[turbo_tasks::value_impl]
impl FileSystemPathVc {
    #[turbo_tasks::function]
    pub async fn read(self) -> Result<FileContentVc> {
        let this = self.await?;
        Ok(this.fs.read(self))
    }

    #[turbo_tasks::function]
    pub async fn read_json(self) -> Result<FileJsonContentVc> {
        let this = self.await?;
        Ok(this.fs.read(self).parse_json())
    }

    #[turbo_tasks::function]
    pub async fn read_dir(self) -> Result<DirectoryContentVc> {
        let this = self.await?;
        Ok(this.fs.read_dir(self))
    }

    #[turbo_tasks::function]
    pub async fn write(self, content: FileContentVc) -> Result<CompletionVc> {
        let this = self.await?;
        Ok(this.fs.write(self, content))
    }

    #[turbo_tasks::function]
    pub async fn parent(self) -> Result<FileSystemPathVc> {
        let this = self.await?;
        Ok(this.fs.parent_path(self))
    }

    #[turbo_tasks::function]
    pub async fn get_type(self) -> Result<Vc<FileSystemEntryType>> {
        let this = self.await?;
        if this.is_root() {
            return Ok(Vc::slot(FileSystemEntryType::Directory));
        }
        let dir_content = this.fs.read_dir(self.parent()).await?;
        match &*dir_content {
            DirectoryContent::NotFound => Ok(Vc::slot(FileSystemEntryType::NotFound)),
            DirectoryContent::Entries(entries) => {
                let basename = if let Some(i) = this.path.rfind('/') {
                    &this.path[i + 1..]
                } else {
                    &this.path
                };
                if let Some(entry) = entries.get(basename) {
                    Ok(Vc::slot(entry.into()))
                } else {
                    Ok(Vc::slot(FileSystemEntryType::NotFound))
                }
            }
        }
    }
}

impl FileSystemPathVc {
    pub fn rebase(
        fs_path: FileSystemPathVc,
        old_base: FileSystemPathVc,
        new_base: FileSystemPathVc,
    ) -> FileSystemPathVc {
        rebase(fs_path, old_base, new_base)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for FileSystemPath {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "[{}]/{}",
            self.fs.to_string().await?,
            self.path
        )))
    }
}

#[derive(PartialEq, Eq, Clone, Copy, Debug)]
#[turbo_tasks::value(shared)]
pub enum Permissions {
    Readable,
    Writable,
    Executable,
}

impl Default for Permissions {
    fn default() -> Self {
        Self::Readable
    }
}

#[cfg(target_family = "unix")]
impl From<Permissions> for fs::Permissions {
    fn from(perm: Permissions) -> Self {
        use std::os::unix::fs::PermissionsExt;
        match perm {
            Permissions::Readable => fs::Permissions::from_mode(0o444),
            Permissions::Writable => fs::Permissions::from_mode(0o664),
            Permissions::Executable => fs::Permissions::from_mode(0o755),
        }
    }
}

#[derive(PartialEq, Eq)]
#[turbo_tasks::value(shared)]
pub enum FileContent {
    Content(File),
    NotFound,
}

#[derive(PartialEq, Eq)]
#[turbo_tasks::value(shared)]
pub struct File {
    meta: FileMeta,
    content: Vec<u8>,
}

impl File {
    pub fn from_path(p: &PathBuf) -> Result<Self, std::io::Error> {
        #[cfg(unix)]
        {
            fs::File::open(p).and_then(|mut f| {
                f.metadata().and_then(|meta| {
                    let mut output = Vec::with_capacity(meta.len() as usize);
                    f.read_to_end(&mut output).map(move |_| File {
                        meta: meta.into(),
                        content: output,
                    })
                })
            })
        }
        #[cfg(not(unix))]
        {
            fs::read(p).map(|output| File {
                meta: Default::default(),
                content: output,
            })
        }
    }
}

impl File {
    pub fn new(meta: FileMeta, content: Vec<u8>) -> Self {
        Self { meta, content }
    }

    pub fn meta(&self) -> &FileMeta {
        &self.meta
    }

    pub fn content(&self) -> &[u8] {
        &self.content
    }
}

impl AsRef<[u8]> for File {
    fn as_ref(&self) -> &[u8] {
        &self.content
    }
}

#[derive(PartialEq, Eq, Default, Debug)]
#[turbo_tasks::value(shared)]
pub struct FileMeta {
    permissions: Permissions,
}

#[cfg(target_family = "unix")]
/// Only handle the permissions on unix platform for now
impl From<fs::Metadata> for FileMeta {
    fn from(meta: fs::Metadata) -> Self {
        use std::os::unix::fs::PermissionsExt;
        let permissions = meta.permissions();
        let perm = if permissions.readonly() {
            Permissions::Readable
        } else {
            // https://github.com/fitzgen/is_executable/blob/master/src/lib.rs#L96
            (permissions.mode() & 0o111 != 0)
                .then(|| Permissions::Executable)
                .unwrap_or(Permissions::Writable)
        };
        Self { permissions: perm }
    }
}

impl FileContent {
    pub fn new(file: File) -> Self {
        FileContent::Content(file)
    }

    pub fn is_content(&self, buffer: &Vec<u8>) -> bool {
        match self {
            FileContent::Content(file) => &file.content == buffer,
            _ => false,
        }
    }

    pub fn parse_json(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => match std::str::from_utf8(&file.content) {
                Ok(string) => match parse(string) {
                    Ok(data) => FileJsonContent::Content(data),
                    Err(_) => FileJsonContent::Unparseable,
                },
                Err(_) => FileJsonContent::Unparseable,
            },
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }

    pub fn parse_json_with_comments(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => match std::str::from_utf8(&file.content) {
                Ok(string) => match parse(&skip_json_comments(string)) {
                    Ok(data) => FileJsonContent::Content(data),
                    Err(_) => FileJsonContent::Unparseable,
                },
                Err(_) => FileJsonContent::Unparseable,
            },
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }
}

fn skip_json_comments(input: &str) -> String {
    enum Mode {
        Normal,
        NormalSlash,
        String,
        StringEscaped,
        SingleLineComment,
        MultiLineComment,
        MultiLineCommentStar,
    }
    let mut o = String::with_capacity(input.len());
    let mut mode = Mode::Normal;
    for c in input.chars() {
        match mode {
            Mode::Normal => match c {
                '/' => {
                    mode = Mode::NormalSlash;
                }
                '\"' => {
                    mode = Mode::String;
                }
                _ => {}
            },
            Mode::NormalSlash => match c {
                '/' => {
                    mode = Mode::SingleLineComment;
                    o.pop();
                    continue;
                }
                '*' => {
                    mode = Mode::MultiLineComment;
                    o.pop();
                    continue;
                }
                '\"' => {
                    mode = Mode::String;
                }
                _ => {}
            },
            Mode::String => match c {
                '\\' => {
                    mode = Mode::StringEscaped;
                }
                '\"' => {
                    mode = Mode::Normal;
                }
                _ => {}
            },
            Mode::StringEscaped => {
                mode = Mode::String;
            }
            Mode::SingleLineComment => match c {
                '\n' => {
                    mode = Mode::Normal;
                    continue;
                }
                _ => continue,
            },
            Mode::MultiLineComment => match c {
                '*' => {
                    mode = Mode::MultiLineCommentStar;
                    continue;
                }
                _ => continue,
            },
            Mode::MultiLineCommentStar => match c {
                '*' => {
                    mode = Mode::MultiLineCommentStar;
                    continue;
                }
                '/' => {
                    mode = Mode::Normal;
                    continue;
                }
                _ => {
                    mode = Mode::MultiLineComment;
                    continue;
                }
            },
        }
        o.push(c);
    }
    o
}

#[turbo_tasks::value_impl]
impl FileContentVc {
    #[turbo_tasks::function]
    pub async fn parse_json(self) -> Result<FileJsonContentVc> {
        let this = self.await?;
        Ok(this.parse_json().into())
    }
    #[turbo_tasks::function]
    pub async fn parse_json_with_comments(self) -> Result<FileJsonContentVc> {
        let this = self.await?;
        Ok(this.parse_json_with_comments().into())
    }
}

#[turbo_tasks::value(shared, serialization: none)]
#[derive(PartialEq, Eq)]
pub enum FileJsonContent {
    Content(#[trace_ignore] JsonValue),
    Unparseable,
    NotFound,
}

#[derive(Hash, Clone, Copy, Debug, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize)]
pub enum DirectoryEntry {
    File(FileSystemPathVc),
    Directory(FileSystemPathVc),
    Other(FileSystemPathVc),
    Error,
}

#[derive(Hash, Clone, Copy, Debug, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize)]
pub enum FileSystemEntryType {
    NotFound,
    File,
    Directory,
    Other,
    Error,
}

impl From<DirectoryEntry> for FileSystemEntryType {
    fn from(entry: DirectoryEntry) -> Self {
        match entry {
            DirectoryEntry::File(_) => FileSystemEntryType::File,
            DirectoryEntry::Directory(_) => FileSystemEntryType::Directory,
            DirectoryEntry::Other(_) => FileSystemEntryType::Other,
            DirectoryEntry::Error => FileSystemEntryType::Error,
        }
    }
}

impl From<&DirectoryEntry> for FileSystemEntryType {
    fn from(entry: &DirectoryEntry) -> Self {
        match entry {
            DirectoryEntry::File(_) => FileSystemEntryType::File,
            DirectoryEntry::Directory(_) => FileSystemEntryType::Directory,
            DirectoryEntry::Other(_) => FileSystemEntryType::Other,
            DirectoryEntry::Error => FileSystemEntryType::Error,
        }
    }
}

#[derive(PartialEq, Eq, Debug)]
#[turbo_tasks::value]
pub enum DirectoryContent {
    Entries(HashMap<String, DirectoryEntry>),
    NotFound,
}

impl DirectoryContentVc {
    pub fn new(entries: HashMap<String, DirectoryEntry>) -> Self {
        Self::slot(DirectoryContent::Entries(entries))
    }

    pub fn not_found() -> Self {
        Self::slot(DirectoryContent::NotFound)
    }
}

#[turbo_tasks::value(shared, FileSystem)]
#[derive(PartialEq, Eq)]
pub struct NullFileSystem;

#[turbo_tasks::value_impl]
impl FileSystem for NullFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: FileSystemPathVc) -> FileContentVc {
        FileContent::NotFound.into()
    }

    #[turbo_tasks::function]
    fn read_dir(&self, _fs_path: FileSystemPathVc) -> DirectoryContentVc {
        DirectoryContentVc::not_found()
    }

    #[turbo_tasks::function]
    fn parent_path(&self, fs_path: FileSystemPathVc) -> FileSystemPathVc {
        FileSystemPathVc::new_normalized(fs_path.fs(), "".to_string())
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPathVc, _content: FileContentVc) -> CompletionVc {
        CompletionVc::new()
    }

    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<String> {
        Vc::slot(String::from("null"))
    }
}

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
