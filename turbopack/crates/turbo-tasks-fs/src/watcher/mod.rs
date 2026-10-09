mod batch_schedule;
mod fs_api;
#[cfg(test)]
mod mock_fs_api;

use std::{
    any::Any,
    borrow::Cow,
    cell::LazyCell,
    collections::BTreeSet,
    env, fmt,
    path::{Path, PathBuf},
    sync::{
        Arc, LazyLock,
        mpsc::{Receiver, RecvTimeoutError, channel},
    },
    time::Duration,
};

use anyhow::{Context, Result};
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use bitflags::bitflags;
use indexmap::map::{RawEntryApiV1, raw_entry_v1::RawEntryMut};
use notify::{
    Config, EventKind, PollWatcher, RecommendedWatcher, Watcher,
    event::{MetadataKind, ModifyKind, RenameMode},
};
use tokio::sync::{RwLock, RwLockWriteGuard};
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, InvalidationReason, InvalidationReasonKind, Invalidator, ResolvedVc,
    TraitRef, TurboTasksApi, spawn_thread, util::StaticOrArc,
};

use crate::{
    format_absolute_fs_path,
    invalidation::{WatchChange, WatchStart},
    invalidator_map::InvalidatorMap,
    path_map::OrderedPathMapExt,
    watcher::{batch_schedule::BatchSchedule, fs_api::DiskFileSystemWatcherApi},
};

/// Overrides [`DiskWatcherConfig::recursive_mode`]. Users shouldn't need to set this, this is
/// intended only for debugging purposes.
static FORCED_WATCH_RECURSIVE_MODE: LazyLock<Option<DiskWatcherRecursiveMode>> = LazyLock::new(
    || match env::var("TURBO_TASKS_FORCE_WATCH_MODE").as_deref() {
        Ok("recursive") => Some(DiskWatcherRecursiveMode::Recursive),
        Ok("nonrecursive") => Some(DiskWatcherRecursiveMode::NonRecursive),
        Ok(_) => {
            eprintln!(
                "unsupported `TURBO_TASKS_FORCE_WATCH_MODE`, must be `recursive` or `nonrecursive`"
            );
            None
        }
        _ => None,
    },
);

#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Encode, Decode)]
pub struct DiskWatcherConfig {
    /// Whether to let the [`notify::Watcher`] recurse into subdirectories itself, or to track and
    /// watch each directory we care about ourselves.
    ///
    /// [`None`] picks a default based on the platform and [`Self::poll_interval`], which is
    /// normally what you want.
    ///
    /// The `TURBO_TASKS_FORCE_WATCH_MODE` environment variable will override this configuration
    /// value (intended for debugging purposes).
    pub recursive_mode: Option<DiskWatcherRecursiveMode>,
    /// Poll the filesystem at this interval instead of using the platform's native file watching,
    /// for cases where native watching doesn't work (e.g. some Docker setups). This is slow and
    /// inefficient, it should only be used as a last resort.
    ///
    /// [`None`] disables polling, using the platform's native watcher ([`RecommendedWatcher`])
    /// instead of [`PollWatcher`].
    pub poll_interval: Option<Duration>,
    /// Attach an [`InvalidationReason`] to every invalidation the watcher causes ([`WatchStart`],
    /// [`WatchChange`], or [`InvalidateRescan`]), so that it can be reported to the user.
    ///
    /// This costs an extra allocation per invalidated path, so it's only worth enabling when
    /// something actually consumes the reasons.
    pub report_invalidation_reason: bool,

    /// How long to keep a batch of filesystem events open, waiting for more events, before
    /// flushing invalidations. Batching coalesces bursts (e.g. a `git checkout`) into a single
    /// invalidation pass and avoids reading half-written files.
    ///
    /// If set too low (<10ms), this is known to cause partial file reads on Linux where `inotify`
    /// has very low latency.
    pub batch_delay: Duration,
    /// When [`DiskWatcherPathMatcher::match_path`] returns `true`, we will extend the batch by
    /// [`Self::extended_batch_delay_duration`].
    pub extended_batch_delay_matcher: Option<ResolvedVc<Box<dyn DiskWatcherPathMatcher>>>,
    /// The idle period required to close a batch once [`Self::extended_batch_delay_matcher`] has
    /// matched. Unused when there is no matcher.
    pub extended_batch_delay_duration: Duration,

    /// If a single batch stays open at least this long, emit a `FilesystemSettlingEvent`
    /// compilation event so the user knows why work has stalled. Repeated events within the same
    /// batch back off exponentially, up to [`Self::settling_event_max_delay`].
    pub settling_event_initial_delay: Duration,
    /// Upper bound for the exponentially increasing interval between repeated
    /// `FilesystemSettlingEvent`s within a single batch.
    pub settling_event_max_delay: Duration,
}

impl Default for DiskWatcherConfig {
    fn default() -> Self {
        Self {
            recursive_mode: None,
            poll_interval: None,
            report_invalidation_reason: false,
            batch_delay: Duration::from_millis(10),
            extended_batch_delay_matcher: None,
            extended_batch_delay_duration: Duration::from_millis(200),
            settling_event_initial_delay: Duration::from_millis(500),
            settling_event_max_delay: Duration::from_secs(60),
        }
    }
}

/// Matches absolute paths reported by the filesystem watcher. See
/// [`DiskWatcherConfig::extended_batch_delay_matcher`].
#[turbo_tasks::value_trait]
pub trait DiskWatcherPathMatcher {
    /// Called on the watcher thread once per path of every incoming event, so this should be
    /// cheap and must not block.
    fn match_path(&self, path: &Path) -> bool;
}

/// Equivalent to [`notify::RecursiveMode`], but implements traits needed by [`turbo_tasks`].
///
/// When using [`Self::Recursive`], [`notify::Watcher`] will recursively track all contents
/// of the filesystem root. This should only be used on platforms with efficient recursive watcher
/// implementations (i.e. macOS and Windows).
///
/// When using [`Self::NonRecursive`], we only track previously read files and their parent
/// directories.
#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Encode, Decode)]
pub enum DiskWatcherRecursiveMode {
    Recursive,
    NonRecursive,
}

