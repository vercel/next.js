use std::{
    collections::hash_map,
    error::Error as StdError,
    future::Future,
    mem::{forget, replace, take},
    num::NonZeroUsize,
    panic::{AssertUnwindSafe, resume_unwind},
    sync::{
        Arc, OnceLock,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
};

use anyhow::Result;
use async_trait::async_trait;
use crossbeam_utils::CachePadded;
use futures::{FutureExt, StreamExt, stream::FuturesUnordered};
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use tokio::{
    sync::{Mutex as AsyncMutex, OwnedMutexGuard},
    task_local,
};
use tracing::Instrument;

use crate::{
    self as turbo_tasks, CollectiblesSource, JoinHandle, NonLocalValue, OperationVc, ReadRef,
    ResolvedVc, TryJoinIterExt, Upcast, VcRead, VcValueType,
    backend::SettledTaskResult,
    changes::{change_epoch, wait_for_change_to_end},
    emit,
    event::Event,
    invalidation::{Invalidator, get_invalidator},
    manager::{
        debug_assert_in_top_level_task, debug_assert_not_in_top_level_task, forbid_task_reads,
        replace_top_level_task, spawn_in_current_task, with_turbo_tasks,
    },
    parallel::available_parallelism,
    spawn,
};

const APPLY_EFFECTS_CONCURRENCY_LIMIT: usize = 1024;

/// An IO Side effect to be computed by turbo tasks and then executed outside of turbo tasks.
#[async_trait]
#[turbo_tasks::value_trait]
pub trait Effect {
    /// Read any Vc data needed for `apply()` and return the [`CapturedEffect`] that performs it.
    ///
    /// Must not create cells (e.g. with `.cell()`): [`take_effects`] captures many effects
    /// concurrently as part of the one task calling it, so the order in which cells were created,
    /// which assigns their indices in that task, wouldn't be deterministic.
    ///
    /// An implementation may elect to elide capturing data if the `EffectStateStorage` state is
    /// already up to date.
    async fn capture(&self) -> Result<Box<dyn CapturedEffect>>;
}

pub trait EffectExt {
    fn emit(self);
}

impl<T> EffectExt for ResolvedVc<T>
where
    T: Upcast<Box<dyn Effect>>,
{
    fn emit(self) {
        emit::<Box<dyn Effect>>(ResolvedVc::upcast_non_strict(self));
    }
}

/// Post-capture effect. Holds data needed to perform the actual side effect in a top level context.
///
/// `apply()` is responsible for coordinating with [`EffectStateStorage`] via
/// [`EffectStateStorage::run_apply`] (which handles the per-key state machine, in-progress
/// coordination, dedup-hit short-circuit, and panic recovery).
#[async_trait]
pub trait CapturedEffect: NonLocalValue + Send + Sync + 'static {
    /// Unique key identifying this effect's target within its storage (e.g., absolute path bytes).
    ///
    /// Must be pure and non-blocking: publication calls it while holding write claims.
    fn key(&self) -> Box<[u8]>;

    /// Extract the hash of the value part of this effect for comparison.
    ///
    /// Must be pure and non-blocking: publication calls it while holding write claims.
    fn value_hash(&self) -> u128;

    /// The storage that coordinates writes to [`Self::key`].
    fn state_storage(&self) -> &EffectStateStorage;

    /// Distinguishes effect kinds that share a key namespace (e.g. writing a file vs. a link).
    /// Pass the same value to [`EffectStateStorage::run_apply`] and
    /// [`EffectStateStorage::matches_applied`].
    fn kind(&self) -> &'static str;

    /// Perform the side effect
    ///
    /// Implementations typically dispatch into [`EffectStateStorage::run_apply`]. Must not publish
    /// effects itself. When this returns or unwinds, the side effect must be complete: publication
    /// releases the key's claim at that point.
    async fn apply(&self) -> Result<(), ApplyError>;
}

/// Outcome of [`CapturedEffect::apply`]. Distinguishes a side-effect failure (terminal) from a
/// soft failure where the captured form had no content and storage state diverged between
/// capture and apply (recoverable via the invalidator path of
/// [`read_strongly_consistent_and_apply_effects`]).
#[derive(Debug)]
pub enum ApplyError {
    /// The side effect itself failed.
    Failed(Arc<dyn EffectError>),
    /// Capture short-circuited content materialization (observed `Applied { matching }` in
    /// storage), but by apply time the storage state had diverged and we have no content to
    /// re-apply. Publication invalidates the producing operation and returns
    /// [`EffectsError::Retry`].
    Retry,
}

/// The error type that an effect can return. We use `dyn std::error::Error` (instead of
/// [`anyhow::Error`] or [`SharedError`]) to encourage use of structured error types that can
/// potentially be transformed into `Issue`s.
///
/// We can't require that the returned error implements `Issue`:
/// - `Issue` uses `FileSystemPath`
/// - `turbo-tasks-fs` returns effect errors that should be transformed into `Issue`s.
/// - It logically doesn't make sense to define `Issue` in `turbo-tasks-fs`, `Issue` can't be
///   defined in a base crate either because it would form a circular crate dependency.
///
/// So instead, we leave it up to the caller to figure out how to downcast these errors themselves.
///
/// [`SharedError`]: crate::util::SharedError
pub trait EffectError: StdError + NonLocalValue + Send + Sync + 'static {}
impl<T> EffectError for T where T: StdError + NonLocalValue + Send + Sync + 'static {}

enum EffectLastApplied {
    Unapplied,
    InProgress {
        write_event: Event,
    },
    Applied {
        kind: &'static str,
        value_hash: u128,
        result: Result<(), Arc<dyn EffectError>>,
    },
}

struct KeyState {
    last_applied: Mutex<EffectLastApplied>,
    /// Held by a publication from before validation until its write of this key has finished, and
    /// again while it commits.
    claim: Arc<AsyncMutex<()>>,
}

/// Per-key entry in the effect state storage.
type EffectStateEntry = Arc<KeyState>;
/// Shared state storage for tracking applied effects. Stored on the filesystem implementation
/// (e.g. DiskFileSystemInner).
pub struct EffectStateStorage {
    /// Process-unique and never reused. Orders claims across storages.
    id: u64,
    effect_state: Mutex<FxHashMap<Box<[u8]>, EffectStateEntry>>,
}

