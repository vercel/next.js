//! The on-disk [`DiskFileSystem`] implementation and its supporting helpers.

use std::{
    env,
    ffi::OsString,
    fmt::{self, Debug, Formatter},
    future::Future,
    io::{self, ErrorKind, Write as _},
    mem::take,
    path::{Component, MAIN_SEPARATOR, Path, PathBuf, Prefix},
    sync::{Arc, LazyLock, Weak},
};

use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use bincode::{Decode, Encode};
#[cfg(windows)]
use omnipath::WinPathExt;
use rustc_hash::FxHashSet;
use smallvec::SmallVec;
use tokio::{
    runtime::Handle,
    sync::{RwLock, RwLockReadGuard},
};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    CapturedEffect, Effect, EffectExt, EffectStateStorage, InvalidationReason, NonLocalValue,
    ReadRef, ResolvedVc, TurboTasksApi, ValueToString, Vc, debug::ValueDebugFormat, parallel,
    trace::TraceRawVcs, turbo_tasks_weak, turbobail,
};
use turbo_tasks_hash::{hash_xxh3_hash64, hash_xxh3_hash128};
use turbo_unix_path::{normalize_path, sys_to_unix, unix_to_sys};

#[cfg(windows)]
use crate::windows::{is_link_junction_point, to_verbatim_with_case_folded_disk};
use crate::{
    AnyhowWrapper, File, FileComparison, FileContent, FileMeta, FileSystem, FileSystemPath,
    LinkContent, LinkTarget, PersistedFileContent, RawDirectoryContent, RawDirectoryEntry,
    WriteLinkContent, WriteLinkTarget, WriteLinkTargetType,
    invalidation::Write,
    invalidator_map::InvalidatorMap,
    mutex_map::MutexMap,
    path_map::OrderedPathMapExt,
    retry::{can_retry, retry_blocking, retry_blocking_custom},
    watcher::{DiskWatcher, DiskWatcherConfig},
};

/// Validate the path, returning the valid path, a modified-but-now-valid path, or bailing with an
/// error.
///
/// The behaviour of the file system changes depending on the OS, and indeed sometimes the FS
/// implementation of the OS itself.
///
/// - On Windows the limit for normal file paths is 260 characters, a holdover from the DOS days,
///   but we use 'verbatim' or 'extended' paths for supported path operations which can be up to
///   32767 characters long.
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
pub fn validate_path_length(path: &Path) -> io::Result<()> {
    fn error(name_or_path: &str, len: usize, limit: usize) -> io::Error {
        io::Error::new(
            io::ErrorKind::InvalidFilename,
            format!("file {name_or_path} is too long ({len}) exceeds filesystem limit of {limit}"),
        )
    }
    if cfg!(windows) {
        // We always use verbatim paths internally in turbo-tasks-fs
        debug_assert!(
            matches!(
                path.components().next(),
                Some(std::path::Component::Prefix(prefix)) if prefix.kind().is_verbatim()
            ),
            "expected a verbatim path, got {path:?}",
        );

        // We subtract a 100-character safety margin from the real value because:
        // > The maximum path of 32,767 characters is approximate, because the "\\?\" prefix may
        // > be expanded to a longer string by the system at run time, and this expansion
        // > applies to the total length.
        const MAX_VERBATIM_PATH_LENGTH_WINDOWS: usize = 32_767 - 100;
        let len = path.as_os_str().len();
        if len > MAX_VERBATIM_PATH_LENGTH_WINDOWS {
            return Err(error("path", len, MAX_VERBATIM_PATH_LENGTH_WINDOWS));
        }
    }

    if cfg!(unix) {
        /// here we are only going to check if the total length exceeds, or the last segment
        /// exceeds. This heuristic is primarily to avoid long file names, and it makes the
        /// operation much cheaper.
        const MAX_FILE_NAME_LENGTH_UNIX: usize = 255;

        // just check the last segment (file name), assume parent directories must've already
        // been constructed successfully
        let name_len = path
            .file_name()
            .map(|n| n.as_encoded_bytes().len())
            .unwrap_or(0);
        if name_len > MAX_FILE_NAME_LENGTH_UNIX {
            return Err(error("name", name_len, MAX_FILE_NAME_LENGTH_UNIX));
        }

        // Note: Most popular filesystems on Linux (ext4, btrfs) have no hard limit on total
        // path length. The `PATH_MAX` constant is not enforced on modern systems in glibc or in
        // the kernel. See: https://eklitzke.org/path-max-is-tricky
        if cfg!(target_os = "macos") {
            #[cfg(unix)]
            {
                use std::os::unix::ffi::OsStrExt;
                // macOS reports a limit of 1024, but I (@arlyon) have had issues with paths
                // above 1016 so we subtract a bit to be safe. on most linux distros this is
                // likely a lot larger than 1024, but macOS is *special*
                const MAX_PATH_LENGTH: usize = 1024 - 8;
                let path_len = path.as_os_str().as_bytes().len();
                if path_len > MAX_PATH_LENGTH {
                    return Err(error("path", path_len, MAX_PATH_LENGTH));
                }
            }
        }
    }

    // unknown platform: skip this check
    Ok(())
}

/// A thin wrapper around [`std::fs::canonicalize`] that returns the result as an [`RcStr`].
///
/// The returned path is in the format [`DiskFileSystem::new`] expects: an absolute,
/// symlink-resolved path (a verbatim/extended `\\?\`-prefixed path on Windows). `path` must already
/// exist on disk. Returns an error if it cannot be canonicalized or is not valid unicode.
pub fn canonicalize_to_rcstr(path: &Path) -> io::Result<RcStr> {
    fs_err::canonicalize(path)?
        .into_string()
        .map(RcStr::from)
        .map_err(|p| {
            io::Error::new(
                ErrorKind::InvalidFilename,
                anyhow!("canonicalized path {p:?} is not valid unicode"),
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

fn number_env_var(name: &'static str) -> Option<usize> {
    env::var(name)
        .ok()
        .filter(|val| !val.is_empty())
        .map(|val| match val.parse() {
            Ok(n) => n,
            Err(err) => panic!("{name} must be a valid integer: {err}"),
        })
        .filter(|val| *val != 0)
}

fn create_read_semaphore() -> tokio::sync::Semaphore {
    // the semaphore isn't serialized, and we assume the environment variable doesn't change during
    // runtime, so it's okay to access it in this untracked way.
    static TURBO_ENGINE_READ_CONCURRENCY: LazyLock<usize> =
        LazyLock::new(|| number_env_var("TURBO_ENGINE_READ_CONCURRENCY").unwrap_or(64));
    tokio::sync::Semaphore::new(*TURBO_ENGINE_READ_CONCURRENCY)
}

fn create_write_semaphore() -> tokio::sync::Semaphore {
    // the semaphore isn't serialized, and we assume the environment variable doesn't change during
    // runtime, so it's okay to access it in this untracked way.
    static TURBO_ENGINE_WRITE_CONCURRENCY: LazyLock<usize> = LazyLock::new(|| {
        number_env_var("TURBO_ENGINE_WRITE_CONCURRENCY").unwrap_or(
            // We write a lot of smallish files where high concurrency will cause metadata
            // thrashing. So 4 threads is a safe cross platform suitable value.
            4,
        )
    });
    tokio::sync::Semaphore::new(*TURBO_ENGINE_WRITE_CONCURRENCY)
}

#[derive(TraceRawVcs, ValueDebugFormat, NonLocalValue, Encode, Decode)]
pub(crate) struct DiskFileSystemInner {
    pub name: RcStr,
    /// A system path in utf-8 representation. This simplifies serialization/deserialization.
    ///
    /// On Windows, this should use the verbatim/extended (`\\?\`-prefixed) path format. That
    /// format supports paths exceeding the 260 character path limit.
    ///
    /// In the future, we should consider using `Path`/`PathBuf` here. Paths inside of the
    /// `DiskFileSystem` must be valid unicode, but the root path doesn't need to be.
    root: RcStr,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip)]
    mutex_map: MutexMap<Arc<PathBuf>>,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip)]
    pub(crate) invalidator_map: InvalidatorMap,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip)]
    pub(crate) dir_invalidator_map: InvalidatorMap,
    /// Lock that makes invalidation atomic. It will keep a write lock during
    /// watcher invalidation and a read lock during other operations.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip)]
    pub(crate) invalidation_lock: RwLock<()>,
    /// Semaphore to limit the maximum number of concurrent file operations.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip, default = "create_read_semaphore")]
    read_semaphore: tokio::sync::Semaphore,
    /// Semaphore to limit the maximum number of concurrent file operations.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip, default = "create_write_semaphore")]
    write_semaphore: tokio::sync::Semaphore,

    #[turbo_tasks(debug_ignore, trace_ignore)]
    pub(crate) watcher: DiskWatcher,
    /// Root paths that we do not allow access to from this filesystem.
    /// Useful for things like output directories to prevent accidental ouroboros situations.
    denied_paths: Vec<RcStr>,
    /// Used by invalidators when called from a non-turbo-tasks thread, specifically in the fs
    /// watcher.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip, default = "turbo_tasks_weak")]
    pub(crate) turbo_tasks: Weak<dyn TurboTasksApi>,
    /// Used by invalidators when called from a non-tokio thread, specifically in the fs watcher.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip, default = "Handle::current")]
    pub(crate) tokio_handle: Handle,
    #[turbo_tasks(debug_ignore, trace_ignore)]
    #[bincode(skip)]
    effect_state_storage: EffectStateStorage,
}

impl DiskFileSystemInner {
    pub(crate) fn root_path(&self) -> &Path {
        Path::new(&*self.root)
    }

    /// Checks if a path is within the denied path
    /// Returns true if the path should be treated as non-existent
    ///
    /// Since denied_paths are guaranteed to be:
    /// - normalized (no ../ traversals)
    /// - using unix separators (/)
    /// - relative to the fs root
    ///
    /// We can efficiently check using string operations
    fn is_path_denied(&self, path: &FileSystemPath) -> bool {
        let path = &path.path;
        self.denied_paths.iter().any(|denied_path| {
            path.starts_with(denied_path.as_str())
                && (path.len() == denied_path.len()
                    || path.as_bytes().get(denied_path.len()) == Some(&b'/'))
        })
    }

    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function
    async fn register_read_invalidator(&self, path: &Arc<PathBuf>) -> Result<()> {
        if let Some(invalidator) = turbo_tasks::get_invalidator() {
            self.invalidator_map.insert(path.clone(), invalidator);
            self.watcher
                .ensure_watched_file(path, self.root_path())
                .await?;
        }
        Ok(())
    }

