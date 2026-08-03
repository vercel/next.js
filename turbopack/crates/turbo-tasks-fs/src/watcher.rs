use std::{
    any::Any,
    collections::BTreeSet,
    env, fmt,
    io::{ErrorKind, Read},
    mem::{replace, take},
    path::{Path, PathBuf},
    sync::{
        Arc, LazyLock,
        mpsc::{Receiver, RecvTimeoutError, channel},
    },
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use bitflags::bitflags;
use notify::{
    Config, EventKind, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher,
    event::{MetadataKind, ModifyKind, RenameMode},
};
use rustc_hash::{FxHashMap, FxHashSet};
use tokio::sync::{RwLock, RwLockWriteGuard};
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, InvalidationReason, InvalidationReasonKind, Invalidator, TurboTasksApi, parallel,
    spawn_thread, util::StaticOrArc,
};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher, Xxh3Hash64Hasher};

use crate::{
    DiskFileSystemInner, FileMeta, format_absolute_fs_path,
    invalidation::{WatchChange, WatchStart},
    invalidator_map::InvalidatorMap,
    path_map::OrderedPathMapExt,
};

static WATCH_RECURSIVE_MODE: LazyLock<RecursiveMode> = LazyLock::new(|| {
    match env::var("TURBO_TASKS_FORCE_WATCH_MODE").as_deref() {
        Ok("recursive") => {
            return RecursiveMode::Recursive;
        }
        Ok("nonrecursive") => {
            return RecursiveMode::NonRecursive;
        }
        Ok(_) => {
            eprintln!(
                "unsupported `TURBO_TASKS_FORCE_WATCH_MODE`, must be `recursive` or `nonrecursive`"
            );
        }
        _ => {}
    }
    if cfg!(any(target_os = "macos", target_os = "windows")) {
        // these platforms have efficient recursive watchers, it's best to track the entire
        // directory and filter events to the files we care about
        RecursiveMode::Recursive
    } else {
        // inotify on linux is non-recursive, so notify-rs's implementation is inefficient, it's
        // better for us to just track it ourselves and only watch the files we know we care about
        //
        // See: https://github.com/vercel/turborepo/pull/4100
        RecursiveMode::NonRecursive
    }
});

/// Whether a write that leaves a file's bytes unchanged should skip invalidation, instead of
/// invalidating everything that read the file and rediscovering that nothing downstream changed.
///
/// Tools produce these writes constantly: a formatter that reformatted nothing, a code generator
/// that reran, a `git checkout` that restored identical bytes, or an editor that saves on focus
/// loss. The filesystem reports each one, because the mtime really did move.
///
/// Off by default. Enabling it trades one read and one hash of each changed file for the chance to
/// skip the work an invalidation would have caused.
static SUPPRESS_UNCHANGED_WRITES: LazyLock<bool> = LazyLock::new(|| {
    matches!(
        env::var("TURBO_TASKS_SUPPRESS_UNCHANGED_WRITES").as_deref(),
        Ok("1" | "true")
    )
});

/// How long to extend an invalidation batch by when receiving new events, before flushing. This
/// reduces invalidations if the same file or directory is modified many times.
///
/// Linux watching is too fast, so we need a longer delay there to avoid reading wip files.
#[cfg(target_os = "linux")]
const BATCH_DELAY: Duration = Duration::from_millis(10);
#[cfg(not(target_os = "linux"))]
const BATCH_DELAY: Duration = Duration::from_millis(1);

#[derive(Encode, Decode)]
pub(crate) struct DiskWatcher {
    #[bincode(skip)]
    state: State,
}

enum State {
    // Note: Information about if we're a recursive or non-recursive watcher must live outside the
    // `RwLock` to allow us to quickly bail out on calls to `ensure_watched`.
    Recursive(RwLock<RecursiveState>),
    NonRecursive(RwLock<NonRecursiveState>),
}

impl Default for State {
    fn default() -> Self {
        State::new_stopped()
    }
}

enum StateWriteGuard<'a> {
    Recursive(RwLockWriteGuard<'a, RecursiveState>),
    NonRecursive(RwLockWriteGuard<'a, NonRecursiveState>),
}

impl State {
    fn new_stopped() -> Self {
        match *WATCH_RECURSIVE_MODE {
            RecursiveMode::Recursive => Self::Recursive(RwLock::new(RecursiveState::Stopped)),
            RecursiveMode::NonRecursive => {
                Self::NonRecursive(RwLock::new(NonRecursiveState::Stopped))
            }
        }
    }

    async fn write(&self) -> StateWriteGuard<'_> {
        match self {
            Self::Recursive(state) => StateWriteGuard::Recursive(state.write().await),
            Self::NonRecursive(state) => StateWriteGuard::NonRecursive(state.write().await),
        }
    }

    fn recursive_mode(&self) -> RecursiveMode {
        match self {
            Self::Recursive(_) => RecursiveMode::Recursive,
            Self::NonRecursive(_) => RecursiveMode::NonRecursive,
        }
    }
}

/// Used by when [`WATCH_RECURSIVE_MODE`] is [`RecursiveMode::Recursive`] (default on macOS and
/// Windows).
enum RecursiveState {
    /// Used when [`DiskWatcher::start_watching`] hasn't been called yet or after
    /// [`DiskWatcher::stop_watching`] is called.
    Stopped,
    Watching {
        /// Hold onto the watcher: When this is dropped, it will cause the channel to disconnect
        _notify_watcher: NotifyWatcher,
    },
}