impl Default for EffectStateStorage {
    fn default() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        Self {
            id: NEXT
                .try_update(Ordering::Relaxed, Ordering::Relaxed, |next| {
                    next.checked_add(1)
                })
                .expect("effect state storage ids exhausted"),
            effect_state: Default::default(),
        }
    }
}

impl EffectStateStorage {
    fn claim_for(&self, key: Box<[u8]>) -> Arc<AsyncMutex<()>> {
        self.entry_for(key).claim.clone()
    }

    /// Returns true if the per-key state holds `Applied { kind, value_hash == target, result:
    /// Ok(()) }`.
    ///
    /// Intended for use by [`Effect::capture`] to elide content materialization when the apply
    /// would dedup. Reading this from inside a turbo-tasks task is sound because
    /// publication re-checks at apply time and fires the producing task's invalidator on
    /// mismatch (via the [`ApplyError::Retry`] / [`EffectsError::Retry`] pathway).
    pub fn matches_applied(&self, key: &[u8], kind: &'static str, target: u128) -> bool {
        let entry = self.effect_state.lock().get(key).cloned();
        let Some(entry) = entry else { return false };
        matches!(
            &*entry.last_applied.lock(),
            EffectLastApplied::Applied {
                kind: applied_kind,
                value_hash,
                result: Ok(()),
            } if *applied_kind == kind && *value_hash == target,
        )
    }

    /// Look up or create the per-key state entry.
    fn entry_for(&self, key: Box<[u8]>) -> EffectStateEntry {
        self.effect_state
            .lock()
            .entry(key)
            .or_insert_with(|| {
                Arc::new(KeyState {
                    last_applied: Mutex::new(EffectLastApplied::Unapplied),
                    claim: Default::default(),
                })
            })
            .clone()
    }

    /// Coordinate an apply for `(key, value_hash)` against the per-key state machine.
    ///
    /// Dedup hits (state already `Applied` with a matching hash) return the cached result without
    /// running `body`. Otherwise `body` runs once under an `InProgress` guard and the result is
    /// stored. A `None` `body` (capture elided content because storage matched, but it no longer
    /// does) yields [`ApplyError::Retry`].
    pub async fn run_apply<E, F, Fut>(
        &self,
        key: Box<[u8]>,
        kind: &'static str,
        value_hash: u128,
        body: Option<F>,
    ) -> Result<(), ApplyError>
    where
        E: EffectError,
        F: FnOnce() -> Fut + Send,
        Fut: Future<Output = Result<(), E>> + Send,
    {
        let entry = self.entry_for(key);

        // If `body` panics or the future is dropped before completion, the guard's drop impl
        // resets the per-key state to `Unapplied` and notifies other waiters via the `Event` it
        // recovers from the previous `InProgress`, so they retry rather than deadlock or observe
        // a stale "panic" cache entry.
        struct EventGuard<'a> {
            entry: &'a EffectStateEntry,
        }
        impl Drop for EventGuard<'_> {
            fn drop(&mut self) {
                let prev_state = replace(
                    &mut *self.entry.last_applied.lock(),
                    EffectLastApplied::Unapplied,
                );
                let EffectLastApplied::InProgress { write_event } = prev_state else {
                    unreachable!("EventGuard: prev_state must be InProgress");
                };
                write_event.notify(usize::MAX);
            }
        }

        let begin_in_progress = |mut last_applied_guard: parking_lot::MutexGuard<'_, _>| {
            *last_applied_guard = EffectLastApplied::InProgress {
                write_event: Event::new(|| || "effect application in progress".to_string()),
            };
            EventGuard { entry: &entry }
        };

        let event_guard = loop {
            let listener;
            {
                let last_applied_guard = entry.last_applied.lock();
                match &*last_applied_guard {
                    EffectLastApplied::Unapplied => {
                        break begin_in_progress(last_applied_guard);
                    }
                    EffectLastApplied::Applied {
                        kind: stored_kind,
                        value_hash: stored,
                        result,
                    } => {
                        if kind == *stored_kind && value_hash == *stored {
                            return result.clone().map_err(ApplyError::Failed);
                        } else {
                            break begin_in_progress(last_applied_guard);
                        }
                    }
                    EffectLastApplied::InProgress { write_event } => {
                        // Event::listen registers the listener immediately, so notifications
                        // fired after we drop last_applied_guard cannot be missed.
                        listener = write_event.listen();
                    }
                }
            };
            listener.await;
        };

        // We hold the InProgress guard. Either run the body, or — if we have no content to
        // apply — release the guard (resetting state to Unapplied + waking waiters) and Retry.
        let Some(body) = body else {
            drop(event_guard);
            return Err(ApplyError::Retry);
        };

        // Erase the body's concrete error type to `Arc<dyn EffectError>` so the cached result
        // type is uniform across all callers of the same key.
        let effect_result: Result<(), Arc<dyn EffectError>> = body()
            .await
            .map_err(|err| Arc::new(err) as Arc<dyn EffectError>);

        let prev_state = replace(
            &mut *entry.last_applied.lock(),
            EffectLastApplied::Applied {
                kind,
                value_hash,
                result: effect_result.clone(),
            },
        );
        forget(event_guard);

        let EffectLastApplied::InProgress { write_event } = prev_state else {
            unreachable!("Effect applied: prev_state must be InProgress");
        };
        write_event.notify(usize::MAX);

        effect_result.map_err(ApplyError::Failed)
    }
}

