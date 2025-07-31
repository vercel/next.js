use std::{
    any::Any,
    env, fmt,
    mem::take,
    path::{Path, PathBuf},
    sync::{
        Arc, LazyLock, Mutex, MutexGuard,
        mpsc::{Receiver, TryRecvError, channel},
    },
    time::Duration,
};

use anyhow::{Context, Result, anyhow};
use dashmap::DashSet;
use notify::{
    Config, EventKind, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher,
    event::{MetadataKind, ModifyKind, RenameMode},
};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, InvalidationReason, InvalidationReasonKind, Invalidator, spawn_thread,
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

/// A thin wrapper around [`RecommendedWatcher`] and [`PollWatcher`].
enum DiskWatcherInternal {
    Recommended(RecommendedWatcher),
    Polling(PollWatcher),
}

impl DiskWatcherInternal {
    fn watch(&mut self, path: &Path, recursive_mode: RecursiveMode) -> notify::Result<()> {
        match self {
            DiskWatcherInternal::Recommended(watcher) => watcher.watch(path, recursive_mode),
            DiskWatcherInternal::Polling(watcher) => watcher.watch(path, recursive_mode),
        }
    }
}

#[derive(Serialize, Deserialize)]
pub(crate) struct DiskWatcher {
    #[serde(skip)]
    internal: Mutex<Option<DiskWatcherInternal>>,

    #[serde(skip, default = "NonRecursiveDiskWatcherState::try_new")]
    pub(crate) non_recursive_state: Option<NonRecursiveDiskWatcherState>,
}

impl Default for DiskWatcher {
    fn default() -> Self {
        Self {
            internal: Mutex::new(None),
            non_recursive_state: NonRecursiveDiskWatcherState::try_new(),
        }
    }
}

/// Extra state used by [`DiskWatcher`] when [`WATCH_RECURSIVE_MODE`] is
/// [`RecursiveMode::NonRecursive`] (default on Linux).
pub(crate) struct NonRecursiveDiskWatcherState {
    /// Keeps track of which directories are currently (or were previously) watched.
    ///
    /// Invariants:
    /// - Never contains `root_path`. A watcher for `root_path` is implicitly set up during
    ///   [`DiskWatcher::start_watching`].
    /// - Contains all parent directories up to `root_path` for every entry.
    watching: DashSet<PathBuf>,
}

impl NonRecursiveDiskWatcherState {
    fn try_new() -> Option<NonRecursiveDiskWatcherState> {
        match *WATCH_RECURSIVE_MODE {
            RecursiveMode::Recursive => None,
            RecursiveMode::NonRecursive => Some(NonRecursiveDiskWatcherState {
                watching: DashSet::new(),
            }),
        }
    }

    /// Called after a rescan in case a previously watched-but-deleted directory was recreated.
    pub(crate) fn restore_all_watching(&self, watcher: &DiskWatcher, root_path: &Path) {
        let mut internal = watcher.internal.lock().unwrap();
        for dir_path in self.watching.iter() {
            // TODO: Report diagnostics if this error happens
            let _ = self.start_watching_dir(&mut internal, &dir_path, root_path);
        }
    }

    /// Called when a new directory is found in a parent directory we're watching. Restores the
    /// watcher if we were previously watching it.
    pub(crate) fn restore_if_watching(
        &self,
        watcher: &DiskWatcher,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        if dir_path == root_path || !self.watching.contains(dir_path) {
            return Ok(());
        }
        let mut internal = watcher.internal.lock().unwrap();
        // TODO: Also restore any watchers for children of this directory
        self.start_watching_dir(&mut internal, dir_path, root_path)
    }

    /// Called when a file in `dir_path` or `dir_path` itself is read or written. Adds a new watcher
    /// if we're not already watching the directory.
    pub(crate) fn ensure_watching(
        &self,
        watcher: &DiskWatcher,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        if dir_path == root_path || self.watching.contains(dir_path) {
            return Ok(());
        }
        let mut internal = watcher.internal.lock().unwrap();
        if self.watching.insert(dir_path.to_path_buf()) {
            self.start_watching_dir(&mut internal, dir_path, root_path)?;
        }
        Ok(())
    }