/// Used by when [`WATCH_RECURSIVE_MODE`] is [`RecursiveMode::NonRecursive`] (default on Linux).
enum NonRecursiveState {
    /// Used when [`DiskWatcher::start_watching`] hasn't been called yet or after
    /// [`DiskWatcher::stop_watching`] is called.
    Stopped,
    Watching(NonRecursiveWatchingState),
}

// split out from the `NonRecursiveState` enum because we want to pass this value around
struct NonRecursiveWatchingState {
    notify_watcher: NotifyWatcher,
    /// Keeps track of which directories are currently or were previously watched by
    /// [`Self::notify_watcher`].
    ///
    /// Invariants:
    /// - Never contains `root_path`. A watcher for `root_path` is implicitly set up during
    ///   [`DiskWatcher::start_watching`].
    /// - Contains all parent directories up to `root_path` for every entry.
    watched: BTreeSet<PathBuf>,
}

/// A thin wrapper around [`RecommendedWatcher`] and [`PollWatcher`].
enum NotifyWatcher {
    Recommended(RecommendedWatcher),
    Polling(PollWatcher),
}

impl NotifyWatcher {
    fn watch(&mut self, path: &Path, recursive_mode: RecursiveMode) -> notify::Result<()> {
        match self {
            Self::Recommended(watcher) => watcher.watch(path, recursive_mode),
            Self::Polling(watcher) => watcher.watch(path, recursive_mode),
        }
    }
}

mod non_recursive_helpers {
    use super::*;
    use crate::path_map::OrderedPathSetExt;

    /// Called after a rescan in case a previously watched-but-deleted directory was recreated.
    #[instrument(skip_all, level = "trace")]
    pub async fn restore_all_watched_ignore_errors(
        state: &RwLock<NonRecursiveState>,
        root_path: &Path,
    ) {
        let mut guard = state.write().await;
        let NonRecursiveState::Watching(watching_state) = &mut *guard else {
            return;
        };
        for dir_path in watching_state.watched.iter() {
            // TODO: Report diagnostics if this error happens
            //
            // Don't watch the parents, because those are already included in `self.watched` (so
            // it'd be redundant), but also because this could deadlock, since we'd try to modify
            // `self.watched` while iterating over it (write lock overlapping with a read lock).
            let _ = start_watching_dir(&mut watching_state.notify_watcher, dir_path, root_path);
        }
    }

    /// Called when a new directory is found in a parent directory we're watching. Restores the
    /// watcher if we were previously watching it.
    #[instrument(skip_all, level = "trace")]
    pub async fn restore_if_watched(
        state: &RwLock<NonRecursiveState>,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        // fast path: The root directory is always implicitly watched during
        // `DiskWatcher::start_watching`, we assume it is never deleted and never needs to be
        // restored.
        if dir_path == root_path {
            return Ok(());
        }

        // fast path: the directory isn't in `watched`, only take a read lock and bail out early
        {
            let guard = state.read().await;
            let NonRecursiveState::Watching(watching_state) = &*guard else {
                return Ok(());
            };
            if !watching_state.watched.contains(dir_path) {
                return Ok(());
            }
        }

        // slow path: re-watch the path
        let mut guard = state.write().await;
        let NonRecursiveState::Watching(watching_state) = &mut *guard else {
            return Ok(());
        };

        // watch the new directory
        start_watching_dir(&mut watching_state.notify_watcher, dir_path, root_path)?;

        // Also try to restore any watchers for children of this directory
        for child_path in watching_state.watched.iter_path_children(dir_path) {
            // Don't watch the parents -- see the comment on `restore_all_watched`
            start_watching_dir(&mut watching_state.notify_watcher, child_path, root_path)?;
        }
        Ok(())
    }

    /// Called when a file in `dir_path` or `dir_path` itself is read or written. Adds a new watcher
    /// if we're not already watching the directory.
    ///
    /// This should be called *before* reading a file to avoid a race condition.
    #[instrument(skip_all, level = "trace")]
    pub async fn ensure_watched(
        state: &RwLock<NonRecursiveState>,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        // fast path: The root directory is always implicitly watched during
        // `DiskWatcher::start_watching`.
        if dir_path == root_path {
            return Ok(());
        }

        // fast path: the directory is already in `watched`, only take a read lock and bail out
        // early
        {
            let guard = state.read().await;
            let NonRecursiveState::Watching(watching_state) = &*guard else {
                return Ok(());
            };
            if watching_state.watched.contains(dir_path) {
                return Ok(());
            }
        }

        // slow path: watch the path
        let mut guard = state.write().await;
        let NonRecursiveState::Watching(watching_state) = &mut *guard else {
            return Ok(());
        };
        if watching_state.watched.insert(dir_path.to_path_buf()) {
            start_watching_dir_and_parents(watching_state, dir_path, root_path)?;
        }
        Ok(())
    }

    /// Private helper, assumes that `dir_path` has already been added to
    /// [`NonRecursiveWatchingState::watched`].
    ///
    /// This does not watch any of the parent directories. For that, use
    /// [`start_watching_dir_and_parents`]. Use this method when iterating over previously-watched
    /// values in `self.watching`.
    fn start_watching_dir(
        notify_watcher: &mut NotifyWatcher,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        debug_assert_ne!(dir_path, root_path);

        match notify_watcher.watch(dir_path, RecursiveMode::NonRecursive) {
            Ok(())
            | Err(notify::Error {
                // The path was probably deleted before we could process the event, but the parent
                // should still be watched. The codepaths that care about this either call
                // `start_watching_dir_and_parents` or handle the parents themselves.
                kind: notify::ErrorKind::PathNotFound,
                ..
            }) => Ok(()),
            Err(err) => {
                // ast-grep-ignore: no-context-format
                return Err(err).context(format!("Unable to watch {}", dir_path.display(),));
            }
        }
    }

