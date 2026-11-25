//! The on-disk [`DiskFileSystem`] implementation and its supporting helpers.

use std::{
    env,
    ffi::OsString,
    fmt::{self, Debug, Formatter},
    future::Future,
    io::{self, ErrorKind, Write as _},
    mem::take,
    ops::ControlFlow,
    path::{Component, MAIN_SEPARATOR, Path, PathBuf, Prefix},
    sync::{
        Arc, LazyLock, Weak,
        atomic::{AtomicU64, Ordering},
    },
};

use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use bincode::{Decode, Encode};
#[cfg(windows)]
use omnipath::WinPathExt;
use rustc_hash::{FxHashMap, FxHashSet};
use tokio::{
    runtime::Handle,
    sync::{RwLock, RwLockReadGuard},
};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    CapturedEffect, Completion, Effect, EffectExt, EffectStateStorage, InvalidationReason,
    Invalidator, NonLocalValue, OperationVc, ReadRef, ResolvedVc, TurboTasksApi, ValueToString, Vc,
    debug::ValueDebugFormat, turbo_tasks_weak, turbobail,
};
use turbo_tasks_hash::{
    DeterministicHasher, Xxh3Hash128Hasher, hash_xxh3_hash64, hash_xxh3_hash128,
};
use turbo_unix_path::{normalize_path, sys_to_unix, unix_to_sys};

#[cfg(windows)]
use crate::windows::{is_link_junction_point, to_verbatim_with_case_folded_disk};
use crate::{
    AnyhowWrapper, DiskFileSystemMap, File, FileContent, FileMeta, FileSystem, FileSystemEntryType,
    FileSystemPath, FileSystemPathOption, LinkContent, LinkTarget, PersistedFileContent,
    RawDirectoryContent, RawDirectoryEntry, WriteLinkContent, WriteLinkTargetType,
    canonicalized_path_cache::CanonicalizedPathWalkCache,
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

/// The content hash of a deleted (or missing) file, used to compare writers of the same path.
const DELETED_FILE_CONTENT_HASH: u128 = u128::MAX;

/// The permission bits a write of `permissions` sets, included in the content hash. Permissions
/// are only written on unix.
fn hashed_permissions(permissions: crate::Permissions) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::Permissions::from(permissions).mode() & 0o7777
    }
    #[cfg(not(unix))]
    {
        let _ = permissions;
        0
    }
}

/// The permission bits of a file on disk, see [`hashed_permissions`].
fn disk_permissions(metadata: &std::fs::Metadata) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o7777
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        0
    }
}

/// Hashes the content (and permissions) of a [`PersistedFileContent`]. Must produce the same hash
/// as [`hash_disk_content`] for the written file.
fn content_hash_of(content: &PersistedFileContent) -> u128 {
    use std::io::BufRead;

    let PersistedFileContent::Content(file) = content else {
        return DELETED_FILE_CONTENT_HASH;
    };
    let mut hasher = Xxh3Hash128Hasher::new();
    let mut reader = file.read();
    loop {
        let Ok(chunk) = reader.fill_buf() else {
            unreachable!("reading a rope can't fail")
        };
        if chunk.is_empty() {
            break;
        }
        let len = chunk.len();
        hasher.write_bytes(chunk);
        reader.consume(len);
    }
    hasher.write_value(hashed_permissions(file.meta.permissions));
    hasher.finish()
}

/// Hashes the content (and permissions) of the regular file at `path`, see
/// [`content_hash_of`]. Returns [`DELETED_FILE_CONTENT_HASH`] if nothing is at `path`, and `None`
/// if something other than a regular file is (e.g. a link, which a file write doesn't produce even
/// when it points to equal bytes).
fn hash_disk_content(path: &Path) -> io::Result<Option<(u128, Fingerprint)>> {
    use std::io::Read;

    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => {}
        Ok(_) => return Ok(None),
        Err(err) if err.kind() == ErrorKind::NotFound => {
            return Ok(Some((DELETED_FILE_CONTENT_HASH, Fingerprint::Absent)));
        }
        Err(err) => return Err(err),
    }
    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(err) if err.kind() == ErrorKind::NotFound => {
            return Ok(Some((DELETED_FILE_CONTENT_HASH, Fingerprint::Absent)));
        }
        Err(err) => return Err(err),
    };
    // Both from the open file, so that they describe the same file.
    let metadata = file.metadata()?;
    let permissions = disk_permissions(&metadata);
    let fingerprint = Fingerprint::from_metadata(&metadata)?;
    let mut hasher = Xxh3Hash128Hasher::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.write_bytes(&buffer[..read]);
    }
    hasher.write_value(permissions);
    Ok(Some((hasher.finish(), fingerprint)))
}