/// Capture effects. Call this from within a [turbo-tasks operation][crate::OperationVc].
///
/// Collectibles are read from `ResolvedVc`s, so this function, and the return value of this
/// function should be published with [`read_strongly_consistent_and_apply_effects`].
///
/// It's important to wrap calls to this function in an [operation with a strongly consistent
/// read][crate::OperationVc::read_strongly_consistent] before applying the effects outside of the
/// operation at the top-level (e.g. in a `run_once` closure) with
/// [`read_strongly_consistent_and_apply_effects`].
///
/// # Example
///
/// ```rust
/// # #![feature(arbitrary_self_types_pointers)]
/// #
/// # use anyhow::Result;
/// # use turbo_tasks::{
/// #     Effects, ReadRef, Vc, read_strongly_consistent_and_apply_effects, take_effects,
/// # };
/// #
/// # async fn _wrapper() -> Result<()> {
/// # type Example = ();
/// # type Args = ();
/// # let args = ();
/// # #[turbo_tasks::function(operation)]
/// # fn some_turbo_tasks_operation(_args: Args) {}
/// #
/// #[turbo_tasks::value(serialization = "skip")]
/// struct OutputWithEffects {
///     output: ReadRef<Example>,
///     effects: Effects,
/// }
///
/// // ensure the return value and the collectibles match by using a single operation for both
/// #[turbo_tasks::function(operation)]
/// async fn some_turbo_tasks_operation_with_effects(args: Args) -> Result<Vc<OutputWithEffects>> {
///     let operation = some_turbo_tasks_operation(args);
///     // collectibles are only stable after a strongly consistent read of their source
///     let output = operation.read_strongly_consistent().await?;
///     // read the effects from the collectibles
///     let effects = take_effects(operation).await?;
///     Ok(OutputWithEffects { output, effects }.cell())
/// }
///
/// // read with strong consistency and apply the effects once at the top-level
/// // (e.g. in a `run_once` closure)
/// let _result_with_effects = read_strongly_consistent_and_apply_effects(
///     some_turbo_tasks_operation_with_effects(args),
///     |result| &result.effects,
/// )
/// .await?;
/// # Ok(())
/// # }
/// ```
pub async fn take_effects(source: impl CollectiblesSource) -> Result<Effects> {
    debug_assert_not_in_top_level_task("take_effects");
    let effects: Vec<ResolvedVc<Box<dyn Effect>>> = source
        .take_collectibles::<Box<dyn Effect>>()
        .into_iter()
        .collect();

    let captured = capture_effects(effects).await?;

    // detect duplicate keys
    let unique_keys = build_unique_keys(&captured);

    let invalidator = get_invalidator()
        .expect("take_effects must be called from within a turbo-tasks task context");

    Ok(Effects::new(captured, unique_keys, invalidator))
}

/// [`capture_effects`] uses one worker per this many effects, so a few effects are captured on the
/// calling task's thread only.
const CAPTURE_EFFECTS_MIN_PER_WORKER: usize = 64;

/// The maximum number of workers [`capture_effects`] uses. Every capture records its reads as
/// dependencies of the one task calling [`take_effects`], which locks that task. With more workers
/// they mostly wait for that lock: on a warm build with ~200k effects, capturing took 4.3s with 1
/// worker, 1.4s with 4, 0.9s with 8, and still 0.9s with 16 or 32 workers, using 2-4x the CPU
/// time.
const CAPTURE_EFFECTS_MAX_WORKERS: usize = 8;

async fn capture_effect(effect: ResolvedVc<Box<dyn Effect>>) -> Result<Box<dyn CapturedEffect>> {
    effect.into_trait_ref().await?.capture().await
}

/// Captures `effects`, returning the captured effects in the same order.
///
/// Capturing reads every effect's cell and usually the content it writes. On a warm build that
/// data isn't in memory yet, so each read restores it from the persistent cache, synchronously on
/// the reading thread. Polling all captures in one future would do all of those restores one by
/// one on a single thread, so for many effects the captures are spread over several workers (up to
/// one per available CPU and at most [`CAPTURE_EFFECTS_MAX_WORKERS`]). The workers run as part of
/// the current task (see [`spawn_in_current_task`]), so their reads are tracked as the task's own
/// dependencies. Each worker takes the next uncaptured effect from a shared counter, which balances
/// the load when some captures are slower than others.
async fn capture_effects(
    effects: Vec<ResolvedVc<Box<dyn Effect>>>,
) -> Result<Vec<Box<dyn CapturedEffect>>> {
    let len = effects.len();
    let workers = available_parallelism()
        .map_or(1, NonZeroUsize::get)
        .min(CAPTURE_EFFECTS_MAX_WORKERS)
        .min(len / CAPTURE_EFFECTS_MIN_PER_WORKER);
    if workers <= 1 {
        return effects.into_iter().map(capture_effect).try_join().await;
    }

    let span = tracing::info_span!("capture effects", count = len, workers);
    async move {
        let state = Arc::new(CaptureEffectsState {
            effects,
            next: CachePadded::new(AtomicUsize::new(0)),
            captured: (0..len).map(|_| OnceLock::new()).collect(),
        });
        let handles = (0..workers)
            .map(|_| {
                let state = state.clone();
                spawn_in_current_task(async move {
                    let result = state.capture_until_done().await;
                    // Release the shared state before the result is handed to the joining side.
                    drop(state);
                    result
                })
            })
            .collect::<Vec<_>>();

        // Wait for every worker, even after an error, so none of them is still reading as part of
        // this task when we return.
        let results = futures::future::join_all(handles).await;
        results.into_iter().collect::<Result<()>>()?;
        let state = Arc::into_inner(state)
            .expect("capture workers finished while still holding the shared state");
        Ok(state
            .captured
            .into_iter()
            .map(|effect| {
                effect
                    .into_inner()
                    .expect("capture workers finished without capturing every effect")
            })
            .collect())
    }
    .instrument(span)
    .await
}

/// State shared by the workers of [`capture_effects`].
struct CaptureEffectsState {
    effects: Vec<ResolvedVc<Box<dyn Effect>>>,
    /// Index of the next effect to capture. Every worker increments it for every effect, so it is
    /// kept on its own cache line to avoid false sharing with the fields around it.
    next: CachePadded<AtomicUsize>,
    /// `captured[i]` is the captured `effects[i]`, set by the worker that took index `i`. It stays
    /// empty until then.
    captured: Box<[OnceLock<Box<dyn CapturedEffect>>]>,
}

