#![feature(trivial_bounds)]
#![feature(hash_drain_filter)]
#![feature(min_specialization)]
#![feature(iter_advance_by)]
#![feature(io_error_more)]
#![feature(main_separator_str)]

pub mod attach;
pub mod embed;
pub mod glob;
mod invalidator_map;
mod read_glob;
mod retry;
pub mod util;

use std::{
    collections::{HashMap, HashSet},
    fmt::{self, Display},
    fs::FileType,
    io::{self, ErrorKind},
    mem::take,
    path::{Path, PathBuf, MAIN_SEPARATOR},
    sync::{
        mpsc::{channel, RecvError, TryRecvError},
        Arc, Mutex,
    },
    time::Duration,
};

use anyhow::{anyhow, bail, Context, Result};
use bitflags::bitflags;
use glob::GlobVc;
use invalidator_map::InvalidatorMap;
use mime::Mime;
use notify::{watcher, DebouncedEvent, RecommendedWatcher, RecursiveMode, Watcher};
use read_glob::read_glob;
pub use read_glob::{ReadGlobResult, ReadGlobResultVc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
};
use turbo_tasks::{
    primitives::{BoolVc, StringReadRef, StringVc},
    spawn_thread,
    trace::TraceRawVcs,
    CompletionVc, Invalidator, ValueToString, ValueToStringVc,
};
use util::{join_path, normalize_path, sys_to_unix, unix_to_sys};

use crate::retry::{retry_blocking, retry_future};
#[cfg(target_family = "windows")]
use crate::util::is_windows_raw_path;

#[turbo_tasks::value_trait]
pub trait FileSystem: ValueToString {
    /// Returns the path to the root of the file system.
    fn root(self_vc: FileSystemVc) -> FileSystemPathVc {
        FileSystemPathVc::new_normalized(self_vc, String::new())
    }
    fn read(&self, fs_path: FileSystemPathVc) -> FileContentVc;
    fn read_link(&self, fs_path: FileSystemPathVc) -> LinkContentVc;
    fn read_dir(&self, fs_path: FileSystemPathVc) -> DirectoryContentVc;
    fn write(&self, fs_path: FileSystemPathVc, content: FileContentVc) -> CompletionVc;
    fn write_link(&self, fs_path: FileSystemPathVc, target: LinkContentVc) -> CompletionVc;
    fn metadata(&self, fs_path: FileSystemPathVc) -> FileMetaVc;
}

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct DiskFileSystem {
    pub name: String,
    pub root: String,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    invalidator_map: Arc<InvalidatorMap>,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    dir_invalidator_map: Arc<InvalidatorMap>,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    watcher: Mutex<Option<RecommendedWatcher>>,
}

impl DiskFileSystem {
    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function
    fn register_invalidator(&self, path: impl AsRef<Path>, file: bool) {
        let invalidator = turbo_tasks::get_invalidator();
        if file {
            self.invalidator_map.insert(path_to_key(path), invalidator);
        } else {
            self.dir_invalidator_map
                .insert(path_to_key(path), invalidator);
        }
    }

    pub fn invalidate(&self) {
        for (_, invalidators) in take(&mut *self.invalidator_map.lock().unwrap()).into_iter() {
            invalidators.into_iter().for_each(|i| i.invalidate());
        }
        for (_, invalidators) in take(&mut *self.dir_invalidator_map.lock().unwrap()).into_iter() {
            invalidators.into_iter().for_each(|i| i.invalidate());
        }
    }

