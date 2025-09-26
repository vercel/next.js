use std::{
    any::Any,
    collections::BTreeSet,
    env, fmt,
    mem::take,
    path::{Path, PathBuf},
    sync::{
        Arc, LazyLock, RwLock, RwLockWriteGuard,
        mpsc::{Receiver, TryRecvError, channel},
    },
    time::Duration,
};

use anyhow::{Context, Result};
use notify::{
    Config, EventKind, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher,
    event::{MetadataKind, ModifyKind, RenameMode},
};
use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, InvalidationReason, InvalidationReasonKind, Invalidator, parallel, spawn_thread,
    util::StaticOrArc,
};

use crate::{
    DiskFileSystemInner, format_absolute_fs_path,
    invalidation::{WatchChange, WatchStart},
    invalidator_map::LockedInvalidatorMap,
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

#[derive(Serialize, Deserialize)]
pub(crate) struct DiskWatcher {
    #[serde(skip, default = "State::new_stopped")]
    state: State,
}

enum State {
    // Note: Information about if we're a recursive or non-recursive watcher must live outside the
    // `RwLock` to allow us to quickly bail out on calls to `ensure_watched`.
    Recursive(RwLock<RecursiveState>),
    NonRecursive(RwLock<NonRecursiveState>),
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

    fn write(&self) -> StateWriteGuard<'_> {
        match self {
            Self::Recursive(state) => StateWriteGuard::Recursive(state.write().unwrap()),
            Self::NonRecursive(state) => StateWriteGuard::NonRecursive(state.write().unwrap()),
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
    pub fn restore_all_watched_ignore_errors(state: &RwLock<NonRecursiveState>, root_path: &Path) {
        let mut guard = state.write().unwrap();
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
    pub fn restore_if_watched(
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
            let guard = state.read().unwrap();
            let NonRecursiveState::Watching(watching_state) = &*guard else {
                return Ok(());
            };
            if !watching_state.watched.contains(dir_path) {
                return Ok(());
            }
        }

        // slow path: re-watch the path
        let mut guard = state.write().unwrap();
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
    pub fn ensure_watched(
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
            let guard = state.read().unwrap();
            let NonRecursiveState::Watching(watching_state) = &*guard else {
                return Ok(());
            };
            if watching_state.watched.contains(dir_path) {
                return Ok(());
            }
        }

        // slow path: watch the path
        let mut guard = state.write().unwrap();
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
    pub fn start_watching(
        &self,
        fs_inner: Arc<DiskFileSystemInner>,
        report_invalidation_reason: bool,
        poll_interval: Option<Duration>,
    ) -> Result<()> {
        let state_guard = self.state.write();

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
        config.with_follow_symlinks(false);

        let mut notify_watcher = if let Some(poll_interval) = poll_interval {
            let config = config.with_poll_interval(poll_interval);
            NotifyWatcher::Polling(PollWatcher::new(tx, config)?)
        } else {
            NotifyWatcher::Recommended(RecommendedWatcher::new(tx, Config::default())?)
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
        {
            let _span = tracing::info_span!("invalidate filesystem").entered();
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
                parallel::for_each_owned(invalidators, |(reason, (invalidator, _))| {
                    invalidator.invalidate_with_reason(reason);
                });
            } else {
                let invalidators = iter
                    .flat_map(|(_, invalidators)| invalidators.into_keys())
                    .collect::<Vec<_>>();
                parallel::for_each_owned(invalidators, |invalidator| {
                    invalidator.invalidate();
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

    pub fn stop_watching(&self) {
        match &self.state {
            State::Recursive(state) => *state.write().unwrap() = RecursiveState::Stopped,
            State::NonRecursive(state) => *state.write().unwrap() = NonRecursiveState::Stopped,
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
        let mut batched_invalidate_path = FxHashSet::default();
        let mut batched_invalidate_path_dir = FxHashSet::default();
        let mut batched_invalidate_path_and_children = FxHashSet::default();
        let mut batched_invalidate_path_and_children_dir = FxHashSet::default();

        let mut batched_new_paths = if let State::NonRecursive(_) = self.state {
            Some(FxHashSet::default())
        } else {
            None
        };

        'outer: loop {
            let mut event_result = rx.recv().or(Err(TryRecvError::Disconnected));
            // this inner loop batches events using `try_recv`
            loop {
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

                            if let State::NonRecursive(non_recursive) = &self.state {
                                // we can't narrow this down to a smaller set of paths: Rescan
                                // events (at least when tested on Linux) come with no `paths`, and
                                // we use only one global `notify::Watcher` instance.
                                //
                                // TODO: Report diagnostics if an error happens
                                non_recursive_helpers::restore_all_watched_ignore_errors(
                                    non_recursive,
                                    fs_inner.root_path(),
                                );
                                if let Some(batched_new_paths) = &mut batched_new_paths {
                                    batched_new_paths.clear();
                                }
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
                            batched_invalidate_path.clear();
                            batched_invalidate_path_dir.clear();
                            batched_invalidate_path_and_children.clear();
                            batched_invalidate_path_and_children_dir.clear();

                            break;
                        }

                        let paths: Vec<PathBuf> = event.paths;
                        if paths.is_empty() {
                            // this event isn't useful, but keep trying to process the batch
                            event_result = rx.try_recv();
                            continue;
                        }

                        // [NOTE] there is attrs in the `Event` struct, which contains few
                        // more metadata like process_id who triggered the event,
                        // or the source we may able to utilize later.
                        match event.kind {
                            // [NOTE] Observing `ModifyKind::Metadata(MetadataKind::Any)` is
                            // not a mistake, fix for PACK-2437.
                            // In here explicitly subscribes to the `ModifyKind::Data` which
                            // indicates file content changes - in case of fsevents backend,
                            // this is `kFSEventStreamEventFlagItemModified`.
                            // Also meanwhile we subscribe to ModifyKind::Metadata as well.
                            // This is due to in some cases fsevents does not emit explicit
                            // kFSEventStreamEventFlagItemModified kernel events,
                            // but only emits kFSEventStreamEventFlagItemInodeMetaMod. While
                            // this could cause redundant invalidation,
                            // it's the way to reliably detect file content changes.
                            // ref other implementation, i.e libuv does same thing to
                            // trigger UV_CHANEGS https://github.com/libuv/libuv/commit/73cf3600d75a5884b890a1a94048b8f3f9c66876#diff-e12fdb1f404f1c97bbdcc0956ac90d7db0d811d9fa9ca83a3deef90c937a486cR95-R99
                            EventKind::Modify(
                                ModifyKind::Data(_) | ModifyKind::Metadata(MetadataKind::Any),
                            ) => {
                                batched_invalidate_path.extend(paths);
                            }
                            EventKind::Create(_) => {
                                batched_invalidate_path_and_children.extend(paths.clone());
                                batched_invalidate_path_and_children_dir.extend(paths.clone());
                                paths.iter().for_each(|path| {
                                    if let Some(parent) = path.parent() {
                                        batched_invalidate_path_dir.insert(PathBuf::from(parent));
                                    }
                                });

                                if let Some(batched_new_paths) = &mut batched_new_paths {
                                    batched_new_paths.extend(paths.clone());
                                }
                            }
                            EventKind::Remove(_) => {
                                batched_invalidate_path_and_children.extend(paths.clone());
                                batched_invalidate_path_and_children_dir.extend(paths.clone());
                                paths.iter().for_each(|path| {
                                    if let Some(parent) = path.parent() {
                                        batched_invalidate_path_dir.insert(PathBuf::from(parent));
                                    }
                                });
                            }
                            // A single event emitted with both the `From` and `To` paths.
                            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                                // For the rename::both, notify provides an array of paths
                                // in given order
                                if let [source, destination, ..] = &paths[..] {
                                    batched_invalidate_path_and_children.insert(source.clone());
                                    if let Some(parent) = source.parent() {
                                        batched_invalidate_path_dir.insert(PathBuf::from(parent));
                                    }
                                    batched_invalidate_path_and_children
                                        .insert(destination.clone());
                                    if let Some(parent) = destination.parent() {
                                        batched_invalidate_path_dir.insert(PathBuf::from(parent));
                                    }
                                    if let Some(batched_new_paths) = &mut batched_new_paths {
                                        batched_new_paths.insert(destination.clone());
                                    }
                                } else {
                                    // If we hit here, we expect this as a bug either in
                                    // notify or system weirdness.
                                    panic!(
                                        "Rename event does not contain source and destination \
                                         paths {paths:#?}"
                                    );
                                }
                            }
                            // We expect `RenameMode::Both` to cover most of the cases we
                            // need to invalidate,
                            // but we also check other RenameModes
                            // to cover cases where notify couldn't match the two rename
                            // events.
                            EventKind::Any
                            | EventKind::Modify(ModifyKind::Any | ModifyKind::Name(..)) => {
                                batched_invalidate_path.extend(paths.clone());
                                batched_invalidate_path_and_children.extend(paths.clone());
                                batched_invalidate_path_and_children_dir.extend(paths.clone());
                                for parent in paths.iter().filter_map(|path| path.parent()) {
                                    batched_invalidate_path_dir.insert(PathBuf::from(parent));
                                }
                            }
                            EventKind::Modify(ModifyKind::Metadata(..) | ModifyKind::Other)
                            | EventKind::Access(_)
                            | EventKind::Other => {
                                // ignored
                            }
                        }
                    }
                    // Error raised by notify watcher itself
                    Ok(Err(notify::Error { kind, paths })) => {
                        println!("watch error ({paths:?}): {kind:?} ");

                        if paths.is_empty() {
                            batched_invalidate_path_and_children
                                .insert(fs_inner.root_path().to_path_buf());
                            batched_invalidate_path_and_children_dir
                                .insert(fs_inner.root_path().to_path_buf());
                        } else {
                            batched_invalidate_path_and_children.extend(paths.clone());
                            batched_invalidate_path_and_children_dir.extend(paths.clone());
                        }
                    }
                    Err(TryRecvError::Disconnected) => {
                        // Sender has been disconnected
                        // which means DiskFileSystem has been dropped
                        // exit thread
                        break 'outer;
                    }
                    Err(TryRecvError::Empty) => {
                        // Linux watching is too fast, so we need to throttle it a bit to avoid
                        // reading wip files
                        #[cfg(target_os = "linux")]
                        let delay = Duration::from_millis(10);
                        #[cfg(not(target_os = "linux"))]
                        let delay = Duration::from_millis(1);
                        match rx.recv_timeout(delay) {
                            Ok(result) => {
                                event_result = Ok(result);
                                continue;
                            }
                            Err(_) => break,
                        }
                    }
                }
                event_result = rx.try_recv();
            }

            // We need to start watching first before invalidating the changed paths...
            // This is only needed on platforms we don't do recursive watching on.
            if let State::NonRecursive(non_recursive) = &self.state {
                for path in batched_new_paths.as_mut().unwrap().drain() {
                    // TODO: Report diagnostics if this error happens
                    let _ = non_recursive_helpers::restore_if_watched(
                        non_recursive,
                        &path,
                        fs_inner.root_path(),
                    );
                }
            }

            let _lock = fs_inner.invalidation_lock.blocking_write();
            {
                let mut invalidator_map = fs_inner.invalidator_map.lock().unwrap();
                invalidate_path(
                    &fs_inner,
                    report_invalidation_reason,
                    &mut invalidator_map,
                    batched_invalidate_path.drain(),
                );
                invalidate_path_and_children_execute(
                    &fs_inner,
                    report_invalidation_reason,
                    &mut invalidator_map,
                    batched_invalidate_path_and_children.drain(),
                );
            }
            {
                let mut dir_invalidator_map = fs_inner.dir_invalidator_map.lock().unwrap();
                invalidate_path(
                    &fs_inner,
                    report_invalidation_reason,
                    &mut dir_invalidator_map,
                    batched_invalidate_path_dir.drain(),
                );
                invalidate_path_and_children_execute(
                    &fs_inner,
                    report_invalidation_reason,
                    &mut dir_invalidator_map,
                    batched_invalidate_path_and_children_dir.drain(),
                );
            }
        }
    }

    pub fn ensure_watched_file(&self, path: &Path, root_path: &Path) -> Result<()> {
        // Watch the parent directory instead of the specified file, since directories also track
        // their immediate children (even in non-recursive mode), and we need to watch all the
        // parents anyways.
        if let State::NonRecursive(non_recursive) = &self.state
            && let Some(dir_path) = path.parent()
        {
            non_recursive_helpers::ensure_watched(non_recursive, dir_path, root_path)?;
        }
        Ok(())
    }

    pub fn ensure_watched_dir(&self, dir_path: &Path, root_path: &Path) -> Result<()> {
        if let State::NonRecursive(non_recursive) = &self.state {
            non_recursive_helpers::ensure_watched(non_recursive, dir_path, root_path)?;
        }
        Ok(())
    }
}

#[instrument(
    parent = None,
    level = "info",
    name = "file change",
    skip_all,
    fields(name = %path.display())
)]
fn invalidate(
    inner: &DiskFileSystemInner,
    report_invalidation_reason: bool,
    path: &Path,
    invalidator: Invalidator,
) {
    if report_invalidation_reason
        && let Some(path) = format_absolute_fs_path(path, &inner.name, inner.root_path())
    {
        invalidator.invalidate_with_reason(WatchChange { path });
        return;
    }
    invalidator.invalidate();
}

fn invalidate_path(
    inner: &DiskFileSystemInner,
    report_invalidation_reason: bool,
    invalidator_map: &mut LockedInvalidatorMap,
    paths: impl Iterator<Item = PathBuf>,
) {
    for path in paths {
        if let Some(invalidators) = invalidator_map.remove(&path) {
            invalidators
                .into_iter()
                .for_each(|(i, _)| invalidate(inner, report_invalidation_reason, &path, i));
        }
    }
}

fn invalidate_path_and_children_execute(
    inner: &DiskFileSystemInner,
    report_invalidation_reason: bool,
    invalidator_map: &mut LockedInvalidatorMap,
    paths: impl Iterator<Item = PathBuf>,
) {
    for path in paths {
        for (_, invalidators) in invalidator_map.extract_path_with_children(&path) {
            invalidators
                .into_iter()
                .for_each(|(i, _)| invalidate(inner, report_invalidation_reason, &path, i));
        }
    }
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