impl CaptureEffectsState {
    /// Captures effects until there are none left or a capture fails.
    async fn capture_until_done(&self) -> Result<()> {
        let len = self.effects.len();
        loop {
            let idx = self.next.fetch_add(1, Ordering::Relaxed);
            let Some(&effect) = self.effects.get(idx) else {
                return Ok(());
            };
            let captured = match capture_effect(effect).await {
                Ok(captured) => captured,
                Err(err) => {
                    // Make the other workers stop early, the result is an error anyway. Indices
                    // handed out after this are `>= len`, so no index is handed out twice.
                    self.next.store(len, Ordering::Relaxed);
                    return Err(err);
                }
            };
            // `fetch_add` hands out every index below `len` at most once (`store` above only sets
            // the counter to `len`), so the slot is still empty.
            if self.captured[idx].set(captured).is_err() {
                panic!("effect {idx} was captured twice");
            }
        }
    }
}

#[derive(thiserror::Error, Debug, NonLocalValue)]
#[error("Conflicting effects for the same key (key length: {key_len} bytes)")]
struct ConflictingEffectError {
    key_len: usize,
}

const MAX_KEYS_TO_DISPLAY: usize = 10;
/// Error returned when applying effects. Publication retries on `Retry`; everything else is
/// terminal.
#[derive(thiserror::Error, Debug, Clone)]
pub enum EffectsError {
    /// A side effect failed during apply. Holds the first error encountered.
    #[error(transparent)]
    Apply(Arc<dyn EffectError>),

    #[error("conflicting effects for the same key (key length: {0} bytes)")]
    Conflict(usize),

    #[error(
        "effect state diverged before apply for {}{}; producing task invalidated, retry required",
        keys.iter().take(MAX_KEYS_TO_DISPLAY).cloned().collect::<Vec<_>>().join(", "),
        if keys.len() > MAX_KEYS_TO_DISPLAY { format!(", ... ({} more)", keys.len() - MAX_KEYS_TO_DISPLAY) } else { String::new() }
    )]
    Retry { keys: Vec<String> },
}

impl From<Arc<dyn EffectError>> for EffectsError {
    fn from(err: Arc<dyn EffectError>) -> Self {
        EffectsError::Apply(err)
    }
}

/// Dedup'd indices into the captured Vec — one entry per unique key. Computed eagerly in
/// [`take_effects`] purely from the captured effects (no [`EffectStateStorage`] interaction);
/// the apply-side state machine in [`EffectStateStorage::run_apply`] handles per-key hash dedup.
type UniqueKeys = Result<Vec<usize>, Arc<ConflictingEffectError>>;

/// Slice of captured effects, individually Arc'd. Each effect is `Arc<dyn CapturedEffect>`
/// so callers can cheaply clone a Send handle out across `.await` boundaries without holding
/// the outer mutex.
type CapturedSlice = Arc<[Arc<dyn CapturedEffect>]>;

/// Captured effects from an operation. This struct can be used to return Effects from a turbo-tasks
/// function and apply them later.
///
/// # Cell semantics
///
/// `Effects` uses `cell = "new"`: every producer re-execution allocates a fresh cell value and
/// the prior cell is dropped. Cell-level dedup of `Effects` is given up; per-key dedup at apply
/// time is provided by [`EffectStateStorage`]'s state machine (see
/// [`EffectStateStorage::run_apply`]), which short-circuits when storage already holds
/// `Applied { value_hash }` matching the new hash.
///
/// Publishing the same value multiple times is idempotent — the state machine in `run_apply`
/// ensures each underlying side effect runs at most once per stored `(key, kind, value_hash)`
/// across all callers.
#[turbo_tasks::value(shared, eq = "manual", serialization = "skip", cell = "new")]
pub struct Effects {
    /// Pre-resolved effects awaiting application. Lives for the lifetime of the cell — released
    /// when the producer reruns and `cell = "new"` overwrites the cell, which is when any
    /// upstream `ReadRef` strong-count cascades are naturally released.
    #[turbo_tasks(debug_ignore)]
    captured: CapturedSlice,
    /// Captured at `take_effects` time. `None` for `Effects::empty()` (nothing to retry).
    #[turbo_tasks(debug_ignore)]
    invalidator: Option<Invalidator>,
    /// Unique key info computed eagerly in `take_effects`. Holds one index into `captured` per
    /// unique `(storage, key)`, or a `ConflictingEffectError` if two captured effects share one
    /// with a different kind or hash. Applied state in [`EffectStateStorage`] is only consulted
    /// during publication.
    #[turbo_tasks(debug_ignore)]
    unique_keys: Arc<UniqueKeys>,
}

/// `PartialEq`/`Eq` are compat shims so containing structs (which derive `PartialEq`/`Eq` via
/// `turbo_tasks::value`) can still embed `Effects`. The actual cell-update strategy for `Effects`
/// itself is `cell = "new"` — see the doc-comment above — so this `PartialEq` is not consulted
/// for `Effects` cells. We always return `false` to match `cell = "new"` semantics for the
/// wrapper structs (they should also refresh on every producer run).
impl PartialEq for Effects {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}
impl Eq for Effects {}

impl Effects {
    /// A test-only placeholder `Effects` value with no effects (and no producer to invalidate).
    #[cfg(test)]
    fn empty() -> Self {
        Self {
            captured: Arc::from(Vec::new()),
            invalidator: None,
            unique_keys: Arc::new(Ok(Vec::new())),
        }
    }

    fn new(
        captured: Vec<Box<dyn CapturedEffect>>,
        unique_keys: UniqueKeys,
        invalidator: Invalidator,
    ) -> Self {
        // Convert Box<dyn> into Arc<dyn> per slot. Each Arc is independently Send/Sync.
        let captured: CapturedSlice = captured
            .into_iter()
            .map(Arc::<dyn CapturedEffect>::from)
            .collect();
        Self {
            captured,
            invalidator: Some(invalidator),
            unique_keys: Arc::new(unique_keys),
        }
    }

    /// The plan's identity: every claimed `(storage, key)` with the operation it performs.
    /// Elided content does not affect it.
    fn plan(&self) -> Result<Vec<PlannedEffect>, EffectsError> {
        let unique = match self.unique_keys.as_ref() {
            Ok(unique) => unique,
            Err(err) => return Err(EffectsError::Conflict(err.key_len)),
        };
        let mut plan: Vec<PlannedEffect> = unique
            .iter()
            .map(|&idx| {
                let effect = &self.captured[idx];
                PlannedEffect {
                    storage: effect.state_storage().id,
                    key: effect.key(),
                    kind: effect.kind(),
                    value_hash: effect.value_hash(),
                }
            })
            .collect();
        plan.sort_unstable();
        Ok(plan)
    }