    pub fn start_watching(&self) -> Result<()> {
        let mut watcher_guard = self.watcher.lock().unwrap();
        if watcher_guard.is_some() {
            return Ok(());
        }
        let invalidator_map = self.invalidator_map.clone();
        let dir_invalidator_map = self.dir_invalidator_map.clone();
        let root = self.root.clone();
        // Create a channel to receive the events.
        let (tx, rx) = channel();
        // Create a watcher object, delivering debounced events.
        // The notification back-end is selected based on the platform.
        let mut watcher = watcher(tx, Duration::from_millis(1))?;
        // Add a path to be watched. All files and directories at that path and
        // below will be monitored for changes.
        watcher.watch(&root, RecursiveMode::Recursive)?;

        // We need to invalidate all reads that happened before watching
        // Best is to start_watching before starting to read
        for (_, invalidators) in take(&mut *invalidator_map.lock().unwrap()).into_iter() {
            invalidators.into_iter().for_each(|i| i.invalidate());
        }
        for (_, invalidators) in take(&mut *dir_invalidator_map.lock().unwrap()).into_iter() {
            invalidators.into_iter().for_each(|i| i.invalidate());
        }

        watcher_guard.replace(watcher);

        spawn_thread(move || {
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
                            batched_invalidate_path.insert(path);
                        }
                        Ok(DebouncedEvent::Create(path)) | Ok(DebouncedEvent::Remove(path)) => {
                            batched_invalidate_path_and_children.insert(path.clone());
                            batched_invalidate_path_and_children_dir.insert(path.clone());
                            if let Some(parent) = path.parent() {
                                batched_invalidate_path_dir.insert(PathBuf::from(parent));
                            }
                        }
                        Ok(DebouncedEvent::Rename(source, destination)) => {
                            batched_invalidate_path_and_children.insert(source.clone());
                            if let Some(parent) = source.parent() {
                                batched_invalidate_path_dir.insert(PathBuf::from(parent));
                            }
                            batched_invalidate_path_and_children.insert(destination.clone());
                            if let Some(parent) = destination.parent() {
                                batched_invalidate_path_dir.insert(PathBuf::from(parent));
                            }
                        }
                        Ok(DebouncedEvent::Rescan) => {
                            batched_invalidate_path_and_children.insert(PathBuf::from(&root));
                            batched_invalidate_path_and_children_dir.insert(PathBuf::from(&root));
                        }
                        Ok(DebouncedEvent::Error(err, path)) => {
                            println!("watch error ({:?}): {:?} ", path, err);
                            match path {
                                Some(path) => {
                                    batched_invalidate_path_and_children.insert(path.clone());
                                    batched_invalidate_path_and_children_dir.insert(path);
                                }
                                None => {
                                    batched_invalidate_path_and_children
                                        .insert(PathBuf::from(&root));
                                    batched_invalidate_path_and_children_dir
                                        .insert(PathBuf::from(&root));
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
                    invalidator_map: &mut HashMap<String, HashSet<Invalidator>>,
                    paths: impl Iterator<Item = PathBuf>,
                ) {
                    for path in paths {
                        let key = path_to_key(path);
                        if let Some(invalidators) = invalidator_map.remove(&key) {
                            invalidators.into_iter().for_each(|i| i.invalidate());
                        }
                    }
                }
                fn invalidate_path_and_children_execute(
                    invalidator_map: &mut HashMap<String, HashSet<Invalidator>>,
                    paths: &mut HashSet<PathBuf>,
                ) {
                    for (_, invalidators) in invalidator_map.drain_filter(|key, _| {
                        paths
                            .iter()
                            .any(|path_key| key.starts_with(&path_to_key(path_key)))
                    }) {
                        invalidators.into_iter().for_each(|i| i.invalidate());
                    }
                    paths.clear()
                }
                {
                    let mut invalidator_map = invalidator_map.lock().unwrap();
                    invalidate_path(&mut invalidator_map, batched_invalidate_path.drain());
                    invalidate_path_and_children_execute(
                        &mut invalidator_map,
                        &mut batched_invalidate_path_and_children,
                    );
                }
                {
                    let mut dir_invalidator_map = dir_invalidator_map.lock().unwrap();
                    invalidate_path(
                        &mut dir_invalidator_map,
                        batched_invalidate_path_dir.drain(),
                    );
                    invalidate_path_and_children_execute(
                        &mut dir_invalidator_map,
                        &mut batched_invalidate_path_and_children_dir,
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

    pub async fn to_sys_path(&self, fs_path: FileSystemPathVc) -> Result<PathBuf> {
        let path = Path::new(&self.root).join(&*unix_to_sys(&fs_path.await?.path));
        Ok(path)
    }
}

pub fn path_to_key(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

#[turbo_tasks::value_impl]
impl DiskFileSystemVc {
    #[turbo_tasks::function]
    pub async fn new(name: String, root: String) -> Result<Self> {
        // create the directory for the filesystem on disk, if it doesn't exist
        fs::create_dir_all(&root).await?;

        let instance = DiskFileSystem {
            name,
            root,
            invalidator_map: Arc::new(InvalidatorMap::new()),
            dir_invalidator_map: Arc::new(InvalidatorMap::new()),
            watcher: Mutex::new(None),
        };

        Ok(Self::cell(instance))
    }
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
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_invalidator(&full_path, true);

        let content = match retry_future(|| File::from_path(full_path.clone())).await {
            Ok(file) => FileContent::new(file),
            Err(e) if e.kind() == ErrorKind::NotFound => FileContent::NotFound,
            Err(e) => {
                bail!(anyhow!(e).context(format!("reading file {}", full_path.display())))
            }
        };

        Ok(content.cell())
    }

    #[turbo_tasks::function]
    async fn read_dir(&self, fs_path: FileSystemPathVc) -> Result<DirectoryContentVc> {
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_invalidator(&full_path, false);
        let fs_path = fs_path.await?;

        // we use the sync std function here as it's a lot faster (600%) in
        // node-file-trace
        let read_dir = match retry_blocking(&full_path, |path| std::fs::read_dir(path)).await {
            Ok(dir) => dir,
            Err(e)
                if e.kind() == ErrorKind::NotFound
                    || e.kind() == ErrorKind::NotADirectory
                    || e.kind() == ErrorKind::InvalidFilename =>
            {
                return Ok(DirectoryContentVc::not_found())
            }
            Err(e) => {
                bail!(anyhow!(e).context(format!("reading dir {}", full_path.display())))
            }
        };

        let entries = read_dir
            .filter_map(|r| {
                let e = match r {
                    Ok(e) => e,
                    Err(err) => return Some(Err(err.into())),
                };

                let path = e.path();

                // we filter out any non unicode names and paths without the same root here
                let file_name = path.file_name()?.to_str()?.to_string();
                let path_to_root = sys_to_unix(path.strip_prefix(&self.root).ok()?.to_str()?);

                let fs_path =
                    FileSystemPathVc::new_normalized(fs_path.fs, path_to_root.to_string());

                let entry = match e.file_type() {
                    Ok(t) if t.is_file() => DirectoryEntry::File(fs_path),
                    Ok(t) if t.is_dir() => DirectoryEntry::Directory(fs_path),
                    Ok(t) if t.is_symlink() => DirectoryEntry::Symlink(fs_path),
                    Ok(_) => DirectoryEntry::Other(fs_path),
                    Err(err) => return Some(Err(err.into())),
                };

                Some(anyhow::Ok((file_name, entry)))
            })
            .collect::<Result<_>>()
            .with_context(|| format!("reading directory item in {}", full_path.display()))?;

        Ok(DirectoryContentVc::new(entries))
    }

    #[turbo_tasks::function]
    async fn read_link(&self, fs_path: FileSystemPathVc) -> Result<LinkContentVc> {
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_invalidator(&full_path, true);

        let link_path = match retry_future(|| fs::read_link(&full_path)).await {
            Ok(res) => res,
            Err(_) => return Ok(LinkContent::NotFound.cell()),
        };
        let is_link_absolute = link_path.is_absolute();

        let mut file = link_path.clone();
        if !is_link_absolute {
            if let Some(normalized_linked_path) = full_path.parent().and_then(|p| {
                normalize_path(&sys_to_unix(p.join(&file).to_string_lossy().as_ref()))
            }) {
                #[cfg(target_family = "windows")]
                {
                    file = PathBuf::from(normalized_linked_path);
                }
                // `normalize_path` stripped the leading `/` of the path
                // add it back here or the `strip_prefix` will return `Err`
                #[cfg(not(target_family = "windows"))]
                {
                    file = PathBuf::from(format!("/{normalized_linked_path}"));
                }
            } else {
                return Ok(LinkContent::Invalid.cell());
            }
        }

        // strip the root from the path, it serves two purpose
        // 1. ensure the linked path is under the root
        // 2. strip the root path if the linked path is absolute
        #[cfg(target_family = "windows")]
        let result = {
            let root_path = Path::new(&self.root);
            if is_windows_raw_path(root_path) && !is_windows_raw_path(&file) {
                file.strip_prefix(Path::new(&self.root[4..]))
            } else {
                file.strip_prefix(root_path)
            }
        };

        #[cfg(not(target_family = "windows"))]
        let result = file.strip_prefix(Path::new(&self.root));
        let relative_to_root_path = match result {
            Ok(file) => PathBuf::from(sys_to_unix(&file.to_string_lossy()).as_ref()),
            Err(_) => return Ok(LinkContent::Invalid.cell()),
        };

        let (target, file_type) = if is_link_absolute {
            let target_string = relative_to_root_path.to_string_lossy().to_string();
            (
                target_string.clone(),
                FileSystemPathVc::new_normalized(fs_path.fs(), target_string)
                    .get_type()
                    .await?,
            )
        } else {
            let link_path_string_cow = link_path.to_string_lossy();
            let link_path_unix = sys_to_unix(&link_path_string_cow);
            (
                link_path_unix.to_string(),
                fs_path
                    .parent()
                    .join(link_path_unix.as_ref())
                    .get_type()
                    .await?,
            )
        };

        Ok(LinkContent::Link {
            target,
            link_type: {
                let mut link_type = LinkType::UNSET;
                if link_path.is_absolute() {
                    link_type |= LinkType::ABSOLUTE;
                }
                if matches!(&*file_type, FileSystemEntryType::Directory) {
                    link_type |= LinkType::DIRECTORY;
                }
                link_type
            },
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn write(
        &self,
        fs_path: FileSystemPathVc,
        content: FileContentVc,
    ) -> Result<CompletionVc> {
        let full_path = self.to_sys_path(fs_path).await?;
        let content = content.await?;
        let old_content = fs_path
            .read()
            .await
            .with_context(|| format!("reading old content of {}", full_path.display()))?;

        if *content == *old_content {
            return Ok(CompletionVc::new());
        }

        let create_directory = *old_content == FileContent::NotFound;
        match &*content {
            FileContent::Content(file) => {
                if create_directory {
                    if let Some(parent) = full_path.parent() {
                        retry_future(move || fs::create_dir_all(parent))
                            .await
                            .with_context(|| {
                                format!(
                                    "failed to create directory {} for write to {}",
                                    parent.display(),
                                    full_path.display()
                                )
                            })?;
                    }
                }
                // println!("write {} bytes to {}", buffer.len(), full_path.display());
                let full_path_to_write = full_path.clone();
                retry_future(move || {
                    let full_path = full_path_to_write.clone();
                    async move {
                        let mut f = fs::File::create(&full_path).await?;
                        f.write_all(&file.content).await?;
                        #[cfg(target_family = "unix")]
                        f.set_permissions(file.meta.permissions.into()).await?;
                        Ok::<(), io::Error>(())
                    }
                })
                .await
                .with_context(|| format!("failed to write to {}", full_path.display()))?;
            }
            FileContent::NotFound => {
                // println!("remove {}", full_path.display());
                retry_future(|| fs::remove_file(full_path.clone()))
                    .await
                    .or_else(|err| {
                        if err.kind() == ErrorKind::NotFound {
                            Ok(())
                        } else {
                            Err(err)
                        }
                    })
                    .with_context(|| anyhow!("removing {} failed", full_path.display()))?;
            }
        }

        Ok(CompletionVc::new())
    }

    #[turbo_tasks::function]
    async fn write_link(
        &self,
        fs_path: FileSystemPathVc,
        target: LinkContentVc,
    ) -> Result<CompletionVc> {
        let full_path = self.to_sys_path(fs_path).await?;
        let old_content = fs_path
            .read_link()
            .await
            .with_context(|| format!("reading old symlink target of {}", full_path.display()))?;
        let target_link = target.await?;
        if target_link == old_content {
            return Ok(CompletionVc::new());
        }
        let file_type = &*fs_path.get_type().await?;
        let create_directory = file_type == &FileSystemEntryType::NotFound;
        if create_directory {
            if let Some(parent) = full_path.parent() {
                retry_future(move || fs::create_dir_all(parent))
                    .await
                    .with_context(|| {
                        format!(
                            "failed to create directory {} for write to {}",
                            parent.display(),
                            full_path.display()
                        )
                    })?;
            }
        }
        match &*target_link {
            LinkContent::Link { target, link_type } => {
                let link_type = *link_type;
                let target_path = if link_type.contains(LinkType::ABSOLUTE) {
                    Path::new(&self.root).join(unix_to_sys(target).as_ref())
                } else {
                    PathBuf::from(unix_to_sys(target).as_ref())
                };
                retry_blocking(&target_path, move |target_path| {
                    // we use the sync std method here because `symlink` is fast
                    // if we put it into a task, it will be slower
                    #[cfg(not(target_family = "windows"))]
                    {
                        std::os::unix::fs::symlink(target_path, &full_path)
                    }
                    #[cfg(target_family = "windows")]
                    {
                        if link_type.contains(LinkType::DIRECTORY) {
                            std::os::windows::fs::symlink_dir(target_path, &full_path)
                        } else {
                            std::os::windows::fs::symlink_file(target_path, &full_path)
                        }
                    }
                })
                .await
                .with_context(|| format!("create symlink to {}", target))?;
            }
            LinkContent::Invalid => {
                return Err(anyhow!("invalid symlink target: {}", full_path.display()));
            }
            LinkContent::NotFound => {
                retry_future(|| fs::remove_file(full_path.clone()))
                    .await
                    .or_else(|err| {
                        if err.kind() == ErrorKind::NotFound {
                            Ok(())
                        } else {
                            Err(err)
                        }
                    })
                    .with_context(|| anyhow!("removing {} failed", full_path.display()))?;
            }
        }
        Ok(CompletionVc::new())
    }

    #[turbo_tasks::function]
    async fn metadata(&self, fs_path: FileSystemPathVc) -> Result<FileMetaVc> {
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_invalidator(&full_path, true);

        let meta = retry_future(|| fs::metadata(full_path.clone()))
            .await
            .with_context(|| format!("reading metadata for {}", full_path.display()))?;

        Ok(FileMetaVc::cell(meta.into()))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for DiskFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(self.name.clone())
    }
}

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct FileSystemPath {
    pub fs: FileSystemVc,
    pub path: String,
}

impl FileSystemPath {
    pub fn is_inside(&self, context: &FileSystemPath) -> bool {
        if self.fs == context.fs && self.path.starts_with(&context.path) {
            if context.path.is_empty() {
                true
            } else {
                self.path.as_bytes().get(context.path.len()) == Some(&b'/')
            }
        } else {
            false
        }
    }

    pub fn is_inside_or_equal(&self, context: &FileSystemPath) -> bool {
        if self.fs == context.fs && self.path.starts_with(&context.path) {
            if context.path.is_empty() {
                true
            } else {
                matches!(
                    self.path.as_bytes().get(context.path.len()),
                    Some(&b'/') | None
                )
            }
        } else {
            false
        }
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
        } else if let Some(stripped) = path.strip_prefix('/') {
            Some(stripped)
        } else {
            None
        }
    }

    pub fn get_relative_path_to(&self, other: &FileSystemPath) -> Option<String> {
        if self.fs != other.fs {
            return None;
        }
        fn split(s: &str) -> impl Iterator<Item = &str> {
            let empty = s.is_empty();
            let mut iterator = s.split('/');
            if empty {
                iterator.next();
            }
            iterator
        }
        let mut self_segments = split(&self.path).peekable();
        let mut other_segments = split(&other.path).peekable();
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
        for segment in other_segments {
            result.push(segment);
        }
        Some(result.join("/"))
    }

    /// Returns the final component of the FileSystemPath, or an empty string
    /// for the root path.
    pub fn file_name(&self) -> &str {
        // rsplit will always give at least one item
        self.path.rsplit('/').next().unwrap()
    }

    pub fn extension(&self) -> Option<&str> {
        if let Some((_, ext)) = self.path.rsplit_once('.') {
            if !ext.contains('/') {
                return Some(ext);
            }
        }
        None
    }
}

#[turbo_tasks::value(transparent)]
pub struct FileSystemPathOption(Option<FileSystemPathVc>);

#[turbo_tasks::value_impl]
impl FileSystemPathVc {
    /// Create a new FileSystemPathVc from a path withing a FileSystem. The
    /// /-separated path is expected to be already normalized (this is asserted
    /// in dev mode).
    #[turbo_tasks::function]
    fn new_normalized(fs: FileSystemVc, path: String) -> Self {
        // On Windows, the path must be converted to a unix path before creating. But on
        // Unix, backslashes are a valid char in file names, and the path can be
        // provided by the user, so we allow it.
        debug_assert!(
            MAIN_SEPARATOR != '\\' || !path.contains('\\'),
            "path {} must not contain a Windows directory '\\', it must be normalized to Unix '/'",
            path,
        );
        debug_assert!(
            normalize_path(&path).as_ref() == Some(&path),
            "path {} must be normalized",
            path,
        );
        Self::cell(FileSystemPath { fs, path })
    }

    /// Adds a subpath to the current path. The /-separate path argument might
    /// contain ".." or "." seqments, but it must not leave the root of the
    /// filesystem.
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

    /// Adds a suffix to the filename. [path] must not contain `/`.
    #[turbo_tasks::function]
    pub async fn append(self, path: &str) -> Result<Self> {
        let this = self.await?;
        if path.contains('/') {
            bail!(
                "FileSystemPathVc(\"{}\").append(\"{}\") must not append '/'",
                this.path,
                path
            )
        }
        Ok(Self::new_normalized(
            this.fs,
            format!("{}{}", this.path, path),
        ))
    }

    /// Adds a suffix to the basename of the filename. [appending] must not
    /// contain `/`. Extension will stay intact.
    #[turbo_tasks::function]
    pub async fn append_to_stem(self, appending: &str) -> Result<Self> {
        let this = self.await?;
        if appending.contains('/') {
            bail!(
                "FileSystemPathVc(\"{}\").append_to_stem(\"{}\") must not append '/'",
                this.path,
                appending
            )
        }
        if let Some((path, ext)) = this.path.rsplit_once('.') {
            // check if `ext` is a real extension, and not a "." in a directory name
            if !ext.contains('/') {
                return Ok(Self::new_normalized(
                    this.fs,
                    format!("{}{}.{}", path, appending, ext),
                ));
            }
        }
        Ok(Self::new_normalized(
            this.fs,
            format!("{}{}", this.path, appending),
        ))
    }

    /// Similar to [FileSystemPathVc::join], but returns an Option that will be
    /// None when the joined path would leave the filesystem root.
    #[turbo_tasks::function]
    pub async fn try_join(self, path: &str) -> Result<FileSystemPathOptionVc> {
        let this = self.await?;
        if let Some(path) = join_path(&this.path, path) {
            Ok(FileSystemPathOptionVc::cell(Some(Self::new_normalized(
                this.fs, path,
            ))))
        } else {
            Ok(FileSystemPathOptionVc::cell(None))
        }
    }

    /// Similar to [FileSystemPathVc::join], but returns an Option that will be
    /// None when the joined path would leave the current path.
    #[turbo_tasks::function]
    pub async fn try_join_inside(self, path: &str) -> Result<FileSystemPathOptionVc> {
        let this = self.await?;
        if let Some(path) = join_path(&this.path, path) {
            if path.starts_with(&this.path) {
                return Ok(FileSystemPathOptionVc::cell(Some(Self::new_normalized(
                    this.fs, path,
                ))));
            }
        }
        Ok(FileSystemPathOptionVc::cell(None))
    }

    #[turbo_tasks::function]
    pub async fn read_glob(self, glob: GlobVc, include_dot_files: bool) -> ReadGlobResultVc {
        read_glob(self, glob, include_dot_files)
    }

    #[turbo_tasks::function]
    pub fn root(self) -> Self {
        self.fs().root()
    }

    #[turbo_tasks::function]
    pub async fn fs(self) -> Result<FileSystemVc> {
        Ok(self.await?.fs)
    }

    #[turbo_tasks::function]
    pub async fn extension(self) -> Result<StringVc> {
        let this = self.await?;
        Ok(StringVc::cell(this.extension().unwrap_or("").to_string()))
    }

    #[turbo_tasks::function]
    pub async fn is_inside(self, other: FileSystemPathVc) -> Result<BoolVc> {
        Ok(BoolVc::cell(self.await?.is_inside(&*other.await?)))
    }

    #[turbo_tasks::function]
    pub async fn is_inside_or_equal(self, other: FileSystemPathVc) -> Result<BoolVc> {
        Ok(BoolVc::cell(self.await?.is_inside_or_equal(&*other.await?)))
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
    Ok(new_base.fs.root().join(&new_path))
}

#[turbo_tasks::value_impl]
impl FileSystemPathVc {
    #[turbo_tasks::function]
    pub async fn read(self) -> FileContentVc {
        self.fs().read(self)
    }

    #[turbo_tasks::function]
    pub async fn read_link(self) -> LinkContentVc {
        self.fs().read_link(self)
    }

    #[turbo_tasks::function]
    pub fn read_json(self) -> FileJsonContentVc {
        self.fs().read(self).parse_json()
    }

    /// Reads content of a directory.
    ///
    /// DETERMINISM: Result is in random order. Either sort result or do not
    /// depend on the order.
    #[turbo_tasks::function]
    pub async fn read_dir(self) -> DirectoryContentVc {
        self.fs().read_dir(self)
    }

    #[turbo_tasks::function]
    pub fn write(self, content: FileContentVc) -> CompletionVc {
        self.fs().write(self, content)
    }

    #[turbo_tasks::function]
    pub fn write_link(self, target: LinkContentVc) -> CompletionVc {
        self.fs().write_link(self, target)
    }

    #[turbo_tasks::function]
    pub async fn parent(self) -> Result<FileSystemPathVc> {
        let this = self.await?;
        let path = &this.path;
        if path.is_empty() {
            return Ok(self);
        }
        let p = match str::rfind(path, '/') {
            Some(index) => path[..index].to_string(),
            None => "".to_string(),
        };
        Ok(FileSystemPathVc::new_normalized(this.fs, p))
    }

    #[turbo_tasks::function]
    pub fn metadata(self) -> FileMetaVc {
        self.fs().metadata(self)
    }

    #[turbo_tasks::function]
    // It is important that get_type uses read_dir and not stat/metadata.
    // - `get_type` is called very very often during resolving and stat would
    // make it 1 syscall per call, whereas read_dir would make it 1 syscall per
    // directory.
    // - `metadata` allows you to use the "wrong" casing on
    // case-insenstive filesystems, while read_dir gives you the "correct"
    // casing. We want to enforce "correct" casing to avoid broken builds on
    // Vercel deployments (case-sensitive).
    pub async fn get_type(self) -> Result<FileSystemEntryTypeVc> {
        let this = self.await?;
        if this.is_root() {
            return Ok(FileSystemEntryTypeVc::cell(FileSystemEntryType::Directory));
        }
        let parent = self.parent().resolve().await?;
        let dir_content = parent.read_dir().await?;
        match &*dir_content {
            DirectoryContent::NotFound => {
                Ok(FileSystemEntryTypeVc::cell(FileSystemEntryType::NotFound))
            }
            DirectoryContent::Entries(entries) => {
                let basename = if let Some((_, basename)) = this.path.rsplit_once('/') {
                    basename
                } else {
                    &this.path
                };
                if let Some(entry) = entries.get(basename) {
                    Ok(FileSystemEntryTypeVc::cell(entry.into()))
                } else {
                    Ok(FileSystemEntryTypeVc::cell(FileSystemEntryType::NotFound))
                }
            }
        }
    }

    #[turbo_tasks::function]
    pub fn realpath(self) -> FileSystemPathVc {
        self.realpath_with_links().path()
    }

    #[turbo_tasks::function]
    pub async fn realpath_with_links(self) -> Result<RealPathResultVc> {
        let this = self.await?;
        if this.is_root() {
            return Ok(RealPathResult {
                path: self,
                symlinks: Vec::new(),
            }
            .into());
        }
        let segments = this.path.split('/');
        let mut current = self.root();
        let mut symlinks = Vec::new();
        for segment in segments {
            current = current.join(segment);
            while let LinkContent::Link { target, link_type } = &*current.read_link().await? {
                symlinks.push(current.resolve().await?);
                current = if link_type.contains(LinkType::ABSOLUTE) {
                    current.root()
                } else {
                    current.parent()
                }
                .join(target);
            }
        }
        if symlinks.is_empty() {
            return Ok(RealPathResult {
                path: self,
                symlinks: Vec::new(),
            }
            .into());
        }
        Ok(RealPathResult {
            path: current.resolve().await?,
            symlinks,
        }
        .into())
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
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "[{}]/{}",
            self.fs.to_string().await?,
            self.path
        )))
    }
}

#[derive(Clone, Debug)]
#[turbo_tasks::value(shared)]
pub struct RealPathResult {
    pub path: FileSystemPathVc,
    pub symlinks: Vec<FileSystemPathVc>,
}

#[turbo_tasks::value_impl]
impl RealPathResultVc {
    #[turbo_tasks::function]
    pub async fn path(self) -> Result<FileSystemPathVc> {
        Ok(self.await?.path)
    }
}

#[derive(Clone, Copy, Debug)]
#[turbo_tasks::value(shared)]
pub enum Permissions {
    Readable,
    Writable,
    Executable,
}

impl Default for Permissions {
    fn default() -> Self {
        Self::Writable
    }
}

// Only handle the permissions on unix platform for now

#[cfg(target_family = "unix")]
impl From<Permissions> for std::fs::Permissions {
    fn from(perm: Permissions) -> Self {
        use std::os::unix::fs::PermissionsExt;
        match perm {
            Permissions::Readable => std::fs::Permissions::from_mode(0o444),
            Permissions::Writable => std::fs::Permissions::from_mode(0o664),
            Permissions::Executable => std::fs::Permissions::from_mode(0o755),
        }
    }
}

#[cfg(target_family = "unix")]
impl From<std::fs::Permissions> for Permissions {
    fn from(perm: std::fs::Permissions) -> Self {
        use std::os::unix::fs::PermissionsExt;
        if perm.readonly() {
            Permissions::Readable
        } else {
            // https://github.com/fitzgen/is_executable/blob/master/src/lib.rs#L96
            if perm.mode() & 0o111 != 0 {
                Permissions::Executable
            } else {
                Permissions::Writable
            }
        }
    }
}

#[cfg(not(target_family = "unix"))]
impl From<std::fs::Permissions> for Permissions {
    fn from(_: std::fs::Permissions) -> Self {
        Permissions::default()
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum FileContent {
    Content(File),
    NotFound,
}

impl From<File> for FileContent {
    fn from(file: File) -> Self {
        FileContent::Content(file)
    }
}

impl From<File> for FileContentVc {
    fn from(file: File) -> Self {
        FileContent::Content(file).cell()
    }
}

bitflags! {
  #[derive(Serialize, Deserialize, TraceRawVcs)]
  pub struct LinkType: u8 {
      const UNSET = 0;
      const DIRECTORY = 0b00000001;
      const ABSOLUTE = 0b00000010;
  }
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub enum LinkContent {
    // for the relative link, the target is raw value read from the link
    // for the absolute link, the target is stripped of the root path while reading
    // We don't use the `FileSystemPathVc` here for now, because the `FileSystemPath` is always
    // normalized, which means in `fn write_link` we couldn't restore the raw value of the file
    // link because there is only **dist** path in `fn write_link`, and we need the raw path if
    // we want to restore the link value in `fn write_link`
    Link { target: String, link_type: LinkType },
    Invalid,
    NotFound,
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct File {
    meta: FileMeta,
    #[turbo_tasks(debug_ignore)]
    content: Vec<u8>,
}

impl File {
    /// Reads a [File] from the given path
    async fn from_path(p: PathBuf) -> io::Result<Self> {
        let mut file = fs::File::open(p).await?;
        let metadata = file.metadata().await?;

        let mut output = Vec::with_capacity(metadata.len() as usize);
        file.read_to_end(&mut output).await?;

        Ok(File {
            meta: metadata.into(),
            content: output,
        })
    }

    /// Creates a [File] from raw bytes.
    fn from_bytes(content: Vec<u8>) -> Self {
        File {
            meta: FileMeta::default(),
            content,
        }
    }

    pub fn content_type(&self) -> Option<&Mime> {
        self.meta.content_type.as_ref()
    }

    pub fn with_content_type(mut self, content_type: Mime) -> Self {
        self.meta.content_type = Some(content_type);
        self
    }
}

impl From<String> for File {
    fn from(s: String) -> Self {
        File::from_bytes(s.into_bytes())
    }
}

impl From<StringReadRef> for File {
    fn from(s: StringReadRef) -> Self {
        File::from_bytes(s.as_bytes().to_vec())
    }
}

impl From<&str> for File {
    fn from(s: &str) -> Self {
        File::from_bytes(s.as_bytes().to_vec())
    }
}

impl From<Vec<u8>> for File {
    fn from(bytes: Vec<u8>) -> Self {
        File::from_bytes(bytes)
    }
}

impl From<&[u8]> for File {
    fn from(bytes: &[u8]) -> Self {
        File::from_bytes(bytes.to_vec())
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

    pub fn push_content(&mut self, content: &[u8]) {
        self.content.extend_from_slice(content);
    }
}

impl AsRef<[u8]> for File {
    fn as_ref(&self) -> &[u8] {
        &self.content
    }
}

mod mime_option_serde {
    use std::{fmt, str::FromStr};

    use mime::Mime;
    use serde::{de, Deserializer, Serializer};

    pub fn serialize<S>(mime: &Option<Mime>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        if let Some(mime) = mime {
            serializer.serialize_str(mime.as_ref())
        } else {
            serializer.serialize_str("")
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Mime>, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> de::Visitor<'de> for Visitor {
            type Value = Option<Mime>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a valid MIME type or empty string")
            }

            fn visit_str<E>(self, value: &str) -> Result<Option<Mime>, E>
            where
                E: de::Error,
            {
                if value.is_empty() {
                    Ok(None)
                } else {
                    Mime::from_str(value)
                        .map(Some)
                        .map_err(|e| E::custom(format!("{}", e)))
                }
            }
        }

        deserializer.deserialize_str(Visitor)
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
pub struct FileMeta {
    permissions: Permissions,
    #[serde(with = "mime_option_serde")]
    #[turbo_tasks(trace_ignore)]
    content_type: Option<Mime>,
}

impl From<std::fs::Metadata> for FileMeta {
    fn from(meta: std::fs::Metadata) -> Self {
        let permissions = meta.permissions().into();

        Self {
            permissions,
            content_type: None,
        }
    }
}

impl FileContent {
    pub fn new(file: File) -> Self {
        FileContent::Content(file)
    }

    pub fn is_content(&self) -> bool {
        matches!(self, FileContent::Content(_))
    }

    pub fn parse_json(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => match std::str::from_utf8(&file.content) {
                Ok(string) => match serde_json::from_str(string) {
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
                Ok(string) => match serde_json::from_str(&skip_json_comments(string)) {
                    Ok(data) => FileJsonContent::Content(data),
                    Err(_) => FileJsonContent::Unparseable,
                },
                Err(_) => FileJsonContent::Unparseable,
            },
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }

    pub fn lines(&self) -> FileLinesContent {
        match self {
            FileContent::Content(file) => match std::str::from_utf8(&file.content) {
                Ok(string) => {
                    let mut bytes_offset = 0;
                    FileLinesContent::Lines(
                        string
                            .split('\n')
                            .map(|l| {
                                let line = FileLine {
                                    content: l.to_string(),
                                    bytes_offset,
                                };
                                bytes_offset += l.len() + 1;
                                line
                            })
                            .collect(),
                    )
                }
                Err(_) => FileLinesContent::Unparseable,
            },
            FileContent::NotFound => FileLinesContent::NotFound,
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
    #[turbo_tasks::function]
    pub async fn lines(self) -> Result<FileLinesContentVc> {
        let this = self.await?;
        Ok(this.lines().into())
    }
}

/// A file's content interpreted as a JSON value.
#[turbo_tasks::value(shared, serialization = "none")]
pub enum FileJsonContent {
    Content(Value),
    Unparseable,
    NotFound,
}

#[turbo_tasks::value_impl]
impl ValueToString for FileJsonContent {
    /// Returns the JSON file content as a UTF-8 string.
    ///
    /// This operation will only succeed if the file contents are a valid JSON
    /// value.
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        match self {
            FileJsonContent::Content(json) => Ok(StringVc::cell(json.to_string())),
            FileJsonContent::Unparseable => Err(anyhow!("File is not valid JSON")),
            FileJsonContent::NotFound => Err(anyhow!("File not found")),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct FileLine {
    pub content: String,
    pub bytes_offset: usize,
}

#[turbo_tasks::value(shared, serialization = "none")]
pub enum FileLinesContent {
    Lines(#[turbo_tasks(trace_ignore)] Vec<FileLine>),
    Unparseable,
    NotFound,
}

#[derive(Hash, Clone, Copy, Debug, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize)]
pub enum DirectoryEntry {
    File(FileSystemPathVc),
    Directory(FileSystemPathVc),
    Symlink(FileSystemPathVc),
    Other(FileSystemPathVc),
    Error,
}

#[turbo_tasks::value]
#[derive(Hash, Clone, Copy, Debug)]
pub enum FileSystemEntryType {
    NotFound,
    File,
    Directory,
    Symlink,
    Other,
    Error,
}

impl From<FileType> for FileSystemEntryType {
    fn from(file_type: FileType) -> Self {
        match file_type {
            t if t.is_dir() => FileSystemEntryType::Directory,
            t if t.is_file() => FileSystemEntryType::File,
            t if t.is_symlink() => FileSystemEntryType::Symlink,
            _ => FileSystemEntryType::Other,
        }
    }
}

impl From<DirectoryEntry> for FileSystemEntryType {
    fn from(entry: DirectoryEntry) -> Self {
        FileSystemEntryType::from(&entry)
    }
}

impl From<&DirectoryEntry> for FileSystemEntryType {
    fn from(entry: &DirectoryEntry) -> Self {
        match entry {
            DirectoryEntry::File(_) => FileSystemEntryType::File,
            DirectoryEntry::Directory(_) => FileSystemEntryType::Directory,
            DirectoryEntry::Symlink(_) => FileSystemEntryType::Symlink,
            DirectoryEntry::Other(_) => FileSystemEntryType::Other,
            DirectoryEntry::Error => FileSystemEntryType::Error,
        }
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
pub enum DirectoryContent {
    Entries(HashMap<String, DirectoryEntry>),
    NotFound,
}

impl DirectoryContentVc {
    pub fn new(entries: HashMap<String, DirectoryEntry>) -> Self {
        Self::cell(DirectoryContent::Entries(entries))
    }

    pub fn not_found() -> Self {
        Self::cell(DirectoryContent::NotFound)
    }
}

#[turbo_tasks::value(shared)]
pub struct NullFileSystem;

#[turbo_tasks::value_impl]
impl FileSystem for NullFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: FileSystemPathVc) -> FileContentVc {
        FileContent::NotFound.cell()
    }

    #[turbo_tasks::function]
    fn read_link(&self, _fs_path: FileSystemPathVc) -> LinkContentVc {
        LinkContent::NotFound.into()
    }

    #[turbo_tasks::function]
    fn read_dir(&self, _fs_path: FileSystemPathVc) -> DirectoryContentVc {
        DirectoryContentVc::not_found()
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPathVc, _content: FileContentVc) -> CompletionVc {
        CompletionVc::new()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NullFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(String::from("null"))
    }
}

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
