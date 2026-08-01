use std::{
    any::Any,
    collections::{BTreeSet, VecDeque, hash_map::Entry},
    env, fmt,
    mem::take,
    path::{Path, PathBuf},
    sync::{
        Arc, LazyLock,
        atomic::{AtomicU32, Ordering},
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

/// How long to extend an invalidation batch by when receiving new events, before flushing. This
/// reduces invalidations if the same file or directory is modified many times.
///
/// Linux watching is too fast, so we need a longer delay there to avoid reading wip files.
#[cfg(target_os = "linux")]
const BATCH_DELAY: Duration = Duration::from_millis(10);
#[cfg(not(target_os = "linux"))]
const BATCH_DELAY: Duration = Duration::from_millis(1);

/// A transaction lease is deliberately short so a crashed controller cannot leave the preview
/// stale. Long-running controllers can renew their own token without extending other controllers,
/// but all overlapping tokens share an absolute batch lifetime so rotating tokens cannot withhold
/// invalidation indefinitely.
pub(crate) const EDIT_TRANSACTION_LEASE: Duration = Duration::from_secs(5);
pub(crate) const EDIT_TRANSACTION_MAX_DURATION: Duration = Duration::from_secs(60);
/// A long transaction must not turn unrelated checkout/install traffic into an unbounded in-memory
/// path batch. Crossing either limit falls back to one deferred full invalidation.
const EDIT_TRANSACTION_MAX_RETAINED_PATHS: usize = 16 * 1024;
const EDIT_TRANSACTION_MAX_RETAINED_PATH_BYTES: usize = 4 * 1024 * 1024;

fn initial_transaction_id() -> AtomicU32 {
    AtomicU32::new(1)
}

#[derive(Encode, Decode)]
pub(crate) struct DiskWatcher {
    #[bincode(skip)]
    state: State,
    #[bincode(skip, default = "initial_transaction_id")]
    next_transaction_id: AtomicU32,
}

#[derive(Clone, Copy)]
struct EditTransactionLease {
    expiration: Instant,
    maximum_expiration: Instant,
}

impl EditTransactionLease {
    fn new(now: Instant, maximum_expiration: Instant) -> Self {
        Self {
            expiration: (now + EDIT_TRANSACTION_LEASE).min(maximum_expiration),
            maximum_expiration,
        }
    }

    fn is_active_at(&self, requested_at: Instant) -> bool {
        self.expiration > requested_at && self.maximum_expiration > requested_at
    }

    fn renew(&mut self, requested_at: Instant, now: Instant) -> bool {
        if !self.is_active_at(requested_at) || self.maximum_expiration <= now {
            return false;
        }
        self.expiration = (now + EDIT_TRANSACTION_LEASE).min(self.maximum_expiration);
        true
    }
}

#[derive(Default)]
struct EditTransactionBatchState {
    maximum_expiration: Option<Instant>,
    forced_settle: bool,
    pending_rescan: bool,
}

impl EditTransactionBatchState {
    fn maximum_expiration(&mut self, now: Instant) -> Instant {
        *self
            .maximum_expiration
            .get_or_insert(now + EDIT_TRANSACTION_MAX_DURATION)
    }

    fn force_settle(&mut self) {
        self.forced_settle = true;
    }

    fn is_settling(&self, has_pending_end: bool) -> bool {
        self.forced_settle || has_pending_end
    }

    fn is_forced_settle(&self) -> bool {
        self.forced_settle
    }

    fn request_rescan(&mut self) {
        self.pending_rescan = true;
    }

    fn has_pending_rescan(&self) -> bool {
        self.pending_rescan
    }

    fn is_transaction_batch(&self) -> bool {
        self.maximum_expiration.is_some()
    }

    fn reset(&mut self) {
        *self = Self::default();
    }
}

enum WatchEventMessage {
    Filesystem(notify::Result<notify::Event>),
    /// Wakes the event receiver after a control message is queued. The control receiver is checked
    /// first on every loop iteration, so it cannot sit behind a filesystem-event backlog.
    ControlReady,
}

fn drain_rescan_event_backlog(event_rx: &Receiver<WatchEventMessage>) {
    // A full rescan subsumes every filesystem message already queued. Control payloads use their
    // own receiver and are polled directly before the next filesystem receive, so consuming their
    // wake tokens here cannot lose or delay an edit-transaction control.
    while event_rx.try_recv().is_ok() {}
}

enum EditTransactionMessage {
    Begin {
        token: u32,
        acknowledged: oneshot::Sender<bool>,
    },
    Renew {
        token: u32,
        requested_at: Instant,
        acknowledged: oneshot::Sender<bool>,
    },
    End {
        token: u32,
        requested_at: Instant,
        changed_paths: Vec<PathBuf>,
        acknowledged: oneshot::Sender<(bool, bool)>,
    },
}

#[derive(Clone)]
struct WatchSenders {
    event_tx: Sender<WatchEventMessage>,
    control_tx: Sender<EditTransactionMessage>,
}

impl WatchSenders {
    fn send_control(&self, message: EditTransactionMessage) -> bool {
        if self.control_tx.send(message).is_err() {
            return false;
        }
        self.event_tx.send(WatchEventMessage::ControlReady).is_ok()
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

        // Keep filesystem events and transaction controls on separate channels. Controls wake the
        // event receiver, but are always processed first, so a busy watcher cannot starve a timely
        // renew or end behind an arbitrary filesystem backlog.
        let (event_tx, event_rx) = channel();
        let (control_tx, control_rx) = channel();
        // Create a watcher object, delivering debounced events.
        // The notification back-end is selected based on the platform.
        let config = Config::default();
        // we should track and invalidate each part of a symlink chain ourselves in
        // turbo-tasks-fs
        let config = config.with_follow_symlinks(false);

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

        spawn_thread(move || {
            fs_inner.clone().watcher.watch_thread(
                event_rx,
                control_rx,
                fs_inner,
                report_invalidation_reason,
            )
        });

        let senders = WatchSenders {
            event_tx,
            control_tx,
        };
        // Updating `self.state` is done last. If we panic while setting up the watcher, it'll
        // stay in the `Stopped` state.
        match state_guard {
            StateWriteGuard::Recursive(mut recursive) => {
                *recursive = RecursiveState::Watching {
                    _notify_watcher: notify_watcher,
                    senders,
                }
            }
            StateWriteGuard::NonRecursive(mut non_recursive) => {
                *non_recursive = NonRecursiveState::Watching(NonRecursiveWatchingState {
                    notify_watcher,
                    senders,
                    watched: BTreeSet::new(),
                })
            }
        };

        Ok(())
    }

    /// Start an explicitly bounded source edit. The acknowledgement guarantees that the watcher is
    /// retaining invalidations before this method returns.
    pub async fn begin_edit_transaction(&self) -> Result<u32> {
        let senders = self
            .state
            .message_senders()
            .await
            .context("filesystem watcher is not running")?;
        let token = self.next_transaction_id.fetch_add(1, Ordering::Relaxed);
        let (acknowledged, acknowledgment) = oneshot::channel();
        if !senders.send_control(EditTransactionMessage::Begin {
            token,
            acknowledged,
        }) {
            anyhow::bail!("filesystem watcher stopped before transaction began");
        }
        if !acknowledgment
            .await
            .context("filesystem watcher stopped before acknowledging transaction")?
        {
            anyhow::bail!("filesystem watcher rejected edit transaction");
        }
        Ok(token)
    }

    /// Renew only the matching transaction's lease. A `false` result means the token was unknown
    /// or its prior lease already expired.
    pub async fn renew_edit_transaction(&self, token: u32) -> Result<bool> {
        let senders = self
            .state
            .message_senders()
            .await
            .context("filesystem watcher is not running")?;
        let (acknowledged, acknowledgment) = oneshot::channel();
        if !senders.send_control(EditTransactionMessage::Renew {
            token,
            requested_at: Instant::now(),
            acknowledged,
        }) {
            anyhow::bail!("filesystem watcher stopped before transaction renewed");
        }
        acknowledgment
            .await
            .context("filesystem watcher stopped before acknowledging transaction renewal")
    }

    /// Finish an explicitly bounded source edit. A successful acknowledgement is delayed until the
    /// final token's invalidations have been submitted, so callers cannot mistake release for
    /// flush.
    pub async fn end_edit_transaction(
        &self,
        token: u32,
        changed_paths: Vec<PathBuf>,
    ) -> Result<(bool, bool)> {
        let senders = self
            .state
            .message_senders()
            .await
            .context("filesystem watcher is not running")?;
        let (acknowledged, acknowledgment) = oneshot::channel();
        if !senders.send_control(EditTransactionMessage::End {
            token,
            requested_at: Instant::now(),
            changed_paths,
            acknowledged,
        }) {
            anyhow::bail!("filesystem watcher stopped before transaction ended");
        }
        acknowledgment
            .await
            .context("filesystem watcher stopped before acknowledging transaction end")
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
        event_rx: Receiver<WatchEventMessage>,
        control_rx: Receiver<EditTransactionMessage>,
        fs_inner: Arc<DiskFileSystemInner>,
        report_invalidation_reason: bool,
    ) {
        let mut batch = BatchedInvalidations::new(self.state.recursive_mode());
        let mut active_edit_transactions = FxHashMap::<u32, EditTransactionLease>::default();
        // This is batch state, not token state. Keep it until the batch is actually executed so a
        // begin racing an abandoned token's final settle cannot mint a fresh maximum or absorb the
        // batch that is already being forced out.
        let mut edit_transaction_batch = EditTransactionBatchState::default();
        let mut pending_end_acknowledgements = Vec::new();
        let mut deferred_controls = VecDeque::new();
        let mut deferred_begins = Vec::new();

        'outer: loop {
            let mut deadline = active_edit_transactions
                .values()
                .map(|lease| lease.expiration)
                .min();
            loop {
                // Transaction controls have their own channel and are checked before expiry and
                // before every filesystem event. `requested_at` preserves whether a renew or end
                // was timely even if this thread was busy processing an earlier event.
                let control_message = deferred_controls
                    .pop_front()
                    .or_else(|| control_rx.try_recv().ok());
                if let Some(message) = control_message {
                    match message {
                        EditTransactionMessage::Begin {
                            token,
                            acknowledged,
                        } => {
                            // A begin that races the final settle must wait for the previous flush.
                            // It must not absorb that previous settling interval.
                            if edit_transaction_batch
                                .is_settling(!pending_end_acknowledgements.is_empty())
                            {
                                deferred_begins.push(EditTransactionMessage::Begin {
                                    token,
                                    acknowledged,
                                });
                            } else {
                                let accepted = !active_edit_transactions.contains_key(&token);
                                if accepted {
                                    let now = Instant::now();
                                    let maximum_expiration =
                                        edit_transaction_batch.maximum_expiration(now);
                                    active_edit_transactions.insert(
                                        token,
                                        EditTransactionLease::new(now, maximum_expiration),
                                    );
                                    if batch.exceeds_transaction_limits() {
                                        eprintln!(
                                            "edit transaction captured too many pre-existing \
                                             filesystem paths; falling back to a full invalidation"
                                        );
                                        edit_transaction_batch.request_rescan();
                                        batch.clear();
                                    }
                                    deadline = active_edit_transactions
                                        .values()
                                        .map(|lease| lease.expiration)
                                        .min();
                                }
                                let _ = acknowledged.send(accepted);
                            }
                        }
                        EditTransactionMessage::Renew {
                            token,
                            requested_at,
                            acknowledged,
                        } => {
                            let now = Instant::now();
                            let accepted = active_edit_transactions
                                .get_mut(&token)
                                .is_some_and(|lease| lease.renew(requested_at, now));
                            let expired_active_lease =
                                !accepted && active_edit_transactions.remove(&token).is_some();
                            let _ = acknowledged.send(accepted);
                            deadline = if !active_edit_transactions.is_empty() {
                                active_edit_transactions
                                    .values()
                                    .map(|lease| lease.expiration)
                                    .min()
                            } else if pending_end_acknowledgements.is_empty()
                                && expired_active_lease
                            {
                                edit_transaction_batch.force_settle();
                                Some(now + BATCH_DELAY)
                            } else {
                                // A stale renewal must not extend another transaction's final
                                // settle.
                                deadline
                            };
                        }
                        EditTransactionMessage::End {
                            token,
                            requested_at,
                            changed_paths,
                            acknowledged,
                        } => {
                            let accepted = active_edit_transactions
                                .get(&token)
                                .is_some_and(|lease| lease.is_active_at(requested_at));
                            active_edit_transactions.remove(&token);
                            if !edit_transaction_batch.has_pending_rescan() {
                                batch.add_changed_paths(changed_paths);
                                if batch.exceeds_transaction_limits() {
                                    eprintln!(
                                        "edit transaction end submitted too many paths; falling \
                                         back to a full invalidation"
                                    );
                                    edit_transaction_batch.request_rescan();
                                    batch.clear();
                                }
                            }
                            if active_edit_transactions.is_empty() {
                                // Controller-confirmed paths remain authoritative even if this end
                                // was queued after the token expired. Report the final flush
                                // independently from token acceptance so JavaScript can release its
                                // retained path budget immediately after invalidation.
                                pending_end_acknowledgements.push((acknowledged, (accepted, true)));
                                if !edit_transaction_batch.is_forced_settle() {
                                    deadline = Some(Instant::now() + BATCH_DELAY);
                                }
                            } else {
                                let _ = acknowledged.send((accepted, false));
                                deadline = active_edit_transactions
                                    .values()
                                    .map(|lease| lease.expiration)
                                    .min();
                            }
                        }
                    }
                    continue;
                }

                // A busy filesystem queue must not starve transaction expiry or a final settle
                // deadline. Check both before consuming each queued event.
                let now = Instant::now();
                let before = active_edit_transactions.len();
                active_edit_transactions.retain(|_, lease| lease.expiration > now);
                let expired = before - active_edit_transactions.len();
                if expired > 0 {
                    eprintln!("edit transaction lease expired for {expired} token(s)");
                    deadline = if active_edit_transactions.is_empty() {
                        // A controller may disappear in the middle of a physical write. Give the
                        // filesystem the ordinary settling interval before forcing progress. This
                        // deadline is fixed: neither filesystem traffic nor a racing begin may
                        // extend or join the abandoned batch.
                        edit_transaction_batch.force_settle();
                        Some(now + BATCH_DELAY)
                    } else {
                        active_edit_transactions
                            .values()
                            .map(|lease| lease.expiration)
                            .min()
                    };
                }
                if active_edit_transactions.is_empty()
                    && edit_transaction_batch.is_settling(!pending_end_acknowledgements.is_empty())
                    && deadline.is_some_and(|deadline| deadline <= now)
                {
                    break;
                }

                let event_result = match deadline {
                    None => event_rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
                    Some(deadline) => {
                        event_rx.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    }
                };
                match event_result {
                    Ok(WatchEventMessage::ControlReady) => continue,
                    Ok(WatchEventMessage::Filesystem(Ok(event))) => {
                        // A pending full invalidation already subsumes every later filesystem
                        // event. Discard them so a deferred rescan cannot
                        // rebuild an unbounded path batch.
                        if edit_transaction_batch.has_pending_rescan() {
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
                            // A rescan means the platform watcher lost event history, but it must
                            // not revoke an acknowledged semantic edit
                            // and expose its partial state. Defer
                            // the full invalidation until the active transaction settles or
                            // expires. The eventual full invalidation
                            // subsumes both the queued events and the
                            // controller-confirmed changed paths.
                            edit_transaction_batch.request_rescan();
                            batch.clear();
                            if active_edit_transactions.is_empty()
                                && !edit_transaction_batch
                                    .is_settling(!pending_end_acknowledgements.is_empty())
                            {
                                break;
                            }
                            continue;
                        }

                        // Only an event that contributes to the batch keeps it open for another
                        // `BATCH_DELAY`.
                        if batch.add_event(event) {
                            if edit_transaction_batch.is_transaction_batch()
                                && batch.exceeds_transaction_limits()
                            {
                                eprintln!(
                                    "edit transaction retained too many filesystem paths; falling \
                                     back to a full invalidation"
                                );
                                edit_transaction_batch.request_rescan();
                                batch.clear();
                            }
                            deadline = if !active_edit_transactions.is_empty() {
                                active_edit_transactions
                                    .values()
                                    .map(|lease| lease.expiration)
                                    .min()
                            } else if !edit_transaction_batch
                                .is_settling(!pending_end_acknowledgements.is_empty())
                            {
                                Some(Instant::now() + BATCH_DELAY)
                            } else {
                                // Controller-confirmed paths make the final settle deadline fixed.
                                // Late watcher events are still included without extending the ack.
                                deadline
                            };
                        }
                    }
                    // Error raised by notify watcher itself
                    Ok(WatchEventMessage::Filesystem(Err(notify::Error { kind, paths }))) => {
                        println!("watch error ({paths:?}): {kind:?} ");

                        // The pending full invalidation also subsumes watcher-error paths.
                        // Retaining them here would allow unbounded growth
                        // while a transaction defers rescan.
                        if edit_transaction_batch.has_pending_rescan() {
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
                        if edit_transaction_batch.is_transaction_batch()
                            && batch.exceeds_transaction_limits()
                        {
                            eprintln!(
                                "edit transaction retained too many watcher-error paths; falling \
                                 back to a full invalidation"
                            );
                            edit_transaction_batch.request_rescan();
                            batch.clear();
                        }
                        deadline = if !active_edit_transactions.is_empty() {
                            active_edit_transactions
                                .values()
                                .map(|lease| lease.expiration)
                                .min()
                        } else if !edit_transaction_batch
                            .is_settling(!pending_end_acknowledgements.is_empty())
                        {
                            Some(Instant::now() + BATCH_DELAY)
                        } else {
                            // Match the ordinary event path: notification errors are included in
                            // the final transaction flush without extending its acknowledgement.
                            deadline
                        };
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        if active_edit_transactions.is_empty() {
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

            if edit_transaction_batch.has_pending_rescan() {
                let _lock = fs_inner.invalidation_lock.blocking_write();
                drain_rescan_event_backlog(&event_rx);
                if let State::NonRecursive(non_recursive) = &self.state {
                    // Rescan events contain no usable paths for the one global non-recursive
                    // watcher. Restore every previously tracked watch immediately before the full
                    // invalidation becomes visible.
                    fs_inner.tokio_handle.block_on(
                        non_recursive_helpers::restore_all_watched_ignore_errors(
                            non_recursive,
                            fs_inner.root_path(),
                        ),
                    );
                }
                if report_invalidation_reason {
                    fs_inner.invalidate_with_reason(|path| InvalidateRescan {
                        // This path is used only for display purposes.
                        path: RcStr::from(path.to_string_lossy()),
                    });
                } else {
                    fs_inner.invalidate();
                }
                batch.clear();
            } else {
                // We need to start watching first before invalidating the changed paths. This is
                // only needed on platforms where watching is non-recursive.
                if let State::NonRecursive(non_recursive) = &self.state {
                    for path in batch.new_paths() {
                        // TODO: Report diagnostics if this error happens
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
            for (acknowledged, result) in take(&mut pending_end_acknowledgements) {
                let _ = acknowledged.send(result);
            }
            edit_transaction_batch.reset();
            deferred_controls.extend(take(&mut deferred_begins));
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
    path_bytes: usize,
    /// See [`Self::new_paths`]). Stored as [`None`] in non-recursive mode.
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

    /// Records `path` as newly-created so its watch can be (re-)established. No-op in recursive
    /// watching mode.
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

    /// Add controller-confirmed changed paths. The broad flags safely cover creates, removes,
    /// renames, and modifications even when the platform watcher delivers its event after `end`.
    /// Controllers include created, removed, and renamed directories as changed paths, so marking
    /// each immediate parent is sufficient to discover a nested subtree without invalidating every
    /// directory up to a monorepo root.
    fn add_changed_paths(&mut self, paths: Vec<PathBuf>) {
        for path in paths {
            self.mark_parent_dir(&path);
            self.mark_new_path(&path);
            self.mark(
                path.into_boxed_path(),
                InvalidationFlags::PATH_AND_CHILDREN | InvalidationFlags::PATH_AND_CHILDREN_DIR,
            );
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
    use super::*;

    #[test]
    fn edit_transaction_renewal_has_an_absolute_deadline() {
        let started_at = Instant::now();
        let maximum_expiration = started_at + EDIT_TRANSACTION_MAX_DURATION;
        let mut lease = EditTransactionLease::new(started_at, maximum_expiration);

        assert!(lease.renew(
            started_at + EDIT_TRANSACTION_LEASE / 2,
            started_at + EDIT_TRANSACTION_LEASE / 2
        ));
        assert_eq!(
            lease.expiration,
            started_at + EDIT_TRANSACTION_LEASE + EDIT_TRANSACTION_LEASE / 2
        );

        let renewal_interval = EDIT_TRANSACTION_LEASE / 2;
        let mut renewal_at = started_at + EDIT_TRANSACTION_LEASE;
        while renewal_at < started_at + EDIT_TRANSACTION_MAX_DURATION {
            assert!(lease.renew(renewal_at, renewal_at));
            renewal_at += renewal_interval;
        }

        let just_before_maximum =
            started_at + EDIT_TRANSACTION_MAX_DURATION - Duration::from_nanos(1);
        let nested_lease = EditTransactionLease::new(just_before_maximum, maximum_expiration);
        assert_eq!(nested_lease.expiration, maximum_expiration);
        assert_eq!(nested_lease.maximum_expiration, maximum_expiration);

        assert!(lease.renew(just_before_maximum, just_before_maximum));
        assert_eq!(lease.expiration, lease.maximum_expiration);
        assert!(!lease.renew(lease.maximum_expiration, lease.maximum_expiration));
    }

    #[test]
    fn timely_queued_renewal_uses_request_time() {
        let started_at = Instant::now();
        let maximum_expiration = started_at + EDIT_TRANSACTION_MAX_DURATION;
        let mut lease = EditTransactionLease::new(started_at, maximum_expiration);
        let original_expiration = lease.expiration;
        let requested_at = original_expiration - Duration::from_nanos(1);
        let processed_at = original_expiration + Duration::from_secs(1);

        assert!(lease.renew(requested_at, processed_at));
        assert_eq!(lease.expiration, processed_at + EDIT_TRANSACTION_LEASE);

        let late_request = lease.expiration;
        assert!(!lease.renew(late_request, late_request));
    }

    #[test]
    fn forced_settle_retains_batch_ceiling_and_defers_new_begin() {
        let started_at = Instant::now();
        let mut batch = EditTransactionBatchState::default();
        let first_maximum = batch.maximum_expiration(started_at);

        batch.force_settle();
        batch.request_rescan();
        assert!(batch.is_forced_settle());
        assert!(batch.is_settling(false));
        assert!(batch.has_pending_rescan());
        assert_eq!(
            batch.maximum_expiration(started_at + EDIT_TRANSACTION_LEASE),
            first_maximum
        );

        batch.reset();
        assert!(!batch.is_settling(false));
        assert!(!batch.has_pending_rescan());
        assert_eq!(
            batch.maximum_expiration(started_at + EDIT_TRANSACTION_LEASE),
            started_at + EDIT_TRANSACTION_LEASE + EDIT_TRANSACTION_MAX_DURATION
        );
    }

    #[test]
    fn controller_changed_directories_connect_nested_path_to_existing_parent() {
        let root = Path::new("workspace");
        let app = root.join("app");
        let new_route = app.join("new-route");
        let nested = new_route.join("nested");
        let changed_file = nested.join("page.tsx");
        let mut batch = BatchedInvalidations::new(RecursiveMode::Recursive);

        batch.add_changed_paths(vec![
            new_route.clone(),
            nested.clone(),
            changed_file.clone(),
        ]);

        for directory in [&app, &new_route, &nested] {
            assert!(
                batch
                    .paths
                    .get(directory.as_path())
                    .is_some_and(|flags| flags.contains(InvalidationFlags::PATH_DIR)),
                "directory listing was not invalidated: {}",
                directory.display()
            );
        }
        assert!(!batch.paths.contains_key(root));
        assert!(
            batch
                .paths
                .get(changed_file.as_path())
                .is_some_and(|flags| {
                    flags.contains(
                        InvalidationFlags::PATH_AND_CHILDREN
                            | InvalidationFlags::PATH_AND_CHILDREN_DIR,
                    )
                })
        );
    }

    #[test]
    fn transaction_batch_path_retention_is_bounded() {
        let mut batch = BatchedInvalidations::new(RecursiveMode::Recursive);
        for index in 0..=EDIT_TRANSACTION_MAX_RETAINED_PATHS {
            batch.mark(
                PathBuf::from(format!("/workspace/path-{index}")).into_boxed_path(),
                InvalidationFlags::PATH,
            );
        }
        assert!(batch.exceeds_transaction_limits());

        batch.clear();
        assert!(batch.paths.is_empty());
        assert_eq!(batch.path_bytes, 0);
        assert!(!batch.exceeds_transaction_limits());

        batch.mark(
            PathBuf::from("x".repeat(EDIT_TRANSACTION_MAX_RETAINED_PATH_BYTES + 1))
                .into_boxed_path(),
            InvalidationFlags::PATH,
        );
        assert!(batch.exceeds_transaction_limits());

        batch.clear();
        assert_eq!(batch.path_bytes, 0);
        assert!(!batch.exceeds_transaction_limits());
    }

    #[test]
    fn rescan_backlog_drain_preserves_control_messages() {
        let (event_tx, event_rx) = channel();
        let (control_tx, control_rx) = channel();
        let senders = WatchSenders {
            event_tx: event_tx.clone(),
            control_tx,
        };

        event_tx
            .send(WatchEventMessage::Filesystem(Ok(notify::Event::new(
                EventKind::Any,
            ))))
            .unwrap();
        let (acknowledged, _acknowledgment) = oneshot::channel();
        assert!(senders.send_control(EditTransactionMessage::Begin {
            token: 42,
            acknowledged,
        }));
        event_tx
            .send(WatchEventMessage::Filesystem(Ok(notify::Event::new(
                EventKind::Any,
            ))))
            .unwrap();

        drain_rescan_event_backlog(&event_rx);

        assert!(matches!(
            event_rx.try_recv(),
            Err(std::sync::mpsc::TryRecvError::Empty)
        ));
        assert!(matches!(
            control_rx.try_recv(),
            Ok(EditTransactionMessage::Begin { token: 42, .. })
        ));
    }
}
