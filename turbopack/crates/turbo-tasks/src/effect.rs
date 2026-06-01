use std::{
    collections::hash_map,
    error::Error as StdError,
    future::Future,
    mem::{forget, replace},
    pin::Pin,
    sync::{Arc, OnceLock},
};

use anyhow::Result;
use futures::{StreamExt, TryStreamExt};
use parking_lot::{Mutex, MutexGuard};
use rustc_hash::FxHashMap;
use tracing::Instrument;

use crate::{
    self as turbo_tasks, CollectiblesSource, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt,
    emit,
    event::Event,
    invalidation::{Invalidator, get_invalidator},
    manager::{
        debug_assert_in_top_level_task, debug_assert_not_in_top_level_task, with_turbo_tasks,
    },
    trace::TraceRawVcs,
};

const APPLY_EFFECTS_CONCURRENCY_LIMIT: usize = 1024;

/// Emit-time effect. Lives inside an [`EffectInstance`] cell and is allowed to read Vcs in
/// [`Effect::capture`] (since `capture` runs from within a turbo-tasks task during
/// [`take_effects`]).
///
/// Implementations resolve any `ResolvedVc`/`Vc` data they need inside `capture()` and return a
/// [`CapturedEffect`] holding only the pre-resolved fields. The captured value is what gets
/// stored in [`Effects`] and what eventually drives the side effect at apply time. After a
/// successful [`Effects::apply`], the captured Vec is dropped — releasing any `ReadRef`s the
/// `CapturedEffect`s held and breaking the strong-count cascade onto upstream cells.
pub trait Effect: TraceRawVcs + NonLocalValue + Send + Sync + 'static {
    /// The pre-resolved companion that performs the side effect. See [`CapturedEffect`].
    type Captured: CapturedEffect;

    /// Resolve any Vc/ReadRef data needed for `apply()`. Runs inside the turbo-tasks task
    /// context of [`take_effects`], so it may `.await` Vc reads. The returned
    /// [`CapturedEffect`] must hold only pre-resolved data — its `apply()` will run from a
    /// top-level task where Vc reads are not expected.
    fn capture(&self) -> impl Future<Output = Result<Self::Captured>> + Send;
}

/// Post-capture effect. Holds only pre-resolved data and performs the actual side effect.
/// `apply()` must not read Vcs — by this point the effect has been captured outside the
/// task graph and any retry semantics go through [`Effects::apply`]'s invalidator path.
pub trait CapturedEffect: TraceRawVcs + NonLocalValue + Send + Sync + 'static {
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
    /// So instead, we leave it up to the caller to figure out how to downcast these errors
    /// themselves.
    ///
    /// [`SharedError`]: crate::util::SharedError
    type Error: EffectError;

    /// Unique key identifying this effect's target (e.g., absolute path bytes).
    fn key(&self) -> Box<[u8]>;

    /// Extract the hash of the value part of this effect for comparison.
    fn value_hash(&self) -> u128;

    /// Returns a reference to the state storage.
    fn state_storage(&self) -> &EffectStateStorage;

    /// Perform the side effect (write file, create symlink, etc.).
    fn apply(&self) -> impl Future<Output = Result<(), Self::Error>> + Send;
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

// Private dyn-dispatch wrapper for emit-time `Effect`. Held inside `EffectInstance` cells.
// Provides only `dyn_capture` — Vc-reading capture step that runs during `take_effects`.
trait DynEffect: TraceRawVcs + NonLocalValue + Send + Sync + 'static {
    fn dyn_capture<'a>(&'a self) -> DynCaptureFuture<'a>;
}

type DynCaptureFuture<'a> =
    Pin<Box<dyn Future<Output = Result<Box<dyn DynCapturedEffect>>> + Send + 'a>>;

impl<T> DynEffect for T
where
    T: Effect,
{
    fn dyn_capture<'a>(&'a self) -> DynCaptureFuture<'a> {
        Box::pin(async move {
            let captured = Effect::capture(self).await?;
            Ok(Box::new(captured) as Box<dyn DynCapturedEffect>)
        })
    }
}