/// Writes `file` to `path` by writing a temporary file next to it and atomically renaming it into
/// place. A reader never observes a partially written file, and a running executable at `path` can
/// keep using the previous file. Creates missing parent directories.
///
/// Returns the fingerprint of the installed file, taken from the closed temporary file before it's
/// moved into place, so that a change at `path` right after the rename isn't taken for this write.
fn write_file_atomically(path: &Path, file: &File) -> io::Result<Fingerprint> {
    let write = |output: &mut std::fs::File| {
        std::io::copy(&mut file.read(), output)?;
        #[cfg(unix)]
        output.set_permissions(file.meta.permissions.into())?;
        output.flush()
    };

    let parent = path.parent().ok_or(ErrorKind::InvalidInput)?;

    #[cfg(any(unix, windows))]
    {
        let mut temporary = match tempfile::NamedTempFile::new_in(parent) {
            Err(err) if err.kind() == ErrorKind::NotFound => {
                std::fs::create_dir_all(parent)?;
                tempfile::NamedTempFile::new_in(parent)?
            }
            result => result?,
        };
        write(temporary.as_file_mut())?;
        // Closed first: Windows only settles the modification time when the handle is closed.
        let temporary = temporary.into_temp_path();
        let fingerprint = Fingerprint::of(&temporary)?;
        temporary.persist(path).map_err(|err| err.error)?;
        Ok(fingerprint)
    }

    // `tempfile` isn't available on other targets (e.g. wasi): create a uniquely named temporary
    // file next to the destination ourselves.
    #[cfg(not(any(unix, windows)))]
    {
        use std::sync::atomic::{AtomicU64, Ordering};

        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let file_name = path.file_name().ok_or(ErrorKind::InvalidInput)?;
        let (temporary_path, mut output) = loop {
            let mut temporary_name = OsString::from(".");
            temporary_name.push(file_name);
            temporary_name.push(format!(
                ".{}.{}.tmp",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            let temporary_path = parent.join(temporary_name);
            let options = || {
                let mut options = std::fs::OpenOptions::new();
                options.write(true).create_new(true);
                options
            };
            match options().open(&temporary_path) {
                Ok(output) => break (temporary_path, output),
                Err(err) if err.kind() == ErrorKind::AlreadyExists => continue,
                Err(err) if err.kind() == ErrorKind::NotFound => {
                    std::fs::create_dir_all(parent)?;
                    match options().open(&temporary_path) {
                        Ok(output) => break (temporary_path, output),
                        Err(err) if err.kind() == ErrorKind::AlreadyExists => continue,
                        Err(err) => return Err(err),
                    }
                }
                Err(err) => return Err(err),
            }
        };
        let result = write(&mut output).and_then(|()| {
            drop(output);
            let fingerprint = Fingerprint::of(&temporary_path)?;
            std::fs::rename(&temporary_path, path)?;
            Ok(fingerprint)
        });
        if result.is_err() {
            let _ = std::fs::remove_file(&temporary_path);
        }
        result
    }
}

/// The path of the additional copy written for `TURBO_ENGINE_WRITE_VERSION`: the hash of the
/// [`File`] (content and metadata) inserted before the extension.
fn versioned_path_for(full_path: &Path, file: &File) -> PathBuf {
    let hash = hash_xxh3_hash64(file);
    let mut versioned_path = full_path.to_path_buf();
    let mut ext = OsString::from(format!("{hash:016x}"));
    if let Some(orig_ext) = full_path.extension() {
        ext.push(".");
        ext.push(orig_ext);
    }
    versioned_path.set_extension(ext);
    versioned_path
}

/// Also write every file to a path that includes its content hash, for debugging.
static WRITE_VERSION: LazyLock<bool> = LazyLock::new(|| {
    std::env::var_os("TURBO_ENGINE_WRITE_VERSION").is_some_and(|v| v == "1" || v == "true")
});

/// Effect kinds sharing the path key namespace of an [`EffectStateStorage`].
const WRITE_FILE_EFFECT: &str = "write file";
const WRITE_LINK_EFFECT: &str = "write link";

/// Writes `content` to `full_path`, replacing the file atomically, or removes it for
/// [`PersistedFileContent::NotFound`]. The caller must hold the path's effect claim.
///
/// With `adopt`, a file that already has `content_hash` is kept instead (e.g. an output written
/// in an earlier session).
async fn write_content(
    inner: &DiskFileSystemInner,
    full_path: &Arc<PathBuf>,
    content: &PersistedFileContent,
    content_hash: u128,
    adopt: bool,
) -> Result<()> {
    let _lock = inner.lock_path(full_path.clone()).await;
    if adopt {
        let path = full_path.clone();
        let on_disk = retry_blocking(move || hash_disk_content(&path))
            .instrument(tracing::info_span!("read file before write", name = ?**full_path))
            .concurrency_limited(&inner.read_semaphore)
            .await
            .with_context(|| format!("failed to read {full_path:?}"))?;
        if let Some((hash, fingerprint)) = on_disk
            && hash == content_hash
        {
            inner.record_installed(full_path, fingerprint);
            return Ok(());
        }
    }
    let fingerprint = match content {
        PersistedFileContent::Content(file) => {
            let versioned_path = if *WRITE_VERSION {
                let path = versioned_path_for(full_path, file);
                validate_path_length(&path)?;
                Some(path)
            } else {
                None
            };
            retry_blocking_custom(
                || {
                    let fingerprint = write_file_atomically(full_path, file)?;
                    if let Some(versioned_path) = &versioned_path {
                        write_file_atomically(versioned_path, file)?;
                    }
                    Ok::<_, io::Error>(fingerprint)
                },
                |err| err.kind() == ErrorKind::NotFound || can_retry(err),
            )
            .instrument(tracing::info_span!("write file", name = ?**full_path))
            .concurrency_limited(&inner.write_semaphore)
            .await
            .with_context(|| format!("failed to write to {full_path:?}"))?
        }
        PersistedFileContent::NotFound => {
            retry_blocking(|| match std::fs::remove_file(&***full_path) {
                Err(err) if err.kind() != ErrorKind::NotFound => Err(err),
                _ => Ok(()),
            })
            .instrument(tracing::info_span!("remove file", name = ?**full_path))
            .concurrency_limited(&inner.write_semaphore)
            .await
            .with_context(|| format!("removing {full_path:?} failed"))?;
            Fingerprint::Absent
        }
    };
    inner.record_installed(full_path, fingerprint);
    // Invalidate any read tasks tracking this path so they re-read the new content
    inner.invalidate_from_write(full_path);
    Ok(())
}

/// Identifies one specific file (or link) on disk, or its absence. Every write replaces the file
/// atomically, so it gets a new identity even with equal content. Used to notice a written output
/// that was changed or removed afterwards, e.g. outside of turbo-tasks. Equal fingerprints don't
/// prove equal content: an edit can keep the length, mode, modification time and file identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Fingerprint {
    Absent,
    Present {
        /// Whether the entry is a regular file, a symlink, or something else.
        kind: u8,
        /// The permission bits on unix, the readonly flag elsewhere.
        mode: u32,
        len: u64,
        modified_ns: i128,
        /// The device and inode on unix.
        id: Option<u128>,
    },
}

impl Fingerprint {
    fn of(path: &Path) -> io::Result<Self> {
        match std::fs::symlink_metadata(path) {
            Ok(metadata) => Self::from_metadata(&metadata),
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(Fingerprint::Absent),
            Err(err) => Err(err),
        }
    }

    fn from_metadata(metadata: &std::fs::Metadata) -> io::Result<Self> {
        let file_type = metadata.file_type();
        let kind = if file_type.is_file() {
            0
        } else if file_type.is_symlink() {
            1
        } else {
            2
        };
        let modified_ns = match metadata.modified()?.duration_since(std::time::UNIX_EPOCH) {
            Ok(duration) => duration.as_nanos() as i128,
            Err(err) => -(err.duration().as_nanos() as i128),
        };
        #[cfg(unix)]
        let (mode, id) = {
            use std::os::unix::fs::MetadataExt;
            (
                metadata.mode(),
                Some(((metadata.dev() as u128) << 64) | metadata.ino() as u128),
            )
        };
        #[cfg(not(unix))]
        let (mode, id) = (metadata.permissions().readonly() as u32, None);
        Ok(Fingerprint::Present {
            kind,
            mode,
            len: metadata.len(),
            modified_ns,
            id,
        })
    }
}

/// The fingerprints of the outputs installed in this session, see [`Fingerprint`].
#[derive(Default)]
struct InstalledOutputs(parking_lot::Mutex<FxHashMap<PathBuf, Fingerprint>>);

/// The most bytes [`Staging`] tracks as staged at once. Writes beyond that aren't staged:
/// publication writes their persisted content instead. A staged file that couldn't be removed isn't
/// tracked anymore, it stays until its path is staged again or the staging directory is removed.
const MAX_STAGED_BYTES: u64 = 1 << 30;

/// Where write tasks put the content they write until publication installs it, see
/// [`DiskFileSystem::write`]. Only publication ever writes an output, so a write that's never
/// published (e.g. by a task that's no longer part of the graph) never reaches it.
///
/// Each process stages into a directory of its own below the configured staging root, and holds
/// a lock on its lease file for as long as it may use it. A process starting later removes the
/// directories of processes that ended. Both happen while holding the root's lock, so a directory
/// is never removed before its owner has locked its lease.
struct Staging {
    dir: PathBuf,
    /// Locked while this process may use `dir`.
    _lease: std::fs::File,
    /// What's staged for each output.
    slots: parking_lot::Mutex<FxHashMap<PathBuf, StagedSlot>>,
    /// Outputs whose staged copy didn't match when publication tried to install it. They aren't
    /// staged anymore and are published from their persisted content instead, so that writers
    /// restaging the same slot can't make publication retry forever.
    missed: parking_lot::Mutex<FxHashSet<PathBuf>>,
    /// The bytes of the staged files, and of stages in progress.
    staged_bytes: AtomicU64,
}

#[derive(Clone, PartialEq)]
struct StagedSlot {
    content_hash: u128,
    /// Of the staged file, taken when it was staged.
    fingerprint: Fingerprint,
    path: PathBuf,
    len: u64,
}

impl Staging {
    fn open(root: &Path) -> io::Result<Self> {
        use std::sync::atomic::AtomicU32;

        static NEXT: AtomicU32 = AtomicU32::new(0);
        let unique = || {
            let time = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |duration| duration.as_nanos());
            format!(
                "{}-{time:x}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            )
        };

        std::fs::create_dir_all(root)?;
        let root_lock = std::fs::File::options()
            .create(true)
            .truncate(false)
            .write(true)
            .open(root.join("lock"))?;
        root_lock.lock()?;
        for entry in std::fs::read_dir(root)? {
            let entry = entry?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(".trash-") {
                let _ = std::fs::remove_dir_all(entry.path());
                continue;
            }
            if !name.starts_with("p-") {
                continue;
            }
            // The owner locks its lease while holding the root's lock, so a directory without a
            // lease belongs to a process that ended while creating it.
            let lease = match std::fs::File::open(entry.path().join("lease")) {
                Ok(lease) => match lease.try_lock() {
                    Ok(()) => Some(lease),
                    Err(_) => continue,
                },
                Err(err) if err.kind() == ErrorKind::NotFound => None,
                Err(_) => continue,
            };
            // Move it out of the way while its lease is still held, then remove it.
            let trash = root.join(format!(".trash-{}", unique()));
            if std::fs::rename(entry.path(), &trash).is_ok() {
                drop(lease);
                let _ = std::fs::remove_dir_all(&trash);
            }
        }
        let dir = root.join(format!("p-{}", unique()));
        std::fs::create_dir(&dir)?;
        let lease = std::fs::File::create(dir.join("lease"))?;
        lease.lock()?;
        drop(root_lock);
        Ok(Self {
            dir,
            _lease: lease,
            slots: Default::default(),
            missed: Default::default(),
            staged_bytes: AtomicU64::new(0),
        })
    }

    fn slot_path(&self, output: &Path) -> PathBuf {
        self.dir.join(format!(
            "{:032x}",
            hash_xxh3_hash128(output.as_os_str().as_encoded_bytes())
        ))
    }

    /// Whether `content_hash` is staged for `output`, so that publication can install it.
    fn is_staged(&self, output: &Path, content_hash: u128) -> bool {
        !self.missed.lock().contains(output)
            && self
                .slots
                .lock()
                .get(output)
                .is_some_and(|slot| slot.content_hash == content_hash)
    }

    /// Reserves `len` bytes for a stage, if that stays within [`MAX_STAGED_BYTES`].
    fn reserve(&self, len: u64) -> bool {
        self.staged_bytes
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |staged| {
                staged
                    .checked_add(len)
                    .filter(|&total| total <= MAX_STAGED_BYTES)
            })
            .is_ok()
    }

    fn release(&self, len: u64) {
        self.staged_bytes.fetch_sub(len, Ordering::Relaxed);
    }

    /// Forgets what's staged for `output`, and removes its slot. The caller must hold the slot's
    /// lock.
    async fn clear(&self, output: &Path) {
        let previous = self.slots.lock().remove(output);
        let Some(previous) = previous else {
            return;
        };
        self.release(previous.len);
        let path = previous.path;
        if let Err(err) = retry_blocking(|| match std::fs::remove_file(&path) {
            Err(err) if err.kind() != ErrorKind::NotFound => Err(err),
            _ => Ok(()),
        })
        .await
        {
            // It's replaced by the next stage of `output`, or removed with the directory.
            tracing::debug!(?err, ?output, "removing a staged file failed");
        }
    }
}

