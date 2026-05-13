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
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;

use crate::{
    self as turbo_tasks, CollectiblesSource, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt,
    emit,
    event::Event,
    manager::{debug_assert_in_top_level_task, debug_assert_not_in_top_level_task},
    trace::TraceRawVcs,
};

const APPLY_EFFECTS_CONCURRENCY_LIMIT: usize = 1024;

pub trait Effect: TraceRawVcs + NonLocalValue + Send + Sync + 'static {
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

// Private wrapper trait to allow dynamic dispatch of an `Effect`. This is similar to the pattern
// that the dynosaur crate uses: https://github.com/spastorino/dynosaur
trait DynEffect: TraceRawVcs + NonLocalValue + Send + Sync + 'static {
    fn key(&self) -> Box<[u8]>;
    fn value_hash(&self) -> u128;
    fn state_storage(&self) -> &EffectStateStorage;
    fn dyn_apply<'a>(&'a self) -> DynEffectApplyFuture<'a>;
}

impl<T> DynEffect for T
where
    T: Effect,
{
    fn key(&self) -> Box<[u8]> {
        Effect::key(self)
    }

    fn value_hash(&self) -> u128 {
        Effect::value_hash(self)
    }

    fn state_storage(&self) -> &EffectStateStorage {
        Effect::state_storage(self)
    }

    fn dyn_apply<'a>(&'a self) -> DynEffectApplyFuture<'a> {
        Box::pin(async move { Effect::apply(self).await.map_err(|err| Arc::new(err) as _) })
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
#[turbo_tasks::value(serialization = "skip", evict = "last", cell = "new", eq = "manual")]
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
/// #[turbo_tasks::value(serialization = "skip", evict = "last")]
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
    let effects = source
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
    Ok(Effects {
        effects,
        unique_indices: OnceLock::new(),
    })
}

#[derive(thiserror::Error, Debug, TraceRawVcs, NonLocalValue)]
#[error("Conflicting effects for the same key (key length: {key_len} bytes)")]
struct ConflictingEffectError {
    key_len: usize,
}

/// Cached result of grouping effects by key and dedup/conflict detection.
/// Each entry is (index into `effects`, per-key state entry).
/// The `EffectStateEntry` is resolved once and cached to avoid repeated map lookups on subsequent
/// `apply()` calls.
type UniqueEffectIndices = Result<Vec<(usize, EffectStateEntry)>, Arc<ConflictingEffectError>>;

/// Captured effects from an operation. This struct can be used to return Effects from a turbo-tasks
/// function and apply them later.
#[derive(Default)]
#[turbo_tasks::value(shared, eq = "manual", serialization = "skip", evict = "last")]
pub struct Effects {
    #[turbo_tasks(debug_ignore)]
    effects: Vec<ReadRef<EffectInstance>>,
    /// Cached `(index, state_entry)` pairs after grouping by key and dedup/conflict detection.
    /// Computed once on first `apply()` call; reused on subsequent calls to avoid repeated
    /// key allocations and map lookups.
    /// `Err` means a conflict was detected.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    unique_indices: OnceLock<UniqueEffectIndices>,
}

impl PartialEq for Effects {
    fn eq(&self, other: &Self) -> bool {
        if self.effects.len() != other.effects.len() {
            return false;
        }
        let effect_ptrs = self
            .effects
            .iter()
            .map(ReadRef::ptr)
            .collect::<FxHashSet<_>>();
        other
            .effects
            .iter()
            .all(|e| effect_ptrs.contains(&ReadRef::ptr(e)))
    }
}

impl Eq for Effects {}

