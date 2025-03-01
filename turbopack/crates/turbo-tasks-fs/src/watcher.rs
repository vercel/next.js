use std::{
    mem::take,
    path::{Path, PathBuf},
    sync::{
        mpsc::{channel, Receiver, TryRecvError},
        Arc, Mutex,
    },
    time::Duration,
};

use anyhow::Result;
use notify::{
    event::{MetadataKind, ModifyKind, RenameMode},
    Config, EventKind, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher,
};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use turbo_tasks::{spawn_thread, Invalidator};

use crate::{
    format_absolute_fs_path,
    invalidation::{WatchChange, WatchStart},
    invalidator_map::WriteContent,
    path_to_key, DiskFileSystemInner,
};

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

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct DiskWatcher {
    #[serde(skip)]
    watcher: Mutex<Option<DiskWatcherInternal>>,

    /// Array of paths that should not notify invalidations.
    /// `notify` currently doesn't support unwatching subpaths from the root,
    /// so underlying we still watches filesystem event but only skips to
    /// invalidate.
    ignored_subpaths: Vec<PathBuf>,

    /// Keeps track of which directories are currently watched. This is only
    /// used on OSs that doesn't support recursive watching.
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    #[serde(skip)]
    watching: dashmap::DashSet<PathBuf>,
}