/// Stages `file` for `output`. Runs on a task of its own, which keeps the slot locked until the
/// staged file is in place even if the write task is cancelled.
async fn stage(
    inner: Arc<DiskFileSystemInner>,
    staging: Arc<Staging>,
    output: Arc<PathBuf>,
    file: ReadRef<PersistedFileContent>,
    content_hash: u128,
) {
    let PersistedFileContent::Content(file) = &*file else {
        return;
    };
    if staging.is_staged(&output, content_hash) || staging.missed.lock().contains(&*output) {
        return;
    }
    let len = file.content().len() as u64;
    if !staging.reserve(len) {
        return;
    }
    let slot = Arc::new(staging.slot_path(&output));
    let _slot_lock = inner.mutex_map.lock(slot.clone()).await;
    // Publication may have given up on staging `output` while this waited for the lock.
    if staging.missed.lock().contains(&*output) {
        staging.release(len);
        return;
    }
    let result = retry_blocking(|| write_file_atomically(&slot, file))
        .instrument(tracing::info_span!("stage file", name = ?*output))
        .concurrency_limited(&inner.write_semaphore)
        .await;
    match result {
        Ok(fingerprint) => {
            let previous = staging.slots.lock().insert(
                (*output).clone(),
                StagedSlot {
                    content_hash,
                    fingerprint,
                    path: (*slot).clone(),
                    len,
                },
            );
            if let Some(previous) = previous {
                staging.release(previous.len);
            }
        }
        Err(err) => {
            // Publication writes the persisted content instead.
            tracing::debug!(?err, output = ?*output, "staging a file failed");
            staging.release(len);
            staging.clear(&output).await;
        }
    }
}

/// Moves the staged `content_hash` into place at `output`, and notifies readers of `output`.
/// Returns `false` if something else is staged for `output` now: `output` isn't staged anymore
/// after that. The caller must hold the output's effect claim.
async fn install_staged(
    inner: &DiskFileSystemInner,
    staging: &Staging,
    output: &Arc<PathBuf>,
    content_hash: u128,
) -> Result<bool> {
    // Lock order: the output (by publication only), then its slot.
    let lock = inner.lock_path(output.clone()).await;
    let slot = Arc::new(staging.slot_path(output));
    let slot_lock = inner.mutex_map.lock(slot.clone()).await;
    let Some(staged) = staging
        .slots
        .lock()
        .get(&**output)
        .filter(|staged| staged.content_hash == content_hash)
        .cloned()
    else {
        staging.missed.lock().insert((**output).clone());
        staging.clear(output).await;
        return Ok(false);
    };
    let installed = retry_blocking_custom(
        || {
            if Fingerprint::of(&slot)? != staged.fingerprint {
                return Ok(None);
            }
            install_file(&slot, staged.fingerprint, output).map(Some)
        },
        |err| err.kind() == ErrorKind::NotFound || can_retry(err),
    )
    .instrument(tracing::info_span!("install file", name = ?**output))
    .concurrency_limited(&inner.write_semaphore)
    .await
    .with_context(|| format!("failed to write to {output:?}"))?;
    let Some(fingerprint) = installed else {
        staging.missed.lock().insert((**output).clone());
        staging.clear(output).await;
        return Ok(false);
    };
    if staging.slots.lock().remove(&**output).is_some() {
        staging.release(staged.len);
    }
    drop(slot_lock);
    // Still holding the output's lock, so that no reader sees the new file before the readers of
    // the old one are invalidated.
    inner.record_installed(output, fingerprint);
    #[cfg(test)]
    tests::installed_hook().await;
    inner.invalidate_from_write(output);
    drop(lock);
    Ok(true)
}

/// Moves the closed file at `staged`, which has `fingerprint`, to `output`, creating missing parent
/// directories, and returns the fingerprint of the installed file. Across filesystems it copies
/// instead.
fn install_file(staged: &Path, fingerprint: Fingerprint, output: &Path) -> io::Result<Fingerprint> {
    let parent = output.parent().ok_or(ErrorKind::InvalidInput)?;
    let rename = || match std::fs::rename(staged, output) {
        Err(err) if err.kind() == ErrorKind::NotFound && !parent.exists() => {
            std::fs::create_dir_all(parent)?;
            std::fs::rename(staged, output)
        }
        result => result,
    };
    match rename() {
        // A rename keeps the file's identity, modification time, length and mode.
        Ok(()) => Ok(fingerprint),
        #[cfg(any(unix, windows))]
        Err(err) if err.kind() == ErrorKind::CrossesDevices => {
            let mut source = std::fs::File::open(staged)?;
            let permissions = source.metadata()?.permissions();
            let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
            std::io::copy(&mut source, temporary.as_file_mut())?;
            temporary.as_file().set_permissions(permissions)?;
            let temporary = temporary.into_temp_path();
            let fingerprint = Fingerprint::of(&temporary)?;
            temporary.persist(output).map_err(|err| err.error)?;
            if let Err(err) = std::fs::remove_file(staged) {
                // The file is installed. The staged copy is replaced by the next stage of
                // `output`, or removed with the staging directory.
                tracing::debug!(?err, ?staged, "removing a staged file failed");
            }
            Ok(fingerprint)
        }
        Err(err) => Err(err),
    }
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

/// The default number of concurrent write operations (file writes, file removals and symlink
/// creations) on platforms other than Linux. On Linux, it's the lower bound of the default, see
/// `linux_default_write_concurrency`.
///
/// Limits on other platforms (e.g. open file limits on macOS, file system metadata contention on
/// NTFS) differ from Linux, so they keep this conservative value until a higher one has been
/// measured there.
const DEFAULT_WRITE_CONCURRENCY: usize = 4;
/// Upper bound of the default write concurrency on Linux.
#[cfg(target_os = "linux")]
const MAX_LINUX_DEFAULT_WRITE_CONCURRENCY: usize = 16;

/// Computes the default number of concurrent write operations on Linux from the available
/// parallelism. Falls back to [`DEFAULT_WRITE_CONCURRENCY`] if the available parallelism can't be
/// determined.
///
/// Write operations run blocking on the calling tokio worker thread (see
/// [`retry_blocking`]), so each permit can keep one worker thread (and one file handle) busy in a
/// syscall. Scaling with the available parallelism lets machines with more cores write the many
/// small output files of a build in parallel, while staying at a small, fixed number of permits on
/// smaller machines.
///
/// The cap bounds the number of file handles and blocked worker threads that writes add. In
/// benchmarks on a 32-thread Linux machine, raising the limit beyond 16 did not make builds faster.
#[cfg(target_os = "linux")]
fn linux_default_write_concurrency(available_parallelism: Option<usize>) -> usize {
    available_parallelism.map_or(DEFAULT_WRITE_CONCURRENCY, |parallelism| {
        parallelism.clamp(
            DEFAULT_WRITE_CONCURRENCY,
            MAX_LINUX_DEFAULT_WRITE_CONCURRENCY,
        )
    })
}

#[cfg(target_os = "linux")]
fn default_write_concurrency() -> usize {
    linux_default_write_concurrency(
        turbo_tasks::parallel::available_parallelism()
            .ok()
            .map(|n| n.get()),
    )
}

#[cfg(not(target_os = "linux"))]
fn default_write_concurrency() -> usize {
    DEFAULT_WRITE_CONCURRENCY
}

fn create_write_semaphore() -> tokio::sync::Semaphore {
    // the semaphore isn't serialized, and we assume the environment variables don't change during
    // runtime, so it's okay to access them in this untracked way.
    static TURBO_ENGINE_WRITE_CONCURRENCY: LazyLock<usize> = LazyLock::new(|| {
        number_env_var("TURBO_ENGINE_WRITE_CONCURRENCY").unwrap_or_else(default_write_concurrency)
    });
    tokio::sync::Semaphore::new(*TURBO_ENGINE_WRITE_CONCURRENCY)
}

#[derive(ValueDebugFormat, NonLocalValue, Encode, Decode)]
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
    /// Results of checking prefixes for this root when the filesystem map does not contain it.
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    root_prefixes: CanonicalizedPathWalkCache,
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    mutex_map: MutexMap<Arc<PathBuf>>,
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    pub(crate) invalidator_map: InvalidatorMap,
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    pub(crate) dir_invalidator_map: InvalidatorMap,
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    pub(crate) metadata_invalidator_map: InvalidatorMap,
    /// Lock that makes invalidation atomic. It will keep a write lock during
    /// watcher invalidation and a read lock during other operations.
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    pub(crate) invalidation_lock: RwLock<()>,
    /// Semaphore to limit the maximum number of concurrent file operations.
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip, default = "create_read_semaphore")]
    read_semaphore: tokio::sync::Semaphore,
    /// Semaphore to limit the maximum number of concurrent file operations.
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip, default = "create_write_semaphore")]
    write_semaphore: tokio::sync::Semaphore,

    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    pub(crate) watcher: DiskWatcher,
    /// Root paths that we do not allow access to from this filesystem.
    /// Useful for things like output directories to prevent accidental ouroboros situations.
    denied_paths: Vec<RcStr>,
    /// Used by invalidators when called from a non-turbo-tasks thread, specifically in the fs
    /// watcher.
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip, default = "turbo_tasks_weak")]
    pub(crate) turbo_tasks: Weak<dyn TurboTasksApi>,
    /// Used by invalidators when called from a non-tokio thread, specifically in the fs watcher.
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip, default = "Handle::current")]
    pub(crate) tokio_handle: Handle,
    /// Used by [`FileSystem::write_link`] effects.
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    effect_state_storage: EffectStateStorage,
    /// What each output written by an effect in this session looked like right after it was
    /// written, see [`CapturedEffect::still_applied`].
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    installed_outputs: InstalledOutputs,
    /// Where write tasks stage the files they write, as a normalized Unix-style path relative to
    /// `root`. Without it, publication writes each file from its persisted content.
    staging_dir: Option<RcStr>,
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    staging: tokio::sync::OnceCell<Option<Arc<Staging>>>,
    map: OperationVc<DiskFileSystemMap>,
}