    /// Private helper, assumes that `dir_path` has already been added to
    /// [`NonRecursiveWatchingState::watched`].
    ///
    /// Watches the given `dir_path` and every parent up to `root_path`. Parents must be recursively
    /// watched in case any of them change:
    /// https://docs.rs/notify/latest/notify/#parent-folder-deletion
    fn start_watching_dir_and_parents(
        state: &mut NonRecursiveWatchingState,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        let mut found_watched_ancestor = false;

        // NOTE: `Path::ancestors` yields ancestors from longest to shortest path.
        let dir_and_ancestor_paths: Vec<_> = [dir_path]
            .into_iter()
            .chain(
                dir_path
                    .ancestors()
                    // skip: `ancestors` includes `dir_path` itself, as well as the ancestors, but
                    // we only want to apply the `take_while` check to parents
                    .skip(1)
                    .take_while(|p| {
                        found_watched_ancestor = *p == root_path || state.watched.contains(*p);
                        !found_watched_ancestor
                    }),
            )
            .collect();

        if !found_watched_ancestor {
            // this should never happen, as we should eventually hit the `root_path`
            anyhow::bail!(
                "failed to find the fs root of {root_path:?} while watching {dir_path:?}"
            );
        }

        // Reverse the iterator: We want to start closest to the root and work towards `dir_path`
        // (opposite of `Path::ancestors`), to avoid a potential race condition if directories are
        // removed and re-added before we've watched their parent.
        for path in dir_and_ancestor_paths.into_iter().rev() {
            // this will silently ignore if the path is not found, expecting that we've watched the
            // parent directory
            start_watching_dir(&mut state.notify_watcher, path, root_path)?;
            state.watched.insert(path.to_owned());
        }

        Ok(())
    }
}

impl DiskWatcher {
    pub fn new() -> Self {
        Self {
            state: State::new_stopped(),
        }
    }

    /// Create a watcher and start watching by creating `debounced` watcher
    /// via `full debouncer`
    ///
    /// `notify` provides 2 different debouncer implementations, `-full`
    /// provides below differences for the easy of use:
    ///
    /// - Only emits a single Rename event if the rename From and To events can be matched
    /// - Merges multiple Rename events
    /// - Takes Rename events into account and updates paths for events that occurred before the
    ///   rename event, but which haven't been emitted, yet
    /// - Optionally keeps track of the file system IDs all files and stitches rename events
    ///   together (FSevents, Windows)
    /// - Emits only one Remove event when deleting a directory (inotify)
    /// - Doesn't emit duplicate create events
    /// - Doesn't emit Modify events after a Create event
    pub async fn start_watching(
        &self,
        fs_inner: Arc<DiskFileSystemInner>,
        report_invalidation_reason: bool,
        poll_interval: Option<Duration>,
    ) -> Result<()> {
        let state_guard = self.state.write().await;

        // bail out if we're already watching
        if let StateWriteGuard::Recursive(guard) = &state_guard
            && matches!(**guard, RecursiveState::Watching { .. })
        {
            return Ok(());
        } else if let StateWriteGuard::NonRecursive(guard) = &state_guard
            && matches!(**guard, NonRecursiveState::Watching(..))
        {
            return Ok(());
        }

        // Create a channel to receive the events.
        let (tx, rx) = channel();
        // Create a watcher object, delivering debounced events.
        // The notification back-end is selected based on the platform.
        let config = Config::default();
        // we should track and invalidate each part of a symlink chain ourselves in
        // turbo-tasks-fs
        let config = config.with_follow_symlinks(false);

        let mut notify_watcher = if let Some(poll_interval) = poll_interval {
            let config = config.with_poll_interval(poll_interval);
            NotifyWatcher::Polling(PollWatcher::new(tx, config)?)
        } else {
            NotifyWatcher::Recommended(RecommendedWatcher::new(tx, config)?)
        };

        // TOCTOU: we must watch `root_path` before calling any invalidators and setting up the
        // watchers in their associated functions
        let root_path = fs_inner.root_path();
        let recursive_mode = match state_guard {
            StateWriteGuard::Recursive(_) => RecursiveMode::Recursive,
            StateWriteGuard::NonRecursive(_) => RecursiveMode::NonRecursive,
        };
        notify_watcher.watch(root_path, recursive_mode)?;

        // We need to invalidate all reads or writes that happened before watching. As a
        // side-effect, this will call `ensure_watched` again, setting up any watchers needed.
        //
        // Best is to start_watching before starting to read
        if let Some(turbo_tasks) = fs_inner.turbo_tasks.upgrade() {
            let _span = tracing::info_span!("invalidate filesystem").entered();
            let _guard = fs_inner.tokio_handle.enter();
            let invalidator_map = take(&mut *fs_inner.invalidator_map.lock().unwrap());
            let dir_invalidator_map = take(&mut *fs_inner.dir_invalidator_map.lock().unwrap());
            let iter = invalidator_map.into_iter().chain(dir_invalidator_map);
            if report_invalidation_reason {
                let invalidators = iter
                    .flat_map(|(path, invalidators)| {
                        let reason = WatchStart {
                            name: fs_inner.name.clone(),
                            // this path is just used for display purposes
                            path: RcStr::from(path.to_string_lossy()),
                        };
                        invalidators.into_iter().map(move |i| (reason.clone(), i))
                    })
                    .collect::<Vec<_>>();
                parallel::for_each_owned(invalidators, |(reason, invalidator)| {
                    invalidator.invalidate_with_reason(&*turbo_tasks, reason);
                });
            } else {
                let invalidators = iter
                    .flat_map(|(_, invalidators)| invalidators.into_iter())
                    .collect::<Vec<_>>();
                parallel::for_each_owned(invalidators, |invalidator| {
                    invalidator.invalidate(&*turbo_tasks);
                });
            }
        }

        spawn_thread(move || {
            fs_inner
                .clone()
                .watcher
                .watch_thread(rx, fs_inner, report_invalidation_reason)
        });

        // Updating `self.state` is done last. If we panic while setting up the watcher, it'll
        // stay in the `Stopped` state.
        match state_guard {
            StateWriteGuard::Recursive(mut recursive) => {
                *recursive = RecursiveState::Watching {
                    _notify_watcher: notify_watcher,
                }
            }
            StateWriteGuard::NonRecursive(mut non_recursive) => {
                *non_recursive = NonRecursiveState::Watching(NonRecursiveWatchingState {
                    notify_watcher,
                    watched: BTreeSet::new(),
                })
            }
        };

        Ok(())
    }

