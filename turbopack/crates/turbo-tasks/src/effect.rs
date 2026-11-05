use std::{
    error::Error as StdError,
    future::Future,
    mem::{forget, replace},
    sync::Arc,
};

use anyhow::Result;
use async_trait::async_trait;
use futures::{StreamExt, TryStreamExt};
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use tracing::Instrument;

use crate::{
    self as turbo_tasks, CollectiblesSource, NonLocalValue, OperationVc, ReadRef, ResolvedVc,
    TraitRef, TryJoinIterExt, Upcast, VcRead, VcValueType, emit,
    event::Event,
    invalidation::{Invalidator, get_invalidator},
    manager::{
        debug_assert_in_top_level_task, debug_assert_not_in_top_level_task, mark_top_level_task,
        unmark_top_level_task_may_leak_eventually_consistent_state, with_turbo_tasks,
    },
};

const APPLY_EFFECTS_CONCURRENCY_LIMIT: usize = 1024;

/// An IO side effect computed by turbo tasks and then executed outside of turbo tasks.
///
/// Effects are emitted as collectibles (see [`EffectExt::emit`]), collected with
/// [`take_effects`] and applied at the top level with
/// [`read_strongly_consistent_and_apply_effects`]. The effect value itself is all the data needed
/// to apply it, so it should be small: expensive work (e.g. writing file content) should happen
/// eagerly in the task that emits the effect, leaving only a cheap operation (e.g. a rename) for
/// `apply()`.
#[async_trait]
#[turbo_tasks::value_trait]
pub trait Effect {
    /// Unique key identifying this effect's target (e.g., absolute path bytes).
    fn key(&self) -> Box<[u8]>;

    /// A cheap identity of this effect's value (e.g. the id of the task that produced it, or a
    /// hash of a small value). Effects for the same key with the same identity are considered
    /// equal without further inspection.
    fn identity(&self) -> u128;

    /// A hash of the content this effect applies.
    ///
    /// This is only called when multiple effects with different [`Effect::identity`]s target the
    /// same key, to decide whether they actually conflict. Effects for the same key with equal
    /// content hashes are deduplicated, different content hashes are reported as a conflict.
    ///
    /// May return [`ApplyError::Retry`] if the content is currently unavailable (e.g. after
    /// invalidating the task that produces it).
    async fn content_hash(&self) -> Result<u128, ApplyError>;

    /// Perform the side effect.
    ///
    /// This is called in the top-level task context, so it may read `Vc`s (untracked). Effects
    /// should run blocking IO via [`spawn`][crate::spawn] so that pending effects execute in
    /// parallel.
    ///
    /// Implementations typically dispatch into [`EffectStateStorage::run_apply`], which handles
    /// the per-key state machine, in-progress coordination, and panic recovery.
    async fn apply(&self) -> Result<(), ApplyError>;
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

/// Outcome of [`Effect::apply`]. Distinguishes a side-effect failure (terminal) from a soft
/// failure where the effect can't be applied right now, but could after its producer re-executes
/// (recoverable via `Effects::apply`'s invalidator path).
#[derive(Debug)]
pub enum ApplyError {
    /// The side effect itself failed.
    Failed(Arc<dyn EffectError>),
    /// The effect could not be applied in its current form (e.g. the data it needs was consumed
    /// or removed). The effect is responsible for invalidating whatever needs to re-execute to
    /// fix this. `Effects::apply` additionally invalidates the operation that took the effects
    /// and returns [`EffectsError::Retry`].
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
    InProgress { write_event: Event },
    Applied(LastApplied),
}

/// The last effect applied for a key, as recorded by [`EffectStateStorage`].
#[derive(Clone)]
pub struct LastApplied {
    /// The [`Effect::identity`] of the effect that was applied last.
    pub identity: u128,
    /// The result of applying it.
    pub result: Result<(), Arc<dyn EffectError>>,
}

/// What the body passed to [`EffectStateStorage::run_apply`] did.
pub enum ApplyStep<E> {
    /// The side effect was executed (successfully or not). The effect's identity is recorded as
    /// the last applied effect for the key, together with the result.
    Applied(Result<(), E>),
    /// The target is already up to date with this effect, nothing was done. The effect's
    /// identity is recorded as the last applied effect for the key. If the previous record had
    /// the same identity, its result is kept and returned.
    UpToDate,
    /// The effect can't be applied right now. The previous record is kept and
    /// [`ApplyError::Retry`] is returned.
    Retry,
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
    /// Returns the identity of the last effect successfully applied for `key`, if any.
    ///
    /// This is a snapshot: it returns `None` while an apply for the key is in progress.
    pub fn last_applied_identity(&self, key: &[u8]) -> Option<u128> {
        let entry = self.effect_state.lock().get(key).cloned()?;
        match &*entry.lock() {
            EffectLastApplied::Applied(LastApplied {
                identity,
                result: Ok(()),
            }) => Some(*identity),
            _ => None,
        }
    }