impl DiskFileSystemInner {
    /// The staging area for write tasks, opened when it's first used. `None` if none is
    /// configured, or if it can't be opened.
    async fn staging(&self) -> Option<&Arc<Staging>> {
        let staging_dir = self.staging_dir.as_ref()?;
        self.staging
            .get_or_init(|| async {
                let root = Path::new(&*self.root).join(unix_to_sys(staging_dir).as_ref());
                retry_blocking(move || Staging::open(&root))
                    .await
                    .inspect_err(|err| {
                        tracing::warn!(
                            ?err,
                            "writes can't be staged, they're written on publication"
                        )
                    })
                    .ok()
                    .map(Arc::new)
            })
            .await
            .as_ref()
    }

    /// The staging area if a write task opened it.
    fn opened_staging(&self) -> Option<&Arc<Staging>> {
        self.staging.get()?.as_ref()
    }

    /// Records `fingerprint` as what the output at `path` looks like now that an effect wrote (or
    /// verified) it. The caller must hold the path's effect claim.
    fn record_installed(&self, path: &Path, fingerprint: Fingerprint) {
        self.installed_outputs
            .0
            .lock()
            .insert(path.to_path_buf(), fingerprint);
    }

    /// Like [`Self::record_installed`], observing the output's fingerprint now. A change at `path`
    /// between installing it and this observation is taken for the install; used for links, which
    /// can't be fingerprinted before they're in place.
    async fn observe_installed(&self, path: &Arc<PathBuf>) {
        let fingerprint = {
            let path = path.clone();
            retry_blocking(move || Fingerprint::of(&path))
                .concurrency_limited(&self.read_semaphore)
                .await
        };
        match fingerprint {
            Ok(fingerprint) => self.record_installed(path, fingerprint),
            Err(_) => {
                self.installed_outputs.0.lock().remove(&**path);
            }
        }
    }

    /// Whether the output at `path` still looks like it did when an effect last wrote it in this
    /// session.
    async fn still_installed(&self, path: &Arc<PathBuf>) -> bool {
        let Some(recorded) = self.installed_outputs.0.lock().get(&**path).copied() else {
            return false;
        };
        let path = path.clone();
        retry_blocking(move || Fingerprint::of(&path))
            .concurrency_limited(&self.read_semaphore)
            .await
            .is_ok_and(|fingerprint| fingerprint == recorded)
    }

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
        for map in [&self.invalidator_map, &self.metadata_invalidator_map] {
            if let Some(invalidators) = map.lock().unwrap().remove(full_path) {
                let Some(turbo_tasks) = self.turbo_tasks.upgrade() else {
                    return;
                };
                let _guard = self.tokio_handle.enter();
                let reason = Write {
                    path: full_path.to_string_lossy().into_owned(),
                };
                Invalidator::invalidate_all_with_reason(invalidators, &*turbo_tasks, reason);
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
        let metadata_invalidator_map = take(&mut *self.metadata_invalidator_map.lock().unwrap());
        let invalidators = invalidator_map
            .into_iter()
            .chain(dir_invalidator_map)
            .chain(metadata_invalidator_map)
            .flat_map(|(_, invalidators)| invalidators.into_iter());
        Invalidator::invalidate_all(invalidators, &*turbo_tasks);
    }

    /// Invalidates every tracked file in the filesystem.
    ///
    /// Calls the given `reason` closure to find the [`InvalidationReason`].
    pub(crate) fn invalidate_with_reason<R: InvalidationReason>(
        &self,
        reason: impl Fn(&Path) -> R,
    ) {
        let _span = tracing::info_span!("invalidate filesystem", name = &*self.root).entered();
        let Some(turbo_tasks) = self.turbo_tasks.upgrade() else {
            return;
        };
        let _guard = self.tokio_handle.enter();

        let invalidator_map = take(&mut *self.invalidator_map.lock().unwrap());
        let dir_invalidator_map = take(&mut *self.dir_invalidator_map.lock().unwrap());
        let metadata_invalidator_map = take(&mut *self.metadata_invalidator_map.lock().unwrap());
        let path_invalidator_counts = || {
            invalidator_map
                .values()
                .chain(dir_invalidator_map.values())
                .chain(metadata_invalidator_map.values())
                .map(|path_invalidators| path_invalidators.len())
                .filter(|&count| count > 0)
        };
        let mut invalidators = Vec::with_capacity(path_invalidator_counts().sum());
        let mut reasons = Vec::with_capacity(path_invalidator_counts().count());
        for (path, path_invalidators) in invalidator_map
            .into_iter()
            .chain(dir_invalidator_map)
            .chain(metadata_invalidator_map)
        {
            if path_invalidators.is_empty() {
                continue;
            }
            reasons.push(reason(&path));
            invalidators.extend(path_invalidators);
        }
        Invalidator::invalidate_all_with_reasons(invalidators, &*turbo_tasks, reasons);
    }

    /// Invalidates tracked files/directories for `paths` and their children.
    /// Also invalidates tracked directory reads for all parent directories to
    /// account for file creations/deletions under the deferred subtree.
    fn invalidate_path_and_children_with_reason<R: InvalidationReason>(
        &self,
        paths: impl IntoIterator<Item = PathBuf>,
        reason: impl Fn(&Path) -> R,
    ) {
        let _span =
            tracing::info_span!("invalidate filesystem paths", name = &*self.root).entered();
        let Some(turbo_tasks) = self.turbo_tasks.upgrade() else {
            return;
        };
        let _guard = self.tokio_handle.enter();

        let paths = paths.into_iter();
        let path_count = paths.size_hint().0;
        let mut invalidator_map = self.invalidator_map.lock().unwrap();
        let mut dir_invalidator_map = self.dir_invalidator_map.lock().unwrap();
        let mut metadata_invalidator_map = self.metadata_invalidator_map.lock().unwrap();
        let mut invalidators = Vec::with_capacity(path_count);
        let mut reasons = Vec::with_capacity(path_count);
        let mut add = |path: &Path, path_invalidators: FxHashSet<Invalidator>| {
            if !path_invalidators.is_empty() {
                reasons.push(reason(path));
                invalidators.extend(path_invalidators);
            }
        };
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
                add(&invalidated_path, path_invalidators);
            }

            for (invalidated_path, path_invalidators) in
                dir_invalidator_map.extract_path_with_children(&path)
            {
                add(&invalidated_path, path_invalidators);
            }
            for (invalidated_path, path_invalidators) in
                metadata_invalidator_map.extract_path_with_children(&path)
            {
                add(&invalidated_path, path_invalidators);
            }
        }

        for path in parent_dirs_to_invalidate {
            if let Some(path_invalidators) = dir_invalidator_map.remove(path.as_path()) {
                add(&path, path_invalidators);
            }
            if let Some(path_invalidators) = metadata_invalidator_map.remove(path.as_path()) {
                add(&path, path_invalidators);
            }
        }

        drop(invalidator_map);
        drop(dir_invalidator_map);
        drop(metadata_invalidator_map);

        Invalidator::invalidate_all_with_reasons(invalidators, &*turbo_tasks, reasons);
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
        if let Ok(realpath) = retry_blocking(|| std::fs::canonicalize(path))
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