    pub async fn stop_watching(&self) {
        match &self.state {
            State::Recursive(state) => *state.write().await = RecursiveState::Stopped,
            State::NonRecursive(state) => *state.write().await = NonRecursiveState::Stopped,
        }
        // thread will detect the stop because the channel is disconnected when `NotifyWatcher` is
        // dropped
    }

    /// Internal thread that processes the events from the watcher
    /// and invalidates the cache.
    ///
    /// Should only be called once from `start_watching`.
    fn watch_thread(
        &self,
        rx: Receiver<notify::Result<notify::Event>>,
        fs_inner: Arc<DiskFileSystemInner>,
        report_invalidation_reason: bool,
    ) {
        let mut batch = BatchedInvalidations::new(self.state.recursive_mode());
        let mut fingerprints = SUPPRESS_UNCHANGED_WRITES.then(ContentFingerprints::new);

        'outer: loop {
            let mut deadline: Option<Instant> = None;
            loop {
                let event_result = match deadline {
                    None => rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
                    Some(deadline) => {
                        rx.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    }
                };
                match event_result {
                    Ok(Ok(event)) => {
                        // TODO: We might benefit from some user-facing diagnostics if it rescans
                        // occur frequently (i.e. more than X times in Y minutes)
                        //
                        // You can test rescans on Linux by reducing the inotify queue to something
                        // really small:
                        //
                        // ```
                        // echo 3 | sudo tee /proc/sys/fs/inotify/max_queued_events
                        // ```
                        if event.need_rescan() {
                            let _lock = fs_inner.invalidation_lock.blocking_write();

                            // flush the whole mpsc queue, we're about to rescan, we don't need to
                            // process any other update events that have already happened
                            while rx.try_recv().is_ok() {}

                            if let State::NonRecursive(non_recursive) = &self.state {
                                // we can't narrow this down to a smaller set of paths: Rescan
                                // events (at least when tested on
                                // Linux) come with no `paths`, and we use
                                // only one global `notify::Watcher` instance.
                                //
                                // TODO: Report diagnostics if an error happens
                                fs_inner.tokio_handle.block_on(
                                    non_recursive_helpers::restore_all_watched_ignore_errors(
                                        non_recursive,
                                        fs_inner.root_path(),
                                    ),
                                );
                            }

                            if report_invalidation_reason {
                                fs_inner.invalidate_with_reason(|path| InvalidateRescan {
                                    // this path is just used for display purposes
                                    path: RcStr::from(path.to_string_lossy()),
                                });
                            } else {
                                fs_inner.invalidate();
                            }

                            // no need to process the rest of the batch as we just
                            // invalidated everything
                            batch.clear();
                            break;
                        }

                        // Only an event that contributes to the batch keeps it open for another
                        // `BATCH_DELAY`.
                        if batch.add_event(event) {
                            deadline = Some(Instant::now() + BATCH_DELAY);
                        }
                    }
                    // Error raised by notify watcher itself
                    Ok(Err(notify::Error { kind, paths })) => {
                        println!("watch error ({paths:?}): {kind:?} ");

                        let flags = InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR;
                        if paths.is_empty() {
                            batch.mark(fs_inner.root_path().into(), flags);
                        } else {
                            for path in paths {
                                batch.mark(path.into_boxed_path(), flags);
                            }
                        }
                        deadline = Some(Instant::now() + BATCH_DELAY);
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        // The batch is complete: break out to invalidate the collected paths.
                        break;
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        // Sender has been disconnected, which means DiskFileSystem has been dropped
                        // exit thread
                        break 'outer;
                    }
                }
            }

            // We need to start watching first before invalidating the changed paths...
            // This is only needed on platforms we don't do recursive watching on.
            if let State::NonRecursive(non_recursive) = &self.state {
                for path in batch.new_paths() {
                    // TODO: Report diagnostics if this error happens
                    let _ =
                        fs_inner
                            .tokio_handle
                            .block_on(non_recursive_helpers::restore_if_watched(
                                non_recursive,
                                path,
                                fs_inner.root_path(),
                            ));
                }
            }

            // Done before taking the invalidation lock below: this reads and hashes each changed
            // file, and holding the lock across that would stall every other filesystem operation.
            if let Some(fingerprints) = &mut fingerprints {
                let dropped = batch.drop_unchanged_writes(fingerprints);
                if dropped > 0 {
                    tracing::debug!(dropped, "skipped invalidation of unchanged file contents");
                }
            }

            let Some(turbo_tasks) = fs_inner.turbo_tasks.upgrade() else {
                // TurboTasks was dropped, stop watching
                break 'outer;
            };
            let _guard = fs_inner.tokio_handle.enter();

            let _lock = fs_inner.invalidation_lock.blocking_write();
            batch.execute(
                &fs_inner.invalidator_map,
                &fs_inner.dir_invalidator_map,
                |invalidation_reason_path, invalidator| {
                    invalidate(
                        &fs_inner,
                        &*turbo_tasks,
                        report_invalidation_reason,
                        invalidation_reason_path,
                        invalidator,
                    )
                },
            );
        }
    }

    pub async fn ensure_watched_file(&self, path: &Path, root_path: &Path) -> Result<()> {
        // Watch the parent directory instead of the specified file, since directories also track
        // their immediate children (even in non-recursive mode), and we need to watch all the
        // parents anyways.
        if let State::NonRecursive(non_recursive) = &self.state
            && let Some(dir_path) = path.parent()
        {
            non_recursive_helpers::ensure_watched(non_recursive, dir_path, root_path).await?;
        }
        Ok(())
    }

    pub async fn ensure_watched_dir(&self, dir_path: &Path, root_path: &Path) -> Result<()> {
        if let State::NonRecursive(non_recursive) = &self.state {
            non_recursive_helpers::ensure_watched(non_recursive, dir_path, root_path).await?;
        }
        Ok(())
    }
}