    /// Look up or create the per-key state entry.
    fn entry_for(&self, key: Box<[u8]>) -> EffectStateEntry {
        self.effect_state
            .lock()
            .entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(EffectLastApplied::Unapplied)))
            .clone()
    }

    /// Coordinate an apply of the effect with `identity` for `key` against the per-key state
    /// machine.
    ///
    /// Applies for the same key are serialized: `body` runs while no other apply for the key is in
    /// progress. It receives the [`LastApplied`] record for the key (if any) and decides what to
    /// do (see [`ApplyStep`]); the record is updated accordingly afterwards.
    pub async fn run_apply<E, F, Fut>(
        &self,
        key: Box<[u8]>,
        identity: u128,
        body: F,
    ) -> Result<(), ApplyError>
    where
        E: EffectError,
        F: FnOnce(Option<LastApplied>) -> Fut + Send,
        Fut: Future<Output = ApplyStep<E>> + Send,
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

        let (event_guard, previous) = loop {
            let listener;
            {
                let mut last_applied_guard = entry.lock();
                match &*last_applied_guard {
                    EffectLastApplied::InProgress { write_event } => {
                        // Event::listen registers the listener immediately, so notifications
                        // fired after we drop last_applied_guard cannot be missed.
                        listener = write_event.listen();
                    }
                    EffectLastApplied::Unapplied | EffectLastApplied::Applied(_) => {
                        let previous = match replace(
                            &mut *last_applied_guard,
                            EffectLastApplied::InProgress {
                                write_event: Event::new(|| {
                                    || "effect application in progress".to_string()
                                }),
                            },
                        ) {
                            EffectLastApplied::Applied(last_applied) => Some(last_applied),
                            EffectLastApplied::Unapplied => None,
                            EffectLastApplied::InProgress { .. } => unreachable!(),
                        };
                        break (EventGuard { entry: &entry }, previous);
                    }
                }
            };
            listener.await;
        };

        let step = body(previous.clone()).await;

        let (new_state, result) = match step {
            ApplyStep::Applied(result) => {
                // Erase the body's concrete error type to `Arc<dyn EffectError>` so the cached
                // result type is uniform across all callers of the same key.
                let result = result.map_err(|err| Arc::new(err) as Arc<dyn EffectError>);
                (
                    EffectLastApplied::Applied(LastApplied {
                        identity,
                        result: result.clone(),
                    }),
                    result.map_err(ApplyError::Failed),
                )
            }
            ApplyStep::UpToDate => {
                let result = previous
                    .filter(|previous| previous.identity == identity)
                    .map_or(Ok(()), |previous| previous.result);
                (
                    EffectLastApplied::Applied(LastApplied {
                        identity,
                        result: result.clone(),
                    }),
                    result.map_err(ApplyError::Failed),
                )
            }
            ApplyStep::Retry => (
                previous.map_or(EffectLastApplied::Unapplied, EffectLastApplied::Applied),
                Err(ApplyError::Retry),
            ),
        };

        let prev_state = replace(&mut *entry.lock(), new_state);
        forget(event_guard);

        let EffectLastApplied::InProgress { write_event } = prev_state else {
            unreachable!("Effect applied: prev_state must be InProgress");
        };
        write_event.notify(usize::MAX);

        result
    }
}

/// Take effects. Call this from within a [turbo-tasks operation][crate::OperationVc].
///
/// Collectibles are read from `ResolvedVc`s, so this function, and the return value of this
/// function should be applied with `Effects::apply`.
///
/// It's important to wrap calls to this function in an [operation with a strongly consistent
/// read][crate::OperationVc::read_strongly_consistent] before applying the effects outside of the
/// operation at the top-level (e.g. in a `run_once` closure) with `Effects::apply`.
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
///     // we must first read the operation to populate the collectibles
///     let output = operation.connect().await?;
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
    let effects = source.take_collectibles::<Box<dyn Effect>>();

    let effects: Vec<TraitRef<Box<dyn Effect>>> = effects
        .into_iter()
        .map(async |effect_vc| effect_vc.into_trait_ref().await)
        .try_join()
        .await?;

    let groups = build_key_groups(&effects);

    let invalidator = get_invalidator()
        .expect("take_effects must be called from within a turbo-tasks task context");

    Ok(Effects {
        effects: effects.into(),
        invalidator: Some(invalidator),
        groups: groups.into(),
    })
}

const MAX_KEYS_TO_DISPLAY: usize = 10;
/// Error returned by `Effects::apply`. Callers should retry on `Retry`; everything else is
/// terminal.
#[derive(thiserror::Error, Debug, Clone)]
pub enum EffectsError {
    /// A side effect failed during apply. Holds the first error encountered.
    #[error(transparent)]
    Apply(Arc<dyn EffectError>),