    /// Claims every key the plan still has to write, in a global `(storage, key)` order so that
    /// overlapping publications cannot deadlock.
    ///
    /// Keys whose storage already records the plan's `(kind, value_hash)` as applied are neither
    /// held nor written: publishing does not change them. This is checked again once the claim is
    /// acquired, so publications sharing identical outputs (e.g. runtime chunks) only queue behind
    /// the one that writes them.
    async fn claim(&self) -> Publication {
        let mut candidates = Vec::new();
        if let Ok(unique) = self.unique_keys.as_ref() {
            for &idx in unique {
                let effect = &self.captured[idx];
                let storage = effect.state_storage();
                let key = effect.key();
                if !storage.matches_applied(&key, effect.kind(), effect.value_hash()) {
                    candidates.push(((storage.id, key), idx));
                }
            }
        }
        candidates.sort_unstable();
        let mut publication = Publication::new(Vec::with_capacity(candidates.len()));
        for ((_, key), idx) in candidates {
            let effect = &self.captured[idx];
            let storage = effect.state_storage();
            let claim = storage.claim_for(key.clone()).lock_owned().await;
            if storage.matches_applied(&key, effect.kind(), effect.value_hash()) {
                continue;
            }
            publication.to_apply.push((idx, Some(claim)));
        }
        publication
    }

    /// Claims every key of the plan in the global order and reports whether each still records the
    /// plan's `(kind, value_hash)` as applied. Waits for any publication that still holds one of
    /// the keys, so a write admitted earlier cannot land after this succeeds.
    async fn claim_all_and_check_applied(&self) -> (Vec<OwnedMutexGuard<()>>, bool) {
        let mut keys = Vec::new();
        if let Ok(unique) = self.unique_keys.as_ref() {
            for &idx in unique {
                let effect = &self.captured[idx];
                keys.push(((effect.state_storage().id, effect.key()), idx));
            }
        }
        keys.sort_unstable();
        let mut claims = Vec::with_capacity(keys.len());
        let mut applied = true;
        for ((_, key), idx) in keys {
            let effect = &self.captured[idx];
            let storage = effect.state_storage();
            claims.push(storage.claim_for(key.clone()).lock_owned().await);
            applied &= storage.matches_applied(&key, effect.kind(), effect.value_hash());
        }
        (claims, applied)
    }

    /// Applies the effects while `publication` holds their claims.
    ///
    /// At most [`APPLY_EFFECTS_CONCURRENCY_LIMIT`] writes run at once. Each write owns its key's
    /// claim and releases it as soon as that write has finished, so a publication waiting only on
    /// an already written key does not wait for slower siblings. Dropping `publication` (e.g. on
    /// cancellation) leaves started writes running until they finish, still holding their claims.
    /// After the first failure, panic, or [`ApplyError::Retry`], no further writes start; started
    /// writes finish before this returns.
    ///
    /// If any write signals [`ApplyError::Retry`], the producing task is invalidated and
    /// [`EffectsError::Retry`] is returned. Side-effect failures propagate as
    /// [`EffectsError::Apply`]; the first such error wins. A panicking write resumes unwinding
    /// here after all started writes have finished.
    async fn apply_claimed(&self, publication: &mut Publication) -> Result<(), EffectsError> {
        debug_assert_in_top_level_task(
            "effects must be applied from a top-level task to avoid unintended re-executions due \
             to eventual consistency",
        );
        if let Err(err) = self.unique_keys.as_ref() {
            return Err(EffectsError::Conflict(err.key_len));
        }
        if publication.to_apply.is_empty() {
            return Ok(());
        }

        let span = tracing::info_span!("apply effects", count = publication.to_apply.len());
        async {
            // Undispatched claims stay in `publication` and are released when it is dropped.
            publication.to_apply.reverse();
            let mut stop = false;
            let mut retry_keys = Vec::new();
            loop {
                while !stop && publication.running.len() < APPLY_EFFECTS_CONCURRENCY_LIMIT {
                    let Some((idx, claim)) = publication.to_apply.pop() else {
                        break;
                    };
                    let effect = self.captured[idx].clone();
                    // Run each apply on its own spawned task so that pending effects execute in
                    // parallel rather than serially on this future (see #94140). The body never
                    // unwinds, so awaiting its handle never resumes a panic before siblings finish.
                    // A dropped handle detaches the task, so the claim is held until the write
                    // finishes even if this publication is cancelled.
                    publication.running.push(spawn(async move {
                        let result = AssertUnwindSafe(
                            IN_EFFECT_APPLY.scope((), async move { effect.apply().await }),
                        )
                        .catch_unwind()
                        .await;
                        drop(claim);
                        (idx, result)
                    }));
                }
                let Some((idx, result)) = publication.running.next().await else {
                    break;
                };
                match result {
                    Ok(Ok(())) => {}
                    Ok(Err(ApplyError::Retry)) => {
                        stop = true;
                        retry_keys
                            .push(String::from_utf8_lossy(&self.captured[idx].key()).into_owned());
                    }
                    failure => {
                        stop = true;
                        // Held by the publication so that, if this future is dropped, the
                        // failure is only dropped after every started write has finished:
                        // dropping a panic payload or an error can itself panic.
                        publication.failures.push(failure);
                    }
                }
            }
            // Every started write has finished.
            let mut failures = take(&mut publication.failures);
            if let Some(i) = failures.iter().position(Result::is_err) {
                let Err(payload) = failures.swap_remove(i) else {
                    unreachable!()
                };
                drop(failures);
                resume_unwind(payload);
            }
            if let Some(Ok(Err(ApplyError::Failed(err)))) = failures.into_iter().next() {
                return Err(EffectsError::Apply(err));
            }
            if retry_keys.is_empty() {
                Ok(())
            } else {
                self.signal_retry(retry_keys)
            }
        }
        .instrument(span)
        .await
    }