bitflags! {
    /// Describes how a single path in a [`BatchedInvalidations`] should be invalidated. A path may
    /// carry any combination of these (accumulated across the events in a batch).
    struct InvalidationFlags: u8 {
        /// Invalidate exactly this path in the file-content invalidator map.
        const PATH = 1 << 0;
        /// Invalidate exactly this path in the directory-listing invalidator map.
        const PATH_DIR = 1 << 1;
        /// Invalidate this path and all of its children in the file-content invalidator map.
        const PATH_AND_CHILDREN = 1 << 2;
        /// Invalidate this path and all of its children in the directory-listing invalidator map.
        const PATH_AND_CHILDREN_DIR = 1 << 3;
    }
}

/// A set of deferred invalidations. Because one or more files may be updated many times in quick
/// succession, we don't want to perform invalidations until we think the filesystem has settled.
///
/// This avoids reading partially-written files which might generate transient errors, and reduces
/// CPU and memory usage by producing less wasted work.
///
/// Paths are stored once in a flag-keyed map, with a set of [`InvalidationFlags`] describing what
/// needs to happen for each, rather than in several separate sets. This avoids cloning each
/// `PathBuf` into multiple collections.
struct BatchedInvalidations {
    paths: FxHashMap<Box<Path>, InvalidationFlags>,
    /// See [`Self::new_paths`]). Stored as [`None`] in non-recursive mode.
    new_paths: Option<FxHashSet<Box<Path>>>,
}

impl BatchedInvalidations {
    fn new(recursive_mode: RecursiveMode) -> Self {
        Self {
            paths: FxHashMap::default(),
            new_paths: match recursive_mode {
                RecursiveMode::NonRecursive => Some(FxHashSet::default()),
                RecursiveMode::Recursive => None,
            },
        }
    }

    fn clear(&mut self) {
        self.paths.clear();
        if let Some(new_paths) = &mut self.new_paths {
            new_paths.clear();
        }
    }

    /// Records `path` as newly-created so its watch can be (re-)established. No-op in recursive
    /// watching mode.
    fn mark_new_path(&mut self, path: &Path) {
        if let Some(new_paths) = &mut self.new_paths {
            new_paths.insert(Box::from(path));
        }
    }

    fn mark(&mut self, path: Box<Path>, flags: InvalidationFlags) {
        *self.paths.entry(path).or_insert(InvalidationFlags::empty()) |= flags;
    }

    fn mark_parent_dir(&mut self, path: &Path) {
        if let Some(parent) = path.parent() {
            self.mark(Box::from(parent), InvalidationFlags::PATH_DIR);
        }
    }

    /// Iterates over the newly-created paths in this batch. In non-recursive watching mode, these
    /// must have their watches (re-)established before [`Self::execute`] is called (see the note
    /// there). Always empty in recursive mode.
    fn new_paths(&self) -> impl Iterator<Item = &Path> {
        self.new_paths.iter().flatten().map(|path| &**path)
    }