    #[error("conflicting effects for the same key (key length: {0} bytes)")]
    Conflict(usize),

    #[error(
        "effects could not be applied for {}{}; producing tasks invalidated, retry required",
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

/// Effects grouped by key: one entry per unique key, holding one index into the effects slice
/// per distinct [`Effect::identity`] for that key.
type KeyGroups = Arc<[Box<[usize]>]>;

/// Effects taken from an operation. This struct can be used to return Effects from a turbo-tasks
/// function and apply them later.
///
/// # Cell semantics
///
/// `Effects` uses `cell = "new"`: every producer re-execution allocates a fresh cell value and
/// the prior cell is dropped. Cell-level dedup of `Effects` is given up; per-key dedup at apply
/// time is provided by [`EffectStateStorage`]'s state machine (see
/// [`EffectStateStorage::run_apply`]).
///
/// `Effects::apply` is idempotent and safe to call multiple times on the same value — the
/// effects consult the per-key state in `run_apply` to avoid re-running side effects that are
/// already up to date.
#[turbo_tasks::value(shared, eq = "manual", serialization = "skip", cell = "new")]
pub struct Effects {
    /// Effects awaiting application. These are small values holding only what's needed to apply
    /// them.
    #[turbo_tasks(debug_ignore)]
    effects: Arc<[TraitRef<Box<dyn Effect>>]>,
    /// Obtained at `take_effects` time. `None` for `Effects::empty()` (nothing to retry).
    #[turbo_tasks(debug_ignore)]
    invalidator: Option<Invalidator>,
    /// Effects grouped by key, computed eagerly in `take_effects` from the cheap
    /// [`Effect::identity`]. Groups with more than one identity are resolved lazily in `apply()`.
    #[turbo_tasks(debug_ignore)]
    groups: KeyGroups,
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

/// Outcome of resolving a key group with multiple writers.
enum GroupResolution {
    /// Apply the effect at this index.
    Apply(usize),
    /// The writers have different content.
    Conflict { key_len: usize },
    /// Some writer's content is unavailable, retry after re-execution.
    Retry { key: String },
}

impl Effects {
    /// A test-only placeholder `Effects` value with no effects (and no producer to invalidate).
    #[cfg(test)]
    fn empty() -> Self {
        Self {
            effects: Arc::from(Vec::new()),
            invalidator: None,
            groups: Arc::from(Vec::new()),
        }
    }

    /// Applies all effects.
    ///
    /// When multiple effects with different identities target the same key, their
    /// [`Effect::content_hash`]es are compared first (reported via a `duplicate effect writers`
    /// tracing span). Equal content is deduplicated; different content fails with
    /// [`EffectsError::Conflict`] before any effect is applied.
    ///
    /// Dispatch goes through each effect's [`Effect::apply`] (typically via
    /// [`EffectStateStorage::run_apply`]) which handles the per-key state machine, dedup hits,
    /// in-progress coordination, and panic recovery.
    ///
    /// If any effect signals [`ApplyError::Retry`], the producing task is invalidated and
    /// [`EffectsError::Retry`] is returned after the remaining keys finish. Side-effect failures
    /// (`ApplyError::Failed`) propagate as [`EffectsError::Apply`]; the first such error wins.
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
        if self.groups.is_empty() {
            return Ok(());
        }

        let span = tracing::info_span!("apply effects", count = self.groups.len());
        let effects = &self.effects;

        async {
            // Collect the keys of any effects that signaled `Retry` so we invalidate at most once
            // at the end of the batch and can report which outputs forced the retry. `Apply`
            // errors and conflicts take precedence.
            let retry_keys = Mutex::new(Vec::<String>::new());
            let record_retry = |idx: usize| {
                let key = effects[idx].key();
                retry_keys
                    .lock()
                    .push(String::from_utf8_lossy(&key).into_owned());
            };

            // Phase 1: resolve keys with multiple writers. This happens before applying anything,
            // so a conflict doesn't leave a partially applied state behind.
            let mut to_apply = Vec::with_capacity(self.groups.len());
            let mut multi_writer_groups = Vec::new();
            for group in self.groups.iter() {
                match &**group {
                    [idx] => to_apply.push(*idx),
                    group => multi_writer_groups.push(group),
                }
            }
            if !multi_writer_groups.is_empty() {
                let resolutions = futures::future::try_join_all(
                    multi_writer_groups
                        .into_iter()
                        .map(|group| self.resolve_multi_writer_group(group)),
                )
                .await?;
                for resolution in resolutions {
                    match resolution {
                        GroupResolution::Apply(idx) => to_apply.push(idx),
                        GroupResolution::Conflict { key_len } => {
                            return Err(EffectsError::Conflict(key_len));
                        }
                        GroupResolution::Retry { key } => retry_keys.lock().push(key),
                    }
                }
            }

            // Phase 2: apply.
            let result: Result<(), EffectsError> = futures::stream::iter(to_apply)
                .map(Ok::<_, EffectsError>)
                .try_for_each_concurrent(APPLY_EFFECTS_CONCURRENCY_LIMIT, async |idx| {
                    // Effects run in this (top-level) task context so they can read `Vc`s. They
                    // spawn their blocking IO themselves, so pending effects execute in parallel
                    // (see #94140).
                    match effects[idx].apply().await {
                        Ok(()) => Ok(()),
                        Err(ApplyError::Failed(err)) => Err(EffectsError::Apply(err)),
                        Err(ApplyError::Retry) => {
                            record_retry(idx);
                            Ok(())
                        }
                    }
                })
                .await;
            result?;

            let retry_keys = retry_keys.into_inner();
            if retry_keys.is_empty() {
                Ok(())
            } else {
                self.signal_retry(retry_keys)
            }
        }
        .instrument(span)
        .await
    }