    /// Test-only: applies the effects without claims or currentness validation, so integration
    /// tests in other crates can drive the per-key apply state machine directly (e.g. asserting
    /// dedup counts or the raw [`EffectsError::Retry`] signal). Production code must use
    /// [`read_strongly_consistent_and_apply_effects`], which owns publication.
    #[doc(hidden)]
    pub async fn apply_for_testing(&self) -> Result<(), EffectsError> {
        let to_apply = match self.unique_keys.as_ref() {
            Ok(unique) => unique.iter().map(|&idx| (idx, None)).collect(),
            Err(err) => return Err(EffectsError::Conflict(err.key_len)),
        };
        self.apply_claimed(&mut Publication::new(to_apply)).await
    }

    /// Invalidate the producing task (if any) and return [`EffectsError::Retry`] carrying the
    /// `keys` that signaled [`ApplyError::Retry`] (their capture elided content materialization but
    /// storage state diverged before apply).
    fn signal_retry(&self, keys: Vec<String>) -> Result<(), EffectsError> {
        self.invalidate_producer();
        Err(EffectsError::Retry { keys })
    }

    fn invalidate_producer(&self) {
        if let Some(invalidator) = self.invalidator {
            with_turbo_tasks(|tt| invalidator.invalidate(&**tt));
        }
    }
}

/// One claimed key and the operation a plan performs on it.
#[derive(PartialEq, Eq, PartialOrd, Ord)]
struct PlannedEffect {
    storage: u64,
    key: Box<[u8]>,
    kind: &'static str,
    value_hash: u128,
}

task_local! {
    /// Set inside every spawned effect apply. Publishing from there could wait on claims that the
    /// enclosing publication holds.
    static IN_EFFECT_APPLY: ();
}

type ApplyOutcome = std::thread::Result<Result<(), ApplyError>>;
type RunningApply = JoinHandle<(usize, ApplyOutcome)>;

/// One publication attempt: the claimed writes it has not started and the writes it has started.
/// Each started write owns its claim. Dropping this with writes still running (e.g. when the
/// caller is cancelled) moves them into a task that collects their outcomes.
struct Publication {
    /// Indices into the captured effects that this attempt writes, with their claims (`None` only
    /// for [`Effects::apply_for_testing`]).
    to_apply: Vec<(usize, Option<OwnedMutexGuard<()>>)>,
    running: FuturesUnordered<RunningApply>,
    /// Failed or panicked writes, in completion order.
    failures: Vec<ApplyOutcome>,
    runtime: tokio::runtime::Handle,
}

impl Publication {
    fn new(to_apply: Vec<(usize, Option<OwnedMutexGuard<()>>)>) -> Self {
        Self {
            to_apply,
            running: FuturesUnordered::new(),
            failures: Vec::new(),
            runtime: tokio::runtime::Handle::current(),
        }
    }
}

impl Drop for Publication {
    fn drop(&mut self) {
        if self.running.is_empty() {
            return;
        }
        let mut running = take(&mut self.running);
        let mut failures = take(&mut self.failures);
        self.runtime.spawn(async move {
            // Keep outcomes until every write has finished: dropping a panic payload can panic.
            while let Some((_, outcome)) = running.next().await {
                failures.push(outcome);
            }
            drop(failures);
        });
    }
}

/// Reads `op` only if it is settled right now, without waiting, scheduling, or executing any task.
///
/// The settled check, the output, and the output cell are read under one task lock, so the value
/// is the root's result at one instant. The root must return a cell of its own (as the usual
/// wrapper operations returning `{ .. }.cell()` do): validating a result reached through another
/// task would need a snapshot of the whole chain.
fn read_settled<T: VcValueType>(op: OperationVc<T>) -> Result<Option<ReadRef<T>>> {
    match with_turbo_tasks(|tt| tt.try_read_settled_task_result(op.task_id()))? {
        SettledTaskResult::NotSettled => Ok(None),
        SettledTaskResult::OwnCell(content) => content.cast::<T>().map(Some),
        SettledTaskResult::Other => anyhow::bail!(
            "effects must be published from an operation that returns its own cell, e.g. \
             `Ok(WithEffects {{ .. }}.cell())`"
        ),
    }
}

/// Returns the current value of `op` if it is settled and its plan is `plan`, the plan of
/// `captured`.
enum Currentness<T> {
    Current(T),
    Obsolete,
    /// A change was in progress (see [`ChangeInProgress`][crate::ChangeInProgress]); check again
    /// once it ended.
    ChangeInProgress,
}

fn read_current<T, F>(
    op: OperationVc<T>,
    get_effects: &F,
    captured: &ReadRef<T>,
    plan: &[PlannedEffect],
) -> Result<Currentness<ReadRef<T>>>
where
    T: VcValueType,
    F: Fn(&<<T as VcValueType>::Read as VcRead<T>>::Target) -> &Effects,
{
    // While a change is in progress, a root that depends on the old value can still look settled
    // although other tasks already see the new value. So the check only counts if no change was
    // in progress, and none started or ended, while it ran.
    let Some(epoch) = change_epoch() else {
        return Ok(Currentness::ChangeInProgress);
    };
    let Some(value) = read_settled(op)? else {
        return Ok(Currentness::Obsolete);
    };
    let current = ReadRef::ptr_eq(&value, captured)
        || forbid_task_reads(|| get_effects(&*value).plan()).is_ok_and(|current| current == plan);
    Ok(match change_epoch() {
        None => Currentness::ChangeInProgress,
        Some(now) if current && now == epoch => Currentness::Current(value),
        Some(_) => Currentness::Obsolete,
    })
}