impl DiskWatcher {
    pub(crate) fn new(ignored_subpaths: Vec<PathBuf>) -> Self {
        Self {
            ignored_subpaths,
            ..Default::default()
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    pub(crate) fn restore_if_watching(&self, dir_path: &Path, root_path: &Path) -> Result<()> {
        if self.watching.contains(dir_path) {
            let mut watcher = self.watcher.lock().unwrap();
            self.start_watching_dir(&mut watcher, dir_path, root_path)?;
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    pub(crate) fn ensure_watching(&self, dir_path: &Path, root_path: &Path) -> Result<()> {
        if self.watching.contains(dir_path) {
            return Ok(());
        }
        let mut watcher = self.watcher.lock().unwrap();
        if self.watching.insert(dir_path.to_path_buf()) {
            self.start_watching_dir(&mut watcher, dir_path, root_path)?;
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    fn start_watching_dir(
        &self,
        watcher: &mut std::sync::MutexGuard<Option<DiskWatcherInternal>>,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        use anyhow::Context;

        if let Some(watcher) = watcher.as_mut() {
            let mut path = dir_path;
            while let Err(err) = watcher.watch(path, RecursiveMode::NonRecursive) {
                if path == root_path {
                    return Err(err).context(format!(
                        "Unable to watch {} (tried up to {})",
                        dir_path.display(),
                        path.display()
                    ));
                }
                let Some(parent_path) = path.parent() else {
                    return Err(err).context(format!(
                        "Unable to watch {} (tried up to {})",
                        dir_path.display(),
                        path.display()
                    ));
                };
                path = parent_path;
            }
        }
        Ok(())
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
        inner: Arc<DiskFileSystemInner>,
        report_invalidation_reason: bool,
        poll_interval: Option<Duration>,
    ) -> Result<()> {
        let mut watcher_guard = self.watcher.lock().unwrap();
        if watcher_guard.is_some() {
            return Ok(());
        }

        // Create a channel to receive the events.
        let (tx, rx) = channel();
        // Create a watcher object, delivering debounced events.
        // The notification back-end is selected based on the platform.
        let config = Config::default();

        let mut watcher = if let Some(poll_interval) = poll_interval {
            let config = config.with_poll_interval(poll_interval);

            DiskWatcherInternal::Polling(PollWatcher::new(tx, config)?)
        } else {
            DiskWatcherInternal::Recommended(RecommendedWatcher::new(tx, Config::default())?)
        };

        // Add a path to be watched. All files and directories at that path and
        // below will be monitored for changes.
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            watcher.watch(inner.root_path(), RecursiveMode::Recursive)?;
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        for dir_path in self.watching.iter() {
            watcher.watch(&dir_path, RecursiveMode::NonRecursive)?;
        }

        // We need to invalidate all reads that happened before watching
        // Best is to start_watching before starting to read
        {
            let _span = tracing::info_span!("invalidate filesystem").entered();
            let span = tracing::Span::current();
            let invalidator_map = take(&mut *inner.invalidator_map.lock().unwrap());
            let dir_invalidator_map = take(&mut *inner.dir_invalidator_map.lock().unwrap());
            let iter = invalidator_map
                .into_par_iter()
                .chain(dir_invalidator_map.into_par_iter());
            let handle = tokio::runtime::Handle::current();
            if report_invalidation_reason {
                iter.flat_map(|(path, invalidators)| {
                    let _span = span.clone().entered();
                    let reason = WatchStart {
                        name: inner.name.clone(),
                        path: path.into(),
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

        watcher_guard.replace(watcher);
        drop(watcher_guard);

        spawn_thread(move || {
            inner
                .clone()
                .watcher
                .watch_thread(rx, inner, report_invalidation_reason)
        });

        Ok(())
    }

    pub(crate) fn stop_watching(&self) {
        if let Some(watcher) = self.watcher.lock().unwrap().take() {
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

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let mut batched_new_paths = FxHashSet::default();

        'outer: loop {
            let mut event = rx.recv().or(Err(TryRecvError::Disconnected));
            loop {
                match event {
                    Ok(Ok(notify::Event { kind, paths, .. })) => {
                        let paths: Vec<PathBuf> = paths
                            .iter()
                            .filter(|p| {
                                !self
                                    .ignored_subpaths
                                    .iter()
                                    .any(|ignored| p.starts_with(ignored))
                            })
                            .cloned()
                            .collect();

                        if paths.is_empty() {
                            return;
                        }

                        // [NOTE] there is attrs in the `Event` struct, which contains few
                        // more metadata like process_id who triggered the event,
                        // or the source we may able to utilize later.
                        match kind {
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
                                batched_invalidate_path.extend(paths.clone());
                            }
                            EventKind::Create(_) => {
                                batched_invalidate_path_and_children.extend(paths.clone());
                                batched_invalidate_path_and_children_dir.extend(paths.clone());
                                paths.iter().for_each(|path| {
                                    if let Some(parent) = path.parent() {
                                        batched_invalidate_path_dir.insert(PathBuf::from(parent));
                                    }
                                });

                                #[cfg(not(any(target_os = "macos", target_os = "windows")))]
                                batched_new_paths.extend(paths.clone());
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
                                    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
                                    batched_new_paths.insert(destination.clone());
                                } else {
                                    // If we hit here, we expect this as a bug either in
                                    // notify or system weirdness.
                                    panic!(
                                        "Rename event does not contain source and destination \
                                         paths {:#?}",
                                        paths
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
                        println!("watch error ({:?}): {:?} ", paths, kind);

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
                                event = Ok(result);
                                continue;
                            }
                            Err(_) => break,
                        }
                    }
                }
                event = rx.try_recv();
            }

            // We need to start watching first before invalidating the changed paths
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            {
                for path in batched_new_paths.drain() {
                    let _ = self.restore_if_watching(&path, inner.root_path());
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
    if report_invalidation_reason {
        if let Some(path) = format_absolute_fs_path(path, &inner.name, inner.root_path()) {
            invalidator.invalidate_with_reason(WatchChange { path });
            return;
        }
    }
    invalidator.invalidate();
}

fn invalidate_path(
    inner: &DiskFileSystemInner,
    report_invalidation_reason: bool,
    invalidator_map: &mut FxHashMap<String, FxHashMap<Invalidator, Option<WriteContent>>>,
    paths: impl Iterator<Item = PathBuf>,
) {
    for path in paths {
        let key = path_to_key(&path);
        if let Some(invalidators) = invalidator_map.remove(&key) {
            invalidators
                .into_iter()
                .for_each(|(i, _)| invalidate(inner, report_invalidation_reason, &path, i));
        }
    }
}

fn invalidate_path_and_children_execute(
    inner: &DiskFileSystemInner,
    report_invalidation_reason: bool,
    invalidator_map: &mut FxHashMap<String, FxHashMap<Invalidator, Option<WriteContent>>>,
    paths: impl Iterator<Item = PathBuf>,
) {
    for path in paths {
        let path_key = path_to_key(&path);
        for (_, invalidators) in invalidator_map.extract_if(|key, _| key.starts_with(&path_key)) {
            invalidators
                .into_iter()
                .for_each(|(i, _)| invalidate(inner, report_invalidation_reason, &path, i));
        }
    }
}