// Private dyn-dispatch wrapper for post-capture `CapturedEffect`. Held inside `Effects.captured`
// (Vec drops on successful apply). No Vc reads. Mirrors the dynosaur pattern of
// https://github.com/spastorino/dynosaur.
pub(crate) trait DynCapturedEffect:
    TraceRawVcs + NonLocalValue + Send + Sync + 'static
{
    fn key(&self) -> Box<[u8]>;
    fn value_hash(&self) -> u128;
    fn state_storage(&self) -> &EffectStateStorage;
    fn dyn_apply<'a>(&'a self) -> DynEffectApplyFuture<'a>;
}

impl<T> DynCapturedEffect for T
where
    T: CapturedEffect,
{
    fn key(&self) -> Box<[u8]> {
        CapturedEffect::key(self)
    }

    fn value_hash(&self) -> u128 {
        CapturedEffect::value_hash(self)
    }

    fn state_storage(&self) -> &EffectStateStorage {
        CapturedEffect::state_storage(self)
    }

    fn dyn_apply<'a>(&'a self) -> DynEffectApplyFuture<'a> {
        Box::pin(async move {
            CapturedEffect::apply(self)
                .await
                .map_err(|err| Arc::new(err) as _)
        })
    }
}

type DynEffectApplyFuture<'a> =
    Pin<Box<dyn Future<Output = Result<(), Arc<dyn EffectError>>> + Send + 'a>>;

/// A trait to emit a task effect as collectible. This trait only has one implementation,
/// `EffectInstance` and no other implementation is allowed. The trait is private to this module so
/// that no other implementation can be added.
#[turbo_tasks::value_trait]
trait EffectCollectible {}

/// The Effect instance collectible that is emitted for effects.
#[turbo_tasks::value(serialization = "skip", cell = "new", eq = "manual")]
struct EffectInstance {
    #[turbo_tasks(debug_ignore)]
    inner: Box<dyn DynEffect>,
}

impl EffectInstance {
    fn new(effect: impl Effect) -> Self {
        Self {
            inner: Box::new(effect) as Box<dyn DynEffect>,
        }
    }
}

#[turbo_tasks::value_impl]
impl EffectCollectible for EffectInstance {}

/// Emits an effect to be applied. The effect is executed once [`Effects::apply`] is called (see
/// [`take_effects`]).
///
/// The effect will only executed once. The effect is executed outside of the current task
/// and can't read any Vcs. These need to be read before. ReadRefs can be passed into the effect.
///
/// Effects are executed in parallel, so they might need to use async locking to avoid problems.
/// Order of execution of multiple effects is not defined. You must not use multiple conflicting
/// effects to avoid non-deterministic behavior.
pub fn emit_effect(effect: impl Effect) {
    emit::<Box<dyn EffectCollectible>>(ResolvedVc::upcast(
        EffectInstance::new(effect).resolved_cell(),
    ));
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
    let effect_refs = source
        .take_collectibles::<Box<dyn EffectCollectible>>()
        .into_iter()
        .map(|effect| {
            if let Some(effect) = ResolvedVc::try_downcast_type::<EffectInstance>(effect) {
                effect
            } else {
                unreachable!("EffectCollectible must only be implemented by EffectInstance");
            }
        })
        .try_join()
        .await?;

    // Capture step: resolve any Vc reads now while we're still inside the producing task's
    // context. The `ReadRef<EffectInstance>`s drop at the end of this iteration, so the only
    // long-lived strong counts onto `EffectInstance` cells come from `dyn_capture` borrows
    // (transient).
    let captured: Vec<Box<dyn DynCapturedEffect>> = effect_refs
        .iter()
        .map(|effect_ref| effect_ref.inner.dyn_capture())
        .try_join()
        .await?;
    drop(effect_refs);

    // Grab an invalidator on the *producing task*. Used only on the retry path: if a later
    // `apply()` call discovers the captured Vec was dropped and the per-key state machine no
    // longer carries our `Applied { value_hash }`, we invalidate this task so the producer
    // re-runs and emits fresh effects.
    let invalidator = get_invalidator()
        .expect("take_effects must be called from within a turbo-tasks task context");

    Ok(Effects::new(captured, invalidator))
}