/// Strongly-consistent read of `op`, then publish its effects.
///
/// `get_effects` extracts the [`Effects`] from the read value (for a wrapper struct this is
/// `|v| &v.effects`; for an `OperationVc<Effects>` it is `|e| e`). It and the captured effects'
/// [`CapturedEffect::key`], [`CapturedEffect::kind`], and [`CapturedEffect::value_hash`] must be
/// pure and non-blocking.
///
/// `op` must return a cell of its own, which is how currentness is validated in one consistent
/// read. Wrap effects in a value built by the operation itself:
///
/// ```ignore
/// #[turbo_tasks::function(operation, root)]
/// async fn with_effects(args: Args) -> Result<Vc<OutputWithEffects>> {
///     let op = some_operation(args);
///     let output = op.read_strongly_consistent().await?;
///     let effects = take_effects(op).await?;
///     Ok(OutputWithEffects { output, effects }.cell())
/// }
/// ```
///
/// An operation returning another task's value (e.g. `fn root() -> Vc<T> { other() }`) is
/// rejected with an error.
///
/// Each attempt:
/// 1. reads `op` strongly consistently and captures its plan;
/// 2. claims every key the plan still has to write (keys already holding the planned result are
///    left alone);
/// 3. checks, without waiting, that `op` is still settled with the same plan, and otherwise
///    releases the claims and starts over;
/// 4. applies the plan under the claims, draining every started write even if this future is
///    dropped, then releases them;
/// 5. commits: claims every key of the plan, including ones it did not write, checks that each
///    holds the planned result and that `op` is still settled with the same plan, and otherwise
///    starts over to publish the current plan.
///
/// The returned value is the one validated after the writes (or, after too many obsolete plans,
/// the last one captured). Its effects equal the applied plan.
///
/// Within one [`EffectStateStorage`] this ensures a plan that is no longer current is never
/// written over a newer one, provided every writer of those keys publishes through this function
/// and roots that are current at the same time agree on shared keys. Writes from separate
/// storages to one physical location are not coordinated.
///
/// "Current" means settled as of the dirtiness that has reached the root. A change counts as in
/// progress (see [`ChangeInProgress`][crate::ChangeInProgress]) from before its new value is
/// readable or a task is marked dirty until that dirtiness has reached the aggregating ancestors,
/// and the check only counts if no change was in progress, and none started or ended, while it
/// ran. So a newer value another root could already read always makes this root obsolete. If a
/// change is in progress, publication releases its claims, waits for a change to end, and counts
/// the attempt like an obsolete plan. A change that is only reported through an [`Invalidator`]
/// after its new value became readable elsewhere (e.g. an untracked read of external state) is
/// not covered.
///
/// [`EffectsError::Retry`] (content elided at capture time, storage diverged before apply) is
/// retried with bounded attempts. If inputs keep changing during publication, it gives up checking
/// currentness after a bounded number of obsolete plans and checks that found a change in
/// progress: it warns, writes the latest plan under
/// its claims without checking it or waiting for changes in progress, and returns that plan's
/// value. Must not be called from inside an effect's
/// [`CapturedEffect::apply`].
pub async fn read_strongly_consistent_and_apply_effects<T, F>(
    op: OperationVc<T>,
    get_effects: F,
) -> Result<ReadRef<T>>
where
    T: VcValueType,
    F: Fn(&<<T as VcValueType>::Read as VcRead<T>>::Target) -> &Effects,
{
    publish(op, get_effects, false).await
}

/// AVOID CALLING THIS UNLESS DEEPLY REQUIRED
///
/// Like [`read_strongly_consistent_and_apply_effects`], but may be called from *inside* a
/// turbo-tasks task (it owns the `mark`/`unmark` around applying). The consequence is that the
/// effects may be re-published if that enclosing task is invalidated — acceptable for
/// lazily-created resources.
pub async fn read_strongly_consistent_and_apply_effects_in_task<T, F>(
    op: OperationVc<T>,
    get_effects: F,
) -> Result<ReadRef<T>>
where
    T: VcValueType,
    F: Fn(&<<T as VcValueType>::Read as VcRead<T>>::Target) -> &Effects,
{
    publish(op, get_effects, true).await
}

async fn publish<T, F>(op: OperationVc<T>, get_effects: F, in_task: bool) -> Result<ReadRef<T>>
where
    T: VcValueType,
    F: Fn(&<<T as VcValueType>::Read as VcRead<T>>::Target) -> &Effects,
{
    anyhow::ensure!(
        IN_EFFECT_APPLY.try_with(|_| ()).is_err(),
        "effects must not be published from inside an effect's apply"
    );
    let mut retries = 0usize;
    let mut obsolete = 0usize;
    loop {
        let value = op.read_strongly_consistent().await?;
        let effects = get_effects(&*value);
        let plan = effects.plan()?;
        let check_current = obsolete < MAX_OBSOLETE_PLANS;
        let mut publication = effects.claim().await;
        if check_current {
            match read_current(op, &get_effects, &value, &plan)? {
                Currentness::Current(_) => {}
                Currentness::Obsolete => {
                    drop(publication);
                    handle_obsolete_plan(&mut obsolete);
                    continue;
                }
                Currentness::ChangeInProgress => {
                    drop(publication);
                    wait_for_change_to_end().await;
                    handle_obsolete_plan(&mut obsolete);
                    continue;
                }
            }
        }
        let result = {
            // Restores the previous marking even if applying unwinds or is cancelled.
            struct TopLevel(bool);
            impl Drop for TopLevel {
                fn drop(&mut self) {
                    replace_top_level_task(self.0);
                }
            }
            let _top_level = in_task.then(|| TopLevel(replace_top_level_task(true)));
            effects.apply_claimed(&mut publication).await
        };
        if let Err(err) = result {
            drop(publication);
            handle_apply_retry(err, &mut retries)?;
            continue;
        }
        drop(publication);
        if !check_current {
            return Ok(value);
        }
        // Commit: with every key of the plan claimed (not only the ones written), check that each
        // holds the planned result and the plan is still current. Releasing first keeps claims in
        // the global order.
        let (claims, applied) = effects.claim_all_and_check_applied().await;
        let current = if applied {
            read_current(op, &get_effects, &value, &plan)?
        } else {
            // Another publication changed a key. Rerun the producer so the next capture
            // materializes content instead of eliding it against the old storage state.
            effects.invalidate_producer();
            Currentness::Obsolete
        };
        drop(claims);
        match current {
            Currentness::Current(value) => return Ok(value),
            Currentness::Obsolete => handle_obsolete_plan(&mut obsolete),
            Currentness::ChangeInProgress => {
                wait_for_change_to_end().await;
                handle_obsolete_plan(&mut obsolete)
            }
        }
    }
}

