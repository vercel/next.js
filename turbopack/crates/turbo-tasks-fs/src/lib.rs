#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(btree_cursors)] // needed for the `InvalidatorMap` and watcher, reduces time complexity
#![feature(io_error_more)]
#![feature(iter_advance_by)]
#![feature(min_specialization)]
// if `normalize_lexically` isn't eventually stabilized, we can copy the implementation from the
// stdlib into our source tree
#![feature(normalize_lexically)]
#![feature(trivial_bounds)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![allow(clippy::mutable_key_type)]

pub mod attach;
pub mod embed;
pub mod glob;
mod globset;
pub mod invalidation;
mod invalidator_map;
pub mod json;
mod mutex_map;
mod path_map;
mod read_glob;
mod retry;
pub mod rope;
pub mod source_context;
pub mod util;
pub(crate) mod virtual_fs;
mod watcher;

use std::{
    borrow::Cow,
    cmp::{Ordering, min},
    env,
    fmt::{self, Debug, Display, Formatter},
    fs::FileType,
    future::Future,
    io::{self, BufRead, BufReader, ErrorKind, Read},
    mem::take,
    path::{MAIN_SEPARATOR, Path, PathBuf},
    sync::{Arc, LazyLock},
    time::Duration,
};

use anyhow::{Context, Result, anyhow, bail};
use auto_hash_map::{AutoMap, AutoSet};
use bitflags::bitflags;
use dunce::simplified;
use indexmap::IndexSet;
use jsonc_parser::{ParseOptions, parse_to_serde_value};
use mime::Mime;
use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{RwLock, RwLockReadGuard};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    ApplyEffectsContext, Completion, InvalidationReason, Invalidator, NonLocalValue, ReadRef,
    ResolvedVc, TaskInput, ValueToString, Vc, debug::ValueDebugFormat, effect,
    mark_session_dependent, mark_stateful, parallel, trace::TraceRawVcs,
};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher, hash_xxh3_hash64};
use turbo_unix_path::{
    get_parent_path, get_relative_path_to, join_path, normalize_path, sys_to_unix, unix_to_sys,
};

use crate::{
    attach::AttachedFileSystem,
    glob::Glob,
    invalidation::Write,
    invalidator_map::{InvalidatorMap, WriteContent},
    json::UnparsableJson,
    mutex_map::MutexMap,
    read_glob::{read_glob, track_glob},
    retry::retry_blocking,
    rope::{Rope, RopeReader},
    util::extract_disk_access,
    watcher::DiskWatcher,
};
pub use crate::{read_glob::ReadGlobResult, virtual_fs::VirtualFileSystem};

/// A (somewhat arbitrary) filename limit that we should try to keep output file names below.
///
/// For the sake of consistency, this is a fixed constant that is likely to be safe across all
/// platforms.
///
/// Different operating systems have different limits on file name and file path. See
/// [`validate_path_length`] for details. Because this only accounts for a single path segment, and
/// not the total path length, this cannot not guarantee a full file path is safe.
///
/// To ensure file names are kept within this limit, call
/// [`FileSystemPath::truncate_file_name_with_hash`].
pub const MAX_SAFE_FILE_NAME_LENGTH: usize = 200;

/// Validate the path, returning the valid path, a modified-but-now-valid path, or bailing with an
/// error.
///
/// The behaviour of the file system changes depending on the OS, and indeed sometimes the FS
/// implementation of the OS itself.
///
/// - On Windows the limit for normal file paths is 260 characters, a holdover from the DOS days,
///   but Rust will opportunistically rewrite paths to 'UNC' paths for supported path operations
///   which can be up to 32767 characters long.
/// - On macOS, the limit is traditionally 255 characters for the file name and a second limit of
///   1024 for the entire path (verified by running `getconf PATH_MAX /`).
/// - On Linux, the limit differs between kernel (and by extension, distro) and filesystem. On most
///   common file systems (e.g. ext4, btrfs, and xfs), individual file names can be up to 255 bytes
///   with no hard limit on total path length. [Some legacy POSIX APIs are restricted to the
///   `PATH_MAX` value of 4096 bytes in `limits.h`, but most applications support longer
///   paths][PATH_MAX].
///
/// For more details, refer to <https://en.wikipedia.org/wiki/Comparison_of_file_systems#Limits>.
///
/// Realistically, the output path lengths will be the same across all platforms, so we need to set
/// a conservative limit and be particular about when we decide to bump it. Here we have opted for
/// 255 characters, because it is the shortest of the three options.
///
/// [PATH_MAX]: https://eklitzke.org/path-max-is-tricky
pub fn validate_path_length(path: &Path) -> Result<Cow<'_, Path>> {
    /// Here we check if the path is too long for windows, and if so, attempt to canonicalize it
    /// to a UNC path.
    #[cfg(target_family = "windows")]
    fn validate_path_length_inner(path: &Path) -> Result<Cow<'_, Path>> {
        const MAX_PATH_LENGTH_WINDOWS: usize = 260;
        const UNC_PREFIX: &str = "\\\\?\\";

        if path.starts_with(UNC_PREFIX) {
            return Ok(path.into());
        }

        if path.as_os_str().len() > MAX_PATH_LENGTH_WINDOWS {
            let new_path = std::fs::canonicalize(path)
                .map_err(|_| anyhow!("file is too long, and could not be normalized"))?;
            return Ok(new_path.into());
        }

        Ok(path.into())
    }

    /// Here we are only going to check if the total length exceeds, or the last segment exceeds.
    /// This heuristic is primarily to avoid long file names, and it makes the operation much
    /// cheaper.
    #[cfg(not(target_family = "windows"))]
    fn validate_path_length_inner(path: &Path) -> Result<Cow<'_, Path>> {
        const MAX_FILE_NAME_LENGTH_UNIX: usize = 255;
        // macOS reports a limit of 1024, but I (@arlyon) have had issues with paths above 1016
        // so we subtract a bit to be safe. on most linux distros this is likely a lot larger than
        // 1024, but macOS is *special*
        const MAX_PATH_LENGTH: usize = 1024 - 8;

        // check the last segment (file name)
        if path
            .file_name()
            .map(|n| n.as_encoded_bytes().len())
            .unwrap_or(0)
            > MAX_FILE_NAME_LENGTH_UNIX
        {
            anyhow::bail!(
                "file name is too long (exceeds {} bytes)",
                MAX_FILE_NAME_LENGTH_UNIX
            );
        }

        if path.as_os_str().len() > MAX_PATH_LENGTH {
            anyhow::bail!("path is too long (exceeds {} bytes)", MAX_PATH_LENGTH);
        }

        Ok(path.into())
    }

    validate_path_length_inner(path).with_context(|| {
        format!(
            "path length for file {} exceeds max length of filesystem",
            path.to_string_lossy()
        )
    })
}

trait ConcurrencyLimitedExt {
    type Output;
    async fn concurrency_limited(self, semaphore: &tokio::sync::Semaphore) -> Self::Output;
}

impl<F, R> ConcurrencyLimitedExt for F
where
    F: Future<Output = R>,
{
    type Output = R;
    async fn concurrency_limited(self, semaphore: &tokio::sync::Semaphore) -> Self::Output {
        let _permit = semaphore.acquire().await;
        self.await
    }
}

fn create_semaphore() -> tokio::sync::Semaphore {
    // the semaphore isn't serialized, and we assume the environment variable doesn't change during
    // runtime, so it's okay to access it in this untracked way.
    static NEXT_TURBOPACK_IO_CONCURRENCY: LazyLock<usize> = LazyLock::new(|| {
        env::var("NEXT_TURBOPACK_IO_CONCURRENCY")
            .ok()
            .filter(|val| !val.is_empty())
            .map(|val| {
                val.parse()
                    .expect("NEXT_TURBOPACK_IO_CONCURRENCY must be a valid integer")
            })
            .filter(|val| *val != 0)
            .unwrap_or(256)
    });
    tokio::sync::Semaphore::new(*NEXT_TURBOPACK_IO_CONCURRENCY)
}

#[turbo_tasks::value_trait]
pub trait FileSystem: ValueToString {
    /// Returns the path to the root of the file system.
    #[turbo_tasks::function]
    fn root(self: ResolvedVc<Self>) -> Vc<FileSystemPath> {
        FileSystemPath::new_normalized(self, RcStr::default()).cell()
    }
    #[turbo_tasks::function]
    fn read(self: Vc<Self>, fs_path: FileSystemPath) -> Vc<FileContent>;
    #[turbo_tasks::function]
    fn read_link(self: Vc<Self>, fs_path: FileSystemPath) -> Vc<LinkContent>;
    #[turbo_tasks::function]
    fn raw_read_dir(self: Vc<Self>, fs_path: FileSystemPath) -> Vc<RawDirectoryContent>;
    #[turbo_tasks::function]
    fn write(self: Vc<Self>, fs_path: FileSystemPath, content: Vc<FileContent>) -> Vc<()>;
    #[turbo_tasks::function]
    fn write_link(self: Vc<Self>, fs_path: FileSystemPath, target: Vc<LinkContent>) -> Vc<()>;
    #[turbo_tasks::function]
    fn metadata(self: Vc<Self>, fs_path: FileSystemPath) -> Vc<FileMeta>;
}

#[derive(Default)]
struct DiskFileSystemApplyContext {
    /// A cache of already created directories to avoid creating them multiple times.
    created_directories: FxHashSet<PathBuf>,
}

#[derive(Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
struct DiskFileSystemInner {
    pub name: RcStr,
    pub root: RcStr,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    mutex_map: MutexMap<PathBuf>,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    invalidator_map: InvalidatorMap,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    dir_invalidator_map: InvalidatorMap,
    /// Lock that makes invalidation atomic. It will keep a write lock during
    /// watcher invalidation and a read lock during other operations.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip)]
    invalidation_lock: RwLock<()>,
    /// Semaphore to limit the maximum number of concurrent file operations.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[serde(skip, default = "create_semaphore")]
    semaphore: tokio::sync::Semaphore,