impl From<DiskWatcherRecursiveMode> for notify::RecursiveMode {
    fn from(value: DiskWatcherRecursiveMode) -> Self {
        match value {
            DiskWatcherRecursiveMode::Recursive => notify::RecursiveMode::Recursive,
            DiskWatcherRecursiveMode::NonRecursive => notify::RecursiveMode::NonRecursive,
        }
    }
}

impl DiskWatcherConfig {
    /// Resolves [`Self::recursive_mode`], falling back to a default based on
    /// [`Self::poll_interval`] and the platform.
    fn resolve_recursive_mode(&self) -> DiskWatcherRecursiveMode {
        // macOS and Windows have efficient recursive watchers, so it's best to track the entire
        // directory and filter events to the files we care about. inotify on Linux is
        // non-recursive, so notify-rs's implementation is inefficient; better for us to track it
        // ourselves and only watch the directories we know we care about.
        //
        // See: <https://github.com/vercel/turborepo/pull/4100>
        let platform_has_efficient_recursive_watcher =
            cfg!(any(target_os = "macos", target_os = "windows"));

        // the env var is a debugging escape hatch, so it wins over everything else
        if let Some(forced) = *FORCED_WATCH_RECURSIVE_MODE {
            forced
        } else if let Some(recursive_mode) = self.recursive_mode {
            recursive_mode
        } else if self.poll_interval.is_some() {
            // `PollWatcher` implements recursive watching by walking the entire subtree on every
            // poll, so watching the fs root recursively would stat every file in the project each
            // interval. Watching non-recursively keeps each poll to the directories we've read.
            DiskWatcherRecursiveMode::NonRecursive
        } else if platform_has_efficient_recursive_watcher {
            DiskWatcherRecursiveMode::Recursive
        } else {
            DiskWatcherRecursiveMode::NonRecursive
        }
    }
}

pub(crate) struct DiskWatcher {
    state: State,
    config: DiskWatcherConfig,
}

/// Only [`Self::config`] is serialized: a decoded [`DiskWatcher`] is always stopped.
impl Encode for DiskWatcher {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        self.config.encode(encoder)
    }
}

impl<Ctx> Decode<Ctx> for DiskWatcher {
    fn decode<D: Decoder<Context = Ctx>>(decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self::new(DiskWatcherConfig::decode(decoder)?))
    }
}
bincode::impl_borrow_decode!(DiskWatcher);

enum State {
    // Note: Information about if we're a recursive or non-recursive watcher must live outside the
    // `RwLock` to allow us to quickly bail out before calling functions in
    // `non_recursive_helpers`.
    Recursive(RwLock<RecursiveState>),
    NonRecursive(RwLock<NonRecursiveState>),
}