/// Obsolete plans, and checks that found a change in progress, after which publication stops
/// checking currentness and writes the latest plan.
const MAX_OBSOLETE_PLANS: usize = 16;

/// Counts a restart caused by inputs changing, or a change being in progress, between a capture and
/// its validation or commit, and warns once publication will stop checking currentness.
fn handle_obsolete_plan(obsolete: &mut usize) {
    *obsolete += 1;
    if *obsolete == MAX_OBSOLETE_PLANS {
        tracing::warn!(
            attempts = MAX_OBSOLETE_PLANS,
            "inputs kept changing while publishing effects; writing the latest plan without \
             checking that it is still current"
        );
    }
}

/// Shared retry-decision for publication.
///
/// Returns `Ok(())` to signal the caller should retry the read+apply loop (bounded by
/// `MAX_RETRIES`). Returns `Err` for terminal outcomes: a non-`Retry` error, or `Retry` after the
/// retry budget is exhausted.
fn handle_apply_retry(err: EffectsError, attempts: &mut usize) -> Result<()> {
    const MAX_RETRIES: usize = 4; // chosen by a fair dice roll
    match err {
        EffectsError::Retry { keys } if *attempts < MAX_RETRIES => {
            *attempts += 1;
            // Warn on every retry after the first.
            if *attempts > 1 {
                tracing::warn!(
                    attempts = *attempts,
                    ?keys,
                    "retrying effect application; this implies multiple routes are fighting to \
                     write one of these files",
                );
            }
            Ok(())
        }
        EffectsError::Retry { keys } => anyhow::bail!(
            "gave up applying effects after {MAX_RETRIES} retries; repeated effect-state \
             divergence on: {keys:?}. This implies multiple routes are fighting to write one of \
             these files."
        ),
        e => Err(e.into()),
    }
}

/// Build the deduped per-key indices into the captured slice. Detects per-key value-hash
/// conflicts. This is the eager half of effect deduplication — it inspects only the captured
/// effects themselves (no [`EffectStateStorage`] interaction) and is therefore safe to call
/// from inside a turbo-tasks task in [`take_effects`].
fn build_unique_keys(captured: &[Box<dyn CapturedEffect>]) -> UniqueKeys {
    let mut by_key: FxHashMap<(u64, Box<[u8]>), usize> = FxHashMap::default();
    for (idx, effect) in captured.iter().enumerate() {
        match by_key.entry((effect.state_storage().id, effect.key())) {
            hash_map::Entry::Vacant(entry) => {
                entry.insert(idx);
            }
            hash_map::Entry::Occupied(entry) => {
                let existing = &captured[*entry.get()];
                if existing.kind() != effect.kind() || existing.value_hash() != effect.value_hash()
                {
                    return Err(Arc::new(ConflictingEffectError {
                        key_len: entry.key().1.len(),
                    }));
                }
            }
        }
    }

    let mut keys: Vec<usize> = by_key.into_values().collect();
    // Sort by idx so the order is deterministic — useful for stable tracing/logging.
    keys.sort_unstable();
    Ok(keys)
}

#[cfg(test)]
mod tests {
    use std::{
        future::ready,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use crate::{
        self as turbo_tasks, ApplyError, CollectiblesSource, EffectStateStorage, Effects,
        NonLocalValue, take_effects,
    };

    #[derive(Debug, thiserror::Error, NonLocalValue)]
    #[error("test effect failed")]
    struct TestError;

    fn key(name: &str) -> Box<[u8]> {
        name.as_bytes().into()
    }

    #[tokio::test]
    async fn kind_is_part_of_applied_identity() {
        let storage = EffectStateStorage::default();
        let calls = AtomicUsize::new(0);
        let apply = |kind| {
            storage.run_apply(
                key("out"),
                kind,
                7,
                Some(async || {
                    calls.fetch_add(1, Ordering::Relaxed);
                    Ok::<_, TestError>(())
                }),
            )
        };
        apply("file").await.unwrap();
        apply("file").await.unwrap();
        assert_eq!(
            calls.load(Ordering::Relaxed),
            1,
            "same kind and hash dedups"
        );
        apply("link").await.unwrap();
        assert_eq!(
            calls.load(Ordering::Relaxed),
            2,
            "a different kind with the same hash must run"
        );
        assert!(storage.matches_applied(&key("out"), "link", 7));
        assert!(!storage.matches_applied(&key("out"), "file", 7));
    }

    #[tokio::test]
    async fn identical_plan_after_failure_returns_cached_error() {
        let storage = EffectStateStorage::default();
        let calls = AtomicUsize::new(0);
        for _ in 0..2 {
            let result = storage
                .run_apply(
                    key("out"),
                    "file",
                    1,
                    Some(async || {
                        calls.fetch_add(1, Ordering::Relaxed);
                        Err::<(), _>(TestError)
                    }),
                )
                .await;
            assert!(matches!(result, Err(ApplyError::Failed(_))));
        }
        assert_eq!(calls.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn cancelled_apply_wakes_waiters() {
        let storage = EffectStateStorage::default();
        let mut pending = Box::pin(storage.run_apply(
            key("out"),
            "file",
            1,
            Some(async || {
                std::future::pending::<()>().await;
                Ok::<_, TestError>(())
            }),
        ));
        assert!(futures::poll!(&mut pending).is_pending());
        let mut waiter = Box::pin(storage.run_apply(
            key("out"),
            "file",
            2,
            Some(|| ready(Ok::<_, TestError>(()))),
        ));
        assert!(futures::poll!(&mut waiter).is_pending());
        drop(pending);
        waiter.await.unwrap();
    }

    #[test]
    fn storage_ids_are_unique() {
        assert_ne!(
            EffectStateStorage::default().id,
            EffectStateStorage::default().id
        );
    }

    #[test]
    #[allow(dead_code)]
    fn is_send() {
        fn assert_send<T: Send>(_: T) {}
        fn check_effects_apply() {
            assert_send(Effects::empty().apply_for_testing());
        }
        fn check_take_effects<T: CollectiblesSource + Send + Sync>(t: T) {
            assert_send(take_effects(t));
        }
    }
}