    /// After an effect writes to a path, invalidate any read tasks tracking that path so they
    /// re-read the updated content. This is necessary because the file watcher may not be active
    /// (e.g., in tests or build-only scenarios).
    fn invalidate_from_write(&self, full_path: &Path) {
        let mut invalidator_map = self.invalidator_map.lock().unwrap();
        if let Some(invalidators) = invalidator_map.remove(full_path) {
            let Some(turbo_tasks) = self.turbo_tasks.upgrade() else {
                return;
            };
            let _guard = self.tokio_handle.enter();
            let reason = Write {
                path: full_path.to_string_lossy().into_owned(),
            };
            for invalidator in invalidators {
                invalidator.invalidate_with_reason(&*turbo_tasks, reason.clone());
            }
        }
    }

    /// registers the path as an invalidator for the current task,
    /// has to be called within a turbo-tasks function
    async fn register_dir_invalidator(&self, path: &Arc<PathBuf>) -> Result<()> {
        if let Some(invalidator) = turbo_tasks::get_invalidator() {
            self.dir_invalidator_map.insert(path.clone(), invalidator);
            self.watcher
                .ensure_watched_dir(path, self.root_path())
                .await?;
        }
        Ok(())
    }

    async fn lock_path(&self, full_path: Arc<PathBuf>) -> PathLockGuard<'_> {
        let lock1 = self.invalidation_lock.read().await;
        let lock2 = self.mutex_map.lock(full_path).await;
        PathLockGuard(lock1, lock2)
    }

    pub(crate) fn invalidate(&self) {
        let _span = tracing::info_span!("invalidate filesystem", name = &*self.root).entered();
        let Some(turbo_tasks) = self.turbo_tasks.upgrade() else {
            return;
        };
        let _guard = self.tokio_handle.enter();

        let invalidator_map = take(&mut *self.invalidator_map.lock().unwrap());
        let dir_invalidator_map = take(&mut *self.dir_invalidator_map.lock().unwrap());
        let invalidators = invalidator_map
            .into_iter()
            .chain(dir_invalidator_map)
            .flat_map(|(_, invalidators)| invalidators.into_iter())
            .collect::<Vec<_>>();
        parallel::for_each_owned(invalidators, |invalidator| {
            invalidator.invalidate(&*turbo_tasks)
        });
    }

    /// Invalidates every tracked file in the filesystem.
    ///
    /// Calls the given
    pub(crate) fn invalidate_with_reason<R: InvalidationReason + Clone>(
        &self,
        reason: impl Fn(&Path) -> R + Sync,
    ) {
        let _span = tracing::info_span!("invalidate filesystem", name = &*self.root).entered();
        let Some(turbo_tasks) = self.turbo_tasks.upgrade() else {
            return;
        };
        let _guard = self.tokio_handle.enter();

        let invalidator_map = take(&mut *self.invalidator_map.lock().unwrap());
        let dir_invalidator_map = take(&mut *self.dir_invalidator_map.lock().unwrap());
        let invalidators = invalidator_map
            .into_iter()
            .chain(dir_invalidator_map)
            .flat_map(|(path, invalidators)| {
                let reason_for_path = reason(&path);
                invalidators
                    .into_iter()
                    .map(move |i| (reason_for_path.clone(), i))
            })
            .collect::<Vec<_>>();
        parallel::for_each_owned(invalidators, |(reason, invalidator)| {
            invalidator.invalidate_with_reason(&*turbo_tasks, reason)
        });
    }

    /// Invalidates tracked files/directories for `paths` and their children.
    /// Also invalidates tracked directory reads for all parent directories to
    /// account for file creations/deletions under the deferred subtree.
    fn invalidate_path_and_children_with_reason<R: InvalidationReason + Clone>(
        &self,
        paths: impl IntoIterator<Item = PathBuf>,
        reason: impl Fn(&Path) -> R + Sync,
    ) {
        let _span =
            tracing::info_span!("invalidate filesystem paths", name = &*self.root).entered();
        let Some(turbo_tasks) = self.turbo_tasks.upgrade() else {
            return;
        };
        let _guard = self.tokio_handle.enter();

        let mut invalidator_map = self.invalidator_map.lock().unwrap();
        let mut dir_invalidator_map = self.dir_invalidator_map.lock().unwrap();
        let mut invalidators = Vec::new();
        let mut parent_dirs_to_invalidate = FxHashSet::default();

        for path in paths {
            let mut current_parent = path.parent();
            while let Some(parent) = current_parent {
                parent_dirs_to_invalidate.insert(parent.to_path_buf());
                current_parent = parent.parent();
            }

            for (invalidated_path, path_invalidators) in
                invalidator_map.extract_path_with_children(&path)
            {
                let reason_for_path = reason(&invalidated_path);
                invalidators.extend(
                    path_invalidators
                        .into_iter()
                        .map(|invalidator| (reason_for_path.clone(), invalidator)),
                );
            }

            for (invalidated_path, path_invalidators) in
                dir_invalidator_map.extract_path_with_children(&path)
            {
                let reason_for_path = reason(&invalidated_path);
                invalidators.extend(
                    path_invalidators
                        .into_iter()
                        .map(|invalidator| (reason_for_path.clone(), invalidator)),
                );
            }
        }

        for path in parent_dirs_to_invalidate {
            if let Some(path_invalidators) = dir_invalidator_map.remove(path.as_path()) {
                let reason_for_path = reason(&path);
                invalidators.extend(
                    path_invalidators
                        .into_iter()
                        .map(|invalidator| (reason_for_path.clone(), invalidator)),
                );
            }
        }

        drop(invalidator_map);
        drop(dir_invalidator_map);

        parallel::for_each_owned(invalidators, |(reason, invalidator)| {
            invalidator.invalidate_with_reason(&*turbo_tasks, reason)
        });
    }

    #[tracing::instrument(level = "info", name = "start filesystem watching", skip_all, fields(path = %self.root))]
    async fn start_watching_internal(self: &Arc<Self>) -> Result<()> {
        let root_path = self.root_path().to_path_buf();

        // create the directory for the filesystem on disk, if it doesn't exist
        retry_blocking(|| std::fs::create_dir_all(&root_path))
            .instrument(tracing::info_span!("create root directory", name = ?root_path))
            .concurrency_limited(&self.write_semaphore)
            .await?;

        DiskWatcher::start_watching(self.clone()).await?;

        Ok(())
    }
}

/// `DiskFileSystem` carries serializable fields (`name`, `root`,
/// `denied_paths`) inside `DiskFileSystemInner` alongside session-scoped
/// state (the `notify` watcher, invalidator maps, weak `TurboTasksApi`,
/// etc.) This is important to maintain invariants in a session and ensure invalidations work, so we
/// never evict this data.
#[derive(Clone, ValueToString)]
#[value_to_string(self.inner.name)]
#[turbo_tasks::value(cell = "new", eq = "manual", evict = "never")]
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

    #[cfg(debug_assertions)]
    async fn ensure_path_is_realpath(&self, operation: &str, path: &Path) -> Result<()> {
        if let Ok(realpath) = retry_blocking(|| fs_err::canonicalize(path))
            .instrument(tracing::info_span!("realpath for filesystem read", name = ?path))
            .concurrency_limited(&self.inner.read_semaphore)
            .await
            && realpath != path
        {
            anyhow::bail!(
                "{operation} called with unresolved path {path:?}; resolve it to {realpath:?} \
                 first"
            );
        }
        Ok(())
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

    pub fn invalidate_path_and_children_with_reason<R: InvalidationReason + Clone>(
        &self,
        paths: impl IntoIterator<Item = PathBuf>,
        reason: impl Fn(&Path) -> R + Sync,
    ) {
        self.inner
            .invalidate_path_and_children_with_reason(paths, reason);
    }

    pub async fn start_watching(&self) -> Result<()> {
        self.inner.start_watching_internal().await
    }

    pub async fn stop_watching(&self) {
        self.inner.watcher.stop_watching().await;
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

        let relative_sys_path = if sys_path.is_absolute() {
            // Flatten any `..` or `.` components. `normalize_lexically` will return an error if the
            // relative `sys_path` leaves the system root.
            #[cfg(not(windows))]
            let normalized_sys_path = sys_path.normalize_lexically().ok()?;

            // Unlike `std::fs::canonicalize`, this is a purely lexical operation: it does not
            // resolve symlinks or 8.3 short name format.
            #[cfg(windows)]
            let normalized_sys_path = to_verbatim_with_case_folded_disk(sys_path).ok()?;

            normalized_sys_path
                .strip_prefix(self.inner.root_path())
                .ok()?
                .to_owned()
        } else {
            // we always have to prepend and then strip root_sys_path here. Imagine:
            // root_sys_path = "/a/b"
            // sys_path = "../b/c"
            // relative_to = None
            //
            // The resulting path would be "/a/b/c", which is inside the `root_sys_path`, but we can
            // only figure that out if we start from `root_sys_path`.
            let root_sys_path = self.inner.root_path();
            let relative_to_sys_path = if let Some(relative_to) = relative_to {
                debug_assert_eq!(
                    relative_to.fs, vc_self,
                    "`relative_to.fs` must match the current `ResolvedVc<DiskFileSystem>`"
                );
                root_sys_path
                    .join(Path::new(&*unix_to_sys(&relative_to.path)))
                    .join(sys_path)
            } else {
                root_sys_path.join(sys_path)
            };
            relative_to_sys_path
                .normalize_lexically()
                .ok()?
                .strip_prefix(root_sys_path)
                .ok()?
                .to_owned()
        };

        Some(FileSystemPath {
            fs: vc_self,
            path: RcStr::from(sys_to_unix(relative_sys_path.to_str()?)),
        })
    }

    /// Returns the path as a system [`PathBuf`]. Similar to [`DiskFileSystem::to_sys_path`], but
    /// keeps the internal representation as-is.
    ///
    ///
    /// On Windows this returns the verbatim/extended (`\\?\`-prefixed) path format used internally,
    /// which supports paths exceeding the 260 character path limit. Use this for internal
    /// filesystem operations and for comparisons against other internal paths, such as the keys of
    /// the invalidator maps used by [`Self::invalidate_path_and_children_with_reason`]. For a path
    /// handed to external consumers, prefer [`Self::to_sys_path`].
    ///
    /// On non-Windows platforms this is identical to [`Self::to_sys_path`].
    pub fn to_sys_path_raw(&self, fs_path: &FileSystemPath) -> PathBuf {
        let sys_root = self.inner.root_path();
        if fs_path.path.is_empty() {
            sys_root.to_path_buf()
        } else {
            sys_root.join(&*unix_to_sys(&fs_path.path))
        }
    }

    /// Returns the path as a system [`PathBuf`].
    ///
    /// As a general rule, system paths should not be stored inside turbo-task cells, or passed
    /// inside [`turbo_tasks::TaskInput`]s as they are not valid after serialization.
    ///
    /// On Windows, this will attempt to convert the internal verbatim/extended path representation
    /// to a more-compatible win32 path, but may return a verbatim path if that conversion fails.
    pub fn to_sys_path(&self, fs_path: &FileSystemPath) -> PathBuf {
        let sys_path = self.to_sys_path_raw(fs_path);

        #[cfg(windows)]
        return sys_path.to_winuser_path().unwrap_or(sys_path);
        #[cfg(not(windows))]
        return sys_path;
    }

    /// Used by the slow path of [`DiskFileSystem::read_link`] for absolute link targets. Attempts
    /// to strip the prefix of an absolute symlink target, creating a [`FileSystemPath`] relative to
    /// the [`DiskFileSystem`] root.
    ///
    /// Returns [`None`] if the target never reaches the filesystem root or an ancestor can't be
    /// canonicalized. `read_link` treats this as `LinkContent::Invalid`.
    ///
    /// In some cases that absolute path may contain symlinks, different capitalization, or Windows
    /// 8.3 short paths. Resolving this requires performing untracked IO outside of the filesystem
    /// root, where we have no filesystem watcher configured. This is mostly okay as we assume the
    /// [`DiskFileSystem`] root is stable.
    ///
    /// To avoid performing untracked reads of files outside of the filesystem root, we iteratively
    /// canonicalize each prefix of the given `target_sys_path` using a session-dependent task.
    async fn resolve_link_target_ancestry_slow_path(
        &self,
        vc_self: ResolvedVc<Self>,
        target_sys_path: &Path,
    ) -> Result<Option<FileSystemPath>> {
        #[turbo_tasks::value(transparent)]
        struct OptionRcStr(Option<RcStr>);

        /// Canonicalization here is an untracked read of state the watcher can't see (outside the
        /// root), and is not portable across machines, hence it is `session_dependent`.
        #[turbo_tasks::function(fs, session_dependent)]
        async fn canonicalize_untracked(sys_path: RcStr) -> Vc<OptionRcStr> {
            Vc::cell(
                retry_blocking(|| canonicalize_to_rcstr(Path::new(&*sys_path)))
                    .await
                    .ok(),
            )
        }

        let root_sys_path = self.inner.root_path();

        // Reversed, `ancestors` yields every prefix of the target, from the system root (e.g. `/`
        // or `\\?\C:\`) down to the full target path. `skip(1)` skips the bare system root: it has
        // no symlink/short-name/casing ambiguity to resolve. Each prefix borrows from
        // `target_sys_path`, so no paths are copied here.
        let ancestors: SmallVec<[&Path; 8]> = target_sys_path.ancestors().collect();
        for prefix in ancestors.into_iter().rev().skip(1) {
            let Some(prefix_str) = prefix.to_str() else {
                // non-unicode: `read_link` will treat this as `LinkContent::Invalid`
                return Ok(None);
            };
            let Some(canonical) = canonicalize_untracked(RcStr::from(prefix_str))
                .owned()
                .await?
            else {
                return Ok(None);
            };
            let canonical = Path::new(canonical.as_str());
            if canonical.starts_with(root_sys_path) {
                // Reached the filesystem root. Keep the rest of the target as spelled and let
                // `try_from_sys_path` strip the root prefix lexically.
                let rest = target_sys_path
                    .strip_prefix(prefix)
                    .expect("`ancestors` yields prefixes of `target_sys_path`");
                return Ok(self.try_from_sys_path(vc_self, &canonical.join(rest), None));
            }
        }

        // The whole path was consumed without reaching the filesystem root.
        Ok(None)
    }
}