    /// Updates the batch to contain updated paths from the given event. Does not perform any
    /// invalidations.
    ///
    /// Returns `true` if the event contained relevant events, or `false` if it was filtered out.
    #[must_use]
    fn add_event(&mut self, event: notify::Event) -> bool {
        let paths: Vec<PathBuf> = event.paths;
        if paths.is_empty() {
            return false;
        }
        match event.kind {
            // [NOTE] Observing `ModifyKind::Metadata(MetadataKind::Any)` is not a mistake, fix for
            // PACK-2437.
            // In here explicitly subscribes to the `ModifyKind::Data` which indicates file content
            // changes - in case of fsevents backend, this is `kFSEventStreamEventFlagItemModified`.
            // Also meanwhile we subscribe to `ModifyKind::Metadata` as well.
            // This is due to in some cases fsevents does not emit explicit
            // `kFSEventStreamEventFlagItemModified` kernel events, but only emits
            // `kFSEventStreamEventFlagItemInodeMetaMod`. While this could cause redundant
            // invalidation, it's the way to reliably detect file content changes.
            // ref other implementation, i.e libuv does same thing to trigger `UV_CHANGES`
            // https://github.com/libuv/libuv/commit/73cf3600d75a5884b890a1a94048b8f3f9c66876
            EventKind::Modify(ModifyKind::Data(_) | ModifyKind::Metadata(MetadataKind::Any)) => {
                for path in paths {
                    self.mark(path.into_boxed_path(), InvalidationFlags::PATH);
                }
                true
            }
            EventKind::Create(_) => {
                for path in paths {
                    self.mark_parent_dir(&path);
                    self.mark_new_path(&path);
                    self.mark(
                        path.into_boxed_path(),
                        InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR,
                    );
                }
                true
            }
            EventKind::Remove(_) => {
                for path in paths {
                    self.mark_parent_dir(&path);
                    self.mark(
                        path.into_boxed_path(),
                        InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR,
                    );
                }
                true
            }
            // A single event emitted with both the `From` and `To` paths.
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                let [source, destination] = <[PathBuf; 2]>::try_from(paths)
                    .expect("RenameMode::Both event must contain exactly two paths");
                self.mark_parent_dir(&source);
                self.mark(
                    source.into_boxed_path(),
                    InvalidationFlags::PATH_AND_CHILDREN,
                );
                self.mark_parent_dir(&destination);
                self.mark_new_path(&destination);
                self.mark(
                    destination.into_boxed_path(),
                    InvalidationFlags::PATH_AND_CHILDREN,
                );
                true
            }
            // We expect `RenameMode::Both` to cover most of the cases we need to invalidate,
            // but we also check other RenameModes to cover cases where notify couldn't match the
            // two rename events.
            EventKind::Any | EventKind::Modify(ModifyKind::Any | ModifyKind::Name(..)) => {
                for path in paths {
                    self.mark_parent_dir(&path);
                    self.mark(
                        path.into_boxed_path(),
                        InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR,
                    );
                }
                true
            }
            EventKind::Modify(ModifyKind::Metadata(..) | ModifyKind::Other)
            | EventKind::Access(_)
            | EventKind::Other => {
                // ignored
                false
            }
        }
    }

    /// Drops the invalidation for every path in this batch whose contents are unchanged since the
    /// last batch that invalidated it, and returns how many were dropped.
    ///
    /// Only a path carrying exactly [`InvalidationFlags::PATH`] is eligible, which is what a
    /// content modification produces on its own. A create, removal, or rename also changes a
    /// directory listing and whether the path exists, and no amount of identical bytes makes those
    /// safe to skip, so such a path is forgotten instead: the bytes it held beforehand are never
    /// compared against the bytes it holds after. The exact-flag test is deliberately redundant
    /// with that forgetting, so that removing either one cannot quietly make a path eligible.
    ///
    /// A dropped path keeps its entry in the batch with no flags set, which leaves its readers
    /// registered in the invalidator map rather than consuming them, so the next real change to
    /// that path still reaches them.
    fn drop_unchanged_writes(&mut self, fingerprints: &mut ContentFingerprints) -> usize {
        const RECURSIVE: InvalidationFlags =
            InvalidationFlags::PATH_AND_CHILDREN.union(InvalidationFlags::PATH_AND_CHILDREN_DIR);

        for (path, flags) in &self.paths {
            if flags.intersects(RECURSIVE) {
                fingerprints.forget(path);
            }
        }

        let mut dropped = 0;
        for (path, flags) in &mut self.paths {
            if *flags == InvalidationFlags::PATH && fingerprints.is_unchanged(path) {
                *flags = InvalidationFlags::empty();
                dropped += 1;
            }
        }
        dropped
    }

    /// Performs all batched invalidations, calling `invalidate` once for each `(path, invalidator)`
    /// pair that needs to be invalidated, then clears the batch.
    ///
    /// In non-recursive watching mode, [`Self::new_paths`] must be processed (to (re-)establish
    /// watches) *before* calling this.
    ///
    /// For each path, a recursive invalidation subsumes an exact one, as
    /// [`extract_path_with_children`][OrderedPathMapExt::extract_path_with_children] removes the
    /// path itself in addition to its children.
    fn execute(
        &mut self,
        invalidator_map: &InvalidatorMap,
        dir_invalidator_map: &InvalidatorMap,
        invalidate: impl Fn(&Path, Invalidator),
    ) {
        for (map, exact_flag, recursive_flag) in [
            (
                invalidator_map,
                InvalidationFlags::PATH,
                InvalidationFlags::PATH_AND_CHILDREN,
            ),
            (
                dir_invalidator_map,
                InvalidationFlags::PATH_DIR,
                InvalidationFlags::PATH_AND_CHILDREN_DIR,
            ),
        ] {
            let mut map = map.lock().unwrap();
            for (path, flags) in &self.paths {
                if flags.contains(recursive_flag) {
                    for (_, invalidators) in map.extract_path_with_children(path) {
                        for invalidator in invalidators {
                            invalidate(path, invalidator);
                        }
                    }
                } else if flags.contains(exact_flag)
                    && let Some(invalidators) = map.remove(&**path)
                {
                    for invalidator in invalidators {
                        invalidate(path, invalidator);
                    }
                }
            }
        }
        self.clear();
    }
}

/// Size of the buffer [`ContentFingerprints`] streams a file through. Files are hashed
/// incrementally so a large one doesn't have to be held in memory all at once.
const FINGERPRINT_CHUNK_SIZE: usize = 64 * 1024;

/// What each path's contents hashed to when we last invalidated for it, so a write that restores
/// identical bytes can be recognized as one.
///
/// Only paths that a content-modification event has been seen for are recorded, so this grows with
/// the files edited during a session rather than with the files read by the build. It is owned by
/// the single watch thread, so it needs no synchronization.
struct ContentFingerprints {
    seen: FxHashMap<Box<Path>, u64>,
    /// Reused across files, so hashing a batch of changes doesn't allocate per file.
    buffer: Box<[u8]>,
}

