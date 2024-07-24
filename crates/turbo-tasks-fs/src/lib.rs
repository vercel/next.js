#![feature(trivial_bounds)]
#![feature(hash_extract_if)]
#![feature(min_specialization)]
#![feature(iter_advance_by)]
#![feature(io_error_more)]
#![feature(round_char_boundary)]
#![feature(arbitrary_self_types)]
#![feature(lint_reasons)]
#![allow(clippy::mutable_key_type)]

pub mod attach;
pub mod embed;
pub mod glob;
mod invalidation;
mod invalidator_map;
pub mod json;
mod mutex_map;
mod read_glob;
mod retry;
pub mod rope;
pub mod source_context;
pub mod util;
pub(crate) mod virtual_fs;
mod watcher;

use std::{
    borrow::Cow,
    cmp::min,
    collections::HashSet,
    fmt::{
        Debug, Display, Formatter, {self},
    },
    fs::FileType,
    io::{
        BufRead, ErrorKind, {self},
    },
    mem::take,
    path::{Path, PathBuf, MAIN_SEPARATOR},
    sync::Arc,
};

use anyhow::{anyhow, bail, Context, Result};
use auto_hash_map::AutoMap;
use bitflags::bitflags;
use dunce::simplified;
use glob::Glob;
use invalidator_map::InvalidatorMap;
use jsonc_parser::{parse_to_serde_value, ParseOptions};
use mime::Mime;
use read_glob::read_glob;
pub use read_glob::ReadGlobResult;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    sync::{RwLock, RwLockReadGuard},
};
use tracing::Instrument;
use turbo_tasks::{
    mark_stateful, trace::TraceRawVcs, Completion, InvalidationReason, Invalidator, RcStr, ReadRef,
    ValueToString, Vc,
};
use turbo_tasks_hash::{hash_xxh3_hash64, DeterministicHash, DeterministicHasher};
use util::{extract_disk_access, join_path, normalize_path, sys_to_unix, unix_to_sys};
pub use virtual_fs::VirtualFileSystem;
use watcher::DiskWatcher;

use self::{invalidation::Write, json::UnparseableJson, mutex_map::MutexMap};
use crate::{
    attach::AttachedFileSystem,
    retry::{retry_blocking, retry_future},
    rope::{Rope, RopeReader},
};

#[turbo_tasks::value_trait]
pub trait FileSystem: ValueToString {
    /// Returns the path to the root of the file system.
    fn root(self: Vc<Self>) -> Vc<FileSystemPath> {
        FileSystemPath::new_normalized(self, RcStr::default())
    }
    fn read(self: Vc<Self>, fs_path: Vc<FileSystemPath>) -> Vc<FileContent>;
    fn read_link(self: Vc<Self>, fs_path: Vc<FileSystemPath>) -> Vc<LinkContent>;
    fn read_dir(self: Vc<Self>, fs_path: Vc<FileSystemPath>) -> Vc<DirectoryContent>;
    fn track(self: Vc<Self>, fs_path: Vc<FileSystemPath>) -> Vc<Completion>;
    fn write(
        self: Vc<Self>,
        fs_path: Vc<FileSystemPath>,
        content: Vc<FileContent>,
    ) -> Vc<Completion>;
    fn write_link(
        self: Vc<Self>,
        fs_path: Vc<FileSystemPath>,
        target: Vc<LinkContent>,
    ) -> Vc<Completion>;
    fn metadata(self: Vc<Self>, fs_path: Vc<FileSystemPath>) -> Vc<FileMeta>;
}

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct DiskFileSystem {
    pub name: RcStr,
    pub root: RcStr,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    mutex_map: MutexMap<PathBuf>,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    invalidator_map: Arc<InvalidatorMap>,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    dir_invalidator_map: Arc<InvalidatorMap>,
    /// Lock that makes invalidation atomic. It will keep a write lock during
    /// watcher invalidation and a read lock during other operations.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    invalidation_lock: Arc<RwLock<()>>,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    watcher: Arc<DiskWatcher>,
}

impl DiskFileSystem {
    /// Returns the root as Path
    fn root_path(&self) -> &Path {
        simplified(Path::new(&*self.root))
    }

    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function
    fn register_invalidator(&self, path: &Path) -> Result<()> {
        let invalidator = turbo_tasks::get_invalidator();
        self.invalidator_map.insert(path_to_key(path), invalidator);
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        if let Some(dir) = path.parent() {
            self.watcher.ensure_watching(dir, self.root_path())?;
        }
        Ok(())
    }

    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function. It removes and returns
    /// the current list of invalidators.
    fn register_sole_invalidator(&self, path: &Path) -> Result<HashSet<Invalidator>> {
        let invalidator = turbo_tasks::get_invalidator();
        let mut invalidator_map = self.invalidator_map.lock().unwrap();
        let old_invalidators = invalidator_map.insert(path_to_key(path), [invalidator].into());
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        if let Some(dir) = path.parent() {
            self.watcher.ensure_watching(dir, self.root_path())?;
        }
        Ok(old_invalidators.unwrap_or_default())
    }

    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function
    fn register_dir_invalidator(&self, path: &Path) -> Result<()> {
        let invalidator = turbo_tasks::get_invalidator();
        self.dir_invalidator_map
            .insert(path_to_key(path), invalidator);
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        self.watcher.ensure_watching(path, self.root_path())?;
        Ok(())
    }