#[allow(dead_code, reason = "we need to hold onto the locks")]
struct PathLockGuard<'a>(
    #[allow(dead_code)] RwLockReadGuard<'a, ()>,
    #[allow(dead_code)] crate::mutex_map::MutexMapGuard<'a, Arc<PathBuf>>,
);

pub(crate) fn format_absolute_fs_path(path: &Path, name: &str, root_path: &Path) -> Option<String> {
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
    ///
    /// `name` is a display name for the filesystem. This should be unique. `root` is the
    /// [canonicalized][std::fs::canonicalize] root of the filesystem.
    ///
    /// This API does not canonicalize itself, as that requires IO operations (e.g. symlink
    /// resolution) which should (ideally) not be cached.
    pub fn new(name: RcStr, root: Vc<RcStr>) -> Vc<Self> {
        Self::new_internal(name, root, Vec::new(), DiskWatcherConfig::default())
    }

    /// Create a new instance of `DiskFileSystem`.
    ///
    /// `name` is a display name for the filesystem. This should be unique. `root` is the
    /// [canonicalized][std::fs::canonicalize] root of the filesystem.
    ///
    /// This API does not canonicalize itself, as that requires IO operations (e.g. symlink
    /// resolution) which should (ideally) not be cached.
    ///
    /// `denied_paths` is a list of paths that are not allowed to be accessed or navigated to. These
    /// must be normalized unix-style paths, non-empty and relative to the fs root.
    pub fn new_with_options(
        name: RcStr,
        root: Vc<RcStr>,
        denied_paths: Vec<RcStr>,
        watcher_config: DiskWatcherConfig,
    ) -> Vc<Self> {
        for denied_path in &denied_paths {
            debug_assert!(!denied_path.is_empty(), "denied_path must not be empty");
            debug_assert!(
                normalize_path(denied_path).as_deref() == Some(&**denied_path),
                "denied_path must be normalized: {denied_path:?}"
            );
        }
        Self::new_internal(name, root, denied_paths, watcher_config)
    }
}

#[turbo_tasks::value_impl]
impl DiskFileSystem {
    #[turbo_tasks::function]
    async fn new_internal(
        name: RcStr,
        root: Vc<RcStr>,
        denied_paths: Vec<RcStr>,
        watcher_config: DiskWatcherConfig,
    ) -> Result<Vc<Self>> {
        let root = root.owned().await?;
        let instance = DiskFileSystem {
            inner: Arc::new(DiskFileSystemInner {
                name,
                root,
                mutex_map: Default::default(),
                invalidation_lock: Default::default(),
                invalidator_map: InvalidatorMap::new(),
                dir_invalidator_map: InvalidatorMap::new(),
                read_semaphore: create_read_semaphore(),
                write_semaphore: create_write_semaphore(),
                watcher: DiskWatcher::new(watcher_config),
                denied_paths,
                turbo_tasks: turbo_tasks_weak(),
                tokio_handle: Handle::current(),
                effect_state_storage: EffectStateStorage::default(),
            }),
        };

        Ok(Self::cell(instance))
    }
}

impl Debug for DiskFileSystem {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        write!(f, "name: {}, root: {}", self.inner.name, self.inner.root)
    }
}

#[turbo_tasks::value_impl]
impl FileSystem for DiskFileSystem {
    #[turbo_tasks::function(fs, session_dependent)]
    async fn read(&self, fs_path: FileSystemPath) -> Result<Vc<FileContent>> {
        // Check if path is denied - if so, treat as NotFound
        if self.inner.is_path_denied(&fs_path) {
            return Ok(FileContent::NotFound.cell());
        }
        let full_path = Arc::new(self.to_sys_path_raw(&fs_path));

        self.inner.register_read_invalidator(&full_path).await?;

        let _lock = self.inner.lock_path(full_path.clone()).await;
        let content = match retry_blocking(|| File::from_path(&full_path))
            .instrument(tracing::info_span!("read file", name = ?full_path))
            .concurrency_limited(&self.inner.read_semaphore)
            .await
        {
            Ok(file) => {
                #[cfg(debug_assertions)]
                self.ensure_path_is_realpath("read_file", &full_path)
                    .await?;
                FileContent::new(file)
            }
            Err(e) if e.kind() == ErrorKind::NotFound || e.kind() == ErrorKind::InvalidFilename => {
                FileContent::NotFound
            }
            // ast-grep-ignore: no-context-format
            Err(e) => return Err(anyhow!(e).context(format!("reading file {full_path:?}"))),
        };
        Ok(content.cell())
    }