impl ContentFingerprints {
    fn new() -> Self {
        Self {
            seen: FxHashMap::default(),
            buffer: vec![0; FINGERPRINT_CHUNK_SIZE].into_boxed_slice(),
        }
    }

    /// Hashes the length, permissions, and contents of `path`, or returns [`None`] if `path` is not
    /// a regular file or could not be read.
    fn fingerprint(&mut self, path: &Path) -> Option<u64> {
        // Regular files only. `read_link` registers symlinks in the same invalidator map and
        // resolves the link itself, so hashing what a link points at could hide a retarget; and a
        // directory's listing is not its bytes.
        let meta = std::fs::symlink_metadata(path).ok()?;
        if !meta.is_file() {
            return None;
        }

        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(meta.len());
        // `metadata()` tasks are registered in the same invalidator map, and fsevents reports some
        // content writes as `Metadata(Any)`, so permissions have to be part of the fingerprint or a
        // `chmod` could be mistaken for a write of identical bytes.
        FileMeta::from(meta).deterministic_hash(&mut hasher);

        let mut file = std::fs::File::open(path).ok()?;
        loop {
            match file.read(&mut self.buffer) {
                Ok(0) => return Some(hasher.finish()),
                Ok(read) => hasher.write_bytes(&self.buffer[..read]),
                Err(err) if err.kind() == ErrorKind::Interrupted => {}
                Err(_) => return None,
            }
        }
    }

    /// Records the current fingerprint of `path` and reports whether it matches the one recorded
    /// before.
    ///
    /// A path we have no fingerprint for, or cannot read, is always reported as changed. That is
    /// the safe direction: a missing fingerprint can only ever cost an invalidation we didn't
    /// need, and never skip one we did.
    fn is_unchanged(&mut self, path: &Path) -> bool {
        let Some(next) = self.fingerprint(path) else {
            self.seen.remove(path);
            return false;
        };
        if let Some(previous) = self.seen.get_mut(path) {
            return replace(previous, next) == next;
        }
        self.seen.insert(Box::from(path), next);
        false
    }

    /// Forgets `path` and everything beneath it, so bytes recorded before a path was created,
    /// removed, or renamed are never compared against bytes written after it.
    fn forget(&mut self, path: &Path) {
        self.seen.retain(|seen, _| !seen.starts_with(path));
    }
}

#[instrument(
    parent = None,
    level = "info",
    name = "file change",
    skip_all,
    fields(name = %invalidation_reason_path.display())
)]
fn invalidate(
    inner: &DiskFileSystemInner,
    turbo_tasks: &dyn TurboTasksApi,
    report_invalidation_reason: bool,
    invalidation_reason_path: &Path,
    invalidator: Invalidator,
) {
    if report_invalidation_reason
        && let Some(path) =
            format_absolute_fs_path(invalidation_reason_path, &inner.name, inner.root_path())
    {
        invalidator.invalidate_with_reason(turbo_tasks, WatchChange { path });
        return;
    }
    invalidator.invalidate(turbo_tasks);
}

/// Invalidation was caused by a watcher rescan event. This will likely invalidate *every* watched
/// file.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct InvalidateRescan {
    path: RcStr,
}

impl InvalidationReason for InvalidateRescan {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&INVALIDATE_RESCAN_KIND))
    }
}

impl fmt::Display for InvalidateRescan {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} in filesystem invalidated", self.path)
    }
}

/// [Invalidation kind][InvalidationReasonKind] for [`InvalidateRescan`].
#[derive(PartialEq, Eq, Hash)]
struct InvalidateRescanKind;

static INVALIDATE_RESCAN_KIND: InvalidateRescanKind = InvalidateRescanKind;

impl InvalidationReasonKind for InvalidateRescanKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut fmt::Formatter<'_>,
    ) -> fmt::Result {
        let first_reason: &dyn InvalidationReason = &*reasons[0];
        write!(
            f,
            "{} items in filesystem invalidated due to notify::Watcher rescan event ({}, ...)",
            reasons.len(),
            (first_reason as &dyn Any)
                .downcast_ref::<InvalidateRescan>()
                .unwrap()
                .path
        )
    }
}

#[cfg(test)]
mod tests {
    use notify::event::{CreateKind, DataChange, RemoveKind};
    use tempfile::TempDir;

    use super::*;

    const CONTENTS: &[u8] = b"export default function Page() { return null }";