    async fn lock_path(&self, full_path: &Path) -> PathLockGuard<'_> {
        let lock1 = self.invalidation_lock.read().await;
        let lock2 = self.mutex_map.lock(full_path.to_path_buf()).await;
        PathLockGuard(lock1, lock2)
    }

    pub fn invalidate(&self) {
        for (_, invalidators) in take(&mut *self.invalidator_map.lock().unwrap()).into_iter() {
            invalidators.into_iter().for_each(|i| i.invalidate());
        }
        for (_, invalidators) in take(&mut *self.dir_invalidator_map.lock().unwrap()).into_iter() {
            invalidators.into_iter().for_each(|i| i.invalidate());
        }
    }

    pub fn invalidate_with_reason<T: InvalidationReason + Clone>(&self, reason: T) {
        for (_, invalidators) in take(&mut *self.invalidator_map.lock().unwrap()).into_iter() {
            invalidators
                .into_iter()
                .for_each(|i| i.invalidate_with_reason(reason.clone()));
        }
        for (_, invalidators) in take(&mut *self.dir_invalidator_map.lock().unwrap()).into_iter() {
            invalidators
                .into_iter()
                .for_each(|i| i.invalidate_with_reason(reason.clone()));
        }
    }

    pub fn start_watching(&self) -> Result<()> {
        self.start_watching_internal(false)
    }

    pub fn start_watching_with_invalidation_reason(&self) -> Result<()> {
        self.start_watching_internal(true)
    }

    fn start_watching_internal(&self, report_invalidation_reason: bool) -> Result<()> {
        let invalidator_map = self.invalidator_map.clone();
        let dir_invalidator_map = self.dir_invalidator_map.clone();
        let root_path = self.root_path().to_path_buf();

        let report_invalidation_reason =
            report_invalidation_reason.then(|| (self.name.clone(), root_path.clone()));
        let invalidation_lock = self.invalidation_lock.clone();

        self.watcher.clone().start_watching(
            self.name.clone(),
            root_path,
            report_invalidation_reason,
            invalidation_lock,
            invalidator_map,
            dir_invalidator_map,
        )?;

        Ok(())
    }

    pub fn stop_watching(&self) {
        self.watcher.stop_watching();
    }

    pub async fn to_sys_path(&self, fs_path: Vc<FileSystemPath>) -> Result<PathBuf> {
        // just in case there's a windows unc path prefix we remove it with `dunce`
        let path = self.root_path();
        let fs_path = fs_path.await?;
        Ok(if fs_path.path.is_empty() {
            path.to_path_buf()
        } else {
            path.join(&*unix_to_sys(&fs_path.path))
        })
    }

    fn invalidate_from_write(&self, full_path: &Path, invalidators: HashSet<Invalidator>) {
        if !invalidators.is_empty() {
            if let Some(path) = format_absolute_fs_path(full_path, &self.name, self.root_path()) {
                if invalidators.len() == 1 {
                    let invalidator = invalidators.into_iter().next().unwrap();
                    invalidator.invalidate_with_reason(Write { path });
                } else {
                    invalidators.into_iter().for_each(|invalidator| {
                        invalidator.invalidate_with_reason(Write { path: path.clone() });
                    });
                }
            } else {
                invalidators.into_iter().for_each(|invalidator| {
                    invalidator.invalidate();
                });
            }
        }
    }
}

#[allow(dead_code, reason = "we need to hold onto the locks")]
struct PathLockGuard<'a>(
    #[allow(dead_code)] RwLockReadGuard<'a, ()>,
    #[allow(dead_code)] mutex_map::MutexMapGuard<'a, PathBuf>,
);

fn format_absolute_fs_path(path: &Path, name: &str, root_path: &Path) -> Option<String> {
    let path = if let Ok(rel_path) = path.strip_prefix(root_path) {
        let path = if MAIN_SEPARATOR != '/' {
            let rel_path = rel_path.to_string_lossy().replace(MAIN_SEPARATOR, "/");
            format!("[{name}]/{}", rel_path)
        } else {
            format!("[{name}]/{}", rel_path.display())
        };
        Some(path)
    } else {
        None
    };
    path
}