#[derive(thiserror::Error, Debug, TraceRawVcs, NonLocalValue)]
#[error("Conflicting effects for the same key (key length: {key_len} bytes)")]
struct ConflictingEffectError {
    key_len: usize,
}

/// Error returned by [`Effects::apply`]. Callers should retry on `Retry`; everything else is
/// terminal.
#[derive(thiserror::Error, Debug, Clone)]
pub enum EffectsError {
    /// A side effect failed during apply. Holds the first error encountered.
    #[error(transparent)]
    Apply(Arc<dyn EffectError>),

    /// Two effects emitted the same key with different value_hashes; no apply happened.
    #[error("conflicting effects for the same key (key length: {0} bytes)")]
    Conflict(usize),

    /// The captured effects were dropped after a previous successful apply, and the shared
    /// per-key state for at least one effect no longer carries a matching `Applied { value_hash
    /// }`. The producing operation has been invalidated; the caller should re-read the operation
    /// and call `apply()` again on the fresh [`Effects`] value.
    #[error("effect state was reset; producing operation has been invalidated, retry required")]
    Retry,
}

impl From<Arc<dyn EffectError>> for EffectsError {
    fn from(err: Arc<dyn EffectError>) -> Self {
        EffectsError::Apply(err)
    }
}

/// Cached deduped per-key data computed on first `apply()`.
struct UniqueEffectEntry {
    /// Index into the captured Vec. Only meaningful while `captured` is `Some`.
    idx: usize,
    entry: EffectStateEntry,
    value_hash: u128,
}
type UniqueEffectIndices = Result<Vec<UniqueEffectEntry>, Arc<ConflictingEffectError>>;

/// Slice of captured effects, individually Arc'd. Each effect is `Arc<dyn DynCapturedEffect>`
/// so callers can cheaply clone a Send handle out across `.await` boundaries without holding
/// the outer mutex.
type CapturedSlice = Arc<[Arc<dyn DynCapturedEffect>]>;

/// Captured effects from an operation. This struct can be used to return Effects from a turbo-tasks
/// function and apply them later.
#[turbo_tasks::value(shared, eq = "manual", serialization = "skip", evict = "last")]
pub struct Effects {
    /// Pre-resolved effects awaiting application. `Some` until the first fully-successful
    /// `apply()` drops them. After drop, `apply()` short-circuits through the per-key state
    /// machine using `unique_indices`, falling back to invalidator-driven retry if any entry
    /// no longer carries our `Applied { value_hash }`.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    captured: Arc<Mutex<Option<CapturedSlice>>>,
    /// Captured at `take_effects` time. `None` for `Effects::empty()` (nothing to retry).
    #[turbo_tasks(debug_ignore, trace_ignore)]
    invalidator: Option<Invalidator>,
    /// Set of `(key, value_hash)` tuples captured at construction. Stable across the drop of
    /// `captured` and used for `PartialEq`. Wrapped in `Arc` so `Effects` clones are cheap.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    identity: Arc<Vec<(Box<[u8]>, u128)>>,
    /// Cached deduped `(idx, value_hash, EffectStateEntry)` tuples computed on first `apply()`.
    /// Survives the drop of `captured`.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    unique_indices: Arc<OnceLock<UniqueEffectIndices>>,
}

impl Effects {
    /// An `Effects` value with no effects. Used by callers that need a placeholder where no
    /// side effects were collected.
    #[cfg(test)]
    fn empty() -> Self {
        Self {
            captured: Arc::new(Mutex::new(Some(Arc::from(Vec::new())))),
            invalidator: None,
            identity: Arc::new(Vec::new()),
            unique_indices: Arc::new(OnceLock::new()),
        }
    }

    fn new(captured: Vec<Box<dyn DynCapturedEffect>>, invalidator: Invalidator) -> Self {
        let identity: Vec<(Box<[u8]>, u128)> =
            captured.iter().map(|e| (e.key(), e.value_hash())).collect();
        // Convert Box<dyn> into Arc<dyn> per slot. Each Arc is independently Send/Sync.
        let captured: CapturedSlice = captured
            .into_iter()
            .map(Arc::<dyn DynCapturedEffect>::from)
            .collect();
        Self {
            captured: Arc::new(Mutex::new(Some(captured))),
            invalidator: Some(invalidator),
            identity: Arc::new(identity),
            unique_indices: Arc::new(OnceLock::new()),
        }
    }
}