    fn modified(path: &Path) -> notify::Event {
        notify::Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Any)))
            .add_path(path.to_path_buf())
    }

    /// The event a `chmod` produces, and the one fsevents also reports some content writes as.
    fn metadata_changed(path: &Path) -> notify::Event {
        notify::Event::new(EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)))
            .add_path(path.to_path_buf())
    }

    /// Runs a single watch batch containing `events`, returning how many invalidations were dropped
    /// and what invalidation is left for `path`.
    fn batch(
        fingerprints: &mut ContentFingerprints,
        events: impl IntoIterator<Item = notify::Event>,
        path: &Path,
    ) -> (usize, InvalidationFlags) {
        let mut batch = BatchedInvalidations::new(RecursiveMode::Recursive);
        for event in events {
            assert!(
                batch.add_event(event),
                "event should have entered the batch"
            );
        }
        let dropped = batch.drop_unchanged_writes(fingerprints);
        let remaining = batch
            .paths
            .get(path)
            .copied()
            .unwrap_or_else(InvalidationFlags::empty);
        (dropped, remaining)
    }

    /// A file with `CONTENTS` written to it, plus a fingerprint store that has already seen one
    /// write of it, which is the state a second save arrives in.
    fn fingerprinted_file() -> (TempDir, PathBuf, ContentFingerprints) {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("page.tsx");
        std::fs::write(&file, CONTENTS).unwrap();

        let mut fingerprints = ContentFingerprints::new();
        // The first write has nothing to be compared against, so it must still invalidate.
        let (dropped, remaining) = batch(&mut fingerprints, [modified(&file)], &file);
        assert_eq!(
            dropped, 0,
            "the first write cannot be recognized as a no-op"
        );
        assert_eq!(remaining, InvalidationFlags::PATH);

        (dir, file, fingerprints)
    }

    #[test]
    fn a_write_of_identical_bytes_is_skipped() {
        let (_dir, file, mut fingerprints) = fingerprinted_file();

        // Rewriting the same bytes moves the mtime, so the filesystem reports a change, but there
        // is nothing downstream to rebuild.
        std::fs::write(&file, CONTENTS).unwrap();
        let (dropped, remaining) = batch(&mut fingerprints, [modified(&file)], &file);
        assert_eq!(dropped, 1);
        assert!(
            remaining.is_empty(),
            "an unchanged file should have no invalidation left"
        );
    }

    #[test]
    fn a_write_that_changes_bytes_is_never_skipped() {
        let (_dir, file, mut fingerprints) = fingerprinted_file();

        std::fs::write(&file, b"export default function Page() { return <main /> }").unwrap();
        let (dropped, remaining) = batch(&mut fingerprints, [modified(&file)], &file);
        assert_eq!(dropped, 0);
        assert_eq!(remaining, InvalidationFlags::PATH);

        // And the new bytes become the baseline, so the file stays editable indefinitely rather
        // than being compared against whatever it held first.
        std::fs::write(&file, b"export default function Page() { return <main /> }").unwrap();
        let (dropped, _) = batch(&mut fingerprints, [modified(&file)], &file);
        assert_eq!(dropped, 1);
    }

    #[test]
    fn creates_and_removals_are_never_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("page.tsx");
        std::fs::write(&file, CONTENTS).unwrap();
        let mut fingerprints = ContentFingerprints::new();

        // These change a directory listing and a path's existence, which identical bytes say
        // nothing about, so they are ineligible however often they repeat.
        for _ in 0..2 {
            let event = notify::Event::new(EventKind::Create(CreateKind::File))
                .add_path(file.to_path_buf());
            let (dropped, remaining) = batch(&mut fingerprints, [event], &file);
            assert_eq!(dropped, 0);
            assert!(remaining.contains(InvalidationFlags::PATH_AND_CHILDREN));
        }
    }

    #[test]
    fn an_atomic_save_is_never_skipped() {
        let (_dir, file, mut fingerprints) = fingerprinted_file();

        // Editors that save by writing a temp file and renaming it over the target land a create
        // and a modification for the same path in one batch. The bytes may well be identical, but
        // the create still has a directory listing to invalidate, so the path is ineligible even
        // though it carries `PATH`.
        std::fs::write(&file, CONTENTS).unwrap();
        let create =
            notify::Event::new(EventKind::Create(CreateKind::File)).add_path(file.to_path_buf());
        let (dropped, remaining) = batch(&mut fingerprints, [modified(&file), create], &file);
        assert_eq!(dropped, 0);
        assert!(remaining.contains(InvalidationFlags::PATH));
        assert!(remaining.contains(InvalidationFlags::PATH_AND_CHILDREN));
    }

    #[test]
    fn bytes_from_before_a_removal_are_forgotten() {
        let (_dir, file, mut fingerprints) = fingerprinted_file();

        std::fs::remove_file(&file).unwrap();
        let removal =
            notify::Event::new(EventKind::Remove(RemoveKind::File)).add_path(file.to_path_buf());
        let (dropped, _) = batch(&mut fingerprints, [removal], &file);
        assert_eq!(dropped, 0);

        // Recreated with the same bytes it had before the removal. The path existed, stopped
        // existing, and exists again: everything that read it has to be told.
        std::fs::write(&file, CONTENTS).unwrap();
        let (dropped, remaining) = batch(&mut fingerprints, [modified(&file)], &file);
        assert_eq!(dropped, 0);
        assert_eq!(remaining, InvalidationFlags::PATH);
    }

    #[cfg(unix)]
    #[test]
    fn a_permission_change_is_never_skipped() {
        use std::os::unix::fs::PermissionsExt;

        let (_dir, file, mut fingerprints) = fingerprinted_file();

        // The bytes are untouched, but `FileMeta` is part of what a read of this path resolves to,
        // so a `metadata()` task would observe this.
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755)).unwrap();
        let (dropped, remaining) = batch(&mut fingerprints, [metadata_changed(&file)], &file);
        assert_eq!(dropped, 0);
        assert_eq!(remaining, InvalidationFlags::PATH);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_is_never_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("target.tsx");
        let link = dir.path().join("link.tsx");
        std::fs::write(&target, CONTENTS).unwrap();
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let mut fingerprints = ContentFingerprints::new();

        // `read_link` registers the link in the same invalidator map and resolves the link itself,
        // so a link retargeted between two files with identical contents must still invalidate.
        for _ in 0..2 {
            let (dropped, remaining) = batch(&mut fingerprints, [modified(&link)], &link);
            assert_eq!(dropped, 0);
            assert_eq!(remaining, InvalidationFlags::PATH);
        }
    }

    #[test]
    fn an_unreadable_path_is_never_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("deleted.tsx");
        let mut fingerprints = ContentFingerprints::new();

        for _ in 0..2 {
            let (dropped, remaining) = batch(&mut fingerprints, [modified(&missing)], &missing);
            assert_eq!(dropped, 0);
            assert_eq!(remaining, InvalidationFlags::PATH);
        }
    }
}