enum StateWriteGuard<'a> {
    Recursive(RwLockWriteGuard<'a, RecursiveState>),
    NonRecursive(RwLockWriteGuard<'a, NonRecursiveState>),
}

impl State {
    fn new_stopped(recursive_mode: DiskWatcherRecursiveMode) -> Self {
        match recursive_mode {
            DiskWatcherRecursiveMode::Recursive => {
                Self::Recursive(RwLock::new(RecursiveState::Stopped))
            }
            DiskWatcherRecursiveMode::NonRecursive => {
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

    fn recursive_mode(&self) -> DiskWatcherRecursiveMode {
        match self {
            Self::Recursive(_) => DiskWatcherRecursiveMode::Recursive,
            Self::NonRecursive(_) => DiskWatcherRecursiveMode::NonRecursive,
        }
    }
}

/// Used when [`DiskWatcherConfig::recursive_mode`] returns [`RecursiveMode::Recursive`] (default on
/// macOS and Windows when not polling).
enum RecursiveState {
    /// Used when [`DiskWatcher::start_watching`] hasn't been called yet or after
    /// [`DiskWatcher::stop_watching`] is called.
    Stopped,
    Watching {
        /// Hold onto the watcher: When this is dropped, it will cause the channel to disconnect
        _notify_watcher: NotifyWatcher,
    },
}

/// Used when [`DiskWatcherConfig::recursive_mode`] returns [`RecursiveMode::NonRecursive`] (default
/// on Linux, and everywhere when polling).
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
    fn watch(&mut self, path: &Path, recursive_mode: notify::RecursiveMode) -> notify::Result<()> {
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

    /// Called with directories newly found in parent directories we're watching. Restores the
    /// watchers of those we were previously watching (i.e. that are in `watched`), and calls
    /// `on_restored` with each of them. `on_restored` is called while holding the write lock on
    /// `state`, so it must not access `state`.
    #[instrument(skip_all, level = "trace")]
    pub async fn restore_all_if_watched(
        state: &RwLock<NonRecursiveState>,
        dir_paths: FxIndexSet<Box<Path>>,
        root_path: &Path,
        mut on_restored: impl FnMut(Box<Path>),
    ) {
        let needs_restore = |watched: &BTreeSet<PathBuf>, dir_path: &Path| {
            // The root directory is always implicitly watched during `DiskWatcher::start_watching`,
            // we assume it is never deleted and never needs to be restored.
            dir_path != root_path && watched.contains(dir_path)
        };

        // fast path: none of the directories are in `watched`, only take a read lock and bail out
        // early
        {
            let guard = state.read().await;
            let NonRecursiveState::Watching(watching_state) = &*guard else {
                return;
            };
            if !dir_paths
                .iter()
                .any(|dir_path| needs_restore(&watching_state.watched, dir_path))
            {
                return;
            }
        }

        // slow path: re-watch the paths
        let mut guard = state.write().await;
        let NonRecursiveState::Watching(watching_state) = &mut *guard else {
            return;
        };
        for dir_path in dir_paths {
            if needs_restore(&watching_state.watched, &dir_path) {
                // TODO: Report diagnostics if this error happens. Report the path as restored even
                // on errors, in case the watch was partially restored.
                let _ = restore_watched_dir(watching_state, &dir_path, root_path);
                on_restored(dir_path);
            }
        }
    }

    /// Re-watches `dir_path` and any of its children in `watched`.
    fn restore_watched_dir(
        watching_state: &mut NonRecursiveWatchingState,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<()> {
        // watch the new directory
        start_watching_dir(&mut watching_state.notify_watcher, dir_path, root_path)?;

        // Also try to restore any watchers for children of this directory
        for child_path in watching_state.watched.iter_path_children(dir_path) {
            // Don't watch the parents -- see the comment on `restore_all_watched_ignore_errors`
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

        match notify_watcher.watch(dir_path, notify::RecursiveMode::NonRecursive) {
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
    pub fn new(config: DiskWatcherConfig) -> Self {
        assert!(
            config.extended_batch_delay_duration >= config.batch_delay,
            "extended_batch_delay_duration must be at least batch_delay"
        );
        Self {
            state: State::new_stopped(config.resolve_recursive_mode()),
            config,
        }
    }

    pub async fn start_watching<FsApi: DiskFileSystemWatcherApi>(fs: Arc<FsApi>) -> Result<()> {
        let watcher: &Self = fs.watcher();

        // read in the turbo-task context and before acquiring the lock
        let extended_batch_delay_matcher = match watcher.config.extended_batch_delay_matcher {
            Some(matcher) => Some(matcher.into_trait_ref().await?),
            None => None,
        };

        let state_guard = watcher.state.write().await;

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

        let mut notify_watcher = if let Some(poll_interval) = watcher.config.poll_interval {
            let config = config.with_poll_interval(poll_interval);
            NotifyWatcher::Polling(PollWatcher::new(tx, config)?)
        } else {
            NotifyWatcher::Recommended(RecommendedWatcher::new(tx, config)?)
        };

        // TOCTOU: we must watch `root_path` before calling any invalidators and setting up the
        // watchers in their associated functions
        let root_path = fs.root_path();
        notify_watcher.watch(
            root_path,
            notify::RecursiveMode::from(watcher.state.recursive_mode()),
        )?;

        // We need to invalidate all reads or writes that happened before watching. As a
        // side-effect, this will call `ensure_watched` again, setting up any watchers needed.
        //
        // Best is to start_watching before starting to read
        if watcher.config.report_invalidation_reason {
            let name = fs.name().clone();
            fs.invalidate_all_with_reason(|path| WatchStart {
                name: name.clone(),
                // this path is just used for display purposes
                path: RcStr::from(path.to_string_lossy()),
            });
        } else {
            fs.invalidate_all();
        }

        spawn_thread({
            let fs = fs.clone();
            move || Self::watch_thread(fs, rx, extended_batch_delay_matcher)
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
    fn watch_thread<FsApi: DiskFileSystemWatcherApi>(
        fs: Arc<FsApi>,
        rx: Receiver<notify::Result<notify::Event>>,
        extended_batch_delay_matcher: Option<TraitRef<Box<dyn DiskWatcherPathMatcher>>>,
    ) {
        let watcher: &Self = fs.watcher();
        let config = &watcher.config;
        let report_invalidation_reason = config.report_invalidation_reason;
        let mut batch = BatchedInvalidations::new(
            watcher.state.recursive_mode(),
            config.poll_interval.is_some(),
        );
        let mut schedule = BatchSchedule::new(config);

        'outer: loop {
            loop {
                match schedule.recv_event(&rx, &*fs, &batch) {
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
                            let _lock = fs.invalidation_lock().blocking_write();

                            // flush the whole mpsc queue, we're about to rescan, we don't need to
                            // process any other update events that have already happened
                            while rx.try_recv().is_ok() {}

                            if let State::NonRecursive(non_recursive) = &watcher.state {
                                // we can't narrow this down to a smaller set of paths: Rescan
                                // events (at least when tested on
                                // Linux) come with no `paths`, and we use
                                // only one global `notify::Watcher` instance.
                                //
                                // TODO: Report diagnostics if an error happens
                                fs.tokio_handle().block_on(
                                    non_recursive_helpers::restore_all_watched_ignore_errors(
                                        non_recursive,
                                        fs.root_path(),
                                    ),
                                );
                            }

                            if report_invalidation_reason {
                                fs.invalidate_all_with_reason(|path| InvalidateRescan {
                                    // this path is just used for display purposes
                                    path: RcStr::from(path.to_string_lossy()),
                                });
                            } else {
                                fs.invalidate_all();
                            }

                            // no need to process the rest of the batch as we just
                            // invalidated everything
                            batch.clear();
                            schedule.reset();
                            break;
                        }

                        // Any event that contributes to the batch keeps it open for another
                        // `batch_delay`. A path matching `extended_batch_delay_matcher` (e.g. a
                        // package-manager install target) keeps it open for
                        // `extended_batch_delay_duration` instead.
                        let mut delay = config.batch_delay;
                        if let Some(matcher) = &extended_batch_delay_matcher
                            && event.paths.iter().any(|path| matcher.match_path(path))
                        {
                            delay = delay.max(config.extended_batch_delay_duration);
                        }

                        if batch.add_event(event, fs.invalidator_map(), fs.dir_invalidator_map()) {
                            schedule.extend(delay);
                        } else if !batch.has_pending_invalidations() && batch.has_new_paths() {
                            // No batch is pending, so `recv_event` would wait for the next event,
                            // but newly created directories may still need their watches restored.
                            // Flush right away, as a dependent task could re-read them at any time.
                            break;
                        }
                    }
                    // Error raised by notify watcher itself
                    Ok(Err(notify::Error { kind, paths })) => {
                        // A path removed while the watcher was scanning it is expected (e.g.
                        // `PollWatcher` walking a tree that is being deleted), so don't report
                        // it. The invalidation below still covers it.
                        if !is_not_found_error(&kind) {
                            eprintln!("watch error ({paths:?}): {kind:?} ");
                        }

                        batch.add_error(paths, fs.root_path());
                        schedule.extend(config.batch_delay);
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        // the batch is complete: break out to invalidate the collected paths.
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
            if let State::NonRecursive(non_recursive) = &watcher.state
                && batch.has_new_paths()
            {
                let new_paths = batch.take_new_paths();
                // A read registered after a directory was created, but before its watch was
                // restored, took `ensure_watched`'s fast path without a live watch, and could have
                // missed changes made in the meantime. Now that the watch is live, invalidate
                // everything under the restored paths, even if they didn't affect any tracked read
                // when the event arrived.
                fs.tokio_handle()
                    .block_on(non_recursive_helpers::restore_all_if_watched(
                        non_recursive,
                        new_paths,
                        fs.root_path(),
                        |path| batch.mark_restored_path(path),
                    ));
            }
            if !batch.has_pending_invalidations() {
                batch.clear();
                continue;
            }

            let Some(turbo_tasks) = fs.turbo_tasks() else {
                // TurboTasks was dropped, stop watching
                break 'outer;
            };
            let _guard = fs.tokio_handle().enter();

            let _lock = fs.invalidation_lock().blocking_write();
            batch.execute(
                fs.invalidator_map(),
                fs.dir_invalidator_map(),
                |invalidation_reason_path, invalidator| {
                    invalidate(
                        &*fs,
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
/// Paths to invalidate are stored once in a flag-keyed map, with a set of [`InvalidationFlags`]
/// describing what needs to happen for each. Newly created paths are tracked separately because
/// their watches must be restored even when they don't affect any tracked read.
struct BatchedInvalidations {
    paths: FxIndexMap<Box<Path>, InvalidationFlags>,
    /// The most recently updated entry in [`Self::paths`].
    last_updated_index: Option<usize>,
    /// Newly-created paths in this batch, including ones that don't affect any tracked read. In
    /// non-recursive watching mode, these must have their watches (re-)established before
    /// [`Self::execute`] is called (see the note there). Stored as [`None`] in recursive mode.
    ///
    /// Kept separately from [`Self::paths`], because it also includes paths that don't affect any
    /// tracked read: a recreated directory must get its watch back even if nothing currently
    /// depends on it, as a dependent task may re-read it later (and then wouldn't watch it again).
    new_paths: Option<FxIndexSet<Box<Path>>>,
    /// Whether events are coming from [`PollWatcher`] instead of [`RecommendedWatcher`], which
    /// changes how a file content change is reported. See [`Self::is_content_change`].
    polling: bool,
}

impl BatchedInvalidations {
    fn new(recursive_mode: DiskWatcherRecursiveMode, polling: bool) -> Self {
        Self {
            paths: FxIndexMap::default(),
            last_updated_index: None,
            new_paths: match recursive_mode {
                DiskWatcherRecursiveMode::NonRecursive => Some(FxIndexSet::default()),
                DiskWatcherRecursiveMode::Recursive => None,
            },
            polling,
        }
    }

    /// Whether a [`ModifyKind::Metadata`] event means the file's *contents* changed.
    ///
    /// Some backends don't report content changes as [`ModifyKind::Data`] at all, so we have to
    /// treat one specific metadata change per backend as a content change. Accepting these
    /// unconditionally would mean invalidating on every `chmod`/`touch` on the backends that do
    /// report `Data` properly.
    fn is_content_change(&self, kind: MetadataKind) -> bool {
        match kind {
            // `PollWatcher` detects changes by comparing mtimes, so a content change surfaces as a
            // write-time change. It only emits `Data` when `Config::with_compare_contents` is
            // enabled, which we don't do because hashing every watched file is too expensive.
            MetadataKind::WriteTime => self.polling,
            // fsevents does not always emit `kFSEventStreamEventFlagItemModified` for a content
            // change; sometimes it only emits `kFSEventStreamEventFlagItemInodeMetaMod`, which
            // notify maps to `MetadataKind::Any`. This causes redundant invalidations, but it's the
            // only way to reliably detect content changes there. Fix for PACK-2437.
            //
            // libuv does the same thing to trigger `UV_CHANGES`:
            // https://github.com/libuv/libuv/commit/73cf3600d75a5884b890a1a94048b8f3f9c66876
            //
            // inotify and ReadDirectoryChangesW both report content changes on their own, so
            // `MetadataKind::Any` there only ever means an actual attribute change.
            MetadataKind::Any => cfg!(target_os = "macos"),
            _ => false,
        }
    }

    fn clear(&mut self) {
        self.paths.clear();
        self.last_updated_index = None;
        if let Some(new_paths) = &mut self.new_paths {
            new_paths.clear();
        }
    }

    fn has_new_paths(&self) -> bool {
        self.new_paths.as_ref().is_some_and(|p| !p.is_empty())
    }

    /// Takes the newly-created paths out of the batch, leaving it without any. Always empty in
    /// recursive mode.
    fn take_new_paths(&mut self) -> FxIndexSet<Box<Path>> {
        self.new_paths
            .as_mut()
            .map(std::mem::take)
            .unwrap_or_default()
    }

    /// Adds a recursive invalidation for a path whose watch was just restored. See
    /// [`DiskWatcher::watch_thread`].
    fn mark_restored_path(&mut self, path: Box<Path>) {
        self.mark(
            Cow::Owned(path.into_path_buf()),
            InvalidationFlags::PATH_AND_CHILDREN | InvalidationFlags::PATH_AND_CHILDREN_DIR,
        );
    }

    /// Whether the batch contains any paths to invalidate, i.e. whether a flush is pending.
    fn has_pending_invalidations(&self) -> bool {
        !self.paths.is_empty()
    }

    /// Records `path` as newly-created so its watch can be (re-)established, regardless of whether
    /// it affects any tracked read. No-op in recursive watching mode.
    fn mark_new_path(&mut self, path: &Path) {
        if let Some(new_paths) = &mut self.new_paths
            && !new_paths.contains(path)
        {
            new_paths.insert(Box::from(path));
        }
    }

    /// Sets the `flags` for `path`. Returns the index that was modified.
    fn mark(&mut self, path: Cow<'_, Path>, flags: InvalidationFlags) -> usize {
        match self.paths.raw_entry_mut_v1().from_key(path.as_ref()) {
            RawEntryMut::Occupied(mut entry) => {
                *entry.get_mut() |= flags;
                entry.index()
            }
            RawEntryMut::Vacant(entry) => {
                let index = entry.index();
                entry.insert(path.into_owned().into_boxed_path(), flags);
                index
            }
        }
    }

    fn last_updated_path(&self) -> Option<&Path> {
        self.last_updated_index
            .and_then(|index| self.paths.get_index(index))
            .map(|(path, _)| &**path)
    }

    fn mark_parent_dir(&mut self, path: &Path) {
        if let Some(parent) = path.parent() {
            self.mark(Cow::Borrowed(parent), InvalidationFlags::PATH_DIR);
        }
    }

    /// Updates the batch to contain updated paths from the given event. Does not perform any
    /// invalidations.
    ///
    /// Returns whether the event contributed any paths affecting tracked reads. Newly created paths
    /// are recorded in [`Self::new_paths`] either way.
    #[must_use]
    fn add_event(
        &mut self,
        event: notify::Event,
        invalidator_map: &InvalidatorMap,
        dir_invalidator_map: &InvalidatorMap,
    ) -> bool {
        // if we need to lock an invalidator map, hold and cache the guard for the whole event
        let invalidator_map_guard = LazyCell::new(|| invalidator_map.lock().unwrap());
        let dir_invalidator_map_guard = LazyCell::new(|| dir_invalidator_map.lock().unwrap());

        // If this path has no reader, we should not add it to the batch, and we should not extend
        // the batch schedule
        let is_relevant = |batch: &Self, path: &Path, parent: Option<&Path>, recursive: bool| {
            // fast-path: The path or parent is already in the batch, assume it is relevant
            if batch.paths.contains_key(path)
                || parent.is_some_and(|parent| batch.paths.contains_key(parent))
            {
                return true;
            }
            // slow-path: Lock the invalidator maps, and see if they contain the path
            invalidator_map_guard.contains_key(path)
                || dir_invalidator_map_guard.contains_key(path)
                || parent.is_some_and(|parent| dir_invalidator_map_guard.contains_key(parent))
                || (recursive
                    && (invalidator_map_guard.contains_path_or_children(path)
                        || dir_invalidator_map_guard.contains_path_or_children(path)))
        };

        let paths = event.paths;
        let mut last_updated_index = None;
        match event.kind {
            EventKind::Modify(ModifyKind::Data(_)) => {
                for path in paths {
                    if is_relevant(self, &path, None, false) {
                        last_updated_index =
                            Some(self.mark(Cow::Owned(path), InvalidationFlags::PATH));
                    }
                }
            }
            // Some backends (fsevents, polling) can report metadata events for file content changes
            EventKind::Modify(ModifyKind::Metadata(kind)) if self.is_content_change(kind) => {
                for path in paths {
                    if is_relevant(self, &path, None, false) {
                        last_updated_index =
                            Some(self.mark(Cow::Owned(path), InvalidationFlags::PATH));
                    }
                }
            }
            EventKind::Create(_) => {
                for path in paths {
                    self.mark_new_path(&path);
                    if !is_relevant(self, &path, path.parent(), true) {
                        continue;
                    }
                    self.mark_parent_dir(&path);
                    last_updated_index = Some(self.mark(
                        Cow::Owned(path),
                        InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR,
                    ));
                }
            }
            EventKind::Remove(_) => {
                for path in paths {
                    if !is_relevant(self, &path, path.parent(), true) {
                        continue;
                    }
                    self.mark_parent_dir(&path);
                    last_updated_index = Some(self.mark(
                        Cow::Owned(path),
                        InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR,
                    ));
                }
            }
            // A single event emitted with both the `From` and `To` paths.
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                let [source, destination] = <[PathBuf; 2]>::try_from(paths)
                    .expect("RenameMode::Both event must contain exactly two paths");

                if is_relevant(self, &source, source.parent(), true) {
                    self.mark_parent_dir(&source);
                    last_updated_index =
                        Some(self.mark(Cow::Owned(source), InvalidationFlags::PATH_AND_CHILDREN));
                }

                self.mark_new_path(&destination);
                if is_relevant(self, &destination, destination.parent(), true) {
                    self.mark_parent_dir(&destination);
                    last_updated_index = Some(self.mark(
                        Cow::Owned(destination),
                        InvalidationFlags::PATH_AND_CHILDREN,
                    ));
                }
            }
            // We expect `RenameMode::Both` to cover most of the cases we need to invalidate,
            // but we also check other RenameModes to cover cases where notify couldn't match the
            // two rename events.
            EventKind::Any | EventKind::Modify(ModifyKind::Any | ModifyKind::Name(..)) => {
                for path in paths {
                    if !is_relevant(self, &path, path.parent(), true) {
                        continue;
                    }
                    self.mark_parent_dir(&path);
                    last_updated_index = Some(self.mark(
                        Cow::Owned(path),
                        InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR,
                    ));
                }
            }
            EventKind::Modify(ModifyKind::Metadata(..) | ModifyKind::Other)
            | EventKind::Access(_)
            | EventKind::Other => {}
        }
        if let Some(index) = last_updated_index {
            self.last_updated_index = Some(index);
            true
        } else {
            false
        }
    }

    /// Updates the batch to invalidate paths associated with a watcher error.
    fn add_error(&mut self, paths: Vec<PathBuf>, root_path: &Path) {
        let flags = InvalidationFlags::PATH_AND_CHILDREN | InvalidationFlags::PATH_AND_CHILDREN_DIR;
        if paths.is_empty() {
            self.last_updated_index = Some(self.mark(Cow::Borrowed(root_path), flags));
        } else {
            for path in paths {
                self.last_updated_index = Some(self.mark(Cow::Owned(path), flags));
            }
        }
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

#[instrument(
    parent = None,
    level = "info",
    name = "file change",
    skip_all,
    fields(name = %invalidation_reason_path.display())
)]
fn invalidate(
    inner: &impl DiskFileSystemWatcherApi,
    turbo_tasks: &dyn TurboTasksApi,
    report_invalidation_reason: bool,
    invalidation_reason_path: &Path,
    invalidator: Invalidator,
) {
    if report_invalidation_reason
        && let Some(path) =
            format_absolute_fs_path(invalidation_reason_path, inner.name(), inner.root_path())
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

/// Whether a [`notify::Error`] was caused by a path that no longer exists, e.g. a directory
/// removed between being listed and being read by [`PollWatcher`].
fn is_not_found_error(kind: &notify::ErrorKind) -> bool {
    matches!(kind, notify::ErrorKind::Io(err) if err.kind() == std::io::ErrorKind::NotFound)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{Instant, SystemTime},
    };

    use notify::event::{CreateKind, DataChange, RemoveKind};
    use rstest::rstest;
    use turbo_tasks::TurboTasks;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;
    use crate::watcher::mock_fs_api::MockFileSystem;

    #[cfg(not(miri))]
    #[tokio::test]
    async fn batches_only_tracked_paths() {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let invalidator_map = InvalidatorMap::new();
            let dir_invalidator_map = InvalidatorMap::new();
            let invalidator = turbo_tasks::get_invalidator().unwrap();
            invalidator_map.insert(Arc::new(PathBuf::from("root/file")), invalidator);
            dir_invalidator_map.insert(Arc::new(PathBuf::from("root/listed")), invalidator);
            dir_invalidator_map.insert(Arc::new(PathBuf::from("dirs/sub")), invalidator);

            let content = EventKind::Modify(ModifyKind::Data(DataChange::Any));
            let create = EventKind::Create(CreateKind::Any);
            let remove = EventKind::Remove(RemoveKind::Any);
            let rename = EventKind::Modify(ModifyKind::Name(RenameMode::From));
            for (kind, path, relevant) in [
                (content, "root", false),
                (content, "root/file", true),
                (content, "root/listed", true),
                (create, "root/listed/new", true),
                (create, "root", true),
                (remove, "root", true),
                (rename, "root", true),
                (remove, "dirs", true),
            ] {
                let mut batch =
                    BatchedInvalidations::new(DiskWatcherRecursiveMode::NonRecursive, false);
                let event = notify::Event::new(kind).add_path(PathBuf::from(path));
                assert_eq!(
                    batch.add_event(event, &invalidator_map, &dir_invalidator_map),
                    relevant,
                    "{kind:?} at {path}",
                );
                assert_eq!(batch.last_updated_path().is_some(), relevant);
            }
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// Polls [`tracked_read`] until it has executed more than `previous_runs` times, i.e. until the
    /// watcher has invalidated it.
    async fn wait_for_rerun(fs: &Arc<MockFileSystem>, path: &Path, previous_runs: u64) {
        const WATCH_TIMEOUT: Duration = Duration::from_secs(5);
        let deadline = Instant::now() + WATCH_TIMEOUT;
        loop {
            if fs.tracked_read_strongly_consistent(path).await > previous_runs {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "the watcher did not invalidate {path:?} within {WATCH_TIMEOUT:?}",
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    /// Backdates `path`'s mtime so that a [`PollWatcher`] can see the write that follows it to
    /// avoid mtime truncation issues.
    fn backdate(path: &Path) {
        fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(SystemTime::now() - Duration::from_secs(10))
            .unwrap();
    }

    /// `recursive_mode` is set explicitly rather than left to the platform default so that both
    /// watching strategies are covered on every host. `TURBO_TASKS_FORCE_WATCH_MODE` still
    /// overrides it, collapsing these into two cases.
    // Miri cannot run the native cases because inotify is unsupported, while the polling cases
    // require Turbo Tasks' link-section registry, which is unavailable under Miri.
    #[cfg(not(miri))]
    #[rstest]
    #[case::native_recursive(None, DiskWatcherRecursiveMode::Recursive)]
    #[case::native_non_recursive(None, DiskWatcherRecursiveMode::NonRecursive)]
    #[case::polling_recursive(Some(Duration::from_millis(20)), DiskWatcherRecursiveMode::Recursive)]
    #[case::polling_non_recursive(
        Some(Duration::from_millis(20)),
        DiskWatcherRecursiveMode::NonRecursive
    )]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn watches_file_and_directory_changes(
        #[case] poll_interval: Option<Duration>,
        #[case] recursive_mode: DiskWatcherRecursiveMode,
    ) {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = MockFileSystem::new(DiskWatcherConfig {
                recursive_mode: Some(recursive_mode),
                poll_interval,
                report_invalidation_reason: true,
                ..Default::default()
            });
            let sub_dir = fs.root_path.join("sub");
            let file_path = sub_dir.join("file.txt");
            fs::create_dir(&sub_dir).unwrap();
            fs::write(&file_path, "initial").unwrap();
            backdate(&file_path);

            DiskWatcher::start_watching(fs.clone()).await?;

            // the initial reads register the invalidators that the watcher will later fire
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 1);
            assert_eq!(fs.tracked_read_strongly_consistent(&sub_dir).await, 1);

            // reading again without touching the filesystem must not re-run anything
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 1);
            assert_eq!(fs.tracked_read_strongly_consistent(&sub_dir).await, 1);

            // modifying a file invalidates the task that read that file
            fs::write(&file_path, "updated")?;
            wait_for_rerun(&fs, &file_path, 1).await;

            // creating a file invalidates the task that listed the containing directory
            let dir_runs = fs.tracked_read_strongly_consistent(&sub_dir).await;
            fs::write(sub_dir.join("new.txt"), "new")?;
            wait_for_rerun(&fs, &sub_dir, dir_runs).await;

            fs.watcher.stop_watching().await;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// Events for paths that nobody has read must not extend the batch: a stream of writes to an
    /// untracked file should not delay the invalidation of a tracked one.
    #[cfg(not(miri))]
    #[rstest]
    #[case::native_recursive(None, DiskWatcherRecursiveMode::Recursive)]
    #[case::native_non_recursive(None, DiskWatcherRecursiveMode::NonRecursive)]
    #[case::polling_recursive(Some(Duration::from_millis(20)), DiskWatcherRecursiveMode::Recursive)]
    #[case::polling_non_recursive(
        Some(Duration::from_millis(20)),
        DiskWatcherRecursiveMode::NonRecursive
    )]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn irrelevant_events_do_not_delay_invalidation(
        #[case] poll_interval: Option<Duration>,
        #[case] recursive_mode: DiskWatcherRecursiveMode,
    ) {
        const BATCH_DELAY: Duration = Duration::from_millis(300);
        const CHURN: Duration = Duration::from_secs(3);
        const CHURN_INTERVAL: Duration = Duration::from_millis(50);

        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = MockFileSystem::new(DiskWatcherConfig {
                recursive_mode: Some(recursive_mode),
                poll_interval,
                batch_delay: BATCH_DELAY,
                extended_batch_delay_duration: BATCH_DELAY,
                ..Default::default()
            });
            let sub_dir = fs.root_path.join("sub");
            let file_path = sub_dir.join("file.txt");
            let other_path = sub_dir.join("other.txt");
            fs::create_dir(&sub_dir).unwrap();
            fs::write(&file_path, "initial").unwrap();
            fs::write(&other_path, "0").unwrap();
            backdate(&file_path);
            backdate(&other_path);

            DiskWatcher::start_watching(fs.clone()).await?;
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 1);

            let churn_start = Instant::now();
            let churn = std::thread::spawn({
                let other_path = other_path.clone();
                move || {
                    let mut i = 0u64;
                    while churn_start.elapsed() < CHURN {
                        i += 1;
                        fs::write(&other_path, i.to_string()).unwrap();
                        std::thread::sleep(CHURN_INTERVAL);
                    }
                }
            });

            std::thread::sleep(CHURN_INTERVAL * 2);
            fs::write(&file_path, "updated")?;
            wait_for_rerun(&fs, &file_path, 1).await;
            let elapsed = churn_start.elapsed();
            assert!(
                elapsed < CHURN - Duration::from_millis(500),
                "invalidation was delayed by unrelated events: took {elapsed:?}"
            );

            churn.join().unwrap();
            fs.watcher.stop_watching().await;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// Repeated writes to a tracked file must keep the batch open even though the file's
    /// invalidator was already extracted into the batch by the first write.
    #[cfg(not(miri))]
    #[rstest]
    #[case::native_recursive(None, DiskWatcherRecursiveMode::Recursive)]
    #[case::native_non_recursive(None, DiskWatcherRecursiveMode::NonRecursive)]
    #[case::polling_recursive(Some(Duration::from_millis(20)), DiskWatcherRecursiveMode::Recursive)]
    #[case::polling_non_recursive(
        Some(Duration::from_millis(20)),
        DiskWatcherRecursiveMode::NonRecursive
    )]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn repeated_writes_to_tracked_file_are_debounced(
        #[case] poll_interval: Option<Duration>,
        #[case] recursive_mode: DiskWatcherRecursiveMode,
    ) {
        const BATCH_DELAY: Duration = Duration::from_millis(300);
        const CHURN: Duration = Duration::from_millis(1500);
        const CHURN_INTERVAL: Duration = Duration::from_millis(50);

        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = MockFileSystem::new(DiskWatcherConfig {
                recursive_mode: Some(recursive_mode),
                poll_interval,
                batch_delay: BATCH_DELAY,
                extended_batch_delay_duration: BATCH_DELAY,
                ..Default::default()
            });
            let sub_dir = fs.root_path.join("sub");
            let file_path = sub_dir.join("file.txt");
            fs::create_dir(&sub_dir).unwrap();
            fs::write(&file_path, "initial").unwrap();
            backdate(&file_path);

            DiskWatcher::start_watching(fs.clone()).await?;
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 1);

            let churn_start = Instant::now();
            let churn = std::thread::spawn({
                let file_path = file_path.clone();
                move || {
                    let mut i = 0u64;
                    while churn_start.elapsed() < CHURN {
                        i += 1;
                        fs::write(&file_path, i.to_string()).unwrap();
                        std::thread::sleep(CHURN_INTERVAL);
                    }
                }
            });

            // well past `BATCH_DELAY`, but while the writes are still going on
            tokio::time::sleep(Duration::from_secs(1)).await;
            assert!(churn_start.elapsed() < CHURN);
            assert_eq!(
                fs.tracked_read_strongly_consistent(&file_path).await,
                1,
                "the batch was flushed while the tracked file was still being written"
            );

            churn.join().unwrap();
            wait_for_rerun(&fs, &file_path, 1).await;
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 2);

            fs.watcher.stop_watching().await;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// In non-recursive mode, deleting a watched directory drops its OS watches, but the path
    /// stays in `NonRecursiveWatchingState::watched`. The watch is only re-established by
    /// `restore_all_if_watched` when the directory's creation is processed. Re-reading a file in it
    /// takes `ensure_watched`'s fast path and doesn't watch it again.
    ///
    /// So the creation must restore the watch even when nothing currently depends on the
    /// directory. That is the case here: the deletion's batch consumed the only invalidator, and
    /// the invalidated read is held back (via `MockFileSystem::read_gate`) until after the
    /// directory has been recreated in a later batch.
    ///
    /// The directory is either recreated in place, or built elsewhere and renamed into place. Runs
    /// in both watching modes, though only non-recursive mode needs watches to be restored.
    #[cfg(not(miri))]
    #[rstest]
    #[case::non_recursive_create(DiskWatcherRecursiveMode::NonRecursive, false)]
    #[case::non_recursive_rename(DiskWatcherRecursiveMode::NonRecursive, true)]
    #[case::recursive_create(DiskWatcherRecursiveMode::Recursive, false)]
    #[case::recursive_rename(DiskWatcherRecursiveMode::Recursive, true)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn recreated_directory_is_watched_again(
        #[case] recursive_mode: DiskWatcherRecursiveMode,
        #[case] rename_into_place: bool,
    ) {
        const BATCH_DELAY: Duration = Duration::from_millis(50);
        // well past `BATCH_DELAY`, so that the removal and the recreation are flushed as separate
        // batches
        const SETTLE: Duration = Duration::from_millis(500);

        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = MockFileSystem::new(DiskWatcherConfig {
                recursive_mode: Some(recursive_mode),
                batch_delay: BATCH_DELAY,
                extended_batch_delay_duration: BATCH_DELAY,
                ..Default::default()
            });
            let dir_a = fs.root_path.join("a");
            let dir_b = dir_a.join("b");
            let file_path = dir_b.join("c.txt");
            fs::create_dir_all(&dir_b)?;
            fs::write(&file_path, "initial")?;
            backdate(&file_path);

            DiskWatcher::start_watching(fs.clone()).await?;
            // watches `a` and `a/b`. Nothing reads or lists the root or `a`.
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 1);

            // The removal invalidates the read and consumes its invalidator. Hold back the
            // re-execution, so no invalidator is registered under `a` while it is recreated.
            let gate = fs.read_gate.write().await;
            fs::remove_dir_all(&dir_a)?;
            tokio::time::sleep(SETTLE).await;

            if rename_into_place {
                let staging = fs.root_path.join("staging");
                fs::create_dir_all(staging.join("b"))?;
                fs::write(staging.join("b").join("c.txt"), "recreated")?;
                fs::rename(&staging, &dir_a)?;
            } else {
                fs::create_dir_all(&dir_b)?;
                fs::write(&file_path, "recreated")?;
            }
            tokio::time::sleep(SETTLE).await;

            // re-runs because of the removal, and registers the read again
            drop(gate);
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 2);

            fs::write(&file_path, "modified")?;
            wait_for_rerun(&fs, &file_path, 2).await;

            fs.watcher.stop_watching().await;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// A read that re-registers after a directory was recreated, but before its watch was restored,
    /// takes `ensure_watched`'s fast path without a live watch. Changes in that window produce no
    /// events, so the reader must be invalidated once the watch is restored.
    ///
    /// The window is kept open deterministically: writes to an unrelated tracked file keep a batch
    /// pending, which defers restoring the recreated directory's watch until that batch flushes.
    #[cfg(not(miri))]
    #[rstest]
    #[case::non_recursive(DiskWatcherRecursiveMode::NonRecursive)]
    #[case::recursive(DiskWatcherRecursiveMode::Recursive)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn read_registered_before_watch_is_restored_is_invalidated(
        #[case] recursive_mode: DiskWatcherRecursiveMode,
    ) {
        const BATCH_DELAY: Duration = Duration::from_millis(300);
        const SETTLE: Duration = Duration::from_millis(800);
        const CHURN_INTERVAL: Duration = Duration::from_millis(50);
        // fallback, in case the test fails before stopping the writes explicitly
        const MAX_CHURN: Duration = Duration::from_secs(10);

        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = MockFileSystem::new(DiskWatcherConfig {
                recursive_mode: Some(recursive_mode),
                batch_delay: BATCH_DELAY,
                extended_batch_delay_duration: BATCH_DELAY,
                ..Default::default()
            });
            let dir_a = fs.root_path.join("a");
            let dir_b = dir_a.join("b");
            let file_path = dir_b.join("c.txt");
            let other_dir = fs.root_path.join("other");
            let other_path = other_dir.join("x.txt");
            fs::create_dir_all(&dir_b)?;
            fs::create_dir_all(&other_dir)?;
            fs::write(&file_path, "initial")?;
            fs::write(&other_path, "0")?;
            backdate(&file_path);
            backdate(&other_path);

            DiskWatcher::start_watching(fs.clone()).await?;
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 1);
            assert_eq!(fs.tracked_read_strongly_consistent(&other_path).await, 1);

            // The removal invalidates the read and consumes its invalidator. Hold back the
            // re-execution until the directory has been recreated.
            let gate = fs.read_gate.write().await;
            fs::remove_dir_all(&dir_a)?;
            tokio::time::sleep(SETTLE).await;

            // Keep a batch pending with writes to an unrelated tracked file, so that restoring the
            // recreated directory's watch is deferred until that batch flushes.
            let churn_done = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let churn = std::thread::spawn({
                let other_path = other_path.clone();
                let churn_done = churn_done.clone();
                move || {
                    let churn_start = Instant::now();
                    let mut i = 0u64;
                    while !churn_done.load(std::sync::atomic::Ordering::Relaxed)
                        && churn_start.elapsed() < MAX_CHURN
                    {
                        i += 1;
                        fs::write(&other_path, i.to_string()).unwrap();
                        std::thread::sleep(CHURN_INTERVAL);
                    }
                }
            });
            std::thread::sleep(CHURN_INTERVAL * 2);

            fs::create_dir_all(&dir_b)?;
            fs::write(&file_path, "recreated")?;
            std::thread::sleep(CHURN_INTERVAL * 2);

            // Re-register the read while the batch (and the watch restoration) is still pending.
            drop(gate);
            assert_eq!(fs.tracked_read_strongly_consistent(&file_path).await, 2);

            // In non-recursive mode, there is no watch on `a/b` yet, so this produces no event.
            fs::write(&file_path, "modified")?;

            churn_done.store(true, std::sync::atomic::Ordering::Relaxed);
            churn.join().unwrap();
            wait_for_rerun(&fs, &file_path, 2).await;

            fs.watcher.stop_watching().await;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
