use std::{
    collections::hash_map,
    error::Error as StdError,
    future::Future,
    mem::{forget, replace},
    sync::Arc,
};

use anyhow::Result;
use async_trait::async_trait;
use futures::{StreamExt, TryStreamExt};
use parking_lot::{Mutex, MutexGuard};
use rustc_hash::FxHashMap;
use tracing::Instrument;

use crate::{
    self as turbo_tasks, CollectiblesSource, NonLocalValue, OperationVc, ReadRef, ResolvedVc,
    TryJoinIterExt, Upcast, VcRead, VcValueType, emit,
    event::Event,
    invalidation::{Invalidator, get_invalidator},
    manager::{
        debug_assert_in_top_level_task, debug_assert_not_in_top_level_task, mark_top_level_task,
        unmark_top_level_task_may_leak_eventually_consistent_state, with_turbo_tasks,
    },
    spawn,
    trace::TraceRawVcs,
};

const APPLY_EFFECTS_CONCURRENCY_LIMIT: usize = 1024;

/// An IO Side effect to be computed by turbo tasks and then executed outside of turbo tasks.
#[async_trait]
#[turbo_tasks::value_trait]
pub trait Effect {
    /// Read any Vc data needed for `apply()` and return the [`CapturedEffect`] that performs it.
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
pub trait CapturedEffect: TraceRawVcs + NonLocalValue + Send + Sync + 'static {
    /// Unique key identifying this effect's target (e.g., absolute path bytes).
    fn key(&self) -> Box<[u8]>;

    /// Extract the hash of the value part of this effect for comparison.
    fn value_hash(&self) -> u128;

    /// Perform the side effect
    ///
    /// Implementations typically dispatch into [`EffectStateStorage::run_apply`].
    async fn apply(&self) -> Result<(), ApplyError>;
}

/// Outcome of [`CapturedEffect::apply`]. Distinguishes a side-effect failure (terminal) from a
/// soft failure where the captured form had no content and storage state diverged between
/// capture and apply (recoverable via [`Effects::apply`]'s invalidator path).
#[derive(Debug)]
pub enum ApplyError {
    /// The side effect itself failed.
    Failed(Arc<dyn EffectError>),
    /// Capture short-circuited content materialization (observed `Applied { matching }` in
    /// storage), but by apply time the storage state had diverged and we have no content to
    /// re-apply. [`Effects::apply`] should invalidate the producing operation and return
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
pub trait EffectError: StdError + TraceRawVcs + NonLocalValue + Send + Sync + 'static {}
impl<T> EffectError for T where T: StdError + TraceRawVcs + NonLocalValue + Send + Sync + 'static {}

enum EffectLastApplied {
    Unapplied,
    InProgress {
        write_event: Event,
    },
    Applied {
        value_hash: u128,
        result: Result<(), Arc<dyn EffectError>>,
    },
}

/// Per-key entry in the effect state storage.
type EffectStateEntry = Arc<Mutex<EffectLastApplied>>;
/// Shared state storage for tracking applied effects. Stored on the filesystem implementation
/// (e.g. DiskFileSystemInner).
#[derive(Default)]
pub struct EffectStateStorage {
    effect_state: Mutex<FxHashMap<Box<[u8]>, EffectStateEntry>>,
}

impl EffectStateStorage {
    /// Returns true if the per-key state holds `Applied { value_hash == target, result: Ok(()) }`.
    ///
    /// Intended for use by [`Effect::capture`] to elide content materialization when the apply
    /// would dedup. Reading this from inside a turbo-tasks task is sound because
    /// [`Effects::apply`] re-checks at apply time and fires the producing task's invalidator on
    /// mismatch (via the [`ApplyError::Retry`] / [`EffectsError::Retry`] pathway).
    pub fn matches_applied(&self, key: &[u8], target: u128) -> bool {
        let entry = self.effect_state.lock().get(key).cloned();
        let Some(entry) = entry else { return false };
        matches!(
            &*entry.lock(),
            EffectLastApplied::Applied {
                value_hash,
                result: Ok(()),
            } if *value_hash == target,
        )
    }