    /// Resolve a key targeted by multiple effects with different identities by comparing their
    /// content hashes.
    async fn resolve_multi_writer_group(
        &self,
        group: &[usize],
    ) -> Result<GroupResolution, EffectsError> {
        let key = self.effects[group[0]].key();
        let identities = group
            .iter()
            .map(|&idx| self.effects[idx].identity())
            .collect::<Vec<_>>();
        let span = tracing::info_span!(
            "duplicate effect writers",
            key = %String::from_utf8_lossy(&key),
            writers = ?identities,
            outcome = tracing::field::Empty,
        );
        async {
            let hashes = group
                .iter()
                .map(|&idx| self.effects[idx].content_hash())
                .collect::<Vec<_>>();
            let mut first_hash = None;
            let mut needs_retry = false;
            let mut conflict = false;
            for hash in futures::future::join_all(hashes).await {
                match hash {
                    Ok(hash) => match first_hash {
                        None => first_hash = Some(hash),
                        Some(first) if first != hash => conflict = true,
                        Some(_) => {}
                    },
                    Err(ApplyError::Retry) => needs_retry = true,
                    Err(ApplyError::Failed(err)) => {
                        tracing::Span::current().record("outcome", "error");
                        return Err(EffectsError::Apply(err));
                    }
                }
            }
            let resolution = if conflict {
                tracing::Span::current().record("outcome", "conflict");
                GroupResolution::Conflict { key_len: key.len() }
            } else if needs_retry {
                tracing::Span::current().record("outcome", "retry");
                GroupResolution::Retry {
                    key: String::from_utf8_lossy(&key).into_owned(),
                }
            } else {
                tracing::Span::current().record("outcome", "equal");
                GroupResolution::Apply(group[0])
            };
            Ok(resolution)
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
    /// `keys` that signaled [`ApplyError::Retry`].
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
/// On [`EffectsError::Retry`] the producing operation (and whatever the effects themselves chose
/// to invalidate) has already been invalidated by `Effects::apply`, so the next
/// [`read_strongly_consistent`][OperationVc::read_strongly_consistent] re-runs the producer and
/// yields fresh [`Effects`]. Retries are bounded to avoid livelock when two producers perpetually
/// stomp the same key; after the first retry a warning is logged on each subsequent attempt, and
/// on exhaustion the last `Retry` surfaces as an error.
///
/// This is one of two public entry points for applying effects (see also
/// [`resolve_strongly_consistent_and_take_and_apply_effects`]) — `Effects::apply` is private so the
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
        let value = op.read_strongly_consistent().await?;
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

/// Group the effects by key, keeping one index per distinct identity. This is the eager half of
/// effect deduplication — it only uses the cheap [`Effect::identity`] (no
/// [`EffectStateStorage`] interaction or IO) and is therefore safe to call from inside a
/// turbo-tasks task in [`take_effects`].
fn build_key_groups(effects: &[TraitRef<Box<dyn Effect>>]) -> Vec<Box<[usize]>> {
    let mut by_key: FxHashMap<Box<[u8]>, Vec<usize>> = FxHashMap::default();
    for (idx, effect) in effects.iter().enumerate() {
        let group = by_key.entry(effect.key()).or_default();
        let identity = effect.identity();
        if !group
            .iter()
            .any(|&other| effects[other].identity() == identity)
        {
            group.push(idx);
        }
    }

    let mut groups: Vec<Box<[usize]>> = by_key
        .into_values()
        .map(|group| group.into_boxed_slice())
        .collect();
    // Sort by first idx so the order is deterministic — useful for stable tracing/logging.
    groups.sort_unstable_by_key(|group| group[0]);
    groups
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