    #[turbo_tasks(debug_ignore, trace_ignore)]
    watcher: DiskWatcher,
    /// A root path that we do not allow access to from this filesystem.
    /// Useful for things like output directories to prevent accidental ouroboros situations.
    denied_path: Option<RcStr>,
}

impl DiskFileSystemInner {
    /// Returns the root as Path
    fn root_path(&self) -> &Path {
        // just in case there's a windows unc path prefix we remove it with `dunce`
        simplified(Path::new(&*self.root))
    }

    /// Checks if a path is within the denied path
    /// Returns true if the path should be treated as non-existent
    ///
    /// Since denied_path is guaranteed to be:
    /// - normalized (no ../ traversals)
    /// - using unix separators (/)
    /// - relative to the fs root
    ///
    /// We can efficiently check using string operations
    fn is_path_denied(&self, path: &FileSystemPath) -> bool {
        let Some(denied_path) = &self.denied_path else {
            return false;
        };
        // If the path starts with the denied path then there are three cases
        // * they are equal => denied
        // * root relative path is a descendant which means the next character is a / => denied
        // * anything else => not denied (covers denying `.next` but allowing `.next2`)
        let path = &path.path;
        path.starts_with(denied_path.as_str())
            && (path.len() == denied_path.len()
                || path.as_bytes().get(denied_path.len()) == Some(&b'/'))
    }

    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function
    fn register_read_invalidator(&self, path: &Path) -> Result<()> {
        if let Some(invalidator) = turbo_tasks::get_invalidator() {
            self.invalidator_map
                .insert(path.to_owned(), invalidator, None);
            self.watcher.ensure_watched_file(path, self.root_path())?;
        }
        Ok(())
    }

    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function. It removes and returns
    /// the current list of invalidators.
    fn register_write_invalidator(
        &self,
        path: &Path,
        invalidator: Invalidator,
        write_content: WriteContent,
    ) -> Result<Vec<(Invalidator, Option<WriteContent>)>> {
        let mut invalidator_map = self.invalidator_map.lock().unwrap();
        let invalidators = invalidator_map.entry(path.to_owned()).or_default();
        let old_invalidators = invalidators
            .extract_if(|i, old_write_content| {
                i == &invalidator
                    || old_write_content
                        .as_ref()
                        .is_none_or(|old| old != &write_content)
            })
            .filter(|(i, _)| i != &invalidator)
            .collect::<Vec<_>>();
        invalidators.insert(invalidator, Some(write_content));
        drop(invalidator_map);
        self.watcher.ensure_watched_file(path, self.root_path())?;
        Ok(old_invalidators)
    }

    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function
    fn register_dir_invalidator(&self, path: &Path) -> Result<()> {
        if let Some(invalidator) = turbo_tasks::get_invalidator() {
            self.dir_invalidator_map
                .insert(path.to_owned(), invalidator, None);
            self.watcher.ensure_watched_dir(path, self.root_path())?;
        }
        Ok(())
    }

    async fn lock_path(&self, full_path: &Path) -> PathLockGuard<'_> {
        let lock1 = self.invalidation_lock.read().await;
        let lock2 = self.mutex_map.lock(full_path.to_path_buf()).await;
        PathLockGuard(lock1, lock2)
    }

    fn invalidate(&self) {
        let _span = tracing::info_span!("invalidate filesystem", name = &*self.root).entered();
        let invalidator_map = take(&mut *self.invalidator_map.lock().unwrap());
        let dir_invalidator_map = take(&mut *self.dir_invalidator_map.lock().unwrap());
        let invalidators = invalidator_map
            .into_iter()
            .chain(dir_invalidator_map)
            .flat_map(|(_, invalidators)| invalidators.into_keys())
            .collect::<Vec<_>>();
        parallel::for_each_owned(invalidators, |invalidator| invalidator.invalidate());
    }

    /// Invalidates every tracked file in the filesystem.
    ///
    /// Calls the given
    fn invalidate_with_reason<R: InvalidationReason + Clone>(
        &self,
        reason: impl Fn(&Path) -> R + Sync,
    ) {
        let _span = tracing::info_span!("invalidate filesystem", name = &*self.root).entered();
        let invalidator_map = take(&mut *self.invalidator_map.lock().unwrap());
        let dir_invalidator_map = take(&mut *self.dir_invalidator_map.lock().unwrap());
        let invalidators = invalidator_map
            .into_iter()
            .chain(dir_invalidator_map)
            .flat_map(|(path, invalidators)| {
                let reason_for_path = reason(&path);
                invalidators
                    .into_keys()
                    .map(move |i| (reason_for_path.clone(), i))
            })
            .collect::<Vec<_>>();
        parallel::for_each_owned(invalidators, |(reason, invalidator)| {
            invalidator.invalidate_with_reason(reason)
        });
    }

    fn invalidate_from_write(
        &self,
        full_path: &Path,
        invalidators: Vec<(Invalidator, Option<WriteContent>)>,
    ) {
        if !invalidators.is_empty() {
            if let Some(path) = format_absolute_fs_path(full_path, &self.name, self.root_path()) {
                if invalidators.len() == 1 {
                    let (invalidator, _) = invalidators.into_iter().next().unwrap();
                    invalidator.invalidate_with_reason(Write { path });
                } else {
                    invalidators.into_iter().for_each(|(invalidator, _)| {
                        invalidator.invalidate_with_reason(Write { path: path.clone() });
                    });
                }
            } else {
                invalidators.into_iter().for_each(|(invalidator, _)| {
                    invalidator.invalidate();
                });
            }
        }
    }

    #[tracing::instrument(level = "info", name = "start filesystem watching", skip_all, fields(path = %self.root))]
    async fn start_watching_internal(
        self: &Arc<Self>,
        report_invalidation_reason: bool,
        poll_interval: Option<Duration>,
    ) -> Result<()> {
        let root_path = self.root_path().to_path_buf();

        // create the directory for the filesystem on disk, if it doesn't exist
        retry_blocking(root_path.clone(), move |path| {
            let _tracing =
                tracing::info_span!("create root directory", name = display(path.display()))
                    .entered();

            std::fs::create_dir_all(path)
        })
        .concurrency_limited(&self.semaphore)
        .await?;

        self.watcher
            .start_watching(self.clone(), report_invalidation_reason, poll_interval)?;

        Ok(())
    }

    async fn create_directory(self: &Arc<Self>, directory: &Path) -> Result<()> {
        let already_created = ApplyEffectsContext::with_or_insert_with(
            DiskFileSystemApplyContext::default,
            |fs_context| fs_context.created_directories.contains(directory),
        );
        if !already_created {
            let func = |p: &Path| std::fs::create_dir_all(p);
            retry_blocking(directory.to_path_buf(), func)
                .concurrency_limited(&self.semaphore)
                .instrument(tracing::info_span!(
                    "create directory",
                    name = display(directory.display())
                ))
                .await?;
            ApplyEffectsContext::with(|fs_context: &mut DiskFileSystemApplyContext| {
                fs_context
                    .created_directories
                    .insert(directory.to_path_buf())
            });
        }
        Ok(())
    }
}

#[turbo_tasks::value(cell = "new", eq = "manual")]
pub struct DiskFileSystem {
    inner: Arc<DiskFileSystemInner>,
}

impl DiskFileSystem {
    pub fn name(&self) -> &RcStr {
        &self.inner.name
    }

    pub fn root(&self) -> &RcStr {
        &self.inner.root
    }

    pub fn invalidate(&self) {
        self.inner.invalidate();
    }

    pub fn invalidate_with_reason<R: InvalidationReason + Clone>(
        &self,
        reason: impl Fn(&Path) -> R + Sync,
    ) {
        self.inner.invalidate_with_reason(reason);
    }

    pub async fn start_watching(&self, poll_interval: Option<Duration>) -> Result<()> {
        self.inner
            .start_watching_internal(false, poll_interval)
            .await
    }

    pub async fn start_watching_with_invalidation_reason(
        &self,
        poll_interval: Option<Duration>,
    ) -> Result<()> {
        self.inner
            .start_watching_internal(true, poll_interval)
            .await
    }

    pub fn stop_watching(&self) {
        self.inner.watcher.stop_watching();
    }

    /// Try to convert [`Path`] to [`FileSystemPath`]. Return `None` if the file path leaves the
    /// filesystem root. If no `relative_to` argument is given, it is assumed that the `sys_path` is
    /// relative to the [`DiskFileSystem`] root.
    ///
    /// Attempts to convert absolute paths to paths relative to the filesystem root, though we only
    /// attempt to do so lexically.
    ///
    /// Assumes `self` is the `DiskFileSystem` contained in `vc_self`. This API is a bit awkward
    /// because:
    /// - [`Path`]/[`PathBuf`] should not be stored in the filesystem cache, so the function cannot
    ///   be a [`turbo_tasks::function`].
    /// - It's a little convenient for this function to be sync.
    pub fn try_from_sys_path(
        &self,
        vc_self: ResolvedVc<DiskFileSystem>,
        sys_path: &Path,
        relative_to: Option<&FileSystemPath>,
    ) -> Option<FileSystemPath> {
        let vc_self = ResolvedVc::upcast(vc_self);

        let sys_path = simplified(sys_path);
        let relative_sys_path = if sys_path.is_absolute() {
            // `normalize_lexically` will return an error if the relative `sys_path` leaves the
            // DiskFileSystem root
            let normalized_sys_path = sys_path.normalize_lexically().ok()?;
            normalized_sys_path
                .strip_prefix(self.inner.root_path())
                .ok()?
                .to_owned()
        } else if let Some(relative_to) = relative_to {
            debug_assert_eq!(
                relative_to.fs, vc_self,
                "`relative_to.fs` must match the current `ResolvedVc<DiskFileSystem>`"
            );
            let mut joined_sys_path = PathBuf::from(unix_to_sys(&relative_to.path).into_owned());
            joined_sys_path.push(sys_path);
            joined_sys_path.normalize_lexically().ok()?
        } else {
            sys_path.normalize_lexically().ok()?
        };

        Some(FileSystemPath {
            fs: vc_self,
            path: RcStr::from(sys_to_unix(relative_sys_path.to_str()?)),
        })
    }