    /// Look up or create the per-key state entry.
    fn entry_for(&self, key: Box<[u8]>) -> EffectStateEntry {
        self.effect_state
            .lock()
            .entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(EffectLastApplied::Unapplied)))
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
                let prev_state = replace(&mut *self.entry.lock(), EffectLastApplied::Unapplied);
                let EffectLastApplied::InProgress { write_event } = prev_state else {
                    unreachable!("EventGuard: prev_state must be InProgress");
                };
                write_event.notify(usize::MAX);
            }
        }

        let begin_in_progress = |mut last_applied_guard: MutexGuard<'_, _>| {
            *last_applied_guard = EffectLastApplied::InProgress {
                write_event: Event::new(|| || "effect application in progress".to_string()),
            };
            EventGuard { entry: &entry }
        };

        let event_guard = loop {
            let listener;
            {
                let last_applied_guard = entry.lock();
                match &*last_applied_guard {
                    EffectLastApplied::Unapplied => {
                        break begin_in_progress(last_applied_guard);
                    }
                    EffectLastApplied::Applied {
                        value_hash: stored,
                        result,
                    } => {
                        if value_hash == *stored {
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
            &mut *entry.lock(),
            EffectLastApplied::Applied {
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
/// function should be applied with [`Effects::apply`].
///
/// It's important to wrap calls to this function in an [operation with a strongly consistent
/// read][crate::OperationVc::read_strongly_consistent] before applying the effects outside of the
/// operation at the top-level (e.g. in a `run_once` closure) with [`Effects::apply`].
///
/// # Example
///
/// ```rust
/// # #![feature(arbitrary_self_types_pointers)]
/// #
/// # use anyhow::Result;
/// # use turbo_tasks::{Effects, ReadRef, Vc, run_once, take_effects};
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
///     // we must first read the operation to populate the collectibles
///     let output = operation.connect().await?;
///     // read the effects from the collectibles
///     let effects = take_effects(operation).await?;
///     Ok(OutputWithEffects { output, effects }.cell())
/// }
///
/// // every operation must be read with strong consistency at the top-level
/// let result_with_effects = some_turbo_tasks_operation_with_effects(args)
///     .read_strongly_consistent()
///     .await?;
///
/// // apply the effects once outside of a turbo_tasks::function at the top-level (e.g. `run_once`)
/// result_with_effects.effects.apply().await?;
/// # Ok(())
/// # }
/// ```
pub async fn take_effects(source: impl CollectiblesSource) -> Result<Effects> {
    debug_assert_not_in_top_level_task("take_effects");
    let effects = source.take_collectibles::<Box<dyn Effect>>();

    let captured: Vec<Box<dyn CapturedEffect>> = effects
        .into_iter()
        .map(async |effect_vc| effect_vc.into_trait_ref().await?.capture().await)
        .try_join()
        .await?;

    // detect duplicate keys
    let unique_keys = build_unique_keys(&captured);

    let invalidator = get_invalidator()
        .expect("take_effects must be called from within a turbo-tasks task context");

    Ok(Effects::new(captured, unique_keys, invalidator))
}

#[derive(thiserror::Error, Debug, TraceRawVcs, NonLocalValue)]
#[error("Conflicting effects for the same key (key length: {key_len} bytes)")]
struct ConflictingEffectError {
    key_len: usize,
}

const MAX_KEYS_TO_DISPLAY: usize = 10;
/// Error returned by [`Effects::apply`]. Callers should retry on `Retry`; everything else is
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
/// `Effects::apply` is idempotent and safe to call multiple times on the same value — the state
/// machine in `run_apply` ensures each underlying side effect runs at most once per stored
/// `(key, value_hash)` pair across all callers.
#[turbo_tasks::value(shared, eq = "manual", serialization = "skip", cell = "new")]
pub struct Effects {
    /// Pre-resolved effects awaiting application. Lives for the lifetime of the cell — released
    /// when the producer reruns and `cell = "new"` overwrites the cell, which is when any
    /// upstream `ReadRef` strong-count cascades are naturally released.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    captured: CapturedSlice,
    /// Captured at `take_effects` time. `None` for `Effects::empty()` (nothing to retry).
    #[turbo_tasks(debug_ignore, trace_ignore)]
    invalidator: Option<Invalidator>,
    /// Unique key info computed eagerly in `take_effects`. Holds one index into `captured` per
    /// unique key, or a `ConflictingEffectError` if two captured effects share a key with
    /// different hashes. No [`EffectStateStorage`] interaction here — that is deferred to
    /// `apply()`.
    #[turbo_tasks(debug_ignore, trace_ignore)]
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

    /// Applies all effects that have been captured.
    ///
    /// Dispatch goes through each captured effect's [`CapturedEffect::apply`] (via
    /// [`EffectStateStorage::run_apply`]) which handles the per-key state machine, dedup hits,
    /// in-progress coordination, and panic recovery. The dispatch is idempotent — calling
    /// `apply()` multiple times on the same `Effects` value runs each underlying side effect at
    /// most once per stored `(key, value_hash)` pair.
    ///
    /// If any captured effect signals [`ApplyError::Retry`] (its content was elided at capture
    /// time and storage state diverged between capture and apply), the producing task is
    /// invalidated and [`EffectsError::Retry`] is returned after the remaining keys finish.
    /// Side-effect failures (`ApplyError::Failed`) propagate as [`EffectsError::Apply`]; the
    /// first such error wins.
    ///
    /// `apply` must only be used in a "top-level" task (e.g. [`run_once`][crate::run_once]),
    /// after [`take_effects`] is called from an [operation read with strong
    /// consistency][crate::OperationVc::read_strongly_consistent].
    ///
    /// See [`take_effects`] for example usage.
    ///
    /// **Do not call this directly.** External callers must go through
    /// [`read_strongly_consistent_and_apply_effects`] or
    /// [`resolve_strongly_consistent_and_take_and_apply_effects`], which own the read+apply+retry
    /// loop required to recover from [`EffectsError::Retry`]. Exposed publicly only as
    /// [`Effects::apply_for_testing`] (`#[doc(hidden)]`) so integration tests can drive the apply
    /// state machine directly.
    async fn apply(&self) -> Result<(), EffectsError> {
        debug_assert_in_top_level_task(
            "Effects::apply must be called from a top-level task to avoid unintended \
             re-executions due to eventual consistency",
        );
        let unique = match self.unique_keys.as_ref() {
            Ok(unique) => unique.as_slice(),
            Err(err) => return Err(EffectsError::Conflict(err.key_len)),
        };
        if unique.is_empty() {
            return Ok(());
        }

        let span = tracing::info_span!("apply effects", count = unique.len());
        let captured = &self.captured;

        async {
            // Collect the keys of any effects that signaled `Retry` across the parallel apply so
            // we invalidate at most once at the end of the batch and can report which outputs
            // forced the retry. `Apply` errors still take precedence — they fail-fast through the
            // `try_for_each_concurrent`.
            let retry_keys = Mutex::new(Vec::<String>::new());
            let result: Result<(), EffectsError> = futures::stream::iter(unique.iter())
                .map(Ok::<_, EffectsError>)
                .try_for_each_concurrent(APPLY_EFFECTS_CONCURRENCY_LIMIT, async |idx| {
                    // Run each apply on its own spawned task so that pending effects execute in
                    // parallel rather than serially on this future (see #94140).
                    let effect = captured[*idx].clone();
                    match spawn(async move { effect.apply().await }).await {
                        Ok(()) => Ok(()),
                        Err(ApplyError::Failed(err)) => Err(EffectsError::Apply(err)),
                        Err(ApplyError::Retry) => {
                            let key = captured[*idx].key();
                            retry_keys
                                .lock()
                                .push(String::from_utf8_lossy(&key).into_owned());
                            Ok(())
                        }
                    }
                })
                .await;

            match result {
                Err(e) => Err(e),
                Ok(()) => {
                    let retry_keys = retry_keys.into_inner();
                    if retry_keys.is_empty() {
                        Ok(())
                    } else {
                        self.signal_retry(retry_keys)
                    }
                }
            }
        }
        .instrument(span)
        .await
    }

    /// Test-only public alias for [`Effects::apply`]. Lets integration tests in other crates drive
    /// the per-key apply state machine directly (e.g. asserting dedup counts or the raw
    /// [`EffectsError::Retry`] signal). Production code must use
    /// [`read_strongly_consistent_and_apply_effects`] instead, which owns the retry loop.
    #[doc(hidden)]
    pub async fn apply_for_testing(&self) -> Result<(), EffectsError> {
        self.apply().await
    }

    /// Invalidate the producing task (if any) and return [`EffectsError::Retry`] carrying the
    /// `keys` that signaled [`ApplyError::Retry`] (their capture elided content materialization but
    /// storage state diverged before apply).
    fn signal_retry(&self, keys: Vec<String>) -> Result<(), EffectsError> {
        if let Some(invalidator) = self.invalidator {
            with_turbo_tasks(|tt| invalidator.invalidate(&**tt));
        }
        Err(EffectsError::Retry { keys })
    }
}

/// Strongly-consistent read of `op`, then apply its effects, retrying the whole read+apply on
/// [`EffectsError::Retry`].
///
/// `get_effects` extracts the [`Effects`] from the read value (for a wrapper struct this is
/// `|v| &v.effects`; for an `OperationVc<Effects>` it is `|e| e`).
///
/// On [`EffectsError::Retry`] the producing operation has already been invalidated by
/// [`Effects::apply`], so the next
/// [`read_strongly_consistent`][OperationVc::read_strongly_consistent] re-runs the producer and
/// yields a fresh [`Effects`] whose `capture()` re-materializes content. Retries are bounded to
/// avoid livelock when two producers perpetually stomp the same key; after the first retry a
/// warning is logged on each subsequent attempt, and on exhaustion the last `Retry` surfaces as an
/// error.
///
/// This is one of two public entry points for applying effects (see also
/// [`read_strongly_consistent_and_apply_effects_with`]) — [`Effects::apply`] is private so the
/// retry contract cannot be bypassed.
pub async fn read_strongly_consistent_and_apply_effects<T, F>(
    op: OperationVc<T>,
    get_effects: F,
) -> Result<ReadRef<T>>
where
    T: VcValueType,
    F: Fn(&<<T as VcValueType>::Read as VcRead<T>>::Target) -> &Effects,
{
    let mut attempts = 0usize;
    loop {
        // final_read_hint because
        // 1. in the retry case we have just invalidated the operation so we need to recompute
        //    anyway (not wasteful)
        // 2. the callers are in top level tasks and the value type inside T is holding a
        //    non-serializable effects value.  This strongly implies the rest of the data is
        //    ephemeral often just readrefs on other cells.  So we don't need to keep it.
        let value = op.read_strongly_consistent().final_read_hint().await?;
        // Deref the `ReadRef<T>` to the read target (`T` for non-transparent types).
        let effects = get_effects(&*value);
        match effects.apply().await {
            Ok(()) => return Ok(value),
            Err(e) => handle_apply_retry(e, &mut attempts)?,
        }
    }
}

/// AVOID CALLING THIS UNLESS DEEPLY REQUIRED
///
/// Like [`read_strongly_consistent_and_apply_effects`], but the [`Effects`] directly accessed by
/// calling [`take_effects`] on the supplied operation.
///
/// Unlike [`read_strongly_consistent_and_apply_effects`], this may be called from *inside* a
/// turbo-tasks task (it owns the `mark`/`unmark` around `apply`). The consequence is that the
/// effects may be re-applied if that enclosing task is invalidated — acceptable for lazily-created
/// resources.
pub async fn resolve_strongly_consistent_and_take_and_apply_effects<T>(
    op: OperationVc<T>,
) -> Result<ResolvedVc<T>>
where
    T: VcValueType,
{
    let mut attempts = 0usize;
    loop {
        let value = op.resolve().strongly_consistent().await?;
        // Run the callback while *not* marked top-level so it can `take_effects` / read Vcs.

        let effects = take_effects(op).await?;
        // `Effects::apply` asserts it runs at the top-level. Mark only around the apply, then
        // unmark so any further work (including the next loop iteration's read) is unaffected.
        mark_top_level_task();
        let result = effects.apply().await;
        unmark_top_level_task_may_leak_eventually_consistent_state();
        match result {
            Ok(()) => return Ok(value),
            Err(e) => handle_apply_retry(e, &mut attempts)?,
        }
    }
}

/// Shared retry-decision for the two `read_strongly_consistent_and_apply_effects*` helpers.
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
    let mut by_key: FxHashMap<Box<[u8]>, usize> = FxHashMap::default();
    for (idx, effect) in captured.iter().enumerate() {
        match by_key.entry(effect.key()) {
            hash_map::Entry::Vacant(entry) => {
                entry.insert(idx);
            }
            hash_map::Entry::Occupied(entry) => {
                if captured[*entry.get()].value_hash() != effect.value_hash() {
                    return Err(Arc::new(ConflictingEffectError {
                        key_len: entry.key().len(),
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
    use crate::{CollectiblesSource, Effects, take_effects};

    #[test]
    #[allow(dead_code)]
    fn is_send() {
        fn assert_send<T: Send>(_: T) {}
        fn check_effects_apply() {
            assert_send(Effects::empty().apply());
        }
        fn check_take_effects<T: CollectiblesSource + Send + Sync>(t: T) {
            assert_send(take_effects(t));
        }
    }
}