pub fn path_to_key(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

#[turbo_tasks::value_impl]
impl DiskFileSystem {
    /// Create a new instance of `DiskFileSystem`.
    /// # Arguments
    ///
    /// * `name` - Name of the filesystem.
    /// * `root` - Path to the given filesystem's root.
    /// * `ignored_subpaths` - A list of subpaths that should not trigger
    ///   invalidation. This should be a full path, since it is possible that
    ///   root & project dir is different and requires to ignore specific
    ///   subpaths from each.
    #[turbo_tasks::function]
    pub async fn new(name: RcStr, root: RcStr, ignored_subpaths: Vec<RcStr>) -> Result<Vc<Self>> {
        mark_stateful();
        // create the directory for the filesystem on disk, if it doesn't exist
        fs::create_dir_all(&root).await?;

        let instance = DiskFileSystem {
            name,
            root,
            mutex_map: Default::default(),
            invalidation_lock: Default::default(),
            invalidator_map: Arc::new(InvalidatorMap::new()),
            dir_invalidator_map: Arc::new(InvalidatorMap::new()),
            watcher: Arc::new(DiskWatcher::new(
                ignored_subpaths.into_iter().map(PathBuf::from).collect(),
            )),
        };

        Ok(Self::cell(instance))
    }
}

impl Debug for DiskFileSystem {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        write!(f, "name: {}, root: {}", self.name, self.root)
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for DiskFileSystem {
    #[turbo_tasks::function(fs)]
    async fn read(&self, fs_path: Vc<FileSystemPath>) -> Result<Vc<FileContent>> {
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_invalidator(&full_path)?;

        let _lock = self.lock_path(&full_path).await;
        let content = match retry_future(|| File::from_path(full_path.clone()))
            .instrument(tracing::info_span!(
                "read file",
                path = display(full_path.display())
            ))
            .await
        {
            Ok(file) => FileContent::new(file),
            Err(e) if e.kind() == ErrorKind::NotFound || e.kind() == ErrorKind::InvalidFilename => {
                FileContent::NotFound
            }
            Err(e) => {
                bail!(anyhow!(e).context(format!("reading file {}", full_path.display())))
            }
        };
        Ok(content.cell())
    }

    #[turbo_tasks::function(fs)]
    async fn read_dir(&self, fs_path: Vc<FileSystemPath>) -> Result<Vc<DirectoryContent>> {
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_dir_invalidator(&full_path)?;
        let fs_path = fs_path.await?;

        // we use the sync std function here as it's a lot faster (600%) in
        // node-file-trace
        let read_dir = match retry_blocking(
            &full_path,
            tracing::info_span!("read directory", path = display(full_path.display())),
            |path| std::fs::read_dir(path),
        )
        .await
        {
            Ok(dir) => dir,
            Err(e)
                if e.kind() == ErrorKind::NotFound
                    || e.kind() == ErrorKind::NotADirectory
                    || e.kind() == ErrorKind::InvalidFilename =>
            {
                return Ok(DirectoryContent::not_found());
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
                let file_name: RcStr = path.file_name()?.to_str()?.into();
                let path_to_root = sys_to_unix(path.strip_prefix(&self.root).ok()?.to_str()?);

                let fs_path = FileSystemPath::new_normalized(fs_path.fs, path_to_root.into());

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

        Ok(DirectoryContent::new(entries))
    }

    #[turbo_tasks::function(fs)]
    async fn read_link(&self, fs_path: Vc<FileSystemPath>) -> Result<Vc<LinkContent>> {
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_invalidator(&full_path)?;

        let _lock = self.lock_path(&full_path).await;
        let link_path = match retry_future(|| fs::read_link(&full_path))
            .instrument(tracing::info_span!(
                "read symlink",
                path = display(full_path.display())
            ))
            .await
        {
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
        //
        // we use `dunce::simplify` to strip a potential UNC prefix on windows, on any
        // other OS this gets compiled away
        let result = simplified(&file).strip_prefix(simplified(Path::new(&self.root)));

        let relative_to_root_path = match result {
            Ok(file) => PathBuf::from(sys_to_unix(&file.to_string_lossy()).as_ref()),
            Err(_) => return Ok(LinkContent::Invalid.cell()),
        };

        let (target, file_type) = if is_link_absolute {
            let target_string: RcStr = relative_to_root_path.to_string_lossy().into();
            (
                target_string.clone(),
                FileSystemPath::new_normalized(fs_path.fs(), target_string)
                    .get_type()
                    .await?,
            )
        } else {
            let link_path_string_cow = link_path.to_string_lossy();
            let link_path_unix: RcStr = sys_to_unix(&link_path_string_cow).into();
            (
                link_path_unix.clone(),
                fs_path.parent().join(link_path_unix).get_type().await?,
            )
        };

        Ok(LinkContent::Link {
            target,
            link_type: {
                let mut link_type = Default::default();
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

    #[turbo_tasks::function(fs)]
    async fn track(&self, fs_path: Vc<FileSystemPath>) -> Result<Vc<Completion>> {
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_invalidator(&full_path)?;
        Ok(Completion::new())
    }

    #[turbo_tasks::function(fs)]
    async fn write(
        &self,
        fs_path: Vc<FileSystemPath>,
        content: Vc<FileContent>,
    ) -> Result<Vc<Completion>> {
        let full_path = self.to_sys_path(fs_path).await?;
        let content = content.await?;

        let _lock = self.lock_path(&full_path).await;

        // Track the file, so that we will rewrite it if it ever changes.
        let old_invalidators = self.register_sole_invalidator(&full_path)?;

        // We perform an untracked comparison here, so that this write is not dependent
        // on a read's Vc<FileContent> (and the memory it holds). Our untracked read can
        // be freed immediately. Given this is an output file, it's unlikely any Turbo
        // code will need to read the file from disk into a Vc<FileContent>, so we're
        // not wasting cycles.
        let compare = content
            .streaming_compare(full_path.clone())
            .instrument(tracing::info_span!(
                "read file before write",
                path = display(full_path.display())
            ))
            .await?;
        if compare == FileComparison::Equal {
            if !old_invalidators.is_empty() {
                let key = path_to_key(&full_path);
                for i in old_invalidators {
                    self.invalidator_map.insert(key.clone(), i);
                }
            }
            return Ok(Completion::unchanged());
        }

        let create_directory = compare == FileComparison::Create;

        match &*content {
            FileContent::Content(file) => {
                if create_directory {
                    if let Some(parent) = full_path.parent() {
                        retry_future(move || fs::create_dir_all(parent))
                            .instrument(tracing::info_span!(
                                "create directory",
                                path = display(parent.display())
                            ))
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
                let full_path_to_write = full_path.clone();
                retry_future(move || {
                    let full_path = full_path_to_write.clone();
                    async move {
                        let mut f = fs::File::create(&full_path).await?;
                        tokio::io::copy(&mut file.read(), &mut f).await?;
                        #[cfg(target_family = "unix")]
                        f.set_permissions(file.meta.permissions.into()).await?;
                        #[cfg(feature = "write_version")]
                        {
                            let mut full_path = full_path;
                            let hash = hash_xxh3_hash64(file);
                            let ext = full_path.extension();
                            let ext = if let Some(ext) = ext {
                                format!("{:016x}.{}", hash, ext.to_string_lossy())
                            } else {
                                format!("{:016x}", hash)
                            };
                            full_path.set_extension(ext);
                            let mut f = fs::File::create(&full_path).await?;
                            tokio::io::copy(&mut file.read(), &mut f).await?;
                            #[cfg(target_family = "unix")]
                            f.set_permissions(file.meta.permissions.into()).await?;
                        }
                        Ok::<(), io::Error>(())
                    }
                })
                .instrument(tracing::info_span!(
                    "write file",
                    path = display(full_path.display())
                ))
                .await
                .with_context(|| format!("failed to write to {}", full_path.display()))?;
            }
            FileContent::NotFound => {
                retry_future(|| fs::remove_file(full_path.clone()))
                    .instrument(tracing::info_span!(
                        "remove file",
                        path = display(full_path.display())
                    ))
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

        self.invalidate_from_write(&full_path, old_invalidators);

        Ok(Completion::new())
    }

    #[turbo_tasks::function(fs)]
    async fn write_link(
        &self,
        fs_path: Vc<FileSystemPath>,
        target: Vc<LinkContent>,
    ) -> Result<Vc<Completion>> {
        let full_path = self.to_sys_path(fs_path).await?;
        // TODO(sokra) preform a untracked read here, register an invalidator and get
        // all existing invalidators
        let old_content = fs_path
            .read_link()
            .await
            .with_context(|| format!("reading old symlink target of {}", full_path.display()))?;
        let target_link = target.await?;
        if target_link == old_content {
            return Ok(Completion::unchanged());
        }
        let file_type = &*fs_path.get_type().await?;
        let create_directory = file_type == &FileSystemEntryType::NotFound;
        if create_directory {
            if let Some(parent) = full_path.parent() {
                retry_future(move || fs::create_dir_all(parent))
                    .instrument(tracing::info_span!(
                        "create directory",
                        path = display(parent.display())
                    ))
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
        let _lock = self.lock_path(&full_path).await;
        match &*target_link {
            LinkContent::Link { target, link_type } => {
                let link_type = *link_type;
                let target_path = if link_type.contains(LinkType::ABSOLUTE) {
                    Path::new(&self.root).join(unix_to_sys(target).as_ref())
                } else {
                    PathBuf::from(unix_to_sys(target).as_ref())
                };
                retry_blocking(
                    &target_path,
                    tracing::info_span!("write symlink", path = display(full_path.display())),
                    move |target_path| {
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
                    },
                )
                .await
                .with_context(|| format!("create symlink to {}", target))?;
            }
            LinkContent::Invalid => {
                return Err(anyhow!("invalid symlink target: {}", full_path.display()));
            }
            LinkContent::NotFound => {
                retry_future(|| fs::remove_file(&full_path))
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
        Ok(Completion::new())
    }

    #[turbo_tasks::function(fs)]
    async fn metadata(&self, fs_path: Vc<FileSystemPath>) -> Result<Vc<FileMeta>> {
        let full_path = self.to_sys_path(fs_path).await?;
        self.register_invalidator(&full_path)?;

        let _lock = self.lock_path(&full_path).await;
        let meta = retry_future(|| fs::metadata(full_path.clone()))
            .instrument(tracing::info_span!(
                "read metadata",
                path = display(full_path.display())
            ))
            .await
            .with_context(|| format!("reading metadata for {}", full_path.display()))?;

        Ok(FileMeta::cell(meta.into()))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for DiskFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.name.clone())
    }
}

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct FileSystemPath {
    pub fs: Vc<Box<dyn FileSystem>>,
    pub path: RcStr,
}

impl FileSystemPath {
    pub fn is_inside_ref(&self, other: &FileSystemPath) -> bool {
        if self.fs == other.fs && self.path.starts_with(&*other.path) {
            if other.path.is_empty() {
                true
            } else {
                self.path.as_bytes().get(other.path.len()) == Some(&b'/')
            }
        } else {
            false
        }
    }

    pub fn is_inside_or_equal_ref(&self, other: &FileSystemPath) -> bool {
        if self.fs == other.fs && self.path.starts_with(&*other.path) {
            if other.path.is_empty() {
                true
            } else {
                matches!(
                    self.path.as_bytes().get(other.path.len()),
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

    /// Returns the path of `inner` relative to `self`.
    ///
    /// Note: this method always strips the leading `/` from the result.
    pub fn get_path_to<'a>(&self, inner: &'a FileSystemPath) -> Option<&'a str> {
        if self.fs != inner.fs {
            return None;
        }
        let path = inner.path.strip_prefix(&*self.path)?;
        if self.path.is_empty() {
            Some(path)
        } else if let Some(stripped) = path.strip_prefix('/') {
            Some(stripped)
        } else {
            None
        }
    }

    pub fn get_relative_path_to(&self, other: &FileSystemPath) -> Option<RcStr> {
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
                return Some(".".into());
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
        Some(result.join("/").into())
    }

    /// Returns the final component of the FileSystemPath, or an empty string
    /// for the root path.
    pub fn file_name(&self) -> &str {
        let (_, file_name) = self.split_file_name();
        file_name
    }

    pub fn extension_ref(&self) -> Option<&str> {
        let (_, extension) = self.split_extension();
        extension
    }

    /// Splits the path into two components:
    /// 1. The path without the extension;
    /// 2. The extension, if any.
    fn split_extension(&self) -> (&str, Option<&str>) {
        if let Some((path_before_extension, extension)) = self.path.rsplit_once('.') {
            if extension.contains('/') ||
                // The file name begins with a `.` and has no other `.`s within.
                path_before_extension.ends_with('/') || path_before_extension.is_empty()
            {
                (self.path.as_str(), None)
            } else {
                (path_before_extension, Some(extension))
            }
        } else {
            (self.path.as_str(), None)
        }
    }

    /// Splits the path into two components:
    /// 1. The parent directory, if any;
    /// 2. The file name;
    fn split_file_name(&self) -> (Option<&str>, &str) {
        // Since the path is normalized, we know `parent`, if any, must not be empty.
        if let Some((parent, file_name)) = self.path.rsplit_once('/') {
            (Some(parent), file_name)
        } else {
            (None, self.path.as_str())
        }
    }

    /// Splits the path into three components:
    /// 1. The parent directory, if any;
    /// 2. The file stem;
    /// 3. The extension, if any.
    fn split_file_stem_extension(&self) -> (Option<&str>, &str, Option<&str>) {
        let (path_before_extension, extension) = self.split_extension();

        if let Some((parent, file_stem)) = path_before_extension.rsplit_once('/') {
            (Some(parent), file_stem, extension)
        } else {
            (None, path_before_extension, extension)
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct FileSystemPathOption(Option<Vc<FileSystemPath>>);

#[turbo_tasks::value_impl]
impl FileSystemPathOption {
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }
}

#[turbo_tasks::value_impl]
impl FileSystemPath {
    /// Create a new Vc<FileSystemPath> from a path withing a FileSystem. The
    /// /-separated path is expected to be already normalized (this is asserted
    /// in dev mode).
    #[turbo_tasks::function]
    fn new_normalized(fs: Vc<Box<dyn FileSystem>>, path: RcStr) -> Vc<Self> {
        // On Windows, the path must be converted to a unix path before creating. But on
        // Unix, backslashes are a valid char in file names, and the path can be
        // provided by the user, so we allow it.
        debug_assert!(
            MAIN_SEPARATOR != '\\' || !path.contains('\\'),
            "path {} must not contain a Windows directory '\\', it must be normalized to Unix '/'",
            path,
        );
        debug_assert!(
            normalize_path(&path).as_deref() == Some(&*path),
            "path {} must be normalized",
            path,
        );
        Self::cell(FileSystemPath { fs, path })
    }

    /// Adds a subpath to the current path. The /-separate path argument might
    /// contain ".." or "." seqments, but it must not leave the root of the
    /// filesystem.
    #[turbo_tasks::function]
    pub async fn join(self: Vc<Self>, path: RcStr) -> Result<Vc<Self>> {
        let this = self.await?;
        if let Some(path) = join_path(&this.path, &path) {
            Ok(Self::new_normalized(this.fs, path.into()))
        } else {
            bail!(
                "Vc<FileSystemPath>(\"{}\").join(\"{}\") leaves the filesystem root",
                this.path,
                path
            );
        }
    }

    /// Adds a suffix to the filename. [path] must not contain `/`.
    #[turbo_tasks::function]
    pub async fn append(self: Vc<Self>, path: RcStr) -> Result<Vc<Self>> {
        let this = self.await?;
        if path.contains('/') {
            bail!(
                "Vc<FileSystemPath>(\"{}\").append(\"{}\") must not append '/'",
                this.path,
                path
            )
        }
        Ok(Self::new_normalized(
            this.fs,
            format!("{}{}", this.path, path).into(),
        ))
    }

    /// Adds a suffix to the basename of the filename. [appending] must not
    /// contain `/`. Extension will stay intact.
    #[turbo_tasks::function]
    pub async fn append_to_stem(self: Vc<Self>, appending: RcStr) -> Result<Vc<Self>> {
        let this = self.await?;
        if appending.contains('/') {
            bail!(
                "Vc<FileSystemPath>(\"{}\").append_to_stem(\"{}\") must not append '/'",
                this.path,
                appending
            )
        }
        if let (path, Some(ext)) = this.split_extension() {
            return Ok(Self::new_normalized(
                this.fs,
                format!("{}{}.{}", path, appending, ext).into(),
            ));
        }
        Ok(Self::new_normalized(
            this.fs,
            format!("{}{}", this.path, appending).into(),
        ))
    }

    /// Similar to [FileSystemPath::join], but returns an Option that will be
    /// None when the joined path would leave the filesystem root.
    #[turbo_tasks::function]
    pub async fn try_join(self: Vc<Self>, path: RcStr) -> Result<Vc<FileSystemPathOption>> {
        let this = self.await?;
        if let Some(path) = join_path(&this.path, &path) {
            Ok(Vc::cell(Some(
                Self::new_normalized(this.fs, path.into()).resolve().await?,
            )))
        } else {
            Ok(FileSystemPathOption::none())
        }
    }

    /// Similar to [FileSystemPath::join], but returns an Option that will be
    /// None when the joined path would leave the current path.
    #[turbo_tasks::function]
    pub async fn try_join_inside(self: Vc<Self>, path: RcStr) -> Result<Vc<FileSystemPathOption>> {
        let this = self.await?;
        if let Some(path) = join_path(&this.path, &path) {
            if path.starts_with(&*this.path) {
                return Ok(Vc::cell(Some(
                    Self::new_normalized(this.fs, path.into()).resolve().await?,
                )));
            }
        }
        Ok(FileSystemPathOption::none())
    }

    #[turbo_tasks::function]
    pub async fn read_glob(
        self: Vc<Self>,
        glob: Vc<Glob>,
        include_dot_files: bool,
    ) -> Vc<ReadGlobResult> {
        read_glob(self, glob, include_dot_files)
    }

    #[turbo_tasks::function]
    pub fn root(self: Vc<Self>) -> Vc<Self> {
        self.fs().root()
    }

    #[turbo_tasks::function]
    pub async fn fs(self: Vc<Self>) -> Result<Vc<Box<dyn FileSystem>>> {
        Ok(self.await?.fs)
    }

    #[turbo_tasks::function]
    pub async fn extension(self: Vc<Self>) -> Result<Vc<RcStr>> {
        let this = self.await?;
        Ok(Vc::cell(this.extension_ref().unwrap_or("").into()))
    }

    #[turbo_tasks::function]
    pub async fn is_inside(self: Vc<Self>, other: Vc<FileSystemPath>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.is_inside_ref(&*other.await?)))
    }

    #[turbo_tasks::function]
    pub async fn is_inside_or_equal(self: Vc<Self>, other: Vc<FileSystemPath>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.is_inside_or_equal_ref(&*other.await?)))
    }

    /// Creates a new [`Vc<FileSystemPath>`] like `self` but with the given
    /// extension.
    #[turbo_tasks::function]
    pub async fn with_extension(self: Vc<Self>, extension: RcStr) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let (path_without_extension, _) = this.split_extension();
        Ok(Self::new_normalized(
            this.fs,
            // Like `Path::with_extension` and `PathBuf::set_extension`, if the extension is empty,
            // we remove the extension altogether.
            match extension.is_empty() {
                true => path_without_extension.into(),
                false => format!("{path_without_extension}.{extension}").into(),
            },
        ))
    }

    /// Extracts the stem (non-extension) portion of self.file_name.
    ///
    /// The stem is:
    ///
    /// * [`None`], if there is no file name;
    /// * The entire file name if there is no embedded `.`;
    /// * The entire file name if the file name begins with `.` and has no other
    ///   `.`s within;
    /// * Otherwise, the portion of the file name before the final `.`
    #[turbo_tasks::function]
    pub async fn file_stem(self: Vc<Self>) -> Result<Vc<Option<RcStr>>> {
        let this = self.await?;
        let (_, file_stem, _) = this.split_file_stem_extension();
        if file_stem.is_empty() {
            return Ok(Vc::cell(None));
        }
        Ok(Vc::cell(Some(file_stem.into())))
    }
}

impl Display for FileSystemPath {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.path)
    }
}

#[turbo_tasks::function]
pub async fn rebase(
    fs_path: Vc<FileSystemPath>,
    old_base: Vc<FileSystemPath>,
    new_base: Vc<FileSystemPath>,
) -> Result<Vc<FileSystemPath>> {
    let fs_path = &*fs_path.await?;
    let old_base = &*old_base.await?;
    let new_base = &*new_base.await?;
    let new_path;
    if old_base.path.is_empty() {
        if new_base.path.is_empty() {
            new_path = fs_path.path.clone();
        } else {
            new_path = [new_base.path.as_str(), "/", &fs_path.path].concat().into();
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
            new_path = [&fs_path.path[base_path.len()..]].concat().into();
        } else {
            new_path = [new_base.path.as_str(), &fs_path.path[old_base.path.len()..]]
                .concat()
                .into();
        }
    }
    Ok(new_base.fs.root().join(new_path))
}

// Not turbo-tasks functions, only delegating
impl FileSystemPath {
    pub fn read(self: Vc<Self>) -> Vc<FileContent> {
        self.fs().read(self)
    }

    pub fn read_link(self: Vc<Self>) -> Vc<LinkContent> {
        self.fs().read_link(self)
    }

    pub fn read_json(self: Vc<Self>) -> Vc<FileJsonContent> {
        self.fs().read(self).parse_json()
    }

    /// Reads content of a directory.
    ///
    /// DETERMINISM: Result is in random order. Either sort result or do not
    /// depend on the order.
    pub fn read_dir(self: Vc<Self>) -> Vc<DirectoryContent> {
        self.fs().read_dir(self)
    }

    pub fn track(self: Vc<Self>) -> Vc<Completion> {
        self.fs().track(self)
    }

    pub fn write(self: Vc<Self>, content: Vc<FileContent>) -> Vc<Completion> {
        self.fs().write(self, content)
    }

    pub fn write_link(self: Vc<Self>, target: Vc<LinkContent>) -> Vc<Completion> {
        self.fs().write_link(self, target)
    }

    pub fn metadata(self: Vc<Self>) -> Vc<FileMeta> {
        self.fs().metadata(self)
    }

    pub fn realpath(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.realpath_with_links().path()
    }

    pub fn rebase(
        fs_path: Vc<FileSystemPath>,
        old_base: Vc<FileSystemPath>,
        new_base: Vc<FileSystemPath>,
    ) -> Vc<FileSystemPath> {
        rebase(fs_path, old_base, new_base)
    }
}

#[turbo_tasks::value_impl]
impl FileSystemPath {
    #[turbo_tasks::function]
    pub async fn parent(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let path = &this.path;
        if path.is_empty() {
            return Ok(self);
        }
        let p = match str::rfind(path, '/') {
            Some(index) => path[..index].to_string(),
            None => "".to_string(),
        };
        Ok(FileSystemPath::new_normalized(this.fs, p.into()))
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
    pub async fn get_type(self: Vc<Self>) -> Result<Vc<FileSystemEntryType>> {
        let this = self.await?;
        if this.is_root() {
            return Ok(FileSystemEntryType::cell(FileSystemEntryType::Directory));
        }
        let parent = self.parent().resolve().await?;
        let dir_content = parent.read_dir().await?;
        match &*dir_content {
            DirectoryContent::NotFound => {
                Ok(FileSystemEntryType::cell(FileSystemEntryType::NotFound))
            }
            DirectoryContent::Entries(entries) => {
                let (_, file_name) = this.split_file_name();
                if let Some(entry) = entries.get(file_name) {
                    Ok(FileSystemEntryType::cell(entry.into()))
                } else {
                    Ok(FileSystemEntryType::cell(FileSystemEntryType::NotFound))
                }
            }
        }
    }

    #[turbo_tasks::function]
    pub async fn realpath_with_links(self: Vc<Self>) -> Result<Vc<RealPathResult>> {
        let this = self.await?;
        if this.is_root() {
            return Ok(RealPathResult {
                path: self,
                symlinks: Vec::new(),
            }
            .cell());
        }
        let parent = self.parent().resolve().await?;
        let parent_result = parent.realpath_with_links().await?;
        let basename = this
            .path
            .rsplit_once('/')
            .map_or(this.path.as_str(), |(_, name)| name);
        let real_self = if parent_result.path != parent {
            parent_result.path.join(basename.into()).resolve().await?
        } else {
            self
        };
        let mut result = parent_result.clone_value();
        if matches!(*real_self.get_type().await?, FileSystemEntryType::Symlink) {
            if let LinkContent::Link { target, link_type } = &*real_self.read_link().await? {
                result.symlinks.push(real_self);
                result.path = if link_type.contains(LinkType::ABSOLUTE) {
                    real_self.root().resolve().await?
                } else {
                    result.path
                }
                .join(target.clone())
                .resolve()
                .await?;
                return Ok(result.cell());
            }
        }
        result.path = real_self;
        Ok(result.cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for FileSystemPath {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("[{}]/{}", self.fs.to_string().await?, self.path).into(),
        ))
    }
}

#[derive(Clone, Debug)]
#[turbo_tasks::value(shared)]
pub struct RealPathResult {
    pub path: Vc<FileSystemPath>,
    pub symlinks: Vec<Vc<FileSystemPath>>,
}

#[turbo_tasks::value_impl]
impl RealPathResult {
    #[turbo_tasks::function]
    pub async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self.await?.path)
    }
}

#[derive(Clone, Copy, Debug, DeterministicHash)]
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
#[derive(Clone, Debug, DeterministicHash)]
pub enum FileContent {
    Content(File),
    NotFound,
}

impl From<File> for FileContent {
    fn from(file: File) -> Self {
        FileContent::Content(file)
    }
}

impl From<File> for Vc<FileContent> {
    fn from(file: File) -> Self {
        FileContent::Content(file).cell()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum FileComparison {
    Create,
    Equal,
    NotEqual,
}

impl FileContent {
    /// Performs a comparison of self's data against a disk file's streamed
    /// read.
    async fn streaming_compare(&self, path: PathBuf) -> Result<FileComparison> {
        let old_file = extract_disk_access(retry_future(|| fs::File::open(&path)).await, &path)?;
        let Some(mut old_file) = old_file else {
            return Ok(match self {
                FileContent::NotFound => FileComparison::Equal,
                _ => FileComparison::Create,
            });
        };
        // We know old file exists, does the new file?
        let FileContent::Content(new_file) = self else {
            return Ok(FileComparison::NotEqual);
        };

        let old_meta = extract_disk_access(retry_future(|| old_file.metadata()).await, &path)?;
        let Some(old_meta) = old_meta else {
            // If we failed to get meta, then the old file has been deleted between the
            // handle open. In which case, we just pretend the file never
            // existed.
            return Ok(FileComparison::Create);
        };
        // If the meta is different, we need to rewrite the file to update it.
        if new_file.meta != old_meta.into() {
            return Ok(FileComparison::NotEqual);
        }

        // So meta matches, and we have a file handle. Let's stream the contents to see
        // if they match.
        let mut new_contents = new_file.read();
        let mut old_contents = BufReader::new(&mut old_file);
        Ok(loop {
            let new_chunk = new_contents.fill_buf()?;
            let Ok(old_chunk) = old_contents.fill_buf().await else {
                break FileComparison::NotEqual;
            };

            let len = min(new_chunk.len(), old_chunk.len());
            if len == 0 {
                if new_chunk.len() == old_chunk.len() {
                    break FileComparison::Equal;
                } else {
                    break FileComparison::NotEqual;
                }
            }

            if new_chunk[0..len] != old_chunk[0..len] {
                break FileComparison::NotEqual;
            }

            new_contents.consume(len);
            old_contents.consume(len);
        })
    }
}

bitflags! {
  #[derive(Default, Serialize, Deserialize, TraceRawVcs)]
  pub struct LinkType: u8 {
      const DIRECTORY = 0b00000001;
      const ABSOLUTE = 0b00000010;
  }
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub enum LinkContent {
    // for the relative link, the target is raw value read from the link
    // for the absolute link, the target is stripped of the root path while reading
    // We don't use the `Vc<FileSystemPath>` here for now, because the `FileSystemPath` is always
    // normalized, which means in `fn write_link` we couldn't restore the raw value of the file
    // link because there is only **dist** path in `fn write_link`, and we need the raw path if
    // we want to restore the link value in `fn write_link`
    Link { target: RcStr, link_type: LinkType },
    Invalid,
    NotFound,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, DeterministicHash)]
pub struct File {
    meta: FileMeta,
    #[turbo_tasks(debug_ignore)]
    content: Rope,
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
            content: Rope::from(output),
        })
    }

    /// Creates a [File] from raw bytes.
    fn from_bytes(content: Vec<u8>) -> Self {
        File {
            meta: FileMeta::default(),
            content: Rope::from(content),
        }
    }

    /// Creates a [File] from a rope.
    fn from_rope(content: Rope) -> Self {
        File {
            meta: FileMeta::default(),
            content,
        }
    }

    /// Returns the content type associated with this file.
    pub fn content_type(&self) -> Option<&Mime> {
        self.meta.content_type.as_ref()
    }

    /// Sets the content type associated with this file.
    pub fn with_content_type(mut self, content_type: Mime) -> Self {
        self.meta.content_type = Some(content_type);
        self
    }

    /// Returns a Read/AsyncRead/Stream/Iterator to access the File's contents.
    pub fn read(&self) -> RopeReader {
        self.content.read()
    }
}

impl Debug for File {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.debug_struct("File")
            .field("meta", &self.meta)
            .field("content (hash)", &hash_xxh3_hash64(&self.content))
            .finish()
    }
}

impl From<RcStr> for File {
    fn from(s: RcStr) -> Self {
        s.into_owned().into()
    }
}

impl From<String> for File {
    fn from(s: String) -> Self {
        File::from_bytes(s.into_bytes())
    }
}

impl From<ReadRef<RcStr>> for File {
    fn from(s: ReadRef<RcStr>) -> Self {
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

impl From<ReadRef<Rope>> for File {
    fn from(rope: ReadRef<Rope>) -> Self {
        File::from_rope(rope.clone_value())
    }
}

impl From<Rope> for File {
    fn from(rope: Rope) -> Self {
        File::from_rope(rope)
    }
}

impl File {
    pub fn new(meta: FileMeta, content: Vec<u8>) -> Self {
        Self {
            meta,
            content: Rope::from(content),
        }
    }

    /// Returns the associated [FileMeta] of this file.
    pub fn meta(&self) -> &FileMeta {
        &self.meta
    }

    /// Returns the immutable contents of this file.
    pub fn content(&self) -> &Rope {
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

impl DeterministicHash for FileMeta {
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        self.permissions.deterministic_hash(state);
        if let Some(content_type) = &self.content_type {
            content_type.to_string().deterministic_hash(state);
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

    pub fn as_content(&self) -> Option<&File> {
        match self {
            FileContent::Content(file) => Some(file),
            FileContent::NotFound => None,
        }
    }

    pub fn parse_json_ref(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => {
                let de = &mut serde_json::Deserializer::from_reader(file.read());
                match serde_path_to_error::deserialize(de) {
                    Ok(data) => FileJsonContent::Content(data),
                    Err(e) => FileJsonContent::Unparseable(Box::new(
                        UnparseableJson::from_serde_path_to_error(e),
                    )),
                }
            }
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }

    pub fn parse_json_with_comments_ref(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => match file.content.to_str() {
                Ok(string) => match parse_to_serde_value(
                    &string,
                    &ParseOptions {
                        allow_comments: true,
                        allow_trailing_commas: true,
                        allow_loose_object_property_names: false,
                    },
                ) {
                    Ok(data) => match data {
                        Some(value) => FileJsonContent::Content(value),
                        None => FileJsonContent::unparseable(
                            "text content doesn't contain any json data",
                        ),
                    },
                    Err(e) => FileJsonContent::Unparseable(Box::new(
                        UnparseableJson::from_jsonc_error(e, string.as_ref()),
                    )),
                },
                Err(_) => FileJsonContent::unparseable("binary is not valid utf-8 text"),
            },
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }

    pub fn lines_ref(&self) -> FileLinesContent {
        match self {
            FileContent::Content(file) => match file.content.to_str() {
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

#[turbo_tasks::value_impl]
impl FileContent {
    #[turbo_tasks::function]
    pub async fn parse_json(self: Vc<Self>) -> Result<Vc<FileJsonContent>> {
        let this = self.await?;
        Ok(this.parse_json_ref().into())
    }

    #[turbo_tasks::function]
    pub async fn parse_json_with_comments(self: Vc<Self>) -> Result<Vc<FileJsonContent>> {
        let this = self.await?;
        Ok(this.parse_json_with_comments_ref().into())
    }

    #[turbo_tasks::function]
    pub async fn lines(self: Vc<Self>) -> Result<Vc<FileLinesContent>> {
        let this = self.await?;
        Ok(this.lines_ref().into())
    }

    #[turbo_tasks::function]
    pub async fn hash(self: Vc<Self>) -> Result<Vc<u64>> {
        Ok(Vc::cell(hash_xxh3_hash64(&self.await?)))
    }
}

/// A file's content interpreted as a JSON value.
#[turbo_tasks::value(shared, serialization = "none")]
pub enum FileJsonContent {
    Content(Value),
    Unparseable(Box<UnparseableJson>),
    NotFound,
}

#[turbo_tasks::value_impl]
impl ValueToString for FileJsonContent {
    /// Returns the JSON file content as a UTF-8 string.
    ///
    /// This operation will only succeed if the file contents are a valid JSON
    /// value.
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        match self {
            FileJsonContent::Content(json) => Ok(Vc::cell(json.to_string().into())),
            FileJsonContent::Unparseable(e) => Err(anyhow!("File is not valid JSON: {}", e)),
            FileJsonContent::NotFound => Err(anyhow!("File not found")),
        }
    }
}

impl FileJsonContent {
    pub fn unparseable(message: &'static str) -> Self {
        FileJsonContent::Unparseable(Box::new(UnparseableJson {
            message: Cow::Borrowed(message),
            path: None,
            start_location: None,
            end_location: None,
        }))
    }

    pub fn unparseable_with_message(message: Cow<'static, str>) -> Self {
        FileJsonContent::Unparseable(Box::new(UnparseableJson {
            message,
            path: None,
            start_location: None,
            end_location: None,
        }))
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
    File(Vc<FileSystemPath>),
    Directory(Vc<FileSystemPath>),
    Symlink(Vc<FileSystemPath>),
    Other(Vc<FileSystemPath>),
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
    Entries(AutoMap<RcStr, DirectoryEntry>),
    NotFound,
}

impl DirectoryContent {
    pub fn new(entries: AutoMap<RcStr, DirectoryEntry>) -> Vc<Self> {
        Self::cell(DirectoryContent::Entries(entries))
    }

    pub fn not_found() -> Vc<Self> {
        Self::cell(DirectoryContent::NotFound)
    }
}

#[turbo_tasks::value(shared)]
pub struct NullFileSystem;

#[turbo_tasks::value_impl]
impl FileSystem for NullFileSystem {
    #[turbo_tasks::function]
    fn read(&self, _fs_path: Vc<FileSystemPath>) -> Vc<FileContent> {
        FileContent::NotFound.cell()
    }

    #[turbo_tasks::function]
    fn read_link(&self, _fs_path: Vc<FileSystemPath>) -> Vc<LinkContent> {
        LinkContent::NotFound.into()
    }

    #[turbo_tasks::function]
    fn read_dir(&self, _fs_path: Vc<FileSystemPath>) -> Vc<DirectoryContent> {
        DirectoryContent::not_found()
    }

    #[turbo_tasks::function]
    fn track(&self, _fs_path: Vc<FileSystemPath>) -> Vc<Completion> {
        Completion::immutable()
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: Vc<FileSystemPath>, _content: Vc<FileContent>) -> Vc<Completion> {
        Completion::new()
    }

    #[turbo_tasks::function]
    fn write_link(&self, _fs_path: Vc<FileSystemPath>, _target: Vc<LinkContent>) -> Vc<Completion> {
        Completion::new()
    }

    #[turbo_tasks::function]
    fn metadata(&self, _fs_path: Vc<FileSystemPath>) -> Vc<FileMeta> {
        FileMeta::default().cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NullFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(RcStr::from("null"))
    }
}

pub async fn to_sys_path(mut path: Vc<FileSystemPath>) -> Result<Option<PathBuf>> {
    loop {
        if let Some(fs) = Vc::try_resolve_downcast_type::<AttachedFileSystem>(path.fs()).await? {
            path = fs.get_inner_fs_path(path);
            continue;
        }

        if let Some(fs) = Vc::try_resolve_downcast_type::<DiskFileSystem>(path.fs()).await? {
            let sys_path = fs.await?.to_sys_path(path).await?;
            return Ok(Some(sys_path));
        }

        return Ok(None);
    }
}

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn with_extension() {
        crate::register();

        turbo_tasks_testing::VcStorage::with(async {
            let fs = Vc::upcast(VirtualFileSystem::new());

            let path_txt = FileSystemPath::new_normalized(fs, "foo/bar.txt".into());

            let path_json = path_txt.with_extension("json".into());
            assert_eq!(&*path_json.await.unwrap().path, "foo/bar.json");

            let path_no_ext = path_txt.with_extension("".into());
            assert_eq!(&*path_no_ext.await.unwrap().path, "foo/bar");

            let path_new_ext = path_no_ext.with_extension("json".into());
            assert_eq!(&*path_new_ext.await.unwrap().path, "foo/bar.json");

            let path_no_slash_txt = FileSystemPath::new_normalized(fs, "bar.txt".into());

            let path_no_slash_json = path_no_slash_txt.with_extension("json".into());
            assert_eq!(path_no_slash_json.await.unwrap().path.as_str(), "bar.json");

            let path_no_slash_no_ext = path_no_slash_txt.with_extension("".into());
            assert_eq!(path_no_slash_no_ext.await.unwrap().path.as_str(), "bar");

            let path_no_slash_new_ext = path_no_slash_no_ext.with_extension("json".into());
            assert_eq!(
                path_no_slash_new_ext.await.unwrap().path.as_str(),
                "bar.json"
            );

            anyhow::Ok(())
        })
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn file_stem() {
        crate::register();

        turbo_tasks_testing::VcStorage::with(async {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new());

            let path = FileSystemPath::new_normalized(fs, "".into());
            assert_eq!(path.file_stem().await.unwrap().as_deref(), None);

            let path = FileSystemPath::new_normalized(fs, "foo/bar.txt".into());
            assert_eq!(path.file_stem().await.unwrap().as_deref(), Some("bar"));

            let path = FileSystemPath::new_normalized(fs, "bar.txt".into());
            assert_eq!(path.file_stem().await.unwrap().as_deref(), Some("bar"));

            let path = FileSystemPath::new_normalized(fs, "foo/bar".into());
            assert_eq!(path.file_stem().await.unwrap().as_deref(), Some("bar"));

            let path = FileSystemPath::new_normalized(fs, "foo/.bar".into());
            assert_eq!(path.file_stem().await.unwrap().as_deref(), Some(".bar"));

            anyhow::Ok(())
        })
        .await
        .unwrap()
    }
}