    /// Private helper, assumes that the path has already been added to `self.watching`.
    fn start_watching_dir(
        &self,
        watcher_internal_guard: &mut MutexGuard<Option<DiskWatcherInternal>>,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        debug_assert_ne!(dir_path, root_path);
        let Some(watcher_internal_guard) = watcher_internal_guard.as_mut() else {
            return Ok(());
        };

        let mut path = dir_path;
        let err_with_context = |err: anyhow::Error| {
            return Err(err).context(format!(
                "Unable to watch {} (tried up to {})",
                dir_path.display(),
                path.display()
            ));
        };

        // watch every parent: https://docs.rs/notify/latest/notify/#parent-folder-deletion
        loop {
            match watcher_internal_guard.watch(path, RecursiveMode::NonRecursive) {
                res @ Ok(())
                | res @ Err(notify::Error {
                    // The path was probably deleted before we could process the event. That's
                    // okay, just make sure we're watching the parent directory, so we can know
                    // if it gets recreated.
                    kind: notify::ErrorKind::PathNotFound,
                    ..
                }) => {
                    let Some(parent_path) = path.parent() else {
                        // this should never happen as we break before we reach the root path
                        return err_with_context(res.err().map_or_else(
                            || anyhow!("failed to compute parent path"),
                            |err| err.into(),
                        ));
                    };
                    if parent_path == root_path || !self.watching.insert(parent_path.to_path_buf())
                    {
                        break;
                    }
                    path = parent_path;
                }
                Err(err) => return err_with_context(err.into()),
            }
        }

        Ok(())
    }
}