impl Effects {
    /// Applies all effects that have been captured.
    ///
    /// On first call: groups effects by key, detects duplicates/conflicts, caches deduped indices.
    /// On subsequent calls: skips grouping (reuses cached indices), only runs per-key state checks.
    ///
    /// `apply` must only be used in a "top-level" task (e.g. [`run_once`][crate::run_once]), after
    /// [`take_effects`] is called from an [operation read with strong
    /// consistency][crate::OperationVc::read_strongly_consistent].
    ///
    /// See [`take_effects`] for example usage.
    pub async fn apply(&self) -> Result<(), Arc<dyn EffectError>> {
        debug_assert_in_top_level_task(
            "Effects::apply must be called from a top-level task to avoid unintended \
             re-executions due to eventual consistency",
        );
        if self.effects.is_empty() {
            return Ok(());
        }

        let span = tracing::info_span!("apply effects", count = self.effects.len());

        async {
            // Compute unique (index, state_entry) pairs once; reuse on later calls.
            // The EffectStateEntry is resolved from the state map on first call and cached
            // here, so subsequent apply() calls bypass the map lookup entirely.
            let unique_indices = self
                .unique_indices
                .get_or_init(|| {
                    let mut by_key: FxHashMap<Box<[u8]>, usize> = FxHashMap::default();
                    for (idx, effect) in self.effects.iter().enumerate() {
                        match by_key.entry(effect.inner.key()) {
                            hash_map::Entry::Vacant(entry) => {
                                entry.insert(idx);
                            }
                            hash_map::Entry::Occupied(entry) => {
                                if self.effects[*entry.get()].inner.value_hash()
                                    != effect.inner.value_hash()
                                {
                                    return Err(Arc::new(ConflictingEffectError {
                                        key_len: entry.key().len(),
                                    }));
                                }
                            }
                        }
                    }

                    let mut indices = Vec::with_capacity(by_key.len());
                    for (key, effect_idx) in by_key {
                        let state_storage = self.effects[effect_idx].inner.state_storage();
                        // Look up or create the per-key state entry and cache the Arc directly.
                        let entry = state_storage
                            .effect_state
                            .lock()
                            .entry(key)
                            .or_insert_with(|| Arc::new(Mutex::new(EffectLastApplied::Unapplied)))
                            .clone();
                        indices.push((effect_idx, entry));
                    }
                    Ok(indices)
                })
                .as_ref()
                .map_err(|err| err.clone() as Arc<_>)?;

            // Apply effects using cached (index, state_entry) pairs.
            // Hot path: no map lookup — EffectStateEntry is cached in unique_indices.
            futures::stream::iter(unique_indices.iter())
                .map(Ok::<_, Arc<dyn EffectError>>)
                .try_for_each_concurrent(APPLY_EFFECTS_CONCURRENCY_LIMIT, async |(idx, entry)| {
                    let effect: &dyn DynEffect = &*self.effects[*idx].inner;

                    // If `effect.dyn_apply` panics or the apply future is dropped before
                    // completion, the guard's drop impl resets the per-key state to `Unapplied`
                    // and notifies other waiters via the `Event` it recovers from the previous
                    // `InProgress`, so they retry rather than deadlock or observe a stale
                    // "panic" cache entry.
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
                            write_event: Event::new(|| {
                                || "effect application in progress".to_string()
                            }),
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
                                EffectLastApplied::Applied { value_hash, result } => {
                                    // Fast path: check if the stored value already matches
                                    if effect.value_hash() == *value_hash {
                                        return result.clone();
                                    } else {
                                        break begin_in_progress(last_applied_guard);
                                    }
                                }
                                EffectLastApplied::InProgress { write_event } => {
                                    // `Event::listen` registers the listener immediately, so
                                    // notifications fired after we drop `last_applied_guard`
                                    // cannot be missed.
                                    listener = write_event.listen();
                                }
                            }
                        };
                        // We didn't break out of the loop: There's a concurrent in-progress
                        // application. Wait for it to finish and then read `last_applied` again.
                        listener.await;
                    };

                    // Apply the effect. InProgress is visible to concurrent readers, preventing
                    // stale fast-path matches.
                    let effect_result = effect.dyn_apply().await;

                    // Update the state, clear the EventGuard
                    let prev_state = replace(
                        &mut *entry.lock(),
                        EffectLastApplied::Applied {
                            value_hash: effect.value_hash(),
                            result: effect_result.clone(),
                        },
                    );
                    // don't run the `Drop` impl on `EventGuard`. We'll do the notification
                    // ourselves.
                    forget(event_guard);

                    let EffectLastApplied::InProgress { write_event } = prev_state else {
                        unreachable!("Effect applied: prev_state must be InProgress");
                    };
                    write_event.notify(usize::MAX);

                    effect_result
                })
                .await
        }
        .instrument(span)
        .await
    }
}

#[cfg(test)]
mod tests {
    use crate::{CollectiblesSource, Effects, take_effects};

    #[test]
    #[allow(dead_code)]
    fn is_send() {
        fn assert_send<T: Send>(_: T) {}
        fn check_effects_apply() {
            assert_send(
                Effects {
                    effects: Vec::new(),
                    unique_indices: Default::default(),
                }
                .apply(),
            );
        }
        fn check_take_effects<T: CollectiblesSource + Send + Sync>(t: T) {
            assert_send(take_effects(t));
        }
    }
}