impl PartialEq for Effects {
    fn eq(&self, other: &Self) -> bool {
        // Equality is determined by the (key, value_hash) multiset captured at construction.
        // Stable across drain — `identity` is never mutated.
        if self.identity.len() != other.identity.len() {
            return false;
        }
        // Both sides typically very small (often 0 or 1) — linear comparison is fine.
        let mut other_used = vec![false; other.identity.len()];
        'outer: for entry in self.identity.iter() {
            for (i, other_entry) in other.identity.iter().enumerate() {
                if !other_used[i] && other_entry == entry {
                    other_used[i] = true;
                    continue 'outer;
                }
            }
            return false;
        }
        true
    }
}

impl Eq for Effects {}

impl Effects {
    /// Applies all effects that have been captured.
    ///
    /// On first call: groups effects by key, detects duplicates/conflicts, caches deduped indices,
    /// runs the per-key state machine. On full success, drops the captured Vec so the underlying
    /// `EffectInstance` strong-counts are released.
    ///
    /// On subsequent calls: short-circuits via the per-key state machine and cached
    /// `unique_indices`. If state for any key was reset (panic recovery or cross-`Effects`
    /// conflict) and the captured Vec has been dropped, invalidates the producing operation and
    /// returns [`EffectsError::Retry`] — callers should re-read the operation and call `apply()`
    /// again on the fresh `Effects` value.
    ///
    /// `apply` must only be used in a "top-level" task (e.g. [`run_once`][crate::run_once]), after
    /// [`take_effects`] is called from an [operation read with strong
    /// consistency][crate::OperationVc::read_strongly_consistent].
    ///
    /// See [`take_effects`] for example usage.
    pub async fn apply(&self) -> Result<(), EffectsError> {
        debug_assert_in_top_level_task(
            "Effects::apply must be called from a top-level task to avoid unintended \
             re-executions due to eventual consistency",
        );
        if self.identity.is_empty() {
            return Ok(());
        }

        let span = tracing::info_span!("apply effects", count = self.identity.len());

        async {
            // Initialize unique_indices on first call. Requires the captured Vec to be present.
            let unique_indices_result = self.unique_indices.get_or_init(|| {
                let captured_guard = self.captured.lock();
                let Some(captured) = captured_guard.as_ref() else {
                    // This branch is unreachable in practice: if `captured` is None then the
                    // first apply() has already completed and initialized `unique_indices`. We
                    // can't form a real `ConflictingEffectError` here, so signal it with a
                    // sentinel and translate to Retry below.
                    return Err(Arc::new(ConflictingEffectError {
                        key_len: usize::MAX,
                    }));
                };
                build_unique_indices(captured)
            });
            let unique = match unique_indices_result.as_ref() {
                Ok(unique) => unique,
                Err(err) if err.key_len == usize::MAX => {
                    return self.signal_retry();
                }
                Err(err) => return Err(EffectsError::Conflict(err.key_len)),
            };

            let have_captured = self.captured.lock().is_some();

            let apply_result = if have_captured {
                self.apply_with_captured(unique).await
            } else {
                self.apply_post_drop(unique).await
            };

            match apply_result {
                Ok(()) if have_captured => {
                    // Drop the captured Vec outside the lock so the ReadRef-drop cascades
                    // happen without holding the mutex.
                    let drained = self.captured.lock().take();
                    drop(drained);
                    Ok(())
                }
                other => other,
            }
        }
        .instrument(span)
        .await
    }