    /// Track a file consumed by an external reader (for example a compiler subprocess).
    /// Unlike depending on `read()`, this invalidates the calling task for every file event,
    /// including an edit that restores identical bytes. Call before accessing the OS path.
    pub async fn track_file(&self, path: &FileSystemPath) -> Result<()> {
        self.inner
            .register_read_invalidator(&Arc::new(self.to_sys_path_raw(path)))
            .await
    }

    /// Track directory membership consumed by an external reader. Missing directories are
    /// watched through their nearest existing parent, just like ordinary filesystem reads.
    pub async fn track_directory(&self, path: &FileSystemPath) -> Result<()> {
        self.inner
            .register_dir_invalidator(&Arc::new(self.to_sys_path_raw(path)))
            .await
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
        DiskWatcher::start_watching(self.inner.clone()).await
    }

    pub async fn stop_watching(&self) {
        self.inner.watcher.stop_watching().await;
    }

    /// Whether this filesystem treats a path as nonexistent under its read policy.
    pub fn is_path_denied(&self, path: &FileSystemPath) -> bool {
        self.inner.is_path_denied(path)
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

    /// Similar to [`try_from_sys_path`], but allows resolving paths that cross roots and may be in
    /// a different [`DiskFileSystem`] linked via the [`DiskFileSystemMap`].
    ///
    /// Unlike [`try_from_sys_path`], this conversion is not entirely lexical, and we may attempt to
    /// canonicalize some segments of an absolute path.
    ///
    /// Crossing roots should generally only happen at symlink boundaries. If you are not
    /// handling a path that was potentially formed by crossing a symlink boundary, you should
    /// prefer [`try_from_sys_path`].
    ///
    /// [`try_from_sys_path`]: DiskFileSystem::try_from_sys_path
    pub async fn try_from_sys_path_across_roots(
        &self,
        vc_self: ResolvedVc<DiskFileSystem>,
        sys_path: &Path,
        relative_to: &FileSystemPath,
    ) -> Result<Option<FileSystemPath>> {
        // The non-lexical fallback is an untracked read of state the watcher can't see (outside
        // the filesystem root), and is not portable across machines, hence it is
        // `session_dependent`. That also makes it okay to take a system path as a task input, as
        // the result is never reused across sessions.
        #[turbo_tasks::function(fs, session_dependent)]
        async fn slow_non_lexical(
            vc_self: ResolvedVc<DiskFileSystem>,
            absolute_path: RcStr,
        ) -> Result<Vc<FileSystemPathOption>> {
            let this = vc_self.await?;
            let absolute_path = Path::new(&*absolute_path);
            let path = this
                .resolve_path_ancestry_slow_path(vc_self, absolute_path)
                .await?;
            Ok(Vc::cell(path))
        }

        debug_assert_eq!(
            relative_to.fs,
            ResolvedVc::upcast(vc_self),
            "`relative_to` must be in the current disk filesystem"
        );

        if let Some(path) = self.try_from_sys_path(vc_self, sys_path, Some(relative_to)) {
            return Ok(Some(path));
        }

        let absolute_path = self
            .to_sys_path_raw(relative_to)
            .join(sys_path)
            .normalize_lexically()?;
        let Some(absolute_path) = absolute_path.to_str() else {
            return Ok(None);
        };
        slow_non_lexical(*vc_self, RcStr::from(absolute_path))
            .owned()
            .await
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

    /// Resolves an absolute path into this filesystem or another configured filesystem by
    /// canonicalizing successive prefixes as needed. For performance reasons, the caller should
    /// attempt to perform lexical prefix stripping against the current root before calling this
    /// method.
    ///
    /// Returns [`None`] if the path never reaches a filesystem root, an ancestor can't be
    /// canonicalized, or the first matching prefix lands inside the root.
    ///
    /// In some cases that absolute path may contain symlinks, different capitalization, or Windows
    /// 8.3 short paths. Resolving this requires performing untracked IO outside of the filesystem
    /// root, where we have no filesystem watcher configured. This is mostly okay as we assume the
    /// [`DiskFileSystem`] root is stable.
    ///
    /// A prefix that first lands inside the root may have followed an internal symlink through
    /// untracked IO. Only an exact root match is valid; leave the remaining path untouched.
    async fn resolve_path_ancestry_slow_path(
        &self,
        vc_self: ResolvedVc<Self>,
        target_sys_path: &Path,
    ) -> Result<Option<FileSystemPath>> {
        // Assumption: The map only changes across process restarts, and the map is updated upon
        // process start (e.g. when processing the Turbopack config) before any root tasks depending
        // on this (e.g. building bundled outputs) are alive, so in-memory caches that depend on
        // this value are okay.
        let map = self.inner.map.connect().await?;

        // The fs map could be empty (i.e. this DiskFileSystem doesn't use additional roots), or
        // (less likely) it may not contain the current root (e.g. paths are allowed to navigate out
        // of this root, but not back in).
        //
        // For these cases, try to match against the current root before looking at the map. Use the
        // cache stored on the `DiskFileSystem` instead of the one on the `DiskFileSystemMap`.
        if !map.contains(self.inner.root_path(), vc_self) {
            if let Some(found) = self
                .inner
                .root_prefixes
                .walk_canonicalized_ancestry(target_sys_path, |canonical| {
                    let root_path = self.inner.root_path();
                    if canonical == root_path {
                        ControlFlow::Break(Some(vc_self))
                    } else if canonical.starts_with(root_path) {
                        // Unlikely: We unexpectedly ended up deep *inside* of `root_path`, which
                        // means we did some untracked reads inside of the filesystem root, just
                        // bail out and treat this path as invalid.
                        ControlFlow::Break(None)
                    } else {
                        ControlFlow::Continue(())
                    }
                })
                .await
            {
                return Ok(Some(found));
            }
            if map.is_empty() {
                // don't bother canonicalizing paths again and checking the map if there's no map
                return Ok(None);
            }
        }

        // Less slow path: Lexically compare against the map. The caller of this function should
        // already tried to lexically compare with the current root, but not the full map.
        if let Some(found) = target_sys_path
            .normalize_lexically()
            .ok()
            .and_then(|path| map.lookup_fs_path(&path))
        {
            return Ok(Some(found));
        }

        // Slow path: Try to canonicalize and compare each ancestor against the map.
        Ok(map
            .canonicalized_paths
            .walk_canonicalized_ancestry(target_sys_path, |canonical| {
                let Some(found) = map.lookup_sys_path_suffix(canonical) else {
                    return ControlFlow::Continue(());
                };
                if found.remaining.as_os_str().is_empty() {
                    ControlFlow::Break(Some(found.fs))
                } else {
                    ControlFlow::Break(None)
                }
            })
            .await)
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
    /// `name` is a display name for the filesystem. This should be unique.
    ///
    /// `root` is the [canonicalized][std::fs::canonicalize] root of the filesystem. It should have
    /// a stable [cell identity][`ResolvedVc`] to avoid invalidating every path if the root changes.
    ///
    /// This API does not canonicalize itself, as that requires IO operations (e.g. symlink
    /// resolution) which should (ideally) not be cached.
    pub fn new(name: RcStr, root: Vc<RcStr>) -> Vc<Self> {
        Self::new_internal(
            name,
            root,
            Vec::new(),
            DiskWatcherConfig::default(),
            DiskFileSystemMap::empty(),
            None,
        )
    }

    /// An extended version of [`DiskFileSystem::new`].
    ///
    /// `denied_paths` contains normalized Unix-style paths relative to `root` that
    /// [`DiskFileSystem`] will treat as nonexistent, disallowing reads of files in those
    /// directories.
    ///
    /// `watcher_config` controls how filesystem changes are detected and reported. See
    /// [`DiskWatcherConfig`].
    ///
    /// `map` provides other configured filesystems used to resolve symlink targets that leave
    /// this filesystem's root.
    ///
    /// `staging_dir` is a normalized Unix-style path relative to `root` where write tasks stage the
    /// files they write until publication moves them into place (see [`FileSystem::write`]). It
    /// must be on the same filesystem as the outputs, and outside of anything that's cleaned
    /// between builds. Without it, publication writes every file from its persisted content.
    pub fn new_with_options(
        name: RcStr,
        root: Vc<RcStr>,
        denied_paths: Vec<RcStr>,
        watcher_config: DiskWatcherConfig,
        map: OperationVc<DiskFileSystemMap>,
        staging_dir: Option<RcStr>,
    ) -> Vc<Self> {
        for denied_path in &denied_paths {
            debug_assert!(!denied_path.is_empty(), "denied_path must not be empty");
            debug_assert!(
                normalize_path(denied_path).as_deref() == Some(&**denied_path),
                "denied_path must be normalized: {denied_path:?}"
            );
        }
        if let Some(staging_dir) = &staging_dir {
            debug_assert!(
                normalize_path(staging_dir).as_deref() == Some(&**staging_dir),
                "staging_dir must be normalized: {staging_dir:?}"
            );
        }
        Self::new_internal(name, root, denied_paths, watcher_config, map, staging_dir)
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
        map: OperationVc<DiskFileSystemMap>,
        staging_dir: Option<RcStr>,
    ) -> Result<Vc<Self>> {
        let root = root.owned().await?;
        let instance = DiskFileSystem {
            inner: Arc::new(DiskFileSystemInner {
                name,
                root,
                root_prefixes: Default::default(),
                mutex_map: Default::default(),
                invalidation_lock: Default::default(),
                invalidator_map: InvalidatorMap::new(),
                dir_invalidator_map: InvalidatorMap::new(),
                metadata_invalidator_map: InvalidatorMap::new(),
                read_semaphore: create_read_semaphore(),
                write_semaphore: create_write_semaphore(),
                watcher: DiskWatcher::new(watcher_config),
                denied_paths,
                turbo_tasks: turbo_tasks_weak(),
                tokio_handle: Handle::current(),
                effect_state_storage: EffectStateStorage::default(),
                installed_outputs: InstalledOutputs::default(),
                staging_dir,
                staging: Default::default(),
                map,
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
impl DiskFileSystem {
    /// Tracks changes relevant to an external stat call, including sizes and timestamps.
    /// This registers dependencies; it does not return stat results. `metadata()` returns
    /// `FileMeta`, which omits sizes and timestamps. Metadata-only changes must invalidate stat
    /// calls without invalidating ordinary content reads.
    ///
    /// The caller must resolve symlinks, including parent directories, before calling this.
    #[turbo_tasks::function(fs, session_dependent)]
    pub async fn full_metadata(&self, fs_path: FileSystemPath) -> Result<Vc<Completion>> {
        if self.inner.is_path_denied(&fs_path) {
            turbobail!("Cannot track metadata from denied path: {fs_path}");
        }
        let full_path = Arc::new(self.to_sys_path_raw(&fs_path));
        if let Some(invalidator) = turbo_tasks::get_invalidator() {
            self.inner
                .metadata_invalidator_map
                .insert(full_path.clone(), invalidator);
            let entry_type = *fs_path.get_type().await?;
            debug_assert!(
                !matches!(entry_type, FileSystemEntryType::Symlink),
                "full_metadata requires a path with symlinks already resolved"
            );
            if !fs_path.is_root() {
                self.inner
                    .watcher
                    .ensure_watched_file(&full_path, self.inner.root_path())
                    .await?;
            }
            if matches!(entry_type, FileSystemEntryType::Directory) {
                self.inner
                    .watcher
                    .ensure_watched_dir(&full_path, self.inner.root_path())
                    .await?;
            }
        }
        Ok(Completion::new())
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
            let raw = RcStr::from(sys_to_unix(target_sys_path.to_string_lossy().as_ref()));
            // First try a cheap, purely lexical conversion of the raw target. `relative_to` is
            // ignored for absolute targets.
            let mut target_fs_path = this.try_from_sys_path(self, &target_sys_path, None);

            // If that failed, the target may just be spelled differently than our canonicalized
            // filesystem root (e.g. case insensitive filesystem, a Windows 8.3 short name, or a
            // symlink in the path). This performs session-dependent IO to resolve the fs root
            // path.
            if target_fs_path.is_none() {
                target_fs_path = this
                    .resolve_path_ancestry_slow_path(self, &target_sys_path)
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
                raw,
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

            // If the relative target steps above the root, resolve its absolute system path
            // against this filesystem and the other configured roots.
            let resolved = if let Some(resolved) = fs_path.parent().try_join(&raw) {
                resolved
            } else {
                let absolute_target = this
                    .to_sys_path_raw(&fs_path.parent())
                    .join(&target_sys_path)
                    .normalize_lexically()
                    .ok();
                let Some(resolved) = (match absolute_target {
                    Some(path) => this.resolve_path_ancestry_slow_path(self, &path).await?,
                    None => None,
                }) else {
                    return Ok(LinkContent::Invalid {
                        reason: rcstr!("the symlink target leaves the configured filesystem roots"),
                    }
                    .cell());
                };
                resolved
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
        let full_path = Arc::new(this.to_sys_path_raw(&fs_path));

        // Validate the path length here, when the write is requested, so that any error is
        // attributed to the caller rather than surfacing later when the effect is applied.
        validate_path_length(&full_path)?;

        let writer = turbo_tasks::get_invalidator()
            .context("DiskFileSystem::write must be called from within a turbo-tasks task")?;

        // Persist the file content so it is stored in the persistent cache.
        // Since FileContent uses serialization = "hash", persisting it here ensures the full
        // content is available in the persistent cache (via PersistedFileContent) and does not
        // require recomputing the content on cache restore — avoiding unnecessary downstream
        // recomputation.
        let content = content.persist().to_resolved().await?;
        let content_value = content.await?;
        let content_hash = content_hash_of(&content_value);

        // Stage the file now, so that the effect doesn't need to hold its content until it's
        // published, and publication only moves it into place. The output itself is only written
        // by publication: this task may be outdated, or not part of what's published at all.
        //
        // Not with `TURBO_ENGINE_WRITE_VERSION`: publication writes the versioned copy too.
        if !*WRITE_VERSION
            && matches!(&*content_value, PersistedFileContent::Content(_))
            && let Some(staging) = this.inner.staging().await
        {
            turbo_tasks::spawn(stage(
                this.inner.clone(),
                staging.clone(),
                full_path.clone(),
                content_value,
                content_hash,
            ))
            .await;
        } else {
            drop(content_value);
        }

        #[turbo_tasks::value(eq = "manual", cell = "new")]
        struct WriteEffect {
            full_path: Arc<PathBuf>,
            fs: ResolvedVc<DiskFileSystem>,
            content: ResolvedVc<PersistedFileContent>,
            /// See [`content_hash_of`].
            #[bincode(fixint)]
            content_hash: u128,
            /// The write task, invalidated when `content` no longer has `content_hash`.
            #[turbo_tasks(debug_ignore, unsafe_ignore)]
            writer: Invalidator,
        }

        #[async_trait]
        #[turbo_tasks::value_impl]
        impl Effect for WriteEffect {
            async fn capture(&self) -> Result<Box<dyn CapturedEffect>> {
                // INVALIDATION: a tracked read of this cell occurred in the write effect so if it
                // somehow changes the effect will be re-emitted
                let inner = (*self.fs).untracked().await?.inner.clone();

                let key: Box<[u8]> = self.full_path.as_os_str().as_encoded_bytes().into();
                // If the per-key effect state already records this content, or it's staged,
                // skip materializing it. The apply-time state machine will dedup-hit before
                // touching content. If state diverged between this read and apply, publication
                // fires our producer's invalidator via the Retry pathway.
                let source = if inner.effect_state_storage.matches_applied(
                    &key,
                    WRITE_FILE_EFFECT,
                    self.content_hash,
                ) {
                    Source::Applied
                } else if inner
                    .opened_staging()
                    .is_some_and(|staging| staging.is_staged(&self.full_path, self.content_hash))
                {
                    Source::Staged
                } else {
                    // INVALIDATION: the content cell is already captured via `content_hash`, and
                    // a tracked dependency would pin the content in memory.
                    let content = (*self.content).untracked().await?;
                    if content_hash_of(&content) == self.content_hash {
                        Source::Content(content)
                    } else {
                        // The cell changed since the write task hashed it. Applying without
                        // content retries, and the write task hashes the new content.
                        if let Some(turbo_tasks) = inner.turbo_tasks.upgrade() {
                            self.writer.invalidate(&*turbo_tasks);
                        }
                        Source::Applied
                    }
                };
                Ok(Box::new(CapturedWriteEffect {
                    full_path: self.full_path.clone(),
                    inner,
                    source,
                    content_hash: self.content_hash,
                }) as Box<dyn CapturedEffect>)
            }
        }

        /// What a captured write applies.
        #[derive(NonLocalValue, Clone)]
        enum Source {
            /// Nothing: the effect state records it as applied already.
            Applied,
            /// The staged file.
            Staged,
            Content(ReadRef<PersistedFileContent>),
        }

        #[derive(NonLocalValue, Clone)]
        struct CapturedWriteEffect {
            full_path: Arc<PathBuf>,
            inner: Arc<DiskFileSystemInner>,
            source: Source,
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

            fn state_storage(&self) -> &EffectStateStorage {
                &self.inner.effect_state_storage
            }

            fn kind(&self) -> &'static str {
                WRITE_FILE_EFFECT
            }

            async fn still_applied(&self) -> bool {
                self.inner.still_installed(&self.full_path).await
            }

            async fn apply(&self) -> Result<(), turbo_tasks::ApplyError> {
                let storage = &self.inner.effect_state_storage;
                match &self.source {
                    Source::Applied => {
                        storage
                            .run_apply::<AnyhowWrapper, _, _>(
                                self.key(),
                                WRITE_FILE_EFFECT,
                                self.content_hash,
                                None::<fn() -> std::future::Ready<Result<(), AnyhowWrapper>>>,
                            )
                            .await
                    }
                    Source::Staged => {
                        storage
                            .run_apply_or_retry::<AnyhowWrapper, _, _>(
                                self.key(),
                                WRITE_FILE_EFFECT,
                                self.content_hash,
                                async || self.install().await,
                            )
                            .await
                    }
                    Source::Content(content) => {
                        // Not written in this session, e.g. an output of an earlier one: keep the
                        // file if it's what this write would write.
                        let adopt = !storage.has_record(&self.key());
                        storage
                            .run_apply::<AnyhowWrapper, _, _>(
                                self.key(),
                                WRITE_FILE_EFFECT,
                                self.content_hash,
                                Some(async || {
                                    write_content(
                                        &self.inner,
                                        &self.full_path,
                                        content,
                                        self.content_hash,
                                        adopt,
                                    )
                                    .await
                                    .map_err(AnyhowWrapper::from)
                                }),
                            )
                            .await
                    }
                }
            }
        }

        impl CapturedWriteEffect {
            /// Installs the staged file. `None` if something else is staged now: the next capture
            /// uses the persisted content.
            async fn install(&self) -> Option<Result<(), AnyhowWrapper>> {
                let staging = self.inner.opened_staging()?;
                match install_staged(&self.inner, staging, &self.full_path, self.content_hash).await
                {
                    Ok(true) => Some(Ok(())),
                    Ok(false) => None,
                    Err(err) => Some(Err(AnyhowWrapper::from(err))),
                }
            }
        }

        WriteEffect {
            full_path,
            fs: self,
            content,
            content_hash,
            writer,
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
        let full_path = Arc::new(this.to_sys_path_raw(&fs_path));

        validate_path_length(&full_path)?;

        let content = target.await?;

        let target_fs = ResolvedVc::try_downcast_type::<DiskFileSystem>(content.target.fs)
            .context("link target must use a disk filesystem")?
            .await?;
        let target_abs_sys_path = target_fs.to_sys_path_raw(&content.target);
        let target_type = content.target_type.clone();
        let is_directory = matches!(target_type, WriteLinkTargetType::DirectoryOrJunctionPoint);
        // Prefer to write relative links.
        //
        // Windows: Junction points require absolute paths. `pathdiff` may return an absolute path
        // if paths cross drives.
        let target_sys_path = if cfg!(windows) && is_directory {
            None
        } else {
            full_path
                .parent()
                .and_then(|parent| pathdiff::diff_paths(&target_abs_sys_path, parent))
        };
        let target_sys_path = match target_sys_path {
            Some(target_sys_path) if target_sys_path.as_os_str().is_empty() => PathBuf::from("."),
            Some(target_sys_path) => target_sys_path,
            None => target_abs_sys_path,
        };
        let target_sys_path = Arc::new(target_sys_path);
        let content_hash =
            hash_xxh3_hash128((target_sys_path.as_os_str().as_encoded_bytes(), &target_type));

        #[turbo_tasks::value(eq = "manual", cell = "new")]
        struct WriteLinkEffect {
            fs: ResolvedVc<DiskFileSystem>,
            full_path: Arc<PathBuf>,
            target_sys_path: Arc<PathBuf>,
            target_type: WriteLinkTargetType,
            #[bincode(fixint)]
            content_hash: u128,
        }

        #[async_trait]
        #[turbo_tasks::value_impl]
        impl Effect for WriteLinkEffect {
            async fn capture(&self) -> Result<Box<dyn CapturedEffect>> {
                // INVALIDATION: a tracked read of this cell occurred in the write effect so if it
                // somehow changes the effect will be re-emitted
                let inner = (*self.fs).untracked().await?.inner.clone();

                // Skip the write entirely if the per-key effect state already records
                // `Applied { value_hash }` matching our hash. See `WriteEffect::capture`.
                let key_bytes = self.full_path.as_os_str().as_encoded_bytes();
                let content = if inner.effect_state_storage.matches_applied(
                    key_bytes,
                    WRITE_LINK_EFFECT,
                    self.content_hash,
                ) {
                    None
                } else {
                    Some((self.target_sys_path.clone(), self.target_type.clone()))
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
        #[derive(NonLocalValue, Clone)]
        struct CapturedWriteLinkEffect {
            full_path: Arc<PathBuf>,
            inner: Arc<DiskFileSystemInner>,
            content: Option<(Arc<PathBuf>, WriteLinkTargetType)>,
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

            fn state_storage(&self) -> &EffectStateStorage {
                &self.inner.effect_state_storage
            }

            fn kind(&self) -> &'static str {
                WRITE_LINK_EFFECT
            }

            async fn still_applied(&self) -> bool {
                self.inner.still_installed(&self.full_path).await
            }

            async fn apply(&self) -> Result<(), turbo_tasks::ApplyError> {
                let body = self.content.as_ref().map(|content| {
                    async || {
                        self.apply_inner(content).await?;
                        // Publication holds the claim, so no other effect changed the link since.
                        self.inner.observe_installed(&self.full_path).await;
                        Ok(())
                    }
                });
                self.inner
                    .effect_state_storage
                    .run_apply::<AnyhowWrapper, _, _>(
                        self.key(),
                        self.kind(),
                        self.content_hash,
                        body,
                    )
                    .await
            }
        }

        impl CapturedWriteLinkEffect {
            async fn apply_inner(
                &self,
                target: &(Arc<PathBuf>, WriteLinkTargetType),
            ) -> anyhow::Result<()> {
                let full_path = self.full_path.clone();

                let _lock = self.inner.lock_path(full_path.clone()).await;

                let (target, target_type) = target;
                #[cfg(windows)]
                let is_directory =
                    matches!(target_type, WriteLinkTargetType::DirectoryOrJunctionPoint);
                #[cfg(not(windows))]
                let _ = target_type;

                let old_content = retry_blocking(|| std::fs::read_link(&**full_path))
                    .instrument(tracing::info_span!("read symlink before write", name = ?full_path))
                    .concurrency_limited(&self.inner.read_semaphore)
                    .await
                    .ok();
                let is_equal = old_content.as_deref() == Some(&**target);
                #[cfg(windows)]
                let is_equal =
                    is_equal && is_link_junction_point(&full_path).ok() == Some(is_directory);
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
                    let io_result = std::os::unix::fs::symlink(&**target, &**full_path);
                    #[cfg(target_os = "wasi")]
                    let io_result = std::os::wasi::fs::symlink_path(&**target, &**full_path);
                    #[cfg(windows)]
                    let io_result = if is_directory {
                        std::os::windows::fs::junction_point(&**target, &**full_path)
                    } else {
                        std::os::windows::fs::symlink_file(&**target, &**full_path)
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
            fs: self,
            full_path,
            target_sys_path,
            target_type,
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

    #[test]
    fn staging_keeps_live_directories_and_removes_ended_ones() {
        let root = tempfile::tempdir().unwrap();
        let first = Staging::open(root.path()).unwrap();
        let second = Staging::open(root.path()).unwrap();
        assert!(
            first.dir.exists(),
            "removed a directory that's still in use"
        );
        assert_ne!(first.dir, second.dir);
        let first_dir = first.dir.clone();
        drop(first);
        let third = Staging::open(root.path()).unwrap();
        assert!(
            !first_dir.exists(),
            "kept the directory of a process that ended"
        );
        assert!(second.dir.exists());
        assert!(third.dir.exists());
    }

    type InstalledHook = Arc<dyn Fn() -> futures::future::BoxFuture<'static, ()> + Send + Sync>;

    /// Runs after a staged file is installed, before readers of it are notified.
    static INSTALLED_HOOK: parking_lot::Mutex<Option<InstalledHook>> =
        parking_lot::Mutex::new(None);

    pub(super) async fn installed_hook() {
        let hook = INSTALLED_HOOK.lock().clone();
        if let Some(hook) = hook {
            hook().await;
        }
    }

    #[turbo_tasks::function(operation, root)]
    fn staged_filesystem(root: RcStr) -> Vc<DiskFileSystem> {
        DiskFileSystem::new_with_options(
            rcstr!("staged"),
            Vc::cell(root),
            Vec::new(),
            DiskWatcherConfig::default(),
            DiskFileSystemMap::empty(),
            Some(rcstr!(".staging")),
        )
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_text_operation(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<RcStr>> {
        let path = fs.root().await?.join("out.txt")?;
        Ok(Vc::cell(match &*path.read().await? {
            FileContent::Content(file) => file.content().to_str()?.into(),
            FileContent::NotFound => rcstr!("(none)"),
        }))
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_metadata_operation(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<Completion>> {
        let path = fs.root().await?.join("out.txt")?;
        fs.metadata(path).await?;
        Ok(Completion::new())
    }

    #[turbo_tasks::function(operation, root)]
    async fn write_new_operation(fs: ResolvedVc<DiskFileSystem>) -> Result<()> {
        let path = fs.root().await?.join("out.txt")?;
        fs.write(path, FileContent::from(File::from("new")).cell())
            .await?;
        Ok(())
    }

    /// Installing a staged file and notifying its readers happen under the file's lock, so a new
    /// reader can't see the installed file while an earlier reader of it still looks up to date.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn installed_file_is_hidden_until_readers_are_notified() -> Result<()> {
        let scratch = tempfile::tempdir()?;
        let root = std::fs::canonicalize(scratch.path())?;
        std::fs::write(root.join("out.txt"), "old")?;
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let result = tt
            .run_once(async move {
                let fs = staged_filesystem(RcStr::from(root.to_str().unwrap()))
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let read = read_text_operation(fs);
                let before = read.read_strongly_consistent().await?.to_string();
                let write = extract_effects_operation(write_new_operation(fs));
                write.read_strongly_consistent().await?;

                let (paused_tx, paused_rx) = tokio::sync::oneshot::channel::<()>();
                let (resume_tx, resume_rx) = tokio::sync::oneshot::channel::<()>();
                let pause = Arc::new(parking_lot::Mutex::new(Some((paused_tx, resume_rx))));
                *INSTALLED_HOOK.lock() = Some(Arc::new(move || {
                    let pause = pause.lock().take();
                    Box::pin(async move {
                        if let Some((paused, resume)) = pause {
                            let _ = paused.send(());
                            let _ = resume.await;
                        }
                    })
                }));
                let publish = async move {
                    turbo_tasks::read_strongly_consistent_and_apply_effects(write, |e| e).await?;
                    anyhow::Ok(())
                };
                let observe = async move {
                    paused_rx.await?;
                    // A reader that never read the file before can't read it until the readers
                    // of the old file are notified.
                    let metadata = read_metadata_operation(fs);
                    let read_while_paused = tokio::time::timeout(
                        std::time::Duration::from_millis(300),
                        metadata.read_strongly_consistent(),
                    )
                    .await
                    .is_ok();
                    let _ = resume_tx.send(());
                    metadata.read_strongly_consistent().await?;
                    anyhow::Ok(read_while_paused)
                };
                let ((), read_while_paused) = futures::future::try_join(publish, observe).await?;
                *INSTALLED_HOOK.lock() = None;
                let after = read.read_strongly_consistent().await?.to_string();
                anyhow::Ok((before, read_while_paused, after))
            })
            .await;
        *INSTALLED_HOOK.lock() = None;
        let (before, read_while_paused, after) = result?;
        assert_eq!(before, "old");
        assert!(
            !read_while_paused,
            "read the installed file before its readers were notified"
        );
        assert_eq!(after, "new");
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn extract_effects_operation(op: OperationVc<()>) -> anyhow::Result<Vc<Effects>> {
        let _ = op.resolve().strongly_consistent().await?;
        Ok(take_effects(op).await?.cell())
    }

    #[cfg(not(miri))]
    #[turbo_tasks::function(operation, root)]
    fn external_tracking_filesystem(root: RcStr) -> Vc<DiskFileSystem> {
        DiskFileSystem::new_with_options(
            rcstr!("external-tracking"),
            Vc::cell(root),
            Vec::new(),
            DiskWatcherConfig {
                // Registration must walk back to the canonical root on Windows too.
                recursive_mode: Some(crate::DiskWatcherRecursiveMode::NonRecursive),
                ..Default::default()
            },
            DiskFileSystemMap::empty(),
            None,
        )
    }

    #[cfg(not(miri))] // Native filesystem watchers are unavailable under Miri.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn external_tracking_uses_internal_paths() -> Result<()> {
        let scratch = tempfile::tempdir()?;
        let root = std::fs::canonicalize(scratch.path())?;
        std::fs::create_dir(root.join("nested"))?;
        std::fs::write(root.join("nested/input.txt"), "input")?;
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = external_tracking_filesystem(RcStr::from(root.to_str().unwrap()))
                .resolve()
                .strongly_consistent()
                .await?;
            let root_path = FileSystemPath {
                fs: ResolvedVc::upcast(fs),
                path: rcstr!(""),
            };
            let fs = fs.await?;
            fs.start_watching().await?;
            let file = root_path.join("nested/input.txt")?;
            let directory = root_path.join("nested")?;
            assert!(turbo_tasks::get_invalidator().is_some());
            fs.track_file(&file).await?;
            fs.track_directory(&directory).await?;
            // Watcher events and writes use these same raw paths as invalidation keys.
            assert!(
                fs.inner
                    .invalidator_map
                    .lock()
                    .unwrap()
                    .contains_key(fs.to_sys_path_raw(&file).as_path())
            );
            assert!(
                fs.inner
                    .dir_invalidator_map
                    .lock()
                    .unwrap()
                    .contains_key(fs.to_sys_path_raw(&directory).as_path())
            );
            fs.stop_watching().await;
            anyhow::Ok(())
        })
        .await
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
            LinkTarget, RealPathErrorType, WriteLinkContent, WriteLinkTargetType,
            canonicalize_to_rcstr,
        };

        #[turbo_tasks::function(operation, root)]
        async fn test_write_link_effect_operation(
            fs: ResolvedVc<DiskFileSystem>,
            path: FileSystemPath,
            target: RcStr,
        ) -> anyhow::Result<()> {
            let file_target = path.join(&format!("{target}/data.txt"))?;
            let directory_target = path.join(&target)?;
            let write_file = |f| {
                fs.write_link(
                    f,
                    WriteLinkContent {
                        target: file_target.clone(),
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
                        target: directory_target.clone(),
                        target_type: WriteLinkTargetType::DirectoryOrJunctionPoint,
                    }
                    .cell(),
                )
            };
            // Write it twice (same content)
            write_dir(path.join("symlink-dir")?).await?;
            write_dir(path.join("symlink-dir")?).await?;

            fs.write_link(
                path.join("symlink-parent")?,
                WriteLinkContent {
                    target: path,
                    target_type: WriteLinkTargetType::DirectoryOrJunctionPoint,
                }
                .cell(),
            )
            .await?;

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
                #[cfg(not(windows))]
                assert_eq!(
                    std::fs::read_link(path.join("symlink-parent")).unwrap(),
                    std::path::PathBuf::from(".")
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
            // DETERMINISM: Only the read error is asserted; no entries are enumerated.
            let error = unresolved_dir
                .read_dir()
                .await
                .expect_err("a directory read through a symlinked parent must be rejected");
            let message = format!("{error:#}");
            assert!(message.contains("alias/child"));
            assert!(message.contains("real/child"));
            // DETERMINISM: Only key presence is checked, independent of entry order.
            assert!(matches!(
                &*resolved_dir.read_dir().await?,
                DirectoryContent::Entries(entries) if entries.contains_key(&rcstr!("data.txt"))
            ));

            // DETERMINISM: Only NotFound is asserted; no entries are enumerated.
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

        /// A relative target can step above the root and return to it, but a target that ends
        /// outside all configured roots is invalid.
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
                let reentrant = fs.read_link(root_path.join("sub/link-reentrant")?).await?;
                assert_eq!(
                    *reentrant,
                    LinkContent::Link {
                        target: LinkTarget::Relative {
                            raw: rcstr!("../../the-root/root.txt"),
                            resolved: root_path.join("root.txt")?,
                        },
                    }
                );

                // sub/link-sideways -> ../../sibling/root.txt, which steps above the root and down
                // into a sibling, so it genuinely ends outside.
                let sideways = fs.read_link(root_path.join("sub/link-sideways")?).await?;
                assert!(matches!(
                    &*sideways,
                    LinkContent::Invalid{reason}
                        if reason == "the symlink target leaves the configured filesystem roots"
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
                assert!(matches!(
                    &*via_alias,
                    LinkContent::Link {
                        target: LinkTarget::Absolute { resolved, .. },
                    } if resolved == &root_path.join("foo.txt")?
                ));

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
                    let target = symlinks_dir.join(&target).unwrap();
                    async move {
                        fs.write_link(
                            symlink_path,
                            WriteLinkContent {
                                target,
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
            DirectoryContent, DiskFileSystem, DiskFileSystemMap, DiskWatcherConfig,
            File as TurboFile, FileContent, FileSystem, FileSystemPath,
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
                    DiskFileSystemMap::empty(),
                    None,
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
                    DiskFileSystemMap::empty(),
                    None,
                );
                let root_path = fs.root().await?;

                // Test: read_dir on root should not include denied_dir
                // DETERMINISM: Only key presence and absence are checked.
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
                // DETERMINISM: Only NotFound is asserted; no entries are enumerated.
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
                    DiskFileSystemMap::empty(),
                    None,
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

            /// Writes the allowed file and takes effects to be applied at
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
                    DiskFileSystemMap::empty(),
                    None,
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
                    DiskFileSystemMap::empty(),
                    None,
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