impl DiskWatcher {
    pub(crate) fn new() -> Self {
        Default::default()
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
    pub(crate) fn start_watching(
        &self,
        fs_inner: Arc<DiskFileSystemInner>,
        report_invalidation_reason: bool,
        poll_interval: Option<Duration>,
    ) -> Result<()> {
        let mut internal_guard = self.internal.lock().unwrap();
        if internal_guard.is_some() {
            return Ok(());
        }

        // Create a channel to receive the events.
        let (tx, rx) = channel();
        // Create a watcher object, delivering debounced events.
        // The notification back-end is selected based on the platform.
        let config = Config::default();
        // we should track and invalidate each part of a symlink chain ourselves in turbo-tasks-fs
        config.with_follow_symlinks(false);

        let mut internal = if let Some(poll_interval) = poll_interval {
            let config = config.with_poll_interval(poll_interval);

            DiskWatcherInternal::Polling(PollWatcher::new(tx, config)?)
        } else {
            DiskWatcherInternal::Recommended(RecommendedWatcher::new(tx, Config::default())?)
        };

        if let Some(non_recursive) = &self.non_recursive_state {
            internal.watch(fs_inner.root_path(), RecursiveMode::NonRecursive)?;
            for dir_path in non_recursive.watching.iter() {
                internal.watch(&dir_path, RecursiveMode::NonRecursive)?;
            }
        } else {
            internal.watch(fs_inner.root_path(), RecursiveMode::Recursive)?;
        }

        // We need to invalidate all reads that happened before watching
        // Best is to start_watching before starting to read
        {
            let span = tracing::info_span!("invalidate filesystem");
            let _span = span.clone().entered();
            let invalidator_map = take(&mut *fs_inner.invalidator_map.lock().unwrap());
            let dir_invalidator_map = take(&mut *fs_inner.dir_invalidator_map.lock().unwrap());
            let iter = invalidator_map
                .into_par_iter()
                .chain(dir_invalidator_map.into_par_iter());
            let handle = tokio::runtime::Handle::current();
            if report_invalidation_reason {
                iter.flat_map(|(path, invalidators)| {
                    let _span = span.clone().entered();
                    let reason = WatchStart {
                        name: fs_inner.name.clone(),
                        // this path is just used for display purposes
                        path: RcStr::from(path.to_string_lossy()),
                    };
                    invalidators
                        .into_par_iter()
                        .map(move |i| (reason.clone(), i))
                })
                .for_each(|(reason, (invalidator, _))| {
                    let _span = span.clone().entered();
                    let _guard = handle.enter();
                    invalidator.invalidate_with_reason(reason)
                });
            } else {
                iter.flat_map(|(_, invalidators)| {
                    let _span = span.clone().entered();
                    invalidators.into_par_iter().map(move |i| i)
                })
                .for_each(|(invalidator, _)| {
                    let _span = span.clone().entered();
                    let _guard = handle.enter();
                    invalidator.invalidate()
                });
            }
        }

        internal_guard.replace(internal);
        drop(internal_guard);

        spawn_thread(move || {
            fs_inner
                .clone()
                .watcher
                .watch_thread(rx, fs_inner, report_invalidation_reason)
        });

        Ok(())
    }

    pub(crate) fn stop_watching(&self) {
        if let Some(watcher) = self.internal.lock().unwrap().take() {
            drop(watcher);
            // thread will detect the stop because the channel is disconnected
        }
    }

    /// Internal thread that processes the events from the watcher
    /// and invalidates the cache.
    ///
    /// Should only be called once from `start_watching`.
    fn watch_thread(
        &self,
        rx: Receiver<notify::Result<notify::Event>>,
        inner: Arc<DiskFileSystemInner>,
        report_invalidation_reason: bool,
    ) {
        let mut batched_invalidate_path = FxHashSet::default();
        let mut batched_invalidate_path_dir = FxHashSet::default();
        let mut batched_invalidate_path_and_children = FxHashSet::default();
        let mut batched_invalidate_path_and_children_dir = FxHashSet::default();

        let mut batched_new_paths = if self.non_recursive_state.is_some() {
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
                            let _lock = inner.invalidation_lock.blocking_write();

                            if let Some(non_recursive) = &self.non_recursive_state {
                                // we can't narrow this down to a smaller set of paths: Rescan
                                // events (at least when tested on Linux) come with no `paths`, and
                                // we use only one global `notify::Watcher` instance.
                                non_recursive.restore_all_watching(self, inner.root_path());
                                if let Some(batched_new_paths) = &mut batched_new_paths {
                                    batched_new_paths.clear();
                                }
                            }

                            if report_invalidation_reason {
                                inner.invalidate_with_reason(|path| InvalidateRescan {
                                    // this path is just used for display purposes
                                    path: RcStr::from(path.to_string_lossy()),
                                });
                            } else {
                                inner.invalidate();
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
                                .insert(inner.root_path().to_path_buf());
                            batched_invalidate_path_and_children_dir
                                .insert(inner.root_path().to_path_buf());
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
            if let Some(non_recursive) = &self.non_recursive_state {
                for path in batched_new_paths.as_mut().unwrap().drain() {
                    // TODO: Report diagnostics if this error happens
                    let _ = non_recursive.restore_if_watching(self, &path, inner.root_path());
                }
            }

            let _lock = inner.invalidation_lock.blocking_write();
            {
                let mut invalidator_map = inner.invalidator_map.lock().unwrap();
                invalidate_path(
                    &inner,
                    report_invalidation_reason,
                    &mut invalidator_map,
                    batched_invalidate_path.drain(),
                );
                invalidate_path_and_children_execute(
                    &inner,
                    report_invalidation_reason,
                    &mut invalidator_map,
                    batched_invalidate_path_and_children.drain(),
                );
            }
            {
                let mut dir_invalidator_map = inner.dir_invalidator_map.lock().unwrap();
                invalidate_path(
                    &inner,
                    report_invalidation_reason,
                    &mut dir_invalidator_map,
                    batched_invalidate_path_dir.drain(),
                );
                invalidate_path_and_children_execute(
                    &inner,
                    report_invalidation_reason,
                    &mut dir_invalidator_map,
                    batched_invalidate_path_and_children_dir.drain(),
                );
            }
        }
    }
}

#[instrument(parent = None, level = "info", name = "DiskFileSystem file change", skip_all, fields(name = display(path.display())))]
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