    pub fn to_sys_path(&self, fs_path: &FileSystemPath) -> PathBuf {
        let path = self.inner.root_path();
        if fs_path.path.is_empty() {
            path.to_path_buf()
        } else {
            path.join(&*unix_to_sys(&fs_path.path))
        }
    }
}

#[allow(dead_code, reason = "we need to hold onto the locks")]
struct PathLockGuard<'a>(
    #[allow(dead_code)] RwLockReadGuard<'a, ()>,
    #[allow(dead_code)] mutex_map::MutexMapGuard<'a, PathBuf>,
);

fn format_absolute_fs_path(path: &Path, name: &str, root_path: &Path) -> Option<String> {
    if let Ok(rel_path) = path.strip_prefix(root_path) {
        let path = if MAIN_SEPARATOR != '/' {
            let rel_path = rel_path.to_string_lossy().replace(MAIN_SEPARATOR, "/");
            format!("[{name}]/{rel_path}")
        } else {
            format!("[{name}]/{}", rel_path.display())
        };
        Some(path)
    } else {
        None
    }
}

impl DiskFileSystem {
    /// Create a new instance of `DiskFileSystem`.
    /// # Arguments
    ///
    /// * `name` - Name of the filesystem.
    /// * `root` - Path to the given filesystem's root. Should be
    ///   [canonicalized][std::fs::canonicalize].
    pub fn new(name: RcStr, root: RcStr) -> Vc<Self> {
        Self::new_internal(name, root, None)
    }

    /// Create a new instance of `DiskFileSystem`.
    /// # Arguments
    ///
    /// * `name` - Name of the filesystem.
    /// * `root` - Path to the given filesystem's root. Should be
    ///   [canonicalized][std::fs::canonicalize].
    /// * `denied_path` - A path within this filesystem that is not allowed to be accessed or
    ///   navigated into.  This must be normalized, non-empty and relative to the fs root.
    pub fn new_with_denied_path(name: RcStr, root: RcStr, denied_path: RcStr) -> Vc<Self> {
        debug_assert!(!denied_path.is_empty(), "denied_path must not be empty");
        debug_assert!(
            normalize_path(&denied_path).as_deref() == Some(&*denied_path),
            "denied_path must be normalized: {denied_path:?}"
        );
        Self::new_internal(name, root, Some(denied_path))
    }
}

#[turbo_tasks::value_impl]
impl DiskFileSystem {
    #[turbo_tasks::function]
    fn new_internal(name: RcStr, root: RcStr, denied_path: Option<RcStr>) -> Vc<Self> {
        mark_stateful();

        let instance = DiskFileSystem {
            inner: Arc::new(DiskFileSystemInner {
                name,
                root,
                mutex_map: Default::default(),
                invalidation_lock: Default::default(),
                invalidator_map: InvalidatorMap::new(),
                dir_invalidator_map: InvalidatorMap::new(),
                semaphore: create_semaphore(),
                watcher: DiskWatcher::new(),
                denied_path,
            }),
        };

        Self::cell(instance)
    }
}

