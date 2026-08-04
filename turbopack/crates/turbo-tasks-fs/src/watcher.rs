use std::{
    any::Any,
    collections::{BTreeSet, hash_map::Entry},
    env, fmt,
    fs::{OpenOptions, create_dir_all, remove_file},
    mem::take,
    path::{Path, PathBuf},
    sync::{
        Arc, LazyLock, Mutex, Weak,
        atomic::{AtomicU32, AtomicU64, Ordering},
        mpsc::{Receiver, RecvTimeoutError, Sender, channel},
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
use tokio::sync::{RwLock, RwLockWriteGuard, oneshot};
use tracing::instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, InvalidationReason, InvalidationReasonKind, Invalidator, TurboTasksApi, parallel,
    spawn_thread, util::StaticOrArc,
};

use crate::{
    DiskFileSystemInner, format_absolute_fs_path,
    invalidation::{WatchChange, WatchStart},
    invalidator_map::{InvalidatorMap, LockedInvalidatorMap},
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

/// How long to extend an invalidation batch by when receiving new events, before flushing. This
/// reduces invalidations if the same file or directory is modified many times.
///
/// Linux watching is too fast, so we need a longer delay there to avoid reading wip files.
#[cfg(target_os = "linux")]
const BATCH_DELAY: Duration = Duration::from_millis(10);
#[cfg(not(target_os = "linux"))]
const BATCH_DELAY: Duration = Duration::from_millis(1);

pub(crate) const EDIT_TRANSACTION_LEASE: Duration = Duration::from_secs(5);
const EDIT_TRANSACTION_MAX_DURATION: Duration = Duration::from_secs(60);
const EDIT_TRANSACTION_MAX_RETAINED_PATHS: usize = 16 * 1024;
const EDIT_TRANSACTION_MAX_RETAINED_PATH_BYTES: usize = 4 * 1024 * 1024;
const EDIT_TRANSACTION_BARRIER_PREFIX: &str = ".next-edit-transaction-barrier-";
const EDIT_TRANSACTION_BARRIER_TIMEOUT: Duration = Duration::from_secs(2);
const EDIT_TRANSACTION_MAX_SETTLE_EXTENSION: Duration = Duration::from_millis(100);
const EDIT_TRANSACTION_MAX_RESCAN_PASSES: usize = 3;
static NEXT_EDIT_TRANSACTION_BARRIER_ID: AtomicU64 = AtomicU64::new(1);

fn edit_transaction_settle_delay(poll_interval: Option<Duration>) -> Duration {
    poll_interval
        .map(|interval| interval.saturating_add(BATCH_DELAY))
        .unwrap_or(BATCH_DELAY)
}

fn edit_transaction_barrier_timeout(poll_interval: Option<Duration>) -> Duration {
    poll_interval
        .map(|interval| {
            interval
                .saturating_add(BATCH_DELAY)
                .max(EDIT_TRANSACTION_BARRIER_TIMEOUT)
        })
        .unwrap_or(EDIT_TRANSACTION_BARRIER_TIMEOUT)
}

#[derive(Clone, Copy)]
struct EditTransactionSettling {
    deadline: Instant,
    limit: Instant,
}

impl EditTransactionSettling {
    fn new(now: Instant, initial_delay: Duration) -> Self {
        let deadline = now + initial_delay;
        Self {
            deadline,
            limit: deadline + EDIT_TRANSACTION_MAX_SETTLE_EXTENSION,
        }
    }

    fn extend(&mut self, now: Instant) {
        self.deadline = self.deadline.max(now + BATCH_DELAY).min(self.limit);
    }
}

fn should_repeat_rescan(
    pending_rescan: bool,
    pending_transaction_end: bool,
    completed_transaction_rescans: usize,
) -> bool {
    pending_rescan
        && (!pending_transaction_end
            || completed_transaction_rescans < EDIT_TRANSACTION_MAX_RESCAN_PASSES)
}

fn create_edit_transaction_barrier(directory: &Path) -> std::io::Result<PathBuf> {
    create_dir_all(directory)?;
    let id = NEXT_EDIT_TRANSACTION_BARRIER_ID.fetch_add(1, Ordering::Relaxed);
    let path = directory.join(format!(
        "{EDIT_TRANSACTION_BARRIER_PREFIX}{}-{id}",
        std::process::id()
    ));
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)?;
    Ok(path)
}

fn initial_transaction_id() -> AtomicU32 {
    AtomicU32::new(1)
}

fn initial_control_senders() -> RwLock<Option<WatchSenders>> {
    RwLock::new(None)
}

#[derive(Encode, Decode)]
pub(crate) struct DiskWatcher {
    #[bincode(skip)]
    state: State,
    #[bincode(skip, default = "initial_control_senders")]
    control_senders: RwLock<Option<WatchSenders>>,
    #[bincode(skip, default = "initial_transaction_id")]
    next_transaction_id: AtomicU32,
}

struct ActiveEditTransaction {
    token: u32,
    expiration: Instant,
    maximum_expiration: Instant,
}

impl ActiveEditTransaction {
    fn new(token: u32, now: Instant) -> Self {
        let maximum_expiration = now + EDIT_TRANSACTION_MAX_DURATION;
        Self {
            token,
            expiration: (now + EDIT_TRANSACTION_LEASE).min(maximum_expiration),
            maximum_expiration,
        }
    }

    fn is_active(&self, token: u32, now: Instant) -> bool {
        self.token == token && now < self.expiration
    }

    fn renew(&mut self, token: u32, now: Instant) -> bool {
        if !self.is_active(token, now) {
            return false;
        }
        self.expiration = (now + EDIT_TRANSACTION_LEASE).min(self.maximum_expiration);
        true
    }
}

enum WatchEventMessage {
    Filesystem(notify::Result<notify::Event>),
    BeginEditTransaction {
        token: u32,
        changed_paths: Vec<PathBuf>,
        acknowledged: oneshot::Sender<bool>,
    },
    ControlReady,
    RescanBoundary,
}

fn retain_after_rescan_boundary(
    message: WatchEventMessage,
    discarding_rescan_events: &mut bool,
    pending_rescan: &mut bool,
) -> Option<WatchEventMessage> {
    match message {
        WatchEventMessage::RescanBoundary => {
            if !*discarding_rescan_events {
                return None;
            }
            *discarding_rescan_events = false;
            Some(WatchEventMessage::RescanBoundary)
        }
        message if !*discarding_rescan_events => Some(message),
        WatchEventMessage::Filesystem(Ok(event)) => {
            // An overflow observed while watches are being restored is not covered by that
            // restoration pass. Repeat the rescan after the FIFO boundary instead of losing it.
            if event.need_rescan() {
                *pending_rescan = true;
            }
            None
        }
        WatchEventMessage::Filesystem(Err(_)) => None,
        WatchEventMessage::BeginEditTransaction { acknowledged, .. } => {
            let _ = acknowledged.send(false);
            None
        }
        WatchEventMessage::ControlReady => Some(WatchEventMessage::ControlReady),
    }
}

enum EditTransactionMessage {
    Renew {
        token: u32,
        acknowledged: oneshot::Sender<bool>,
    },
    End {
        token: u32,
        acknowledged: oneshot::Sender<bool>,
    },
}

#[derive(Clone)]
struct WatchSenders {
    event_tx: Arc<Sender<WatchEventMessage>>,
    control_tx: Sender<EditTransactionMessage>,
    generation_running: Arc<Mutex<bool>>,
}

impl WatchSenders {
    fn send_control(&self, message: EditTransactionMessage) -> bool {
        self.control_tx.send(message).is_ok()
            && self.event_tx.send(WatchEventMessage::ControlReady).is_ok()
    }

    fn stop_generation(&self) {
        *self.generation_running.lock().unwrap() = false;
    }
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

    async fn message_senders(&self) -> Option<WatchSenders> {
        match self {
            Self::Recursive(state) => match &*state.read().await {
                RecursiveState::Stopped => None,
                RecursiveState::Watching { senders, .. } => Some(senders.clone()),
            },
            Self::NonRecursive(state) => match &*state.read().await {
                NonRecursiveState::Stopped => None,
                NonRecursiveState::Watching(state) => Some(state.senders.clone()),
            },
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
        senders: WatchSenders,
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
    senders: WatchSenders,
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

    fn unwatch(&mut self, path: &Path) -> notify::Result<()> {
        match self {
            Self::Recommended(watcher) => watcher.unwatch(path),
            Self::Polling(watcher) => watcher.unwatch(path),
        }
    }

    /// Recursive native watchers already cover the denied output directory. PollWatcher needs a
    /// distinct handle so watcher operations can synchronize with its scan lock.
    fn watch_edit_transaction_barrier(&mut self, path: &Path) -> notify::Result<bool> {
        match self {
            Self::Recommended(_) => Ok(false),
            Self::Polling(watcher) => {
                watcher.watch(path, RecursiveMode::NonRecursive)?;
                Ok(true)
            }
        }
    }

    /// Finish the poll that observed the barrier, then request one complete post-barrier poll.
    /// Returns whether the temporary watch must remain installed until that poll completes.
    fn synchronize_edit_transaction_poll(&mut self, path: &Path) -> notify::Result<bool> {
        match self {
            Self::Recommended(watcher) => {
                watcher.unwatch(path)?;
                Ok(false)
            }
            Self::Polling(watcher) => {
                // `unwatch` takes PollWatcher's scan lock, so it cannot return until the scan that
                // emitted the barrier has completed. Reinstall the watch and wake the poll loop;
                // removing it at the settle deadline will similarly wait for this new scan.
                watcher.unwatch(path)?;
                watcher.watch(path, RecursiveMode::NonRecursive)?;
                watcher.poll()?;
                Ok(true)
            }
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

    /// Watch a directory for the lifetime of one edit-transaction barrier without adding it to
    /// the persistent invalidator-backed watch set. Returns whether the caller owns a temporary
    /// watch that must be removed.
    pub async fn watch_temporary_dir(
        state: &RwLock<NonRecursiveState>,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<bool> {
        if dir_path == root_path {
            return Ok(false);
        }

        let mut guard = state.write().await;
        let NonRecursiveState::Watching(watching_state) = &mut *guard else {
            return Ok(false);
        };
        if watching_state.watched.contains(dir_path) {
            start_watching_dir(&mut watching_state.notify_watcher, dir_path, root_path)?;
            return Ok(false);
        }
        start_watching_dir(&mut watching_state.notify_watcher, dir_path, root_path)?;
        Ok(true)
    }

    pub async fn unwatch_temporary_dir(state: &RwLock<NonRecursiveState>, dir_path: &Path) {
        let mut guard = state.write().await;
        let NonRecursiveState::Watching(watching_state) = &mut *guard else {
            return;
        };
        if !watching_state.watched.contains(dir_path) {
            let _ = watching_state.notify_watcher.unwatch(dir_path);
        }
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
            control_senders: initial_control_senders(),
            next_transaction_id: AtomicU32::new(1),
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

        // Transaction controls use a separate channel so renewals and releases cannot sit behind
        // a filesystem-event backlog. A token on the event channel wakes the watcher thread.
        let (event_tx, event_rx) = channel();
        let event_tx = Arc::new(event_tx);
        let (control_tx, control_rx) = channel();
        // Create a watcher object, delivering debounced events.
        // The notification back-end is selected based on the platform.
        let config = Config::default();
        // we should track and invalidate each part of a symlink chain ourselves in
        // turbo-tasks-fs
        let config = config.with_follow_symlinks(false);
        let transaction_settle_delay = edit_transaction_settle_delay(poll_interval);
        let transaction_barrier_timeout = edit_transaction_barrier_timeout(poll_interval);

        let mut notify_watcher = if let Some(poll_interval) = poll_interval {
            let config = config.with_poll_interval(poll_interval);
            let notify_tx = event_tx.clone();
            NotifyWatcher::Polling(PollWatcher::new(
                move |result| {
                    let _ = notify_tx.send(WatchEventMessage::Filesystem(result));
                },
                config,
            )?)
        } else {
            let notify_tx = event_tx.clone();
            NotifyWatcher::Recommended(RecommendedWatcher::new(
                move |result| {
                    let _ = notify_tx.send(WatchEventMessage::Filesystem(result));
                },
                config,
            )?)
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

        let rescan_boundary_tx = Arc::downgrade(&event_tx);
        let generation_running = Arc::new(Mutex::new(true));
        let senders = WatchSenders {
            event_tx,
            control_tx,
            generation_running: generation_running.clone(),
        };
        spawn_thread(move || {
            fs_inner.clone().watcher.watch_thread(
                event_rx,
                control_rx,
                rescan_boundary_tx,
                generation_running,
                fs_inner,
                report_invalidation_reason,
                transaction_settle_delay,
                transaction_barrier_timeout,
            )
        });

        // Updating `self.state` is done last. If we panic while setting up the watcher, it'll
        // stay in the `Stopped` state.
        let mut control_senders = self.control_senders.write().await;
        match state_guard {
            StateWriteGuard::Recursive(mut recursive) => {
                *recursive = RecursiveState::Watching {
                    _notify_watcher: notify_watcher,
                    senders: senders.clone(),
                }
            }
            StateWriteGuard::NonRecursive(mut non_recursive) => {
                *non_recursive = NonRecursiveState::Watching(NonRecursiveWatchingState {
                    notify_watcher,
                    senders: senders.clone(),
                    watched: BTreeSet::new(),
                })
            }
        };
        *control_senders = Some(senders);

        Ok(())
    }

    /// Begin one semantic source edit. The acknowledgement is a barrier: once returned, the
    /// watcher will retain invalidations until this transaction ends or its lease expires.
    /// Only one edit transaction may be active for a filesystem.
    pub async fn begin_edit_transaction(&self, changed_paths: Vec<PathBuf>) -> Result<Option<u32>> {
        let senders = self
            .state
            .message_senders()
            .await
            .context("filesystem watcher is not running")?;
        let token = self.next_transaction_id.fetch_add(1, Ordering::Relaxed);
        let (acknowledged, acknowledgment) = oneshot::channel();
        if senders
            .event_tx
            .send(WatchEventMessage::BeginEditTransaction {
                token,
                changed_paths,
                acknowledged,
            })
            .is_err()
        {
            anyhow::bail!("filesystem watcher stopped before transaction began");
        }
        Ok(acknowledgment
            .await
            .context("filesystem watcher stopped before acknowledging transaction")?
            .then_some(token))
    }

    pub async fn renew_edit_transaction(&self, token: u32) -> Result<bool> {
        let senders = self
            .control_senders
            .read()
            .await
            .clone()
            .context("filesystem watcher is not running")?;
        let (acknowledged, acknowledgment) = oneshot::channel();
        if !senders.send_control(EditTransactionMessage::Renew {
            token,
            acknowledged,
        }) {
            anyhow::bail!("filesystem watcher stopped before transaction renewed");
        }
        acknowledgment
            .await
            .context("filesystem watcher stopped before acknowledging transaction renewal")
    }

    /// End the matching edit transaction. A successful result is acknowledged only after its
    /// invalidations have been submitted.
    pub async fn end_edit_transaction(&self, token: u32) -> Result<bool> {
        let senders = self
            .control_senders
            .read()
            .await
            .clone()
            .context("filesystem watcher is not running")?;
        let (acknowledged, acknowledgment) = oneshot::channel();
        if !senders.send_control(EditTransactionMessage::End {
            token,
            acknowledged,
        }) {
            anyhow::bail!("filesystem watcher stopped before transaction ended");
        }
        acknowledgment
            .await
            .context("filesystem watcher stopped before acknowledging transaction end")
    }

    pub async fn stop_watching(&self) {
        let state_guard = self.state.write().await;
        let mut control_senders = self.control_senders.write().await;
        match state_guard {
            StateWriteGuard::Recursive(mut state) => {
                if let RecursiveState::Watching { senders, .. } = &*state {
                    senders.stop_generation();
                }
                *state = RecursiveState::Stopped;
            }
            StateWriteGuard::NonRecursive(mut state) => {
                if let NonRecursiveState::Watching(watching) = &*state {
                    watching.senders.stop_generation();
                }
                *state = NonRecursiveState::Stopped;
            }
        }
        *control_senders = None;
        // thread will detect the stop because the channel is disconnected when `NotifyWatcher` is
        // dropped
    }

    /// Internal thread that processes the events from the watcher
    /// and invalidates the cache.
    ///
    /// Should only be called once from `start_watching`.
    fn watch_thread(
        &self,
        event_rx: Receiver<WatchEventMessage>,
        control_rx: Receiver<EditTransactionMessage>,
        rescan_boundary_tx: Weak<Sender<WatchEventMessage>>,
        generation_running: Arc<Mutex<bool>>,
        fs_inner: Arc<DiskFileSystemInner>,
        report_invalidation_reason: bool,
        transaction_settle_delay: Duration,
        transaction_barrier_timeout: Duration,
    ) {
        let mut batch = BatchedInvalidations::new(self.state.recursive_mode());
        let mut active_transaction: Option<ActiveEditTransaction> = None;
        let mut settling: Option<EditTransactionSettling> = None;
        let mut pending_rescan = false;
        let mut discarding_rescan_events = false;
        let mut pending_end_acknowledgment: Option<oneshot::Sender<bool>> = None;
        let mut completed_transaction_rescans = 0;
        let mut pending_end_barrier: Option<PathBuf> = None;
        let mut pending_end_barrier_temporary_watch: Option<PathBuf> = None;
        let mut pending_end_barrier_deadline: Option<Instant> = None;

        'outer: loop {
            let mut deadline = active_transaction
                .as_ref()
                .map(|transaction| transaction.expiration)
                .or(pending_end_barrier_deadline)
                .or(settling.map(|settling| settling.deadline));
            loop {
                let now = Instant::now();
                if active_transaction
                    .as_ref()
                    .is_some_and(|transaction| transaction.expiration <= now)
                {
                    eprintln!("edit transaction lease expired");
                    active_transaction = None;
                    settling = Some(EditTransactionSettling::new(now, transaction_settle_delay));
                    deadline = settling.map(|settling| settling.deadline);
                }

                if pending_end_barrier_deadline
                    .is_some_and(|barrier_deadline| barrier_deadline <= now)
                {
                    eprintln!(
                        "edit transaction watcher barrier timed out; using bounded settle fallback"
                    );
                    if let Some(barrier_path) = pending_end_barrier.take() {
                        let _ = remove_file(barrier_path);
                    }
                    if let Some(directory) = pending_end_barrier_temporary_watch.take() {
                        fs_inner
                            .tokio_handle
                            .block_on(self.remove_edit_transaction_barrier_dir(&directory));
                    }
                    pending_end_barrier_deadline = None;
                    settling = Some(EditTransactionSettling::new(
                        // Removing a PollWatcher watch may block behind a scan. The fallback
                        // settle must start after cleanup, not from the stale timeout sample.
                        Instant::now(),
                        transaction_settle_delay,
                    ));
                    deadline = settling.map(|settling| settling.deadline);
                }

                if let Ok(message) = control_rx.try_recv() {
                    // Dequeue is the control operation's linearization point. The loop's `now`
                    // may predate a scheduler pause, so never use it to accept a bounded lease.
                    let control_now = Instant::now();
                    match message {
                        EditTransactionMessage::Renew {
                            token,
                            acknowledged,
                        } => {
                            // A sender cloned before shutdown can outlive the watcher stored in
                            // state. Serialize renewal admission and acknowledgment with
                            // stop_watching just like transaction begin.
                            let generation_guard = generation_running.lock().unwrap();
                            let accepted = *generation_guard
                                && active_transaction.as_mut().is_some_and(|transaction| {
                                    transaction.renew(token, control_now)
                                });
                            if accepted {
                                deadline = active_transaction
                                    .as_ref()
                                    .map(|transaction| transaction.expiration);
                            }
                            let _ = acknowledged.send(accepted);
                            drop(generation_guard);
                        }
                        EditTransactionMessage::End {
                            token,
                            acknowledged,
                        } => {
                            let accepted = active_transaction.as_ref().is_some_and(|transaction| {
                                transaction.is_active(token, control_now)
                            });
                            if accepted {
                                active_transaction = None;
                                pending_end_acknowledgment = Some(acknowledged);
                                completed_transaction_rescans = 0;
                                let barrier = (|| -> Result<_> {
                                    let directory =
                                        fs_inner.edit_transaction_barrier_directory().context(
                                            "project filesystem has no denied output directory",
                                        )?;
                                    create_dir_all(&directory)?;
                                    let temporary_watch = fs_inner.tokio_handle.block_on(
                                        self.ensure_edit_transaction_barrier_dir(
                                            &directory,
                                            fs_inner.root_path(),
                                        ),
                                    )?;
                                    match create_edit_transaction_barrier(&directory) {
                                        Ok(barrier_path) => Ok((
                                            barrier_path,
                                            temporary_watch.then_some(directory),
                                            Instant::now(),
                                        )),
                                        Err(error) => {
                                            if temporary_watch {
                                                fs_inner.tokio_handle.block_on(
                                                    self.remove_edit_transaction_barrier_dir(
                                                        &directory,
                                                    ),
                                                );
                                            }
                                            Err(error.into())
                                        }
                                    }
                                })();
                                match barrier {
                                    Ok((barrier_path, temporary_watch, barrier_created_at)) => {
                                        pending_end_barrier = Some(barrier_path);
                                        pending_end_barrier_temporary_watch = temporary_watch;
                                        // Watch installation and the PollWatcher initial scan may
                                        // block. Give the backend its full observation window from
                                        // the point at which the marker actually exists.
                                        pending_end_barrier_deadline =
                                            Some(barrier_created_at + transaction_barrier_timeout);
                                        deadline = pending_end_barrier_deadline;
                                    }
                                    Err(error) => {
                                        eprintln!(
                                            "failed to create edit transaction watcher barrier: \
                                             {error}; using bounded settle fallback"
                                        );
                                        settling = Some(EditTransactionSettling::new(
                                            // Barrier setup may include blocking watch cleanup.
                                            Instant::now(),
                                            transaction_settle_delay,
                                        ));
                                        deadline = settling.map(|settling| settling.deadline);
                                    }
                                }
                            } else {
                                let _ = acknowledged.send(false);
                            }
                        }
                    }
                    continue;
                }

                if settling.is_some_and(|settling| settling.deadline <= now) {
                    if let Some(directory) = pending_end_barrier_temporary_watch.take() {
                        // A PollWatcher callback can arrive in the middle of a recursive scan.
                        // Removing the temporary watch takes its scan lock, so this cannot return
                        // until the explicitly requested post-barrier poll has completed. Give
                        // already-sent callbacks one ordinary batch window to drain before flush.
                        fs_inner
                            .tokio_handle
                            .block_on(self.remove_edit_transaction_barrier_dir(&directory));
                        settling = Some(EditTransactionSettling::new(Instant::now(), BATCH_DELAY));
                        deadline = settling.map(|settling| settling.deadline);
                        continue;
                    }
                    break;
                }

                let event_result = match deadline {
                    None => event_rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
                    Some(deadline) => {
                        event_rx.recv_timeout(deadline.saturating_duration_since(now))
                    }
                };
                let event_result = match event_result {
                    Ok(message) => {
                        let Some(message) = retain_after_rescan_boundary(
                            message,
                            &mut discarding_rescan_events,
                            &mut pending_rescan,
                        ) else {
                            continue;
                        };
                        Ok(message)
                    }
                    Err(error) => Err(error),
                };
                match event_result {
                    Ok(WatchEventMessage::RescanBoundary) => {
                        if should_repeat_rescan(
                            pending_rescan,
                            pending_end_acknowledgment.is_some(),
                            completed_transaction_rescans,
                        ) {
                            break;
                        }
                        if pending_rescan {
                            // The FIFO boundary is queued before the last global invalidation, so
                            // that invalidation subsumed this pre-boundary overflow. Stop repeating
                            // after a bounded number of watch-restoration attempts.
                            eprintln!(concat!(
                                "edit transaction watcher repeatedly requested rescans; ",
                                "finishing after the bounded global invalidation"
                            ));
                            pending_rescan = false;
                        }
                        if let Some(acknowledged) = pending_end_acknowledgment.take() {
                            completed_transaction_rescans = 0;
                            let _ = acknowledged.send(true);
                        }
                        continue;
                    }
                    Ok(WatchEventMessage::ControlReady) => continue,
                    Ok(WatchEventMessage::BeginEditTransaction {
                        token,
                        changed_paths,
                        acknowledged,
                    }) => {
                        if active_transaction.is_none()
                            && settling.is_none()
                            && pending_end_acknowledgment.is_none()
                            && !pending_rescan
                            && !batch.is_empty()
                        {
                            // The begin message is FIFO behind filesystem callbacks already sent
                            // by the backend. Discard paths that cannot invalidate a current task,
                            // then refuse to absorb any relevant ordinary invalidation batch.
                            // Re-establish non-recursive watches before discarding irrelevant
                            // create events: `watched` outlives an inotify watch removed by the
                            // kernel when a directory is deleted.
                            if let State::NonRecursive(non_recursive) = &self.state {
                                for path in batch.new_paths() {
                                    let _ = fs_inner.tokio_handle.block_on(
                                        non_recursive_helpers::restore_if_watched(
                                            non_recursive,
                                            path,
                                            fs_inner.root_path(),
                                        ),
                                    );
                                }
                            }
                            let _lock = fs_inner.invalidation_lock.blocking_write();
                            batch.retain_relevant(
                                &fs_inner.invalidator_map,
                                &fs_inner.dir_invalidator_map,
                            );
                        }
                        // Serialize the final admission and its acknowledgment with
                        // stop_watching. A sender cloned before a stop must not acknowledge a
                        // transaction for a watcher generation that can no longer flush it.
                        let generation_guard = generation_running.lock().unwrap();
                        let accepted = *generation_guard
                            && active_transaction.is_none()
                            && settling.is_none()
                            && pending_end_acknowledgment.is_none()
                            && !pending_rescan
                            && batch.is_empty();
                        if accepted {
                            if batch.add_changed_paths(changed_paths, fs_inner.root_path()) {
                                eprintln!(
                                    "edit transaction retained too many paths; falling back to a \
                                     full invalidation"
                                );
                                pending_rescan = true;
                            }
                            // `event_rx.recv()` above may have blocked indefinitely while the
                            // watcher was idle, so the loop's `now` can predate this begin by an
                            // arbitrary amount. Start the advertised lease at acceptance.
                            let transaction = ActiveEditTransaction::new(token, Instant::now());
                            deadline = Some(transaction.expiration);
                            active_transaction = Some(transaction);
                        }
                        let _ = acknowledged.send(accepted);
                        drop(generation_guard);
                    }
                    Ok(WatchEventMessage::Filesystem(Ok(mut event))) => {
                        let barrier_observed = pending_end_barrier
                            .as_ref()
                            .is_some_and(|barrier_path| event.paths.contains(barrier_path));
                        event.paths.retain(|path| {
                            pending_end_barrier.as_ref() != Some(path)
                                && !fs_inner.is_sys_path_denied(path)
                        });
                        if barrier_observed {
                            if let Some(barrier_path) = pending_end_barrier.take() {
                                let _ = remove_file(barrier_path);
                            }
                            if let Some(directory) = pending_end_barrier_temporary_watch.take() {
                                match fs_inner
                                    .tokio_handle
                                    .block_on(self.synchronize_edit_transaction_poll(&directory))
                                {
                                    Ok(true) => {
                                        pending_end_barrier_temporary_watch = Some(directory);
                                    }
                                    Ok(false) => {}
                                    Err(error) => {
                                        eprintln!(
                                            "failed to synchronize edit transaction polling \
                                             barrier: {error}; using bounded settle fallback"
                                        );
                                        fs_inner.tokio_handle.block_on(
                                            self.remove_edit_transaction_barrier_dir(&directory),
                                        );
                                    }
                                }
                            }
                            pending_end_barrier_deadline = None;
                            settling = Some(EditTransactionSettling::new(
                                Instant::now(),
                                transaction_settle_delay,
                            ));
                            deadline = settling.map(|settling| settling.deadline);
                        }

                        if pending_rescan {
                            continue;
                        }

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
                            pending_rescan = true;
                            batch.clear();
                            if active_transaction.is_none() && settling.is_none() {
                                if let Some(barrier_path) = pending_end_barrier.take() {
                                    let _ = remove_file(barrier_path);
                                }
                                if let Some(directory) = pending_end_barrier_temporary_watch.take()
                                {
                                    fs_inner.tokio_handle.block_on(
                                        self.remove_edit_transaction_barrier_dir(&directory),
                                    );
                                }
                                pending_end_barrier_deadline = None;
                                break;
                            }
                            continue;
                        }

                        // Only an event that contributes to the batch keeps it open for another
                        // `BATCH_DELAY`.
                        if batch.add_event(event) {
                            if transaction_retention_overflowed(
                                &mut batch,
                                active_transaction.is_some(),
                                pending_end_acknowledgment.is_some(),
                                settling.is_some(),
                            ) {
                                eprintln!(
                                    "edit transaction retained too many paths; falling back to a \
                                     full invalidation"
                                );
                                pending_rescan = true;
                            }
                            if let Some(settling) = &mut settling {
                                settling.extend(Instant::now());
                                deadline = Some(settling.deadline);
                            } else if active_transaction.is_none()
                                && pending_end_barrier_deadline.is_none()
                            {
                                deadline = Some(Instant::now() + BATCH_DELAY);
                            }
                        }
                    }
                    // Error raised by notify watcher itself
                    Ok(WatchEventMessage::Filesystem(Err(notify::Error { kind, mut paths }))) => {
                        println!("watch error ({paths:?}): {kind:?} ");

                        if pending_rescan {
                            continue;
                        }

                        let had_paths = !paths.is_empty();
                        paths.retain(|path| {
                            pending_end_barrier.as_ref() != Some(path)
                                && !fs_inner.is_sys_path_denied(path)
                        });
                        if had_paths && paths.is_empty() {
                            continue;
                        }

                        let flags = InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR;
                        if paths.is_empty() {
                            batch.mark(fs_inner.root_path().into(), flags);
                        } else {
                            for path in paths {
                                batch.mark(path.into_boxed_path(), flags);
                            }
                        }
                        if transaction_retention_overflowed(
                            &mut batch,
                            active_transaction.is_some(),
                            pending_end_acknowledgment.is_some(),
                            settling.is_some(),
                        ) {
                            eprintln!(
                                "edit transaction retained too many watcher-error paths; falling \
                                 back to a full invalidation"
                            );
                            pending_rescan = true;
                        }
                        if let Some(settling) = &mut settling {
                            settling.extend(Instant::now());
                            deadline = Some(settling.deadline);
                        } else if active_transaction.is_none()
                            && pending_end_barrier_deadline.is_none()
                        {
                            deadline = Some(Instant::now() + BATCH_DELAY);
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        if pending_end_barrier_deadline.is_some() {
                            deadline = pending_end_barrier_deadline;
                            continue;
                        }
                        if active_transaction.is_none() {
                            if settling.is_some() && pending_end_barrier_temporary_watch.is_some() {
                                // Re-enter at the top so the quiet PollWatcher path synchronizes
                                // and removes its temporary watch before flushing.
                                continue;
                            }
                            break;
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        // Sender has been disconnected, which means DiskFileSystem has been dropped
                        // exit thread
                        break 'outer;
                    }
                }
            }

            debug_assert!(active_transaction.is_none());

            if pending_rescan {
                let _lock = fs_inner.invalidation_lock.blocking_write();

                if let State::NonRecursive(non_recursive) = &self.state {
                    fs_inner.tokio_handle.block_on(
                        non_recursive_helpers::restore_all_watched_ignore_errors(
                            non_recursive,
                            fs_inner.root_path(),
                        ),
                    );
                }

                // Place the FIFO boundary before the global invalidation. Directory reads do not
                // all take the invalidation lock, so an event racing the invalidation must land
                // after the boundary and be processed conservatively instead of being discarded.
                let Some(rescan_boundary_tx) = rescan_boundary_tx.upgrade() else {
                    break 'outer;
                };
                if rescan_boundary_tx
                    .send(WatchEventMessage::RescanBoundary)
                    .is_err()
                {
                    break 'outer;
                }

                if report_invalidation_reason {
                    fs_inner.invalidate_with_reason(|path| InvalidateRescan {
                        path: RcStr::from(path.to_string_lossy()),
                    });
                } else {
                    fs_inner.invalidate();
                }

                discarding_rescan_events = true;
                batch.clear();
                pending_rescan = false;
                if pending_end_acknowledgment.is_some() {
                    completed_transaction_rescans += 1;
                }
            } else {
                // We need to start watching first before invalidating the changed paths. This is
                // only needed on platforms where watching is non-recursive.
                if let State::NonRecursive(non_recursive) = &self.state {
                    for path in batch.new_paths() {
                        let _ = fs_inner.tokio_handle.block_on(
                            non_recursive_helpers::restore_if_watched(
                                non_recursive,
                                path,
                                fs_inner.root_path(),
                            ),
                        );
                    }
                }

                let Some(turbo_tasks) = fs_inner.turbo_tasks.upgrade() else {
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

            settling = None;
            if !discarding_rescan_events
                && let Some(acknowledged) = pending_end_acknowledgment.take()
            {
                completed_transaction_rescans = 0;
                let _ = acknowledged.send(true);
            }
        }

        if let Some(barrier_path) = pending_end_barrier {
            let _ = remove_file(barrier_path);
        }
        if let Some(directory) = pending_end_barrier_temporary_watch {
            fs_inner
                .tokio_handle
                .block_on(self.remove_edit_transaction_barrier_dir(&directory));
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

    async fn ensure_edit_transaction_barrier_dir(
        &self,
        dir_path: &Path,
        root_path: &Path,
    ) -> Result<bool> {
        match &self.state {
            State::Recursive(recursive) => {
                let mut guard = recursive.write().await;
                let RecursiveState::Watching {
                    _notify_watcher, ..
                } = &mut *guard
                else {
                    return Ok(false);
                };
                let owns_temporary_watch =
                    _notify_watcher.watch_edit_transaction_barrier(dir_path)?;
                Ok(owns_temporary_watch)
            }
            State::NonRecursive(non_recursive) => {
                non_recursive_helpers::watch_temporary_dir(non_recursive, dir_path, root_path).await
            }
        }
    }

    async fn remove_edit_transaction_barrier_dir(&self, dir_path: &Path) {
        match &self.state {
            State::Recursive(recursive) => {
                let mut guard = recursive.write().await;
                if let RecursiveState::Watching {
                    _notify_watcher, ..
                } = &mut *guard
                {
                    let _ = _notify_watcher.unwatch(dir_path);
                }
            }
            State::NonRecursive(non_recursive) => {
                non_recursive_helpers::unwatch_temporary_dir(non_recursive, dir_path).await;
            }
        }
    }

    async fn synchronize_edit_transaction_poll(&self, dir_path: &Path) -> Result<bool> {
        match &self.state {
            State::Recursive(recursive) => {
                let mut guard = recursive.write().await;
                let RecursiveState::Watching {
                    _notify_watcher, ..
                } = &mut *guard
                else {
                    return Ok(false);
                };
                let await_post_barrier_poll =
                    _notify_watcher.synchronize_edit_transaction_poll(dir_path)?;
                Ok(await_post_barrier_poll)
            }
            State::NonRecursive(non_recursive) => {
                let mut guard = non_recursive.write().await;
                let NonRecursiveState::Watching(watching_state) = &mut *guard else {
                    return Ok(false);
                };
                let await_post_barrier_poll = watching_state
                    .notify_watcher
                    .synchronize_edit_transaction_poll(dir_path)?;
                Ok(await_post_barrier_poll)
            }
        }
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
    path_bytes: usize,
    /// See [`Self::new_paths`]. Stored as [`None`] in recursive mode.
    new_paths: Option<FxHashSet<Box<Path>>>,
}

impl BatchedInvalidations {
    fn new(recursive_mode: RecursiveMode) -> Self {
        Self {
            paths: FxHashMap::default(),
            path_bytes: 0,
            new_paths: match recursive_mode {
                RecursiveMode::NonRecursive => Some(FxHashSet::default()),
                RecursiveMode::Recursive => None,
            },
        }
    }

    fn clear(&mut self) {
        self.paths.clear();
        self.path_bytes = 0;
        if let Some(new_paths) = &mut self.new_paths {
            new_paths.clear();
        }
    }

    fn is_empty(&self) -> bool {
        self.paths.is_empty() && self.new_paths.as_ref().is_none_or(FxHashSet::is_empty)
    }

    /// Records `path` as potentially created or replaced so its watch can be (re-)established.
    /// No-op in recursive watching mode.
    fn mark_new_path(&mut self, path: &Path) {
        if let Some(new_paths) = &mut self.new_paths {
            new_paths.insert(Box::from(path));
        }
    }

    fn mark(&mut self, path: Box<Path>, flags: InvalidationFlags) {
        match self.paths.entry(path) {
            Entry::Occupied(mut entry) => *entry.get_mut() |= flags,
            Entry::Vacant(entry) => {
                self.path_bytes += entry.key().as_os_str().as_encoded_bytes().len();
                entry.insert(flags);
            }
        }
    }

    fn exceeds_transaction_limits(&self) -> bool {
        self.paths.len() > EDIT_TRANSACTION_MAX_RETAINED_PATHS
            || self.path_bytes > EDIT_TRANSACTION_MAX_RETAINED_PATH_BYTES
    }

    fn mark_parent_dir(&mut self, path: &Path) {
        if let Some(parent) = path.parent() {
            self.mark(Box::from(parent), InvalidationFlags::PATH_DIR);
        }
    }

    fn mark_parent_dirs_through_existing(&mut self, path: &Path, root_path: &Path) -> bool {
        let mut parent = path.parent();
        while let Some(directory) = parent {
            if !directory.starts_with(root_path) {
                break;
            }
            self.mark(Box::from(directory), InvalidationFlags::PATH_DIR);
            // A declared descendant can replace an already-watched directory without the
            // platform delivering its create event. Restore every traversed ancestor before
            // publishing so a stale non-recursive watch cannot hide later edits.
            self.mark_new_path(directory);
            if self.exceeds_transaction_limits() {
                self.clear();
                return true;
            }
            if directory == root_path || directory.try_exists().unwrap_or(false) {
                break;
            }
            parent = directory.parent();
        }
        false
    }

    /// Add controller-confirmed paths up front, so the final flush is authoritative even if a
    /// platform watcher delivers the corresponding events late or loses them entirely.
    /// Returns true after clearing the batch if expansion reaches either retention limit.
    fn add_changed_paths(&mut self, paths: Vec<PathBuf>, root_path: &Path) -> bool {
        for path in paths {
            // A declared file may be created below directories that do not exist at begin time.
            // Mark through the nearest existing ancestor so its directory/glob invalidator is
            // guaranteed to run if the watcher drops intermediate creates. On metadata errors,
            // continue conservatively to the filesystem root.
            if self.mark_parent_dirs_through_existing(&path, root_path) {
                return true;
            }
            self.mark_new_path(&path);
            self.mark(
                path.into_boxed_path(),
                InvalidationFlags::PATH_AND_CHILDREN | InvalidationFlags::PATH_AND_CHILDREN_DIR,
            );
            if self.exceeds_transaction_limits() {
                self.clear();
                return true;
            }
        }
        false
    }

    /// Remove paths that cannot invalidate a task registered at this barrier. This is used only
    /// while admitting an edit transaction, under `DiskFileSystemInner::invalidation_lock`, so an
    /// unrelated watcher-root event cannot cause permanent `busy` responses.
    fn retain_relevant(
        &mut self,
        invalidator_map: &InvalidatorMap,
        dir_invalidator_map: &InvalidatorMap,
    ) {
        fn contains_path_or_child(map: &LockedInvalidatorMap, path: &Path) -> bool {
            use std::ops::Bound::{Included, Unbounded};

            map.range::<Path, _>((Included(path), Unbounded))
                .next()
                .is_some_and(|(candidate, _)| candidate.starts_with(path))
        }

        let invalidator_map = invalidator_map.lock().unwrap();
        let dir_invalidator_map = dir_invalidator_map.lock().unwrap();
        self.paths.retain(|path, flags| {
            (flags.contains(InvalidationFlags::PATH) && invalidator_map.contains_key(&**path))
                || (flags.contains(InvalidationFlags::PATH_AND_CHILDREN)
                    && contains_path_or_child(&invalidator_map, path))
                || (flags.contains(InvalidationFlags::PATH_DIR)
                    && dir_invalidator_map.contains_key(&**path))
                || (flags.contains(InvalidationFlags::PATH_AND_CHILDREN_DIR)
                    && contains_path_or_child(&dir_invalidator_map, path))
        });
        self.path_bytes = self
            .paths
            .keys()
            .map(|path| path.as_os_str().as_encoded_bytes().len())
            .sum();
        if let Some(new_paths) = &mut self.new_paths {
            new_paths.retain(|path| self.paths.contains_key(&**path));
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
                match <[PathBuf; 2]>::try_from(paths) {
                    Ok([source, destination]) => {
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
                    }
                    Err(paths) => {
                        // Path filtering can remove one side of a rename across a denied output
                        // boundary. Conservatively invalidate every surviving path instead of
                        // panicking the watcher thread.
                        for path in paths {
                            self.mark_parent_dir(&path);
                            self.mark_new_path(&path);
                            self.mark(
                                path.into_boxed_path(),
                                InvalidationFlags::PATH_AND_CHILDREN
                                    | InvalidationFlags::PATH_AND_CHILDREN_DIR,
                            );
                        }
                    }
                }
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

fn transaction_retention_overflowed(
    batch: &mut BatchedInvalidations,
    active_transaction: bool,
    pending_end_acknowledgment: bool,
    settling: bool,
) -> bool {
    if !(active_transaction || pending_end_acknowledgment || settling)
        || !batch.exceeds_transaction_limits()
    {
        return false;
    }
    batch.clear();
    true
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