    #[turbo_tasks::function(fs, session_dependent)]
    async fn raw_read_dir(&self, fs_path: FileSystemPath) -> Result<Vc<RawDirectoryContent>> {
        // Check if directory itself is denied - if so, treat as NotFound
        if self.inner.is_path_denied(&fs_path) {
            return Ok(RawDirectoryContent::not_found());
        }
        let full_path = Arc::new(self.to_sys_path_raw(&fs_path));

        self.inner.register_dir_invalidator(&full_path).await?;

        // we use the sync std function here as it's a lot faster (600%) in node-file-trace
        let read_dir = match retry_blocking(|| std::fs::read_dir(&*full_path))
            .instrument(tracing::info_span!("read directory", name = ?full_path))
            .concurrency_limited(&self.inner.read_semaphore)
            .await
        {
            Ok(dir) => {
                #[cfg(debug_assertions)]
                self.ensure_path_is_realpath("read_dir", &full_path).await?;
                dir
            }
            Err(e)
                if e.kind() == ErrorKind::NotFound
                    || e.kind() == ErrorKind::NotADirectory
                    || e.kind() == ErrorKind::InvalidFilename =>
            {
                return Ok(RawDirectoryContent::not_found());
            }
            Err(e) => {
                // ast-grep-ignore: no-context-format
                return Err(anyhow!(e).context(format!("reading dir {full_path:?}")));
            }
        };
        let dir_path = fs_path.path.as_str();
        let denied_entries: FxHashSet<&str> = self
            .inner
            .denied_paths
            .iter()
            .filter_map(|denied_path| {
                // If we have a denied path, we need to see if the current directory is a prefix of
                // the denied path meaning that it is possible that some directory entry needs to be
                // filtered. we do this first to avoid string manipulation on every
                // iteration of the directory entries. So while expanding `foo/bar`,
                // if `foo/bar/baz` is denied, we filter out `baz`.
                // But if foo/bar/baz/qux is denied we don't filter anything from this level.
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
            })
            .collect();

        let entries = read_dir
            .filter_map(|r| {
                let e = match r {
                    Ok(e) => e,
                    Err(err) => return Some(Err(err.into())),
                };

                // we filter out any non unicode names
                let file_name = RcStr::from(e.file_name().to_str()?);
                // Filter out denied entries
                if denied_entries.contains(file_name.as_str()) {
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
            .with_context(|| format!("reading directory item in {full_path:?}"))?;

        Ok(RawDirectoryContent::new(entries))
    }

    #[turbo_tasks::function(fs, session_dependent)]
    async fn read_link(self: ResolvedVc<Self>, fs_path: FileSystemPath) -> Result<Vc<LinkContent>> {
        let this = self.await?;
        let inner = &this.inner;
        if inner.is_path_denied(&fs_path) {
            return Ok(LinkContent::Invalid {
                reason: rcstr!("access to the symlink path is denied"),
            }
            .cell());
        }
        let full_link_path = Arc::new(this.to_sys_path_raw(&fs_path));

        inner.register_read_invalidator(&full_link_path).await?;

        let _lock = inner.lock_path(full_link_path.clone()).await;
        let mut target_sys_path = match retry_blocking(|| std::fs::read_link(&**full_link_path))
            .instrument(tracing::info_span!("read symlink", name = ?full_link_path))
            .concurrency_limited(&inner.read_semaphore)
            .await
        {
            Ok(res) => res,
            Err(err) if err.kind() == ErrorKind::NotFound => {
                return Ok(LinkContent::NotFound.cell());
            }
            Err(err) => {
                return Ok(LinkContent::Invalid {
                    reason: RcStr::from(err.to_string()),
                }
                .cell());
            }
        };

        if cfg!(windows) && target_sys_path.has_root() && !target_sys_path.is_absolute() {
            // On windows, `\foo` has a root but no drive and is not absolute. Just convert it to
            // absolute and treat it like it's absolute.
            let mut absolute_target = inner.root_path().to_path_buf();
            absolute_target.push(target_sys_path);
            target_sys_path = absolute_target;
        }

        let target = if target_sys_path.is_absolute() {
            // First try a cheap, purely lexical conversion of the raw target. `relative_to` is
            // ignored for absolute targets.
            let mut target_fs_path = this.try_from_sys_path(self, &target_sys_path, None);

            // If that failed, the target may just be spelled differently than our canonicalized
            // filesystem root (e.g. case insensitive filesystem, a Windows 8.3 short name, or a
            // symlink in the path). This performs session-dependent IO to resolve the fs root
            // path.
            if target_fs_path.is_none() {
                target_fs_path = this
                    .resolve_link_target_ancestry_slow_path(self, &target_sys_path)
                    .await?;
            }

            let Some(target_fs_path) = target_fs_path else {
                // The target leaves the filesystem root (or is a dangling link whose parent
                // directory couldn't be canonicalized).
                return Ok(LinkContent::Invalid {
                    reason: rcstr!(
                        "the symlink target leaves the filesystem root or its parent directory \
                         could not be resolved"
                    ),
                }
                .cell());
            };
            // Rewrite from the sys root to the DiskFileSystem root.
            LinkTarget::Absolute {
                resolved: target_fs_path,
            }
        } else {
            if cfg!(windows)
                && let Some(Component::Prefix(target_prefix)) = target_sys_path.components().next()
            {
                // Edge case: Windows supports relative file paths with a prefixed disk, e.g.
                // `C:foo`. These only make sense when the drive letter matches the
                // DiskFileSystem root. If it matches, we can safely strip it.
                let Prefix::Disk(target_drive) = target_prefix.kind() else {
                    unreachable!(
                        "path is relative, but contains a prefix that should form an absolute path"
                    );
                };
                let root_drive = match inner.root_path().components().next() {
                    Some(Component::Prefix(root_prefix)) => match root_prefix.kind() {
                        Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => Some(drive),
                        _ => None,
                    },
                    _ => None,
                };
                if root_drive
                    .is_none_or(|root_drive| !target_drive.eq_ignore_ascii_case(&root_drive))
                {
                    return Ok(LinkContent::Invalid {
                        reason: rcstr!(
                            "the symlink target uses a different drive than the filesystem root"
                        ),
                    }
                    .cell());
                }

                target_sys_path = target_sys_path.components().skip(1).collect();
            }

            // The raw value read from the link, converted to a unix-style format. A relative
            // target is resolved against the directory *containing* the link, not the link itself.
            let Some(target_str) = target_sys_path.to_str() else {
                return Ok(LinkContent::Invalid {
                    reason: RcStr::from(format!(
                        "the symlink target {target_sys_path:?} is not valid unicode"
                    )),
                }
                .cell());
            };
            let raw = RcStr::from(sys_to_unix(target_str));

            // Require the target to stay within the filesystem root at every step, not just at
            // the end. A target like `../../<root dir name>/foo` steps out of the root and back
            // in; resolving that needs the names of the root's own ancestors, which a
            // root-relative `FileSystemPath` doesn't carry. Rejecting it here is what lets
            // `LinkTarget` carry a resolved path at all.
            let Some(resolved) = fs_path.parent().try_join(&raw) else {
                return Ok(LinkContent::Invalid {
                    reason: rcstr!("the symlink target leaves the filesystem root"),
                }
                .cell());
            };
            LinkTarget::Relative { raw, resolved }
        };

        Ok(LinkContent::Link { target }.cell())
    }

    #[turbo_tasks::function(fs, session_dependent)]
    async fn is_junction_point(&self, fs_path: FileSystemPath) -> Result<Vc<bool>> {
        #[cfg(windows)]
        {
            if self.inner.is_path_denied(&fs_path) {
                return Ok(Vc::cell(false));
            }
            let full_path = Arc::new(self.to_sys_path_raw(&fs_path));
            self.inner.register_read_invalidator(&full_path).await?;

            let _lock = self.inner.lock_path(full_path.clone()).await;
            let is_junction_point = retry_blocking(|| is_link_junction_point(&full_path))
                .instrument(tracing::info_span!("read junction point", name = ?full_path))
                .concurrency_limited(&self.inner.read_semaphore)
                .await
                .with_context(|| format!("checking junction point {full_path:?}"))?;
            Ok(Vc::cell(is_junction_point))
        }
        #[cfg(not(windows))]
        {
            let _ = fs_path;
            Ok(Vc::cell(false))
        }
    }

    #[turbo_tasks::function(fs)]
    async fn write(
        self: ResolvedVc<Self>,
        fs_path: FileSystemPath,
        content: ResolvedVc<FileContent>,
    ) -> Result<()> {
        let this = self.await?;
        // You might be tempted to use `session_dependent` here, but `write` purely declares a side
        // effect and does not need to be reexecuted in the next session. All side effects are
        // reexecuted in general.

        // Check if path is denied - if so, return an error
        if this.inner.is_path_denied(&fs_path) {
            turbobail!("Cannot write to denied path: {fs_path}");
        }
        let full_path = this.to_sys_path_raw(&fs_path);

        // Validate the path length here, when the write is requested, so that any error is
        // attributed to the caller rather than surfacing later when the effect is applied.
        validate_path_length(&full_path)?;

        // Persist the file content so it is stored in the persistent cache.
        // Since FileContent uses serialization = "hash", persisting it here ensures the full
        // content is available in the persistent cache (via PersistedFileContent) and does not
        // require recomputing the content on cache restore — avoiding unnecessary downstream
        // recomputation.
        let content = content.persist().to_resolved().await?;
        let content_hash = hash_xxh3_hash128(&*content.await?);

        #[turbo_tasks::value(eq = "manual", cell = "new")]
        struct WriteEffect {
            full_path: Arc<PathBuf>,
            fs: ResolvedVc<DiskFileSystem>,
            content: ResolvedVc<PersistedFileContent>,
            content_hash: u128,
        }

        #[async_trait]
        #[turbo_tasks::value_impl]
        impl Effect for WriteEffect {
            async fn capture(&self) -> Result<Box<dyn CapturedEffect>> {
                // Untracked, a tracked read of this cell occurred in the write effect so if it
                // somehow changes the effect will be re-emitted
                let inner = (*self.fs).untracked().await?.inner.clone();

                // If the per-key effect state already records `Applied { value_hash }` matching
                // our hash, skip materializing the content (avoids a possible disk read +
                // decompression via the persistent cache). The apply-time state machine will
                // dedup-hit before touching content. If state diverged between this read and
                // apply, `Effects::apply` will fire our producer's invalidator via the Retry
                // pathway and the producer will rerun with a fresh capture.
                let key_bytes: Box<[u8]> = self.full_path.as_os_str().as_encoded_bytes().into();
                let content = if inner
                    .effect_state_storage
                    .matches_applied(&key_bytes, self.content_hash)
                {
                    None
                } else {
                    // Untracked: the content cell is already captured via `content_hash`, and
                    // we don't want this `capture` to take a tracked dependency on the content
                    // cell — that would pin it and defeat the eviction this refactor enables.
                    Some((*self.content).untracked().await?)
                };
                Ok(Box::new(CapturedWriteEffect {
                    full_path: self.full_path.clone(),
                    inner,
                    content,
                    content_hash: self.content_hash,
                }) as Box<dyn CapturedEffect>)
            }
        }

        #[derive(TraceRawVcs, NonLocalValue, Clone)]
        struct CapturedWriteEffect {
            full_path: Arc<PathBuf>,
            inner: Arc<DiskFileSystemInner>,
            content: Option<ReadRef<PersistedFileContent>>,
            content_hash: u128,
        }

        #[async_trait]
        impl CapturedEffect for CapturedWriteEffect {
            fn key(&self) -> Box<[u8]> {
                self.full_path.as_os_str().as_encoded_bytes().into()
            }

            fn value_hash(&self) -> u128 {
                self.content_hash
            }

            async fn apply(&self) -> Result<(), turbo_tasks::ApplyError> {
                let body = self.content.as_ref().map(|content| {
                    async || self.apply_inner(content).await.map_err(AnyhowWrapper::from)
                });
                self.inner
                    .effect_state_storage
                    .run_apply::<AnyhowWrapper, _, _>(self.key(), self.content_hash, body)
                    .await
            }
        }

        impl CapturedWriteEffect {
            async fn apply_inner(
                &self,
                content: &ReadRef<PersistedFileContent>,
            ) -> anyhow::Result<()> {
                let full_path = &self.full_path;

                let _lock = self.inner.lock_path(full_path.clone()).await;

                // We perform an untracked comparison here, so that this write is not dependent
                // on a read's Vc<FileContent> (and the memory it holds). Our untracked read can
                // be freed immediately. Given this is an output file, it's unlikely any Turbo
                // code will need to read the file from disk into a Vc<FileContent>, so we're
                // not wasting cycles.
                let compare = content
                    .streaming_compare(full_path)
                    .instrument(tracing::info_span!(
                        "read file before write",
                        name = ?full_path,
                    ))
                    .concurrency_limited(&self.inner.read_semaphore)
                    .await?;
                if compare == FileComparison::Equal {
                    return Ok(());
                }

                match &**content {
                    PersistedFileContent::Content(..) => {
                        let content = content.clone();

                        let mut missing_parent_dir = false;
                        let do_write = || {
                            if missing_parent_dir && let Some(parent) = full_path.parent() {
                                std::fs::create_dir_all(parent)?;
                                missing_parent_dir = false;
                            }
                            let mut f = std::fs::File::create(&**full_path).inspect_err(|err| {
                                if err.kind() == ErrorKind::NotFound {
                                    // create the parent dirs in the next attempt
                                    missing_parent_dir = true;
                                }
                            })?;
                            let PersistedFileContent::Content(file) = &*content else {
                                unreachable!()
                            };
                            std::io::copy(&mut file.read(), &mut f)?;
                            #[cfg(unix)]
                            f.set_permissions(file.meta.permissions.into())?;
                            f.flush()?;

                            static WRITE_VERSION: LazyLock<bool> = LazyLock::new(|| {
                                std::env::var_os("TURBO_ENGINE_WRITE_VERSION")
                                    .is_some_and(|v| v == "1" || v == "true")
                            });
                            if *WRITE_VERSION {
                                let mut full_path = (**full_path).clone();
                                let hash = hash_xxh3_hash64(file);
                                let orig_ext = full_path.extension();
                                let mut ext = OsString::from(format!("{hash:016x}"));
                                if let Some(orig_ext) = orig_ext {
                                    ext.push(".");
                                    ext.push(orig_ext);
                                }
                                full_path.set_extension(ext);
                                validate_path_length(&full_path)?;
                                let mut f = std::fs::File::create(&*full_path)?;
                                std::io::copy(&mut file.read(), &mut f)?;
                                #[cfg(unix)]
                                f.set_permissions(file.meta.permissions.into())?;
                                f.flush()?;
                            }
                            Ok::<(), io::Error>(())
                        };
                        fn can_retry_write(err: &io::Error) -> bool {
                            err.kind() == ErrorKind::NotFound || can_retry(err)
                        }
                        retry_blocking_custom(do_write, can_retry_write)
                            .instrument(tracing::info_span!("write file", name = ?full_path))
                            .concurrency_limited(&self.inner.write_semaphore)
                            .await
                            .with_context(|| format!("failed to write to {full_path:?}"))?;
                    }
                    PersistedFileContent::NotFound => {
                        retry_blocking(|| std::fs::remove_file(&**full_path))
                            .instrument(tracing::info_span!("remove file", name = ?full_path))
                            .concurrency_limited(&self.inner.write_semaphore)
                            .await
                            .or_else(|err| {
                                if err.kind() == ErrorKind::NotFound {
                                    Ok(())
                                } else {
                                    Err(err)
                                }
                            })
                            .with_context(|| format!("removing {full_path:?} failed"))?;
                    }
                }

                // Invalidate any read tasks tracking this path so they re-read the new content
                self.inner.invalidate_from_write(&self.full_path);

                Ok(())
            }
        }

        WriteEffect {
            full_path: Arc::new(full_path),
            fs: self,
            content,
            content_hash,
        }
        .resolved_cell()
        .emit();

        Ok(())
    }

    #[turbo_tasks::function(fs)]
    async fn write_link(
        self: ResolvedVc<Self>,
        fs_path: FileSystemPath,
        target: ResolvedVc<WriteLinkContent>,
    ) -> Result<()> {
        // You might be tempted to use `session_dependent` here, but we purely declare a side
        // effect and does not need to be re-executed in the next session. All side effects are
        // re-executed in general.

        let this = self.await?;
        // Check if path is denied - if so, return an error
        if this.inner.is_path_denied(&fs_path) {
            turbobail!("Cannot write link to denied path: {fs_path}");
        }
        let full_path = this.to_sys_path_raw(&fs_path);

        validate_path_length(&full_path)?;

        let content_hash = hash_xxh3_hash128(&*target.await?);

        #[turbo_tasks::value(eq = "manual", cell = "new")]
        struct WriteLinkEffect {
            full_path: Arc<PathBuf>,
            fs: ResolvedVc<DiskFileSystem>,
            target: ResolvedVc<WriteLinkContent>,
            content_hash: u128,
        }

        #[async_trait]
        #[turbo_tasks::value_impl]
        impl Effect for WriteLinkEffect {
            async fn capture(&self) -> Result<Box<dyn CapturedEffect>> {
                let inner = (*self.fs).untracked().await?.inner.clone();

                // Skip target materialization if the per-key effect state already records
                // `Applied { value_hash }` matching our hash. See `WriteEffect::capture`.
                let key_bytes: Box<[u8]> = self.full_path.as_os_str().as_encoded_bytes().into();
                let content = if inner
                    .effect_state_storage
                    .matches_applied(&key_bytes, self.content_hash)
                {
                    None
                } else {
                    // Untracked — see `WriteEffect::capture`.
                    Some((*self.target).untracked().await?)
                };
                Ok(Box::new(CapturedWriteLinkEffect {
                    full_path: self.full_path.clone(),
                    inner,
                    content,
                    content_hash: self.content_hash,
                }) as Box<dyn CapturedEffect>)
            }
        }

        // Post-capture effect — session-only plain struct.
        #[derive(TraceRawVcs, NonLocalValue, Clone)]
        struct CapturedWriteLinkEffect {
            full_path: Arc<PathBuf>,
            inner: Arc<DiskFileSystemInner>,
            content: Option<ReadRef<WriteLinkContent>>,
            content_hash: u128,
        }

        #[async_trait]
        impl CapturedEffect for CapturedWriteLinkEffect {
            fn key(&self) -> Box<[u8]> {
                self.full_path.as_os_str().as_encoded_bytes().into()
            }

            fn value_hash(&self) -> u128 {
                self.content_hash
            }

            async fn apply(&self) -> Result<(), turbo_tasks::ApplyError> {
                let body = self.content.as_ref().map(|content| {
                    async || self.apply_inner(content).await.map_err(AnyhowWrapper::from)
                });
                self.inner
                    .effect_state_storage
                    .run_apply::<AnyhowWrapper, _, _>(self.key(), self.content_hash, body)
                    .await
            }
        }

        impl CapturedWriteLinkEffect {
            async fn apply_inner(&self, content: &ReadRef<WriteLinkContent>) -> anyhow::Result<()> {
                let full_path = self.full_path.clone();

                let _lock = self.inner.lock_path(full_path.clone()).await;

                let WriteLinkContent {
                    target,
                    target_type,
                } = &**content;
                let is_directory =
                    matches!(target_type, WriteLinkTargetType::DirectoryOrJunctionPoint);
                let target = match target {
                    WriteLinkTarget::Absolute(target) => {
                        self.inner.root_path().join(unix_to_sys(target).as_ref())
                    }
                    WriteLinkTarget::Relative(target) => {
                        let relative_target = PathBuf::from(unix_to_sys(target).as_ref());
                        if cfg!(windows) && is_directory {
                            // Windows junction points must always be stored as absolute
                            full_path
                                .parent()
                                .unwrap_or(&full_path)
                                .join(relative_target)
                        } else {
                            relative_target
                        }
                    }
                };

                let old_content = match retry_blocking(|| std::fs::read_link(&**full_path))
                    .instrument(tracing::info_span!("read symlink before write", name = ?full_path))
                    .concurrency_limited(&self.inner.read_semaphore)
                    .await
                {
                    Ok(res) => Some((res.is_absolute(), res)),
                    Err(_) => None,
                };
                #[cfg(not(windows))]
                let is_equal = match &old_content {
                    Some((old_is_absolute, old_target)) => {
                        target == *old_target && target.is_absolute() == *old_is_absolute
                    }
                    None => false,
                };
                #[cfg(windows)]
                let is_equal = match &old_content {
                    Some((old_is_absolute, old_target)) => {
                        target == *old_target
                            && target.is_absolute() == *old_is_absolute
                            && is_link_junction_point(&full_path).ok() == Some(is_directory)
                    }
                    None => false,
                };
                if is_equal {
                    return Ok(());
                }

                #[derive(thiserror::Error, Debug)]
                #[error("{msg}: {source}")]
                struct SymlinkCreationError {
                    msg: &'static str,
                    #[source]
                    source: io::Error,
                }

                let mut missing_parent_dir = false;
                let mut has_old_content = old_content.is_some();
                let try_create_link = || {
                    if missing_parent_dir && let Some(parent) = full_path.parent() {
                        std::fs::create_dir_all(parent).map_err(|err| SymlinkCreationError {
                            msg: "failed to create directory",
                            source: err,
                        })?;
                        missing_parent_dir = false;
                    }
                    if has_old_content {
                        // Remove existing symlink before creating a new one. On Unix,
                        // symlink(2) fails with EEXIST if the link already exists instead
                        // of overwriting it. Windows has similar behavior with junction
                        // points.
                        remove_symbolic_link_dir_helper(&full_path).map_err(|err| {
                            SymlinkCreationError {
                                msg: "removal of existing symbolic link or junction point failed",
                                source: err,
                            }
                        })?;
                        has_old_content = false;
                    }
                    #[cfg(all(not(windows), not(target_os = "wasi")))]
                    let io_result = std::os::unix::fs::symlink(&target, &**full_path);
                    #[cfg(target_os = "wasi")]
                    let io_result = std::os::wasi::fs::symlink_path(&target, &**full_path);
                    #[cfg(windows)]
                    let io_result = if is_directory {
                        std::os::windows::fs::junction_point(&target, &**full_path)
                    } else {
                        std::os::windows::fs::symlink_file(&target, &**full_path)
                    };
                    io_result.map_err(|err| {
                        match err.kind() {
                            ErrorKind::NotFound => {
                                // create the parent dirs in the next attempt
                                missing_parent_dir = true;
                            }
                            ErrorKind::AlreadyExists => {
                                // try to remove the symlink on the next attempt
                                has_old_content = true;
                            }
                            _ => {}
                        }
                        SymlinkCreationError {
                            msg: "creation of a new symbolic link or junction point failed",
                            source: err,
                        }
                    })
                };
                fn can_retry_link(err: &SymlinkCreationError) -> bool {
                    matches!(
                        err.source.kind(),
                        ErrorKind::NotFound | ErrorKind::AlreadyExists
                    ) || can_retry(&err.source)
                }
                let err_context = || {
                    #[cfg(not(windows))]
                    let message =
                        format!("failed to create symlink at {full_path:?} pointing to {target:?}");
                    #[cfg(windows)]
                    let message = if is_directory {
                        format!(
                            "failed to create junction point at {full_path:?} pointing to \
                             {target:?}"
                        )
                    } else {
                        format!(
                            "failed to create symlink at {full_path:?} pointing to \
                             {target:?}\n\
                            (Note: creating file symlinks on Windows require developer \
                             mode or admin permissions: \
                             https://learn.microsoft.com/en-us/windows/advanced-settings/developer-mode)",
                        )
                    };
                    message
                };
                retry_blocking_custom(try_create_link, can_retry_link)
                    .instrument(tracing::info_span!(
                        "write symlink",
                        name = ?full_path,
                        target = ?target,
                    ))
                    .concurrency_limited(&self.inner.write_semaphore)
                    .await
                    .with_context(err_context)?;

                // Invalidate any read tasks tracking this path so they re-read the new content
                self.inner.invalidate_from_write(&self.full_path);

                Ok(())
            }
        }

        WriteLinkEffect {
            full_path: Arc::new(full_path),
            fs: self,
            target,
            content_hash,
        }
        .resolved_cell()
        .emit();
        Ok(())
    }

    #[turbo_tasks::function(fs, session_dependent)]
    async fn metadata(&self, fs_path: FileSystemPath) -> Result<Vc<FileMeta>> {
        let full_path = Arc::new(self.to_sys_path_raw(&fs_path));

        // Check if path is denied - if so, return an error (metadata shouldn't be readable)
        if self.inner.is_path_denied(&fs_path) {
            turbobail!("Cannot read metadata from denied path: {fs_path}");
        }

        self.inner.register_read_invalidator(&full_path).await?;

        let _lock = self.inner.lock_path(full_path.clone()).await;
        let meta = retry_blocking(|| std::fs::metadata(&**full_path))
            .instrument(tracing::info_span!("read metadata", name = ?full_path))
            .concurrency_limited(&self.inner.read_semaphore)
            .await
            .with_context(|| format!("reading metadata for {:?}", full_path))?;

        Ok(FileMeta::cell(meta.into()))
    }
}

fn remove_symbolic_link_dir_helper(path: &Path) -> io::Result<()> {
    let result = if cfg!(windows) {
        // Junction points on Windows are treated as directories, and therefore need
        // `remove_dir`:
        //
        // > `RemoveDirectory` can be used to remove a directory junction. Since the target
        // > directory and its contents will remain accessible through its canonical path, the
        // > target directory itself is not affected by removing a junction which targets it.
        //
        // -- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-removedirectoryw
        //
        // However, Next 16.1.0 shipped with symlinks, before we switched to junction links on
        // Windows, and `remove_dir` won't work on symlinks. So try to remove it as a directory
        // (junction) first, and then fall back to removing it as a file (symlink).
        std::fs::remove_dir(path).or_else(|err| {
            if err.kind() == ErrorKind::NotADirectory {
                std::fs::remove_file(path)
            } else {
                Err(err)
            }
        })
    } else {
        std::fs::remove_file(path)
    };
    match result {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err),
    }
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbo_tasks::{Effects, OperationVc, Vc, take_effects};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;

    #[turbo_tasks::function(operation, root)]
    async fn extract_effects_operation(op: OperationVc<()>) -> anyhow::Result<Vc<Effects>> {
        let _ = op.resolve().strongly_consistent().await?;
        Ok(take_effects(op).await?.cell())
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
            assert_try_from_sys_path_operation(RcStr::from(sys_root.to_str().unwrap()))
                .read_strongly_consistent()
                .await?;

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::function(operation, root)]
    async fn assert_try_from_sys_path_operation(sys_root: RcStr) -> anyhow::Result<()> {
        let sys_root = Path::new(sys_root.as_str());
        let fs_vc = DiskFileSystem::new(
            rcstr!("temp"),
            Vc::cell(RcStr::from(sys_root.to_str().unwrap())),
        )
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

        Ok(())
    }

    #[cfg(test)]
    mod symlink_tests {
        use std::{
            fs::{File, create_dir_all, read_to_string},
            io::Write,
        };

        use rand::{RngExt, SeedableRng};
        use turbo_rcstr::{RcStr, rcstr};
        use turbo_tasks::{ResolvedVc, Vc, read_strongly_consistent_and_apply_effects};
        use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

        use super::extract_effects_operation;
        #[cfg(all(unix, debug_assertions))]
        use crate::{DirectoryContent, FileContent, RawDirectoryContent};
        use crate::{
            DiskFileSystem, FileSystem, FileSystemEntryType, FileSystemPath, LinkContent,
            LinkTarget, RealPathErrorType, WriteLinkContent, WriteLinkTarget, WriteLinkTargetType,
            canonicalize_to_rcstr,
        };

        #[turbo_tasks::function(operation, root)]
        async fn test_write_link_effect_operation(
            fs: ResolvedVc<DiskFileSystem>,
            path: FileSystemPath,
            target: RcStr,
        ) -> anyhow::Result<()> {
            let write_file = |f| {
                fs.write_link(
                    f,
                    WriteLinkContent {
                        target: WriteLinkTarget::Relative(format!("{target}/data.txt").into()),
                        target_type: WriteLinkTargetType::FileNonPortable,
                    }
                    .cell(),
                )
            };
            // Write it twice (same content)
            write_file(path.join("symlink-file")?).await?;
            write_file(path.join("symlink-file")?).await?;

            let write_dir = |f| {
                fs.write_link(
                    f,
                    WriteLinkContent {
                        target: WriteLinkTarget::Relative(target.clone()),
                        target_type: WriteLinkTargetType::DirectoryOrJunctionPoint,
                    }
                    .cell(),
                )
            };
            // Write it twice (same content)
            write_dir(path.join("symlink-dir")?).await?;
            write_dir(path.join("symlink-dir")?).await?;

            Ok(())
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_write_link() {
            let scratch = tempfile::tempdir().unwrap();
            let path = scratch.path().to_owned();

            create_dir_all(path.join("subdir-a")).unwrap();
            File::create_new(path.join("subdir-a/data.txt"))
                .unwrap()
                .write_all(b"foo")
                .unwrap();
            create_dir_all(path.join("subdir-b")).unwrap();
            File::create_new(path.join("subdir-b/data.txt"))
                .unwrap()
                .write_all(b"bar")
                .unwrap();
            let root = path.to_str().unwrap().into();

            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async move {
                let fs = disk_file_system_operation(root)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let root_path = disk_file_system_root(fs);

                read_strongly_consistent_and_apply_effects(
                    extract_effects_operation(test_write_link_effect_operation(
                        fs,
                        root_path.clone(),
                        rcstr!("subdir-a"),
                    )),
                    |e| e,
                )
                .await?;

                assert_eq!(read_to_string(path.join("symlink-file")).unwrap(), "foo");
                assert_eq!(
                    read_to_string(path.join("symlink-dir/data.txt")).unwrap(),
                    "foo"
                );

                // Write the same links again but with different targets
                read_strongly_consistent_and_apply_effects(
                    extract_effects_operation(test_write_link_effect_operation(
                        fs,
                        root_path,
                        rcstr!("subdir-b"),
                    )),
                    |e| e,
                )
                .await?;

                assert_eq!(read_to_string(path.join("symlink-file")).unwrap(), "bar");
                assert_eq!(
                    read_to_string(path.join("symlink-dir/data.txt")).unwrap(),
                    "bar"
                );

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        /// A relative symlink's `target` must be the raw link-relative value stored on disk
        /// (consumers like `realpath_with_links` and `write_link` resolve it against the
        /// directory *containing* the link). It must not be normalized or made root-relative.
        #[turbo_tasks::function(operation, root)]
        async fn assert_read_relative_symlink_operation(
            fs: ResolvedVc<DiskFileSystem>,
            root_path: FileSystemPath,
        ) -> anyhow::Result<()> {
            // sub/link-sibling -> foo.txt     (resolves to sub/foo.txt)
            let sibling = fs.read_link(root_path.join("sub/link-sibling")?).await?;
            assert_eq!(
                *sibling,
                LinkContent::Link {
                    target: LinkTarget::Relative {
                        raw: rcstr!("foo.txt"),
                        resolved: root_path.join("sub/foo.txt")?,
                    },
                }
            );

            // sub/link-parent -> ../root.txt  (resolves to root.txt)
            let parent = fs.read_link(root_path.join("sub/link-parent")?).await?;
            assert_eq!(
                *parent,
                LinkContent::Link {
                    target: LinkTarget::Relative {
                        raw: rcstr!("../root.txt"),
                        resolved: root_path.join("root.txt")?,
                    },
                }
            );

            Ok(())
        }

        #[cfg(all(unix, debug_assertions))]
        #[turbo_tasks::function(operation, root)]
        async fn assert_read_realpath_operation(root_path: FileSystemPath) -> anyhow::Result<()> {
            let unresolved_dir = root_path.join("alias/child")?;
            let resolved_dir = unresolved_dir
                .realpath()
                .await?
                .expect("the linked directory should resolve");

            assert_ne!(unresolved_dir, resolved_dir);
            let error = unresolved_dir
                .read_dir()
                .await
                .expect_err("a directory read through a symlinked parent must be rejected");
            let message = format!("{error:#}");
            assert!(message.contains("alias/child"));
            assert!(message.contains("real/child"));
            assert!(matches!(
                &*resolved_dir.read_dir().await?,
                DirectoryContent::Entries(entries) if entries.contains_key(&rcstr!("data.txt"))
            ));

            assert!(matches!(
                &*root_path.join("file-alias")?.raw_read_dir().await?,
                RawDirectoryContent::NotFound
            ));

            let unresolved_file = unresolved_dir.join("data.txt")?;
            let resolved_file = unresolved_file
                .realpath()
                .await?
                .expect("the linked file should resolve");
            assert_ne!(unresolved_file, resolved_file);
            let error = unresolved_file
                .read()
                .await
                .expect_err("a file read through a symlinked parent must be rejected");
            let message = format!("{error:#}");
            assert!(message.contains("alias/child/data.txt"));
            assert!(message.contains("real/child/data.txt"));
            assert!(matches!(
                &*resolved_file.read().await?,
                FileContent::Content(_)
            ));

            Ok(())
        }

        #[cfg(all(unix, debug_assertions))]
        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_reads_require_realpath() {
            use std::os::unix::fs::symlink;

            let scratch = tempfile::tempdir().unwrap();
            let path = scratch.path().to_owned();
            create_dir_all(path.join("real/child")).unwrap();
            File::create_new(path.join("real/child/data.txt")).unwrap();
            symlink("real", path.join("alias")).unwrap();
            symlink("real/child/data.txt", path.join("file-alias")).unwrap();

            let root = canonicalize_to_rcstr(&path).unwrap();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async move {
                let fs = disk_file_system_operation(root)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let root_path = disk_file_system_root(fs);
                assert_read_realpath_operation(root_path)
                    .read_strongly_consistent()
                    .await?;
                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        /// `read_link` never looks at the target, so a dangling link still reads back as a valid
        /// [`LinkContent::Link`]. Resolving it reports the missing target.
        #[cfg(unix)]
        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_dangling_symlink() {
            use std::os::unix::fs::symlink;

            let scratch = tempfile::tempdir().unwrap();
            let path = scratch.path().to_owned();
            create_dir_all(path.join("sub")).unwrap();
            create_dir_all(path.join("target-dir")).unwrap();
            symlink("missing.txt", path.join("sub/link-dangling")).unwrap();
            symlink("link-dangling", path.join("sub/link-chain")).unwrap();
            symlink("../target-dir", path.join("sub/link-dir")).unwrap();

            let root = canonicalize_to_rcstr(&path).unwrap();

            #[turbo_tasks::function(operation, root)]
            async fn assert_operation(
                fs: ResolvedVc<DiskFileSystem>,
                root_path: FileSystemPath,
            ) -> anyhow::Result<()> {
                let link_path = root_path.join("sub/link-dangling")?;

                // The link itself is perfectly valid; only its target is missing.
                let link = fs.read_link(link_path.clone()).await?;
                let LinkContent::Link { target } = &*link else {
                    anyhow::bail!("expected a valid link, got {link:?}");
                };
                assert_eq!(
                    *target,
                    LinkTarget::Relative {
                        raw: rcstr!("missing.txt"),
                        resolved: root_path.join("sub/missing.txt")?,
                    }
                );
                assert_eq!(target.target_type().await?, FileSystemEntryType::NotFound,);

                // `realpath` follows the link and reports the missing target.
                let result = link_path.realpath_with_links().await?;
                assert!(matches!(
                    result.path_result.as_ref().unwrap_err().kind(),
                    RealPathErrorType::NotFound
                ));

                // The same missing target after another link is also reported as not found.
                let chain_path = root_path.join("sub/link-chain")?;
                let result = chain_path.realpath_with_links().await?;
                assert!(matches!(
                    result.path_result.as_ref().unwrap_err().kind(),
                    RealPathErrorType::NotFound
                ));

                // A missing path beneath a resolved directory link is reported as not found.
                let missing_in_linked_dir = root_path.join("sub/link-dir/package.json")?;
                let result = missing_in_linked_dir.realpath_with_links().await?;
                assert!(matches!(
                    result.path_result.as_ref().unwrap_err().kind(),
                    RealPathErrorType::NotFound
                ));

                // A path that simply doesn't exist is also reported as not found.
                let missing = root_path.join("sub/missing.txt")?;
                let result = missing.realpath_with_links().await?;
                assert!(matches!(
                    result.path_result.as_ref().unwrap_err().kind(),
                    RealPathErrorType::NotFound
                ));

                Ok(())
            }

            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async move {
                let fs = disk_file_system_operation(root)
                    .resolve()
                    .strongly_consistent()
                    .await?;

                assert_operation(fs, disk_file_system_root(fs))
                    .read_strongly_consistent()
                    .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();

            tt.stop_and_wait().await;
        }

        #[cfg(unix)]
        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_link_target_resolved_type_through_chain() {
            use std::os::unix::fs::symlink;

            let scratch = tempfile::tempdir().unwrap();
            let path = scratch.path().to_owned();
            create_dir_all(path.join("target-dir")).unwrap();
            File::create_new(path.join("target-file")).unwrap();
            symlink("target-dir", path.join("dir-inner")).unwrap();
            symlink("dir-inner", path.join("dir-outer")).unwrap();
            symlink("target-file", path.join("file-inner")).unwrap();
            symlink("file-inner", path.join("file-outer")).unwrap();
            symlink("../outside", path.join("invalid-inner")).unwrap();
            symlink("invalid-inner", path.join("invalid-outer")).unwrap();

            let root = canonicalize_to_rcstr(&path).unwrap();

            #[turbo_tasks::function(operation, root)]
            async fn assert_operation(
                fs: ResolvedVc<DiskFileSystem>,
                root_path: FileSystemPath,
            ) -> anyhow::Result<()> {
                for (input_path, expected_output) in [
                    ("dir-outer", FileSystemEntryType::Directory),
                    ("file-outer", FileSystemEntryType::File),
                    ("invalid-outer", FileSystemEntryType::Error),
                ] {
                    let link = fs.read_link(root_path.join(input_path)?).await?;
                    let LinkContent::Link { target } = &*link else {
                        anyhow::bail!("expected a valid link, got {link:?}");
                    };
                    assert_eq!(target.resolved_type().await?, expected_output);
                }

                Ok(())
            }

            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async move {
                let fs = disk_file_system_operation(root)
                    .resolve()
                    .strongly_consistent()
                    .await?;

                assert_operation(fs, disk_file_system_root(fs))
                    .read_strongly_consistent()
                    .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();

            tt.stop_and_wait().await;
        }

        /// A relative target must stay inside the filesystem root at every step, not just at the
        /// end. Both of these step above the root; one comes back into it and one doesn't, but
        /// neither can be resolved against a root-relative [`FileSystemPath`], so `read_link`
        /// rejects both and every [`LinkContent::Link`] stays resolvable by construction.
        #[cfg(unix)]
        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_read_escaping_relative_symlink() {
            use std::os::unix::fs::symlink;

            let scratch = tempfile::tempdir().unwrap();
            // The fs root is a subdirectory, so that `../..` can step above it and back in.
            let path = scratch.path().join("the-root");
            create_dir_all(path.join("sub")).unwrap();
            File::create_new(path.join("root.txt"))
                .unwrap()
                .write_all(b"root")
                .unwrap();
            // Steps above the root and back down into it.
            symlink("../../the-root/root.txt", path.join("sub/link-reentrant")).unwrap();
            // Steps above the root and back down into a sibling of the root, so it escapes.
            create_dir_all(scratch.path().join("sibling")).unwrap();
            File::create_new(scratch.path().join("sibling/root.txt"))
                .unwrap()
                .write_all(b"sibling")
                .unwrap();
            symlink("../../sibling/root.txt", path.join("sub/link-sideways")).unwrap();
            // Stays inside the root the whole way.
            symlink("../root.txt", path.join("sub/link-inside")).unwrap();
            // A target naming a file that literally contains a backslash.
            File::create_new(path.join("sub/a\\b.txt"))
                .unwrap()
                .write_all(b"backslash")
                .unwrap();
            symlink("a\\b.txt", path.join("sub/link-backslash")).unwrap();

            let root = canonicalize_to_rcstr(&path).unwrap();

            #[turbo_tasks::function(operation, root)]
            async fn assert_operation(
                fs: ResolvedVc<DiskFileSystem>,
                root_path: FileSystemPath,
            ) -> anyhow::Result<()> {
                // sub/link-reentrant -> ../../<root dir name>/root.txt, which steps above the root
                // and back down into it. Resolving this would need the names of the root's own
                // ancestors, which a root-relative path doesn't carry.
                let reentrant = fs.read_link(root_path.join("sub/link-reentrant")?).await?;
                assert!(matches!(
                    &*reentrant,
                    LinkContent::Invalid { reason }
                        if reason == "the symlink target leaves the filesystem root"
                ));

                // sub/link-sideways -> ../../sibling/root.txt, which steps above the root and down
                // into a sibling, so it genuinely ends outside.
                let sideways = fs.read_link(root_path.join("sub/link-sideways")?).await?;
                assert!(matches!(
                    &*sideways,
                    LinkContent::Invalid{reason}
                        if reason == "the symlink target leaves the filesystem root"
                ));

                // `\` is a legal filename character on unix, so a raw target may contain one. It
                // must not be treated as a separator, and must not trip
                // `join_path`'s debug assertion.
                let backslash_path = root_path.join("sub/link-backslash")?;
                let backslash = fs.read_link(backslash_path.clone()).await?;
                assert_eq!(
                    *backslash,
                    LinkContent::Link {
                        target: LinkTarget::Relative {
                            raw: rcstr!("a\\b.txt"),
                            resolved: root_path.join("sub/a\\b.txt")?,
                        },
                    }
                );

                // A relative target that stays within the root throughout is still fine.
                let inside_path = root_path.join("sub/link-inside")?;
                let inside = fs.read_link(inside_path.clone()).await?;
                let LinkContent::Link { target } = &*inside else {
                    anyhow::bail!("expected a valid link, got {inside:?}");
                };
                assert_eq!(
                    *target,
                    LinkTarget::Relative {
                        raw: rcstr!("../root.txt"),
                        resolved: root_path.join("root.txt")?,
                    }
                );
                assert_eq!(target.target_type().await?, FileSystemEntryType::File,);

                Ok(())
            }

            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));
            tt.run_once(async move {
                let fs = disk_file_system_operation(root)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let root_path = disk_file_system_root(fs);

                assert_operation(fs, root_path)
                    .read_strongly_consistent()
                    .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();

            tt.stop_and_wait().await;
        }

        #[cfg(unix)]
        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_read_relative_symlink() {
            use std::os::unix::fs::symlink;

            let scratch = tempfile::tempdir().unwrap();
            let path = scratch.path().to_owned();

            // root.txt
            // sub/foo.txt
            // sub/link-sibling -> foo.txt
            // sub/link-parent  -> ../root.txt
            create_dir_all(path.join("sub")).unwrap();
            File::create_new(path.join("root.txt"))
                .unwrap()
                .write_all(b"root")
                .unwrap();
            File::create_new(path.join("sub/foo.txt"))
                .unwrap()
                .write_all(b"foo")
                .unwrap();
            symlink("foo.txt", path.join("sub/link-sibling")).unwrap();
            symlink("../root.txt", path.join("sub/link-parent")).unwrap();

            let root: RcStr = path.to_str().unwrap().into();

            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async move {
                let fs = disk_file_system_operation(root)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let root_path = disk_file_system_root(fs);

                assert_read_relative_symlink_operation(fs, root_path)
                    .read_strongly_consistent()
                    .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        #[cfg(unix)]
        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_read_absolute_symlink_slow_path() {
            use std::os::unix::fs::symlink;

            let scratch = tempfile::tempdir().unwrap();
            let path = scratch.path().to_owned();

            // real-root/foo.txt                     (the filesystem root's contents)
            // alias -> real-root                    (a differently-spelled path to the fs root)
            // outside.txt                           (outside of the fs root)
            // real-root/link-via-alias -> <scratch>/alias/foo.txt
            // real-root/link-outside   -> <scratch>/outside.txt
            let real_root = path.join("real-root");
            create_dir_all(&real_root).unwrap();
            File::create_new(real_root.join("foo.txt"))
                .unwrap()
                .write_all(b"foo")
                .unwrap();
            File::create_new(path.join("outside.txt"))
                .unwrap()
                .write_all(b"outside")
                .unwrap();
            symlink(&real_root, path.join("alias")).unwrap();
            symlink(path.join("alias/foo.txt"), real_root.join("link-via-alias")).unwrap();
            symlink(path.join("outside.txt"), real_root.join("link-outside")).unwrap();

            // `DiskFileSystem::new` requires a canonicalized root. The raw targets above are
            // spelled via the un-canonicalized `scratch` path and the `alias` symlink, so they
            // never lexically match the root and must take the slow path.
            let root = canonicalize_to_rcstr(&real_root).unwrap();

            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            /// An absolute symlink target uses a symlinked alias of the root, so lexically
            /// stripping the prefix from the target does not work. `read_link`'s slow path must
            /// map it into the filesystem root, and must reject targets that are outside of the
            /// root.
            #[turbo_tasks::function(operation, root)]
            async fn assert_read_absolute_symlink_slow_path_operation(
                fs: ResolvedVc<DiskFileSystem>,
                root_path: FileSystemPath,
            ) -> anyhow::Result<()> {
                // link-via-alias -> <scratch>/alias/foo.txt  (resolves to <fs root>/foo.txt)
                let via_alias = fs.read_link(root_path.join("link-via-alias")?).await?;
                assert_eq!(
                    *via_alias,
                    LinkContent::Link {
                        target: LinkTarget::Absolute {
                            resolved: root_path.join("foo.txt")?,
                        },
                    }
                );

                // link-outside -> <scratch>/outside.txt  (outside of the fs root)
                let outside = fs.read_link(root_path.join("link-outside")?).await?;
                assert!(matches!(
                    &*outside,
                    LinkContent::Invalid { reason}
                        if reason.contains("leaves the filesystem root")
                ));

                Ok(())
            }

            tt.run_once(async move {
                let fs = disk_file_system_operation(root)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let root_path = disk_file_system_root(fs);

                assert_read_absolute_symlink_slow_path_operation(fs, root_path)
                    .read_strongly_consistent()
                    .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        const STRESS_ITERATIONS: usize = 100;
        const STRESS_PARALLELISM: usize = 8;
        const STRESS_TARGET_COUNT: usize = 20;
        const STRESS_SYMLINK_COUNT: usize = 16;

        #[turbo_tasks::function(operation, root)]
        fn disk_file_system_operation(fs_root: RcStr) -> Vc<DiskFileSystem> {
            DiskFileSystem::new(rcstr!("test"), Vc::cell(fs_root))
        }

        fn disk_file_system_root(fs: ResolvedVc<DiskFileSystem>) -> FileSystemPath {
            FileSystemPath {
                fs: ResolvedVc::upcast(fs),
                path: rcstr!(""),
            }
        }

        #[turbo_tasks::function(operation, root)]
        async fn write_symlink_stress_batch(
            fs: ResolvedVc<DiskFileSystem>,
            symlinks_dir: FileSystemPath,
            updates: Vec<(usize, usize)>,
        ) -> anyhow::Result<()> {
            use turbo_tasks::TryJoinIterExt;

            updates
                .into_iter()
                .map(|(symlink_idx, target_idx)| {
                    let target = RcStr::from(format!("../_targets/{target_idx}"));
                    let symlink_path = symlinks_dir.join(&symlink_idx.to_string()).unwrap();
                    async move {
                        fs.write_link(
                            symlink_path,
                            WriteLinkContent {
                                target: WriteLinkTarget::Relative(target),
                                target_type: WriteLinkTargetType::DirectoryOrJunctionPoint,
                            }
                            .cell(),
                        )
                        .await
                    }
                })
                .try_join()
                .await?;
            Ok(())
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_symlink_stress() {
            let scratch = tempfile::tempdir().unwrap();
            let path = scratch.path().to_owned();

            let targets_dir = path.join("_targets");
            create_dir_all(&targets_dir).unwrap();
            for i in 0..STRESS_TARGET_COUNT {
                create_dir_all(targets_dir.join(i.to_string())).unwrap();
            }
            create_dir_all(path.join("_symlinks")).unwrap();

            let root = RcStr::from(path.to_str().unwrap());

            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));

            tt.run_once(async move {
                let fs = disk_file_system_operation(root)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let root_path = disk_file_system_root(fs);
                let symlinks_dir = root_path.join("_symlinks")?;

                let initial_updates: Vec<(usize, usize)> =
                    (0..STRESS_SYMLINK_COUNT).map(|i| (i, 0)).collect();
                read_strongly_consistent_and_apply_effects(
                    extract_effects_operation(write_symlink_stress_batch(
                        fs,
                        symlinks_dir.clone(),
                        initial_updates,
                    )),
                    |e| e,
                )
                .await?;

                let mut rng = rand::rngs::SmallRng::seed_from_u64(0);
                for _ in 0..STRESS_ITERATIONS {
                    let mut updates_map = rustc_hash::FxHashMap::default();
                    for _ in 0..STRESS_PARALLELISM {
                        let symlink_idx = rng.random_range(0..STRESS_SYMLINK_COUNT);
                        let target_idx = rng.random_range(0..STRESS_TARGET_COUNT);
                        updates_map.insert(symlink_idx, target_idx);
                    }
                    let updates: Vec<(usize, usize)> = updates_map.into_iter().collect();

                    read_strongly_consistent_and_apply_effects(
                        extract_effects_operation(write_symlink_stress_batch(
                            fs,
                            symlinks_dir.clone(),
                            updates,
                        )),
                        |e| e,
                    )
                    .await?;
                }

                anyhow::Ok(())
            })
            .await
            .unwrap();

            tt.stop_and_wait().await;
        }
    }

    // Tests helpers for denied_path tests
    #[cfg(test)]
    mod denied_path_tests {
        use std::{
            fs::{File, create_dir_all, read_to_string},
            io::Write,
            path::Path,
        };

        use turbo_rcstr::{RcStr, rcstr};
        use turbo_tasks::{Effects, Vc, read_strongly_consistent_and_apply_effects, take_effects};
        use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

        use crate::{
            DirectoryContent, DiskFileSystem, DiskWatcherConfig, File as TurboFile, FileContent,
            FileSystem, FileSystemPath,
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

            let root = RcStr::from(path.to_str().unwrap());
            // denied_path should be relative to root, using unix separators
            let denied_path = rcstr!("denied_dir");

            (scratch, root, denied_path)
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_denied_path_read() {
            #[turbo_tasks::function(operation, root)]
            async fn test_operation(root: RcStr, denied_path: RcStr) -> anyhow::Result<()> {
                let fs = DiskFileSystem::new_with_options(
                    rcstr!("test"),
                    Vc::cell(root),
                    vec![denied_path],
                    DiskWatcherConfig::default(),
                );
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

                Ok(())
            }

            let (_scratch, root, denied_path) = setup_test_fs();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));
            tt.run_once(async {
                test_operation(root, denied_path)
                    .read_strongly_consistent()
                    .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_denied_path_read_dir() {
            #[turbo_tasks::function(operation, root)]
            async fn test_operation(root: RcStr, denied_path: RcStr) -> anyhow::Result<()> {
                let fs = DiskFileSystem::new_with_options(
                    rcstr!("test"),
                    Vc::cell(root),
                    vec![denied_path],
                    DiskWatcherConfig::default(),
                );
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

                Ok(())
            }

            let (_scratch, root, denied_path) = setup_test_fs();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));
            tt.run_once(async {
                test_operation(root, denied_path)
                    .read_strongly_consistent()
                    .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_denied_path_read_glob() {
            #[turbo_tasks::function(operation, root)]
            async fn test_operation(root: RcStr, denied_path: RcStr) -> anyhow::Result<()> {
                let fs = DiskFileSystem::new_with_options(
                    rcstr!("test"),
                    Vc::cell(root),
                    vec![denied_path],
                    DiskWatcherConfig::default(),
                );
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

                Ok(())
            }

            let (_scratch, root, denied_path) = setup_test_fs();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));
            tt.run_once(async {
                test_operation(root, denied_path)
                    .read_strongly_consistent()
                    .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn test_denied_path_write() {
            #[turbo_tasks::function(operation, root)]
            async fn write_file_operation(
                path: FileSystemPath,
                contents: RcStr,
            ) -> anyhow::Result<()> {
                path.write(
                    FileContent::Content(TurboFile::from_bytes(contents.to_string().into_bytes()))
                        .cell(),
                )
                .await?;
                Ok(())
            }

            /// Writes the allowed file and captures effects to be applied at
            /// the top level.
            #[turbo_tasks::function(operation, root)]
            async fn write_allowed_file_operation(
                root: RcStr,
                denied_path: RcStr,
                file_path: RcStr,
                contents: RcStr,
            ) -> anyhow::Result<Vc<Effects>> {
                let fs = DiskFileSystem::new_with_options(
                    rcstr!("test"),
                    Vc::cell(root),
                    vec![denied_path],
                    DiskWatcherConfig::default(),
                );
                let root_path = fs.root().await?;
                let allowed_file = root_path.join(&file_path)?;
                let write_op = write_file_operation(allowed_file, contents);
                write_op.read_strongly_consistent().await?;
                Ok(take_effects(write_op).await?.cell())
            }

            #[turbo_tasks::function(operation, root)]
            async fn test_denied_writes_operation(
                root: RcStr,
                denied_path: RcStr,
                denied_file: RcStr,
                nested_denied_file: RcStr,
            ) -> anyhow::Result<()> {
                let fs = DiskFileSystem::new_with_options(
                    rcstr!("test"),
                    Vc::cell(root),
                    vec![denied_path],
                    DiskWatcherConfig::default(),
                );
                let root_path = fs.root().await?;

                let path = root_path.join(&denied_file)?;
                let result = write_file_operation(path, rcstr!("forbidden"))
                    .read_strongly_consistent()
                    .await;
                assert!(
                    result.is_err(),
                    "writing to denied path should return an error"
                );

                let path = root_path.join(&nested_denied_file)?;
                let result = write_file_operation(path, rcstr!("nested"))
                    .read_strongly_consistent()
                    .await;
                assert!(
                    result.is_err(),
                    "writing to nested denied path should return an error"
                );

                Ok(())
            }

            let (_scratch, root, denied_path) = setup_test_fs();
            let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ));
            tt.run_once(async {
                const ALLOWED_FILE: &str = "allowed_dir/new_file.txt";
                const TEST_CONTENT: &str = "test content";

                // Test 1: Writing to allowed directory should work
                let effects_op = write_allowed_file_operation(
                    root.clone(),
                    denied_path.clone(),
                    RcStr::from(ALLOWED_FILE),
                    RcStr::from(TEST_CONTENT),
                );
                read_strongly_consistent_and_apply_effects(effects_op, |e| e).await?;

                // Verify the file was written to disk
                let content = read_to_string(Path::new(root.as_str()).join(ALLOWED_FILE))?;
                assert_eq!(content, TEST_CONTENT, "allowed file write should succeed");

                // Tests 2 & 3: Writing to denied paths should fail
                test_denied_writes_operation(
                    root,
                    denied_path,
                    RcStr::from("denied_dir/forbidden.txt"),
                    RcStr::from("denied_dir/nested/file.txt"),
                )
                .read_strongly_consistent()
                .await?;

                anyhow::Ok(())
            })
            .await
            .unwrap();
        }
    }
}