impl Debug for DiskFileSystem {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        write!(f, "name: {}, root: {}", self.inner.name, self.inner.root)
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for DiskFileSystem {
    #[turbo_tasks::function(fs)]
    async fn read(&self, fs_path: FileSystemPath) -> Result<Vc<FileContent>> {
        mark_session_dependent();

        // Check if path is denied - if so, treat as NotFound
        if self.inner.is_path_denied(&fs_path) {
            return Ok(FileContent::NotFound.cell());
        }
        let full_path = self.to_sys_path(&fs_path);

        self.inner.register_read_invalidator(&full_path)?;

        let _lock = self.inner.lock_path(&full_path).await;
        let content = match retry_blocking(full_path.clone(), |path: &Path| File::from_path(path))
            .concurrency_limited(&self.inner.semaphore)
            .instrument(tracing::info_span!(
                "read file",
                name = display(full_path.display())
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
    async fn raw_read_dir(&self, fs_path: FileSystemPath) -> Result<Vc<RawDirectoryContent>> {
        mark_session_dependent();

        // Check if directory itself is denied - if so, treat as NotFound
        if self.inner.is_path_denied(&fs_path) {
            return Ok(RawDirectoryContent::not_found());
        }
        let full_path = self.to_sys_path(&fs_path);

        self.inner.register_dir_invalidator(&full_path)?;

        // we use the sync std function here as it's a lot faster (600%) in
        // node-file-trace
        let read_dir = match retry_blocking(full_path.clone(), |path| {
            let _span =
                tracing::info_span!("read directory", name = display(path.display())).entered();
            std::fs::read_dir(path)
        })
        .concurrency_limited(&self.inner.semaphore)
        .await
        {
            Ok(dir) => dir,
            Err(e)
                if e.kind() == ErrorKind::NotFound
                    || e.kind() == ErrorKind::NotADirectory
                    || e.kind() == ErrorKind::InvalidFilename =>
            {
                return Ok(RawDirectoryContent::not_found());
            }
            Err(e) => {
                bail!(anyhow!(e).context(format!("reading dir {}", full_path.display())))
            }
        };
        let denied_entry = match self.inner.denied_path.as_ref() {
            Some(denied_path) => {
                // If we have a denied path, we need to see if the current directory is a prefix of
                // the denied path meaning that it is possible that some directory entry needs to be
                // filtered. we do this first to avoid string manipulation on every
                // iteration of the directory entries. So while expanding `foo/bar`,
                // if `foo/bar/baz` is denied, we filter out `baz`.
                // But if foo/bar/baz/qux is denied we don't filter anything from this level.
                let dir_path = fs_path.path.as_str();
                if denied_path.starts_with(dir_path) {
                    let denied_path_suffix =
                        if denied_path.as_bytes().get(dir_path.len()) == Some(&b'/') {
                            Some(&denied_path[dir_path.len() + 1..])
                        } else if dir_path.is_empty() {
                            Some(denied_path.as_str())
                        } else {
                            None
                        };
                    // if the suffix is `foo/bar` we cannot filter foo from this level
                    denied_path_suffix.filter(|s| !s.contains('/'))
                } else {
                    None
                }
            }
            None => None,
        };

        let entries = read_dir
            .filter_map(|r| {
                let e = match r {
                    Ok(e) => e,
                    Err(err) => return Some(Err(err.into())),
                };

                // we filter out any non unicode names
                let file_name: RcStr = e.file_name().to_str()?.into();
                // Filter out denied entries
                if let Some(denied_name) = denied_entry
                    && denied_name == file_name.as_str()
                {
                    return None;
                }

                let entry = match e.file_type() {
                    Ok(t) if t.is_file() => RawDirectoryEntry::File,
                    Ok(t) if t.is_dir() => RawDirectoryEntry::Directory,
                    Ok(t) if t.is_symlink() => RawDirectoryEntry::Symlink,
                    Ok(_) => RawDirectoryEntry::Other,
                    Err(err) => return Some(Err(err.into())),
                };

                Some(anyhow::Ok((file_name, entry)))
            })
            .collect::<Result<_>>()
            .with_context(|| format!("reading directory item in {}", full_path.display()))?;

        Ok(RawDirectoryContent::new(entries))
    }

    #[turbo_tasks::function(fs)]
    async fn read_link(&self, fs_path: FileSystemPath) -> Result<Vc<LinkContent>> {
        mark_session_dependent();

        // Check if path is denied - if so, treat as NotFound
        if self.inner.is_path_denied(&fs_path) {
            return Ok(LinkContent::NotFound.cell());
        }
        let full_path = self.to_sys_path(&fs_path);

        self.inner.register_read_invalidator(&full_path)?;

        let _lock = self.inner.lock_path(&full_path).await;
        let link_path =
            match retry_blocking(full_path.clone(), |path: &Path| std::fs::read_link(path))
                .concurrency_limited(&self.inner.semaphore)
                .instrument(tracing::info_span!(
                    "read symlink",
                    name = display(full_path.display())
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
        let result = simplified(&file).strip_prefix(simplified(Path::new(&self.inner.root)));

        let relative_to_root_path = match result {
            Ok(file) => PathBuf::from(sys_to_unix(&file.to_string_lossy()).as_ref()),
            Err(_) => return Ok(LinkContent::Invalid.cell()),
        };

        let (target, file_type) = if is_link_absolute {
            let target_string: RcStr = relative_to_root_path.to_string_lossy().into();
            (
                target_string.clone(),
                FileSystemPath::new_normalized(fs_path.fs().to_resolved().await?, target_string)
                    .get_type()
                    .await?,
            )
        } else {
            let link_path_string_cow = link_path.to_string_lossy();
            let link_path_unix: RcStr = sys_to_unix(&link_path_string_cow).into();
            (
                link_path_unix.clone(),
                fs_path.parent().join(&link_path_unix)?.get_type().await?,
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
    async fn write(&self, fs_path: FileSystemPath, content: Vc<FileContent>) -> Result<()> {
        // You might be tempted to use `mark_session_dependent` here, but
        // `write` purely declares a side effect and does not need to be reexecuted in the next
        // session. All side effects are reexecuted in general.

        // Check if path is denied - if so, return an error
        if self.inner.is_path_denied(&fs_path) {
            bail!(
                "Cannot write to denied path: {}",
                fs_path.value_to_string().await?
            );
        }
        let full_path = self.to_sys_path(&fs_path);

        let content = content.await?;

        let inner = self.inner.clone();
        let invalidator = turbo_tasks::get_invalidator();

        effect(async move {
            let full_path = validate_path_length(&full_path)?;

            let _lock = inner.lock_path(&full_path).await;

            // Track the file, so that we will rewrite it if it ever changes.
            let old_invalidators = invalidator
                .map(|invalidator| {
                    inner.register_write_invalidator(
                        &full_path,
                        invalidator,
                        WriteContent::File(content.clone()),
                    )
                })
                .transpose()?
                .unwrap_or_default();

            // We perform an untracked comparison here, so that this write is not dependent
            // on a read's Vc<FileContent> (and the memory it holds). Our untracked read can
            // be freed immediately. Given this is an output file, it's unlikely any Turbo
            // code will need to read the file from disk into a Vc<FileContent>, so we're
            // not wasting cycles.
            let compare = content
                .streaming_compare(&full_path)
                .concurrency_limited(&inner.semaphore)
                .instrument(tracing::info_span!(
                    "read file before write",
                    name = display(full_path.display())
                ))
                .await?;
            if compare == FileComparison::Equal {
                if !old_invalidators.is_empty() {
                    for (invalidator, write_content) in old_invalidators {
                        inner.invalidator_map.insert(
                            full_path.clone().into_owned(),
                            invalidator,
                            write_content,
                        );
                    }
                }
                return Ok(());
            }

            match &*content {
                FileContent::Content(..) => {
                    let create_directory = compare == FileComparison::Create;
                    if create_directory && let Some(parent) = full_path.parent() {
                        inner.create_directory(parent).await.with_context(|| {
                            format!(
                                "failed to create directory {} for write to {}",
                                parent.display(),
                                full_path.display()
                            )
                        })?;
                    }

                    let full_path_to_write = full_path.clone();
                    let content = content.clone();
                    retry_blocking(full_path_to_write.into_owned(), move |full_path| {
                        use std::io::Write;

                        let mut f = std::fs::File::create(full_path)?;
                        let FileContent::Content(file) = &*content else {
                            unreachable!()
                        };
                        std::io::copy(&mut file.read(), &mut f)?;
                        #[cfg(target_family = "unix")]
                        f.set_permissions(file.meta.permissions.into())?;
                        f.flush()?;

                        static WRITE_VERSION: LazyLock<bool> = LazyLock::new(|| {
                            std::env::var_os("TURBO_ENGINE_WRITE_VERSION")
                                .is_some_and(|v| v == "1" || v == "true")
                        });
                        if *WRITE_VERSION {
                            let mut full_path = full_path.to_owned();
                            let hash = hash_xxh3_hash64(file);
                            let ext = full_path.extension();
                            let ext = if let Some(ext) = ext {
                                format!("{:016x}.{}", hash, ext.to_string_lossy())
                            } else {
                                format!("{hash:016x}")
                            };
                            full_path.set_extension(ext);
                            let mut f = std::fs::File::create(&full_path)?;
                            std::io::copy(&mut file.read(), &mut f)?;
                            #[cfg(target_family = "unix")]
                            f.set_permissions(file.meta.permissions.into())?;
                            f.flush()?;
                        }
                        Ok::<(), io::Error>(())
                    })
                    .concurrency_limited(&inner.semaphore)
                    .instrument(tracing::info_span!(
                        "write file",
                        name = display(full_path.display())
                    ))
                    .await
                    .with_context(|| format!("failed to write to {}", full_path.display()))?;
                }
                FileContent::NotFound => {
                    retry_blocking(full_path.clone().into_owned(), |path| {
                        std::fs::remove_file(path)
                    })
                    .concurrency_limited(&inner.semaphore)
                    .instrument(tracing::info_span!(
                        "remove file",
                        name = display(full_path.display())
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

            inner.invalidate_from_write(&full_path, old_invalidators);

            Ok(())
        });

        Ok(())
    }

    #[turbo_tasks::function(fs)]
    async fn write_link(&self, fs_path: FileSystemPath, target: Vc<LinkContent>) -> Result<()> {
        // You might be tempted to use `mark_session_dependent` here, but
        // `write_link` purely declares a side effect and does not need to be reexecuted in the next
        // session. All side effects are reexecuted in general.

        // Check if path is denied - if so, return an error
        if self.inner.is_path_denied(&fs_path) {
            bail!(
                "Cannot write link to denied path: {}",
                fs_path.value_to_string().await?
            );
        }
        let full_path = self.to_sys_path(&fs_path);

        let content = target.await?;
        let inner = self.inner.clone();
        let invalidator = turbo_tasks::get_invalidator();

        effect(async move {
            let full_path = validate_path_length(&full_path)?;

            let _lock = inner.lock_path(&full_path).await;

            let old_invalidators = invalidator
                .map(|invalidator| {
                    inner.register_write_invalidator(
                        &full_path,
                        invalidator,
                        WriteContent::Link(content.clone()),
                    )
                })
                .transpose()?
                .unwrap_or_default();

            // TODO(sokra) preform a untracked read here, register an invalidator and get
            // all existing invalidators
            let old_content = match retry_blocking(full_path.clone().into_owned(), |path| {
                std::fs::read_link(path)
            })
            .concurrency_limited(&inner.semaphore)
            .instrument(tracing::info_span!(
                "read symlink before write",
                name = display(full_path.display())
            ))
            .await
            {
                Ok(res) => Some((res.is_absolute(), res)),
                Err(_) => None,
            };
            let is_equal = match (&*content, &old_content) {
                (LinkContent::Link { target, link_type }, Some((old_is_absolute, old_target))) => {
                    Path::new(&**target) == old_target
                        && link_type.contains(LinkType::ABSOLUTE) == *old_is_absolute
                }
                (LinkContent::NotFound, None) => true,
                _ => false,
            };
            if is_equal {
                if !old_invalidators.is_empty() {
                    for (invalidator, write_content) in old_invalidators {
                        inner.invalidator_map.insert(
                            full_path.clone().into_owned(),
                            invalidator,
                            write_content,
                        );
                    }
                }
                return Ok(());
            }

            match &*content {
                LinkContent::Link { target, link_type } => {
                    let create_directory = old_content.is_none();
                    if create_directory && let Some(parent) = full_path.parent() {
                        inner.create_directory(parent).await.with_context(|| {
                            format!(
                                "failed to create directory {} for write link to {}",
                                parent.display(),
                                full_path.display()
                            )
                        })?;
                    }

                    let link_type = *link_type;
                    let target_path = if link_type.contains(LinkType::ABSOLUTE) {
                        Path::new(&inner.root).join(unix_to_sys(target).as_ref())
                    } else {
                        PathBuf::from(unix_to_sys(target).as_ref())
                    };
                    let full_path = full_path.into_owned();
                    retry_blocking(target_path, move |target_path| {
                        let _span = tracing::info_span!(
                            "write symlink",
                            name = display(target_path.display())
                        )
                        .entered();
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
                    .with_context(|| format!("create symlink to {target}"))?;
                }
                LinkContent::Invalid => {
                    anyhow::bail!("invalid symlink target: {}", full_path.display())
                }
                LinkContent::NotFound => {
                    retry_blocking(full_path.clone().into_owned(), |path| {
                        std::fs::remove_file(path)
                    })
                    .concurrency_limited(&inner.semaphore)
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

            Ok(())
        });
        Ok(())
    }

    #[turbo_tasks::function(fs)]
    async fn metadata(&self, fs_path: FileSystemPath) -> Result<Vc<FileMeta>> {
        mark_session_dependent();
        let full_path = self.to_sys_path(&fs_path);

        // Check if path is denied - if so, return an error (metadata shouldn't be readable)
        if self.inner.is_path_denied(&fs_path) {
            bail!(
                "Cannot read metadata from denied path: {}",
                fs_path.value_to_string().await?
            );
        }

        self.inner.register_read_invalidator(&full_path)?;

        let _lock = self.inner.lock_path(&full_path).await;
        let meta = retry_blocking(full_path.clone(), |path| std::fs::metadata(path))
            .concurrency_limited(&self.inner.semaphore)
            .instrument(tracing::info_span!(
                "read metadata",
                name = display(full_path.display())
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
        Vc::cell(self.inner.name.clone())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Hash, TaskInput)]
pub struct FileSystemPath {
    pub fs: ResolvedVc<Box<dyn FileSystem>>,
    pub path: RcStr,
}

impl FileSystemPath {
    /// Mimics `ValueToString::to_string`.
    pub fn value_to_string(&self) -> Vc<RcStr> {
        value_to_string(self.clone())
    }
}

#[turbo_tasks::function]
async fn value_to_string(path: FileSystemPath) -> Result<Vc<RcStr>> {
    Ok(Vc::cell(
        format!("[{}]/{}", path.fs.to_string().await?, path.path).into(),
    ))
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

        Some(get_relative_path_to(&self.path, &other.path).into())
    }

    /// Returns the final component of the FileSystemPath, or an empty string
    /// for the root path.
    pub fn file_name(&self) -> &str {
        let (_, file_name) = self.split_file_name();
        file_name
    }

    /// Returns true if this path has the given extension
    ///
    /// slightly faster than `self.extension_ref() == Some(extension)` as we can simply match a
    /// suffix
    pub fn has_extension(&self, extension: &str) -> bool {
        debug_assert!(!extension.contains('/') && extension.starts_with('.'));
        self.path.ends_with(extension)
    }

    /// Returns the extension (without a leading `.`)
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
pub struct FileSystemPathOption(Option<FileSystemPath>);

#[turbo_tasks::value_impl]
impl FileSystemPathOption {
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }
}

impl FileSystemPath {
    /// Create a new FileSystemPath from a path within a FileSystem. The
    /// /-separated path is expected to be already normalized (this is asserted
    /// in dev mode).
    fn new_normalized(fs: ResolvedVc<Box<dyn FileSystem>>, path: RcStr) -> Self {
        // On Windows, the path must be converted to a unix path before creating. But on
        // Unix, backslashes are a valid char in file names, and the path can be
        // provided by the user, so we allow it.
        debug_assert!(
            MAIN_SEPARATOR != '\\' || !path.contains('\\'),
            "path {path} must not contain a Windows directory '\\', it must be normalized to Unix \
             '/'",
        );
        debug_assert!(
            normalize_path(&path).as_deref() == Some(&*path),
            "path {path} must be normalized",
        );
        FileSystemPath { fs, path }
    }

    /// Adds a subpath to the current path. The /-separate path argument might
    /// contain ".." or "." segments, but it must not leave the root of the
    /// filesystem.
    pub fn join(&self, path: &str) -> Result<Self> {
        if let Some(path) = join_path(&self.path, path) {
            Ok(Self::new_normalized(self.fs, path.into()))
        } else {
            bail!(
                "FileSystemPath(\"{}\").join(\"{}\") leaves the filesystem root",
                self.path,
                path
            );
        }
    }

    /// Adds a suffix to the filename. [path] must not contain `/`.
    pub fn append(&self, path: &str) -> Result<Self> {
        if path.contains('/') {
            bail!(
                "FileSystemPath(\"{}\").append(\"{}\") must not append '/'",
                self.path,
                path
            )
        }
        Ok(Self::new_normalized(
            self.fs,
            format!("{}{}", self.path, path).into(),
        ))
    }

    /// Adds a suffix to the basename of the filename. [appending] must not
    /// contain `/`. Extension will stay intact.
    pub fn append_to_stem(&self, appending: &str) -> Result<Self> {
        if appending.contains('/') {
            bail!(
                "FileSystemPath(\"{}\").append_to_stem(\"{}\") must not append '/'",
                self.path,
                appending
            )
        }
        if let (path, Some(ext)) = self.split_extension() {
            return Ok(Self::new_normalized(
                self.fs,
                format!("{path}{appending}.{ext}").into(),
            ));
        }
        Ok(Self::new_normalized(
            self.fs,
            format!("{}{}", self.path, appending).into(),
        ))
    }

    /// Similar to [FileSystemPath::join], but returns an Option that will be
    /// None when the joined path would leave the filesystem root.
    #[allow(clippy::needless_borrow)] // for windows build
    pub fn try_join(&self, path: &str) -> Result<Option<FileSystemPath>> {
        // TODO(PACK-3279): Remove this once we do not produce invalid paths at the first place.
        #[cfg(target_os = "windows")]
        let path = path.replace('\\', "/");

        if let Some(path) = join_path(&self.path, &path) {
            Ok(Some(Self::new_normalized(self.fs, path.into())))
        } else {
            Ok(None)
        }
    }

    /// Similar to [FileSystemPath::join], but returns an Option that will be
    /// None when the joined path would leave the current path.
    pub fn try_join_inside(&self, path: &str) -> Result<Option<FileSystemPath>> {
        if let Some(path) = join_path(&self.path, path)
            && path.starts_with(&*self.path)
        {
            return Ok(Some(Self::new_normalized(self.fs, path.into())));
        }
        Ok(None)
    }

    /// DETERMINISM: Result is in random order. Either sort result or do not depend
    /// on the order.
    pub fn read_glob(&self, glob: Vc<Glob>) -> Vc<ReadGlobResult> {
        read_glob(self.clone(), glob)
    }

    // Tracks all files and directories matching the glob
    // Follows symlinks as though they were part of the original hierarchy.
    pub fn track_glob(&self, glob: Vc<Glob>, include_dot_files: bool) -> Vc<Completion> {
        track_glob(self.clone(), glob, include_dot_files)
    }

    pub fn root(&self) -> Vc<Self> {
        self.fs().root()
    }
}

impl FileSystemPath {
    pub fn fs(&self) -> Vc<Box<dyn FileSystem>> {
        *self.fs
    }

    pub fn extension(&self) -> &str {
        self.extension_ref().unwrap_or_default()
    }

    pub fn is_inside(&self, other: &FileSystemPath) -> bool {
        self.is_inside_ref(other)
    }

    pub fn is_inside_or_equal(&self, other: &FileSystemPath) -> bool {
        self.is_inside_or_equal_ref(other)
    }

    /// Creates a new [`FileSystemPath`] like `self` but with the given
    /// extension.
    pub fn with_extension(&self, extension: &str) -> FileSystemPath {
        let (path_without_extension, _) = self.split_extension();
        Self::new_normalized(
            self.fs,
            // Like `Path::with_extension` and `PathBuf::set_extension`, if the extension is empty,
            // we remove the extension altogether.
            match extension.is_empty() {
                true => path_without_extension.into(),
                false => format!("{path_without_extension}.{extension}").into(),
            },
        )
    }

    /// Extracts the stem (non-extension) portion of self.file_name.
    ///
    /// The stem is:
    ///
    /// * [`None`], if there is no file name;
    /// * The entire file name if there is no embedded `.`;
    /// * The entire file name if the file name begins with `.` and has no other `.`s within;
    /// * Otherwise, the portion of the file name before the final `.`
    pub fn file_stem(&self) -> Option<&str> {
        let (_, file_stem, _) = self.split_file_stem_extension();
        if file_stem.is_empty() {
            return None;
        }
        Some(file_stem)
    }
}

impl Display for FileSystemPath {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.path)
    }
}

#[turbo_tasks::function]
pub async fn rebase(
    fs_path: FileSystemPath,
    old_base: FileSystemPath,
    new_base: FileSystemPath,
) -> Result<Vc<FileSystemPath>> {
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
    Ok(new_base.fs.root().await?.join(&new_path)?.cell())
}

// Not turbo-tasks functions, only delegating
impl FileSystemPath {
    pub fn read(&self) -> Vc<FileContent> {
        self.fs().read(self.clone())
    }

    pub fn read_link(&self) -> Vc<LinkContent> {
        self.fs().read_link(self.clone())
    }

    pub fn read_json(&self) -> Vc<FileJsonContent> {
        self.fs().read(self.clone()).parse_json()
    }

    pub fn read_json5(&self) -> Vc<FileJsonContent> {
        self.fs().read(self.clone()).parse_json5()
    }

    /// Reads content of a directory.
    ///
    /// DETERMINISM: Result is in random order. Either sort result or do not
    /// depend on the order.
    pub fn raw_read_dir(&self) -> Vc<RawDirectoryContent> {
        self.fs().raw_read_dir(self.clone())
    }

    pub fn write(&self, content: Vc<FileContent>) -> Vc<()> {
        self.fs().write(self.clone(), content)
    }

    pub fn write_link(&self, target: Vc<LinkContent>) -> Vc<()> {
        self.fs().write_link(self.clone(), target)
    }

    pub fn metadata(&self) -> Vc<FileMeta> {
        self.fs().metadata(self.clone())
    }

    // Returns the realpath to the file, resolving all symlinks and reporting an error if the path
    // is invalid.
    pub async fn realpath(&self) -> Result<FileSystemPath> {
        let result = &(*self.realpath_with_links().await?);
        match &result.path_result {
            Ok(path) => Ok(path.clone()),
            Err(error) => Err(anyhow::anyhow!(error.as_error_message(self, result))),
        }
    }

    pub fn rebase(
        fs_path: FileSystemPath,
        old_base: FileSystemPath,
        new_base: FileSystemPath,
    ) -> Vc<FileSystemPath> {
        rebase(fs_path, old_base, new_base)
    }
}

impl FileSystemPath {
    /// Reads content of a directory.
    ///
    /// DETERMINISM: Result is in random order. Either sort result or do not
    /// depend on the order.
    pub fn read_dir(&self) -> Vc<DirectoryContent> {
        read_dir(self.clone())
    }

    pub fn parent(&self) -> FileSystemPath {
        let path = &self.path;
        if path.is_empty() {
            return self.clone();
        }
        FileSystemPath::new_normalized(self.fs, RcStr::from(get_parent_path(path)))
    }

    // It is important that get_type uses read_dir and not stat/metadata.
    // - `get_type` is called very very often during resolving and stat would
    // make it 1 syscall per call, whereas read_dir would make it 1 syscall per
    // directory.
    // - `metadata` allows you to use the "wrong" casing on
    // case-insensitive filesystems, while read_dir gives you the "correct"
    // casing. We want to enforce "correct" casing to avoid broken builds on
    // Vercel deployments (case-sensitive).
    pub fn get_type(&self) -> Vc<FileSystemEntryType> {
        get_type(self.clone())
    }

    pub fn realpath_with_links(&self) -> Vc<RealPathResult> {
        realpath_with_links(self.clone())
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
    pub path_result: Result<FileSystemPath, RealPathResultError>,
    pub symlinks: Vec<FileSystemPath>,
}

/// Errors that can occur when resolving a path with symlinks.
/// Many of these can be transient conditions that might happen when package managers are running.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize, NonLocalValue, TraceRawVcs)]
pub enum RealPathResultError {
    TooManySymlinks,
    CycleDetected,
    Invalid,
    NotFound,
}
impl RealPathResultError {
    /// Formats the error message
    pub fn as_error_message(&self, orig: &FileSystemPath, result: &RealPathResult) -> String {
        match self {
            RealPathResultError::TooManySymlinks => format!(
                "Symlink {orig} leads to too many other symlinks ({len} links)",
                len = result.symlinks.len()
            ),
            RealPathResultError::CycleDetected => {
                format!("Symlink {orig} is in a symlink loop: {:?}", result.symlinks)
            }
            RealPathResultError::Invalid => {
                format!("Symlink {orig} is invalid, it points out of the filesystem root")
            }
            RealPathResultError::NotFound => {
                format!("Symlink {orig} is invalid, it points at a file that doesn't exist")
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Default, DeterministicHash, PartialOrd, Ord)]
#[turbo_tasks::value(shared)]
pub enum Permissions {
    Readable,
    #[default]
    Writable,
    Executable,
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
#[derive(Clone, Debug, DeterministicHash, PartialOrd, Ord)]
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
    async fn streaming_compare(&self, path: &Path) -> Result<FileComparison> {
        let old_file = extract_disk_access(
            retry_blocking(path.to_path_buf(), |path| std::fs::File::open(path)).await,
            path,
        )?;
        let Some(old_file) = old_file else {
            return Ok(match self {
                FileContent::NotFound => FileComparison::Equal,
                _ => FileComparison::Create,
            });
        };
        // We know old file exists, does the new file?
        let FileContent::Content(new_file) = self else {
            return Ok(FileComparison::NotEqual);
        };

        let old_meta = extract_disk_access(
            retry_blocking(path.to_path_buf(), {
                let file_for_metadata = old_file.try_clone()?;
                move |_| file_for_metadata.metadata()
            })
            .await,
            path,
        )?;
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
        let mut old_contents = BufReader::new(old_file);
        Ok(loop {
            let new_chunk = new_contents.fill_buf()?;
            let Ok(old_chunk) = old_contents.fill_buf() else {
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
  #[derive(Default, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
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
    // We don't use the `FileSystemPath` here for now, because the `FileSystemPath` is always
    // normalized, which means in `fn write_link` we couldn't restore the raw value of the file
    // link because there is only **dist** path in `fn write_link`, and we need the raw path if
    // we want to restore the link value in `fn write_link`
    Link { target: RcStr, link_type: LinkType },
    // Invalid means the link is invalid it points out of the filesystem root
    Invalid,
    // The target was not found
    NotFound,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, DeterministicHash, PartialOrd, Ord)]
pub struct File {
    #[turbo_tasks(debug_ignore)]
    content: Rope,
    meta: FileMeta,
}

impl File {
    /// Reads a [File] from the given path
    fn from_path(p: &Path) -> io::Result<Self> {
        let mut file = std::fs::File::open(p)?;
        let metadata = file.metadata()?;

        let mut output = Vec::with_capacity(metadata.len() as usize);
        file.read_to_end(&mut output)?;

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
        File::from_rope(ReadRef::into_owned(rope))
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
    use serde::{Deserializer, Serializer, de};

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

        impl de::Visitor<'_> for Visitor {
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
                        .map_err(|e| E::custom(format!("{e}")))
                }
            }
        }

        deserializer.deserialize_str(Visitor)
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default)]
pub struct FileMeta {
    // Size of the file
    // len: u64,
    permissions: Permissions,
    #[serde(with = "mime_option_serde")]
    #[turbo_tasks(trace_ignore)]
    content_type: Option<Mime>,
}

impl Ord for FileMeta {
    fn cmp(&self, other: &Self) -> Ordering {
        self.permissions
            .cmp(&other.permissions)
            .then_with(|| self.content_type.as_ref().cmp(&other.content_type.as_ref()))
    }
}

impl PartialOrd for FileMeta {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
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
                let content = file.content.clone().into_bytes();
                let de = &mut serde_json::Deserializer::from_slice(&content);
                match serde_path_to_error::deserialize(de) {
                    Ok(data) => FileJsonContent::Content(data),
                    Err(e) => FileJsonContent::Unparsable(Box::new(
                        UnparsableJson::from_serde_path_to_error(e),
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
                        None => FileJsonContent::unparsable(rcstr!(
                            "text content doesn't contain any json data"
                        )),
                    },
                    Err(e) => FileJsonContent::Unparsable(Box::new(
                        UnparsableJson::from_jsonc_error(e, string.as_ref()),
                    )),
                },
                Err(_) => FileJsonContent::unparsable(rcstr!("binary is not valid utf-8 text")),
            },
            FileContent::NotFound => FileJsonContent::NotFound,
        }
    }

    pub fn parse_json5_ref(&self) -> FileJsonContent {
        match self {
            FileContent::Content(file) => match file.content.to_str() {
                Ok(string) => match parse_to_serde_value(
                    &string,
                    &ParseOptions {
                        allow_comments: true,
                        allow_trailing_commas: true,
                        allow_loose_object_property_names: true,
                    },
                ) {
                    Ok(data) => match data {
                        Some(value) => FileJsonContent::Content(value),
                        None => FileJsonContent::unparsable(rcstr!(
                            "text content doesn't contain any json data"
                        )),
                    },
                    Err(e) => FileJsonContent::Unparsable(Box::new(
                        UnparsableJson::from_jsonc_error(e, string.as_ref()),
                    )),
                },
                Err(_) => FileJsonContent::unparsable(rcstr!("binary is not valid utf-8 text")),
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
                                bytes_offset += (l.len() + 1) as u32;
                                line
                            })
                            .collect(),
                    )
                }
                Err(_) => FileLinesContent::Unparsable,
            },
            FileContent::NotFound => FileLinesContent::NotFound,
        }
    }
}

#[turbo_tasks::value_impl]
impl FileContent {
    #[turbo_tasks::function]
    pub fn len(&self) -> Result<Vc<Option<u64>>> {
        Ok(Vc::cell(match self {
            FileContent::Content(file) => Some(file.content.len() as u64),
            FileContent::NotFound => None,
        }))
    }

    #[turbo_tasks::function]
    pub fn parse_json(&self) -> Result<Vc<FileJsonContent>> {
        Ok(self.parse_json_ref().into())
    }

    #[turbo_tasks::function]
    pub async fn parse_json_with_comments(self: Vc<Self>) -> Result<Vc<FileJsonContent>> {
        let this = self.await?;
        Ok(this.parse_json_with_comments_ref().into())
    }

    #[turbo_tasks::function]
    pub async fn parse_json5(self: Vc<Self>) -> Result<Vc<FileJsonContent>> {
        let this = self.await?;
        Ok(this.parse_json5_ref().into())
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
    Unparsable(Box<UnparsableJson>),
    NotFound,
}

#[turbo_tasks::value_impl]
impl ValueToString for FileJsonContent {
    /// Returns the JSON file content as a UTF-8 string.
    ///
    /// This operation will only succeed if the file contents are a valid JSON
    /// value.
    #[turbo_tasks::function]
    fn to_string(&self) -> Result<Vc<RcStr>> {
        match self {
            FileJsonContent::Content(json) => Ok(Vc::cell(json.to_string().into())),
            FileJsonContent::Unparsable(e) => Err(anyhow!("File is not valid JSON: {}", e)),
            FileJsonContent::NotFound => Err(anyhow!("File not found")),
        }
    }
}

#[turbo_tasks::value_impl]
impl FileJsonContent {
    #[turbo_tasks::function]
    pub async fn content(self: Vc<Self>) -> Result<Vc<Value>> {
        match &*self.await? {
            FileJsonContent::Content(json) => Ok(Vc::cell(json.clone())),
            FileJsonContent::Unparsable(e) => Err(anyhow!("File is not valid JSON: {}", e)),
            FileJsonContent::NotFound => Err(anyhow!("File not found")),
        }
    }
}
impl FileJsonContent {
    pub fn unparsable(message: RcStr) -> Self {
        FileJsonContent::Unparsable(Box::new(UnparsableJson {
            message,
            path: None,
            start_location: None,
            end_location: None,
        }))
    }

    pub fn unparsable_with_message(message: RcStr) -> Self {
        FileJsonContent::Unparsable(Box::new(UnparsableJson {
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
    pub bytes_offset: u32,
}

#[turbo_tasks::value(shared, serialization = "none")]
pub enum FileLinesContent {
    Lines(#[turbo_tasks(trace_ignore)] Vec<FileLine>),
    Unparsable,
    NotFound,
}

#[derive(Hash, Clone, Debug, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize, NonLocalValue)]
pub enum RawDirectoryEntry {
    File,
    Directory,
    Symlink,
    // Other just means 'not a file, directory, or symlink'
    Other,
}

#[derive(Hash, Clone, Debug, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize, NonLocalValue)]
pub enum DirectoryEntry {
    File(FileSystemPath),
    Directory(FileSystemPath),
    Symlink(FileSystemPath),
    Other(FileSystemPath),
    Error(RcStr),
}

impl DirectoryEntry {
    /// Handles the `DirectoryEntry::Symlink` variant by checking the symlink target
    /// type and replacing it with `DirectoryEntry::File` or
    /// `DirectoryEntry::Directory`.
    pub async fn resolve_symlink(self) -> Result<Self> {
        if let DirectoryEntry::Symlink(symlink) = &self {
            let result = &*symlink.realpath_with_links().await?;
            let real_path = match &result.path_result {
                Ok(path) => path,
                Err(error) => {
                    return Ok(DirectoryEntry::Error(
                        error.as_error_message(symlink, result).into(),
                    ));
                }
            };
            Ok(match *real_path.get_type().await? {
                FileSystemEntryType::Directory => DirectoryEntry::Directory(real_path.clone()),
                FileSystemEntryType::File => DirectoryEntry::File(real_path.clone()),
                // Happens if the link is to a non-existent file
                FileSystemEntryType::NotFound => DirectoryEntry::Error(
                    format!("Symlink {symlink} points at {real_path} which does not exist").into(),
                ),
                // This is caused by eventual consistency
                FileSystemEntryType::Symlink => bail!(
                    "Symlink {symlink} points at a symlink but realpath_with_links returned a path"
                ),
                _ => self,
            })
        } else {
            Ok(self)
        }
    }

    pub fn path(self) -> Option<FileSystemPath> {
        match self {
            DirectoryEntry::File(path)
            | DirectoryEntry::Directory(path)
            | DirectoryEntry::Symlink(path)
            | DirectoryEntry::Other(path) => Some(path),
            DirectoryEntry::Error(_) => None,
        }
    }
}

#[turbo_tasks::value]
#[derive(Hash, Clone, Copy, Debug)]
pub enum FileSystemEntryType {
    NotFound,
    File,
    Directory,
    Symlink,
    /// These would be things like named pipes, sockets, etc.
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
            DirectoryEntry::Error(_) => FileSystemEntryType::Error,
        }
    }
}

impl From<RawDirectoryEntry> for FileSystemEntryType {
    fn from(entry: RawDirectoryEntry) -> Self {
        FileSystemEntryType::from(&entry)
    }
}

impl From<&RawDirectoryEntry> for FileSystemEntryType {
    fn from(entry: &RawDirectoryEntry) -> Self {
        match entry {
            RawDirectoryEntry::File => FileSystemEntryType::File,
            RawDirectoryEntry::Directory => FileSystemEntryType::Directory,
            RawDirectoryEntry::Symlink => FileSystemEntryType::Symlink,
            RawDirectoryEntry::Other => FileSystemEntryType::Other,
        }
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
pub enum RawDirectoryContent {
    // The entry keys are the directory relative file names
    // e.g. for `/bar/foo`, it will be `foo`
    Entries(AutoMap<RcStr, RawDirectoryEntry>),
    NotFound,
}

impl RawDirectoryContent {
    pub fn new(entries: AutoMap<RcStr, RawDirectoryEntry>) -> Vc<Self> {
        Self::cell(RawDirectoryContent::Entries(entries))
    }

    pub fn not_found() -> Vc<Self> {
        Self::cell(RawDirectoryContent::NotFound)
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
    fn read(&self, _fs_path: FileSystemPath) -> Vc<FileContent> {
        FileContent::NotFound.cell()
    }

    #[turbo_tasks::function]
    fn read_link(&self, _fs_path: FileSystemPath) -> Vc<LinkContent> {
        LinkContent::NotFound.into()
    }

    #[turbo_tasks::function]
    fn raw_read_dir(&self, _fs_path: FileSystemPath) -> Vc<RawDirectoryContent> {
        RawDirectoryContent::not_found()
    }

    #[turbo_tasks::function]
    fn write(&self, _fs_path: FileSystemPath, _content: Vc<FileContent>) -> Vc<()> {
        Vc::default()
    }

    #[turbo_tasks::function]
    fn write_link(&self, _fs_path: FileSystemPath, _target: Vc<LinkContent>) -> Vc<()> {
        Vc::default()
    }

    #[turbo_tasks::function]
    fn metadata(&self, _fs_path: FileSystemPath) -> Vc<FileMeta> {
        FileMeta::default().cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NullFileSystem {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("null"))
    }
}

pub async fn to_sys_path(mut path: FileSystemPath) -> Result<Option<PathBuf>> {
    loop {
        if let Some(fs) = ResolvedVc::try_downcast_type::<AttachedFileSystem>(path.fs) {
            path = fs.get_inner_fs_path(path).owned().await?;
            continue;
        }

        if let Some(fs) = ResolvedVc::try_downcast_type::<DiskFileSystem>(path.fs) {
            let sys_path = fs.await?.to_sys_path(&path);
            return Ok(Some(sys_path));
        }

        return Ok(None);
    }
}

#[turbo_tasks::function]
async fn read_dir(path: FileSystemPath) -> Result<Vc<DirectoryContent>> {
    let fs = path.fs().to_resolved().await?;
    match &*fs.raw_read_dir(path.clone()).await? {
        RawDirectoryContent::NotFound => Ok(DirectoryContent::not_found()),
        RawDirectoryContent::Entries(entries) => {
            let mut normalized_entries = AutoMap::new();
            let dir_path = &path.path;
            for (name, entry) in entries {
                // Construct the path directly instead of going through `join`.
                // We do not need to normalize since the `name` is guaranteed to be a simple
                // path segment.
                let path = if dir_path.is_empty() {
                    name.clone()
                } else {
                    RcStr::from(format!("{dir_path}/{name}"))
                };

                let entry_path = FileSystemPath::new_normalized(fs, path);
                let entry = match entry {
                    RawDirectoryEntry::File => DirectoryEntry::File(entry_path),
                    RawDirectoryEntry::Directory => DirectoryEntry::Directory(entry_path),
                    RawDirectoryEntry::Symlink => DirectoryEntry::Symlink(entry_path),
                    RawDirectoryEntry::Other => DirectoryEntry::Other(entry_path),
                };
                normalized_entries.insert(name.clone(), entry);
            }
            Ok(DirectoryContent::new(normalized_entries))
        }
    }
}

#[turbo_tasks::function]
async fn get_type(path: FileSystemPath) -> Result<Vc<FileSystemEntryType>> {
    if path.is_root() {
        return Ok(FileSystemEntryType::Directory.cell());
    }
    let parent = path.parent();
    let dir_content = parent.raw_read_dir().await?;
    match &*dir_content {
        RawDirectoryContent::NotFound => Ok(FileSystemEntryType::NotFound.cell()),
        RawDirectoryContent::Entries(entries) => {
            let (_, file_name) = path.split_file_name();
            if let Some(entry) = entries.get(file_name) {
                Ok(FileSystemEntryType::from(entry).cell())
            } else {
                Ok(FileSystemEntryType::NotFound.cell())
            }
        }
    }
}

#[turbo_tasks::function]
async fn realpath_with_links(path: FileSystemPath) -> Result<Vc<RealPathResult>> {
    let mut current_path = path;
    let mut symlinks: IndexSet<FileSystemPath> = IndexSet::new();
    let mut visited: AutoSet<RcStr> = AutoSet::new();
    let mut error = RealPathResultError::TooManySymlinks;
    // Pick some arbitrary symlink depth limit... similar to the ELOOP logic for realpath(3).
    // SYMLOOP_MAX is 40 for Linux: https://unix.stackexchange.com/q/721724
    for _i in 0..40 {
        if current_path.is_root() {
            // fast path
            return Ok(RealPathResult {
                path_result: Ok(current_path),
                symlinks: symlinks.into_iter().collect(),
            }
            .cell());
        }

        if !visited.insert(current_path.path.clone()) {
            error = RealPathResultError::CycleDetected;
            break; // we detected a cycle
        }

        // see if a parent segment of the path is a symlink and resolve that first
        let parent = current_path.parent();
        let parent_result = parent.realpath_with_links().owned().await?;
        let basename = current_path
            .path
            .rsplit_once('/')
            .map_or(current_path.path.as_str(), |(_, name)| name);
        symlinks.extend(parent_result.symlinks);
        let parent_path = match parent_result.path_result {
            Ok(path) => {
                if path != parent {
                    current_path = path.join(basename)?;
                }
                path
            }
            Err(parent_error) => {
                error = parent_error;
                break;
            }
        };

        // use `get_type` before trying `read_link`, as there's a good chance of a cache hit on
        // `get_type`, and `read_link` isn't the common codepath.
        if !matches!(
            *current_path.get_type().await?,
            FileSystemEntryType::Symlink
        ) {
            return Ok(RealPathResult {
                path_result: Ok(current_path),
                symlinks: symlinks.into_iter().collect(), // convert set to vec
            }
            .cell());
        }

        match &*current_path.read_link().await? {
            LinkContent::Link { target, link_type } => {
                symlinks.insert(current_path.clone());
                current_path = if link_type.contains(LinkType::ABSOLUTE) {
                    current_path.root().owned().await?
                } else {
                    parent_path
                }
                .join(target)?;
            }
            LinkContent::NotFound => {
                error = RealPathResultError::NotFound;
                break;
            }
            LinkContent::Invalid => {
                error = RealPathResultError::Invalid;
                break;
            }
        }
    }

    // Too many attempts or detected a cycle, we bailed out!
    //
    // TODO: There's no proper way to indicate an non-turbo-tasks error here, so just return the
    // original path and all the symlinks we followed.
    //
    // Returning the followed symlinks is still important, even if there is an error! Otherwise
    // we may never notice if the symlink loop is fixed.
    Ok(RealPathResult {
        path_result: Err(error),
        symlinks: symlinks.into_iter().collect(),
    }
    .cell())
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;

    #[test]
    fn test_get_relative_path_to() {
        assert_eq!(get_relative_path_to("a/b/c", "a/b/c").as_str(), ".");
        assert_eq!(get_relative_path_to("a/c/d", "a/b/c").as_str(), "../../b/c");
        assert_eq!(get_relative_path_to("", "a/b/c").as_str(), "./a/b/c");
        assert_eq!(get_relative_path_to("a/b/c", "").as_str(), "../../..");
        assert_eq!(
            get_relative_path_to("a/b/c", "c/b/a").as_str(),
            "../../../c/b/a"
        );
        assert_eq!(
            get_relative_path_to("file:///a/b/c", "file:///c/b/a").as_str(),
            "../../../c/b/a"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn with_extension() {
        turbo_tasks_testing::VcStorage::with(async {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new())
                .to_resolved()
                .await?;

            let path_txt = FileSystemPath::new_normalized(fs, rcstr!("foo/bar.txt"));

            let path_json = path_txt.with_extension("json");
            assert_eq!(&*path_json.path, "foo/bar.json");

            let path_no_ext = path_txt.with_extension("");
            assert_eq!(&*path_no_ext.path, "foo/bar");

            let path_new_ext = path_no_ext.with_extension("json");
            assert_eq!(&*path_new_ext.path, "foo/bar.json");

            let path_no_slash_txt = FileSystemPath::new_normalized(fs, rcstr!("bar.txt"));

            let path_no_slash_json = path_no_slash_txt.with_extension("json");
            assert_eq!(path_no_slash_json.path.as_str(), "bar.json");

            let path_no_slash_no_ext = path_no_slash_txt.with_extension("");
            assert_eq!(path_no_slash_no_ext.path.as_str(), "bar");

            let path_no_slash_new_ext = path_no_slash_no_ext.with_extension("json");
            assert_eq!(path_no_slash_new_ext.path.as_str(), "bar.json");

            anyhow::Ok(())
        })
        .await
        .unwrap()
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn file_stem() {
        turbo_tasks_testing::VcStorage::with(async {
            let fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new())
                .to_resolved()
                .await?;

            let path = FileSystemPath::new_normalized(fs, rcstr!(""));
            assert_eq!(path.file_stem(), None);

            let path = FileSystemPath::new_normalized(fs, rcstr!("foo/bar.txt"));
            assert_eq!(path.file_stem(), Some("bar"));

            let path = FileSystemPath::new_normalized(fs, rcstr!("bar.txt"));
            assert_eq!(path.file_stem(), Some("bar"));

            let path = FileSystemPath::new_normalized(fs, rcstr!("foo/bar"));
            assert_eq!(path.file_stem(), Some("bar"));

            let path = FileSystemPath::new_normalized(fs, rcstr!("foo/.bar"));
            assert_eq!(path.file_stem(), Some(".bar"));

            anyhow::Ok(())
        })
        .await
        .unwrap()
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_try_from_sys_path() {
        let sys_root = if cfg!(windows) {
            Path::new(r"C:\fake\root")
        } else {
            Path::new(r"/fake/root")
        };

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let fs_vc =
                DiskFileSystem::new(rcstr!("temp"), RcStr::from(sys_root.to_str().unwrap()))
                    .to_resolved()
                    .await?;
            let fs = fs_vc.await?;
            let fs_root_path = fs_vc.root().await?;

            assert_eq!(
                fs.try_from_sys_path(
                    fs_vc,
                    &Path::new("relative").join("directory"),
                    /* relative_to */ None,
                )
                .unwrap()
                .path,
                "relative/directory"
            );

            assert_eq!(
                fs.try_from_sys_path(
                    fs_vc,
                    &sys_root
                        .join("absolute")
                        .join("directory")
                        .join("..")
                        .join("normalized_path"),
                    /* relative_to */ Some(&fs_root_path.join("ignored").unwrap()),
                )
                .unwrap()
                .path,
                "absolute/normalized_path"
            );

            assert_eq!(
                fs.try_from_sys_path(
                    fs_vc,
                    Path::new("child"),
                    /* relative_to */ Some(&fs_root_path.join("parent").unwrap()),
                )
                .unwrap()
                .path,
                "parent/child"
            );

            assert_eq!(
                fs.try_from_sys_path(
                    fs_vc,
                    &Path::new("..").join("parallel_dir"),
                    /* relative_to */ Some(&fs_root_path.join("parent").unwrap()),
                )
                .unwrap()
                .path,
                "parallel_dir"
            );

            assert_eq!(
                fs.try_from_sys_path(
                    fs_vc,
                    &Path::new("relative")
                        .join("..")
                        .join("..")
                        .join("leaves_root"),
                    /* relative_to */ None,
                ),
                None
            );

            assert_eq!(
                fs.try_from_sys_path(
                    fs_vc,
                    &sys_root
                        .join("absolute")
                        .join("..")
                        .join("..")
                        .join("leaves_root"),
                    /* relative_to */ None,
                ),
                None
            );

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    // Test helpers for denied_path tests
    #[cfg(test)]
    mod denied_path_tests {
        use std::{
            fs::{File, create_dir_all},
            io::Write,
        };

        use turbo_rcstr::{RcStr, rcstr};
        use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

        use crate::{
            DirectoryContent, DiskFileSystem, File as TurboFile, FileContent, FileSystem,
            FileSystemPath,
            glob::{Glob, GlobOptions},
        };

        /// Helper to set up a test filesystem with denied_path
        /// Creates the filesystem structure on disk and returns paths
        fn setup_test_fs() -> (tempfile::TempDir, RcStr, RcStr) {
            let scratch = tempfile::tempdir().unwrap();
            let path = scratch.path();

            // Create standard test structure:
            // /allowed_file.txt
            // /allowed_dir/file.txt
            // /other_file.txt
            // /denied_dir/secret.txt
            // /denied_dir/nested/deep.txt
            File::create_new(path.join("allowed_file.txt"))
                .unwrap()
                .write_all(b"allowed content")
                .unwrap();

            create_dir_all(path.join("allowed_dir")).unwrap();
            File::create_new(path.join("allowed_dir/file.txt"))
                .unwrap()
                .write_all(b"allowed dir content")
                .unwrap();

            File::create_new(path.join("other_file.txt"))
                .unwrap()
                .write_all(b"other content")
                .unwrap();

            create_dir_all(path.join("denied_dir/nested")).unwrap();
            File::create_new(path.join("denied_dir/secret.txt"))
                .unwrap()
                .write_all(b"secret content")
                .unwrap();
            File::create_new(path.join("denied_dir/nested/deep.txt"))
                .unwrap()
                .write_all(b"deep secret")
                .unwrap();

            let root: RcStr = path.to_str().unwrap().into();
            // denied_path should be relative to root, using unix separators
            let denied_path: RcStr = rcstr!("denied_dir");

            (scratch, root, denied_path)
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_denied_path_read() {
            let (_scratch, root, denied_path) = setup_test_fs();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async {
                let fs = DiskFileSystem::new_with_denied_path(rcstr!("test"), root, denied_path);
                let root_path = fs.root().await?;

                // Test 1: Reading allowed file should work
                let allowed_file = root_path.join("allowed_file.txt")?;
                let content = allowed_file.read().await?;
                assert!(
                    matches!(&*content, FileContent::Content(_)),
                    "allowed file should be readable"
                );

                // Test 2: Direct read of denied file should return NotFound
                let denied_file = root_path.join("denied_dir/secret.txt")?;
                let content = denied_file.read().await?;
                assert!(
                    matches!(&*content, FileContent::NotFound),
                    "denied file should return NotFound, got {:?}",
                    content
                );

                // Test 3: Reading nested denied file should return NotFound
                let nested_denied = root_path.join("denied_dir/nested/deep.txt")?;
                let content = nested_denied.read().await?;
                assert!(
                    matches!(&*content, FileContent::NotFound),
                    "nested denied file should return NotFound"
                );

                // Test 4: Reading the denied directory itself should return NotFound
                let denied_dir = root_path.join("denied_dir")?;
                let content = denied_dir.read().await?;
                assert!(
                    matches!(&*content, FileContent::NotFound),
                    "denied directory should return NotFound"
                );

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_denied_path_read_dir() {
            let (_scratch, root, denied_path) = setup_test_fs();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async {
                let fs = DiskFileSystem::new_with_denied_path(rcstr!("test"), root, denied_path);
                let root_path = fs.root().await?;

                // Test: read_dir on root should not include denied_dir
                let dir_content = root_path.read_dir().await?;
                match &*dir_content {
                    DirectoryContent::Entries(entries) => {
                        assert!(
                            entries.contains_key(&rcstr!("allowed_dir")),
                            "allowed_dir should be visible"
                        );
                        assert!(
                            entries.contains_key(&rcstr!("other_file.txt")),
                            "other_file.txt should be visible"
                        );
                        assert!(
                            entries.contains_key(&rcstr!("allowed_file.txt")),
                            "allowed_file.txt should be visible"
                        );
                        assert!(
                            !entries.contains_key(&rcstr!("denied_dir")),
                            "denied_dir should NOT be visible in read_dir"
                        );
                    }
                    DirectoryContent::NotFound => panic!("root directory should exist"),
                }

                // Test: read_dir on denied_dir should return NotFound
                let denied_dir = root_path.join("denied_dir")?;
                let dir_content = denied_dir.read_dir().await?;
                assert!(
                    matches!(&*dir_content, DirectoryContent::NotFound),
                    "denied_dir read_dir should return NotFound"
                );

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_denied_path_read_glob() {
            let (_scratch, root, denied_path) = setup_test_fs();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async {
                let fs = DiskFileSystem::new_with_denied_path(rcstr!("test"), root, denied_path);
                let root_path = fs.root().await?;

                // Test: read_glob with ** should not reveal denied files
                let glob_result = root_path
                    .read_glob(Glob::new(rcstr!("**/*.txt"), GlobOptions::default()))
                    .await?;

                // Check top level results
                assert!(
                    glob_result.results.contains_key("allowed_file.txt"),
                    "allowed_file.txt should be found"
                );
                assert!(
                    glob_result.results.contains_key("other_file.txt"),
                    "other_file.txt should be found"
                );
                assert!(
                    !glob_result.results.contains_key("denied_dir"),
                    "denied_dir should NOT appear in glob results"
                );

                // Check that denied_dir doesn't appear in inner results
                assert!(
                    !glob_result.inner.contains_key("denied_dir"),
                    "denied_dir should NOT appear in glob inner results"
                );

                // Verify allowed_dir is present (to ensure we're not filtering everything)
                assert!(
                    glob_result.inner.contains_key("allowed_dir"),
                    "allowed_dir directory should be present"
                );
                let sub_inner = glob_result.inner.get("allowed_dir").unwrap().await?;
                assert!(
                    sub_inner.results.contains_key("file.txt"),
                    "allowed_dir/file.txt should be found"
                );

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        #[turbo_tasks::function(operation)]
        async fn write_file(path: FileSystemPath, contents: RcStr) -> anyhow::Result<()> {
            path.write(
                FileContent::Content(TurboFile::from_bytes(contents.to_string().into_bytes()))
                    .cell(),
            )
            .await?;
            Ok(())
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_denied_path_write() {
            use turbo_tasks::apply_effects;

            let (_scratch, root, denied_path) = setup_test_fs();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async {
                let fs = DiskFileSystem::new_with_denied_path(rcstr!("test"), root, denied_path);
                let root_path = fs.root().await?;

                // Test 1: Writing to allowed directory should work
                let allowed_file = root_path.join("allowed_dir/new_file.txt")?;
                let write_result = write_file(allowed_file.clone(), rcstr!("test content"));
                write_result.read_strongly_consistent().await?;
                apply_effects(write_result).await?;

                // Verify it was written
                let read_content = allowed_file.read().await?;
                assert!(
                    matches!(&*read_content, FileContent::Content(_)),
                    "allowed file write should succeed"
                );

                // Test 2: Writing to denied directory should fail
                let denied_file = root_path.join("denied_dir/forbidden.txt")?;
                let write_result = write_file(denied_file, rcstr!("forbidden"));
                let result = write_result.read_strongly_consistent().await;
                assert!(
                    result.is_err(),
                    "writing to denied path should return an error"
                );

                // Test 3: Writing to nested denied path should fail
                let nested_denied = root_path.join("denied_dir/nested/file.txt")?;
                let write_result = write_file(nested_denied, rcstr!("nested"));
                let result = write_result.read_strongly_consistent().await;
                assert!(
                    result.is_err(),
                    "writing to nested denied path should return an error"
                );

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }
    }
}