    /// Apply path used while the captured Vec is still present. Mirrors the historical
    /// state-machine loop, calling `dyn_apply()` via `captured[entry.idx]` as needed.
    async fn apply_with_captured(&self, unique: &[UniqueEffectEntry]) -> Result<(), EffectsError> {
        // Clone the captured slice handle once, outside the concurrent loop, so each per-effect
        // future can grab its own `Arc<dyn DynCapturedEffect>` without taking the outer mutex.
        let captured: CapturedSlice = self
            .captured
            .lock()
            .as_ref()
            .expect("apply_with_captured called with captured Vec already dropped")
            .clone();
        futures::stream::iter(unique.iter())
            .map(Ok::<_, EffectsError>)
            .try_for_each_concurrent(APPLY_EFFECTS_CONCURRENCY_LIMIT, async |unique_entry| {
                let entry = &unique_entry.entry;
                let value_hash = unique_entry.value_hash;

                // If `dyn_apply` panics or the future is dropped before completion, the guard's
                // drop impl resets the per-key state to `Unapplied` and notifies other waiters
                // via the `Event` it recovers from the previous `InProgress`, so they retry
                // rather than deadlock or observe a stale "panic" cache entry.
                struct EventGuard<'a> {
                    entry: &'a EffectStateEntry,
                }
                impl Drop for EventGuard<'_> {
                    fn drop(&mut self) {
                        let prev_state =
                            replace(&mut *self.entry.lock(), EffectLastApplied::Unapplied);
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
                    EventGuard { entry }
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
                                    return result.clone().map_err(EffectsError::Apply);
                                } else {
                                    break begin_in_progress(last_applied_guard);
                                }
                            }
                            EffectLastApplied::InProgress { write_event } => {
                                // Event::listen registers the listener immediately, so
                                // notifications fired after we drop last_applied_guard cannot be
                                // missed.
                                listener = write_event.listen();
                            }
                        }
                    };
                    listener.await;
                };

                // The cloned `captured` slice is Send (Arc<[Arc<dyn DynCapturedEffect>]>), so
                // we can index into it freely without locks.
                let effect = &captured[unique_entry.idx];
                let effect_result = effect.dyn_apply().await;

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

                effect_result.map_err(EffectsError::Apply)
            })
            .await
    }

    /// Apply path used once the captured Vec has been dropped. Only consults the per-key state
    /// machine. If any entry no longer carries our `Applied { value_hash }`, invalidate the
    /// producing operation and return `Retry`.
    async fn apply_post_drop(&self, unique: &[UniqueEffectEntry]) -> Result<(), EffectsError> {
        for unique_entry in unique.iter() {
            let entry = &unique_entry.entry;
            let value_hash = unique_entry.value_hash;
            loop {
                let listener;
                {
                    let last_applied_guard = entry.lock();
                    match &*last_applied_guard {
                        EffectLastApplied::Applied {
                            value_hash: stored,
                            result,
                        } if *stored == value_hash => {
                            // Cached result still matches. Return it (Ok or cached error).
                            result.clone().map_err(EffectsError::Apply)?;
                            break;
                        }
                        EffectLastApplied::Applied { .. } | EffectLastApplied::Unapplied => {
                            // State was reset or another `Effects` overwrote it. We have no
                            // captured effect to re-apply.
                            drop(last_applied_guard);
                            return self.signal_retry();
                        }
                        EffectLastApplied::InProgress { write_event } => {
                            listener = write_event.listen();
                        }
                    }
                }
                listener.await;
            }
        }
        Ok(())
    }

    /// Invalidate the producing task (if any) and return `EffectsError::Retry`. Used when the
    /// per-key state machine no longer carries our `Applied { value_hash }` and we have no
    /// captured effect to re-apply.
    fn signal_retry(&self) -> Result<(), EffectsError> {
        if let Some(invalidator) = self.invalidator {
            with_turbo_tasks(|tt| invalidator.invalidate(&**tt));
        }
        Err(EffectsError::Retry)
    }
}

/// Build deduped `(idx, value_hash, EffectStateEntry)` tuples from a captured slice. Detects
/// per-key value-hash conflicts.
fn build_unique_indices(
    captured: &[Arc<dyn DynCapturedEffect>],
) -> Result<Vec<UniqueEffectEntry>, Arc<ConflictingEffectError>> {
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

    let mut indices = Vec::with_capacity(by_key.len());
    for (key, effect_idx) in by_key {
        let effect = &captured[effect_idx];
        let state_storage = effect.state_storage();
        let entry = state_storage
            .effect_state
            .lock()
            .entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(EffectLastApplied::Unapplied)))
            .clone();
        indices.push(UniqueEffectEntry {
            idx: effect_idx,
            entry,
            value_hash: effect.value_hash(),
        });
    }
    Ok(indices)
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
