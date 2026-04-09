use std::{
    any::{Any, TypeId},
    error::Error as StdError,
    future::Future,
    mem::replace,
    pin::Pin,
    sync::Arc,
};

use anyhow::Result;
use futures::{StreamExt, TryStreamExt};
use parking_lot::Mutex;
use rustc_hash::{FxHashMap, FxHashSet};
use tokio::task_local;
use tracing::Instrument;

use crate::{
    self as turbo_tasks, CollectiblesSource, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt,
    emit,
    event::{Event, EventListener},
    manager::{debug_assert_in_top_level_task, debug_assert_not_in_top_level_task},
    spawn,
    trace::TraceRawVcs,
};

const APPLY_EFFECTS_CONCURRENCY_LIMIT: usize = 1024;

pub trait Effect: TraceRawVcs + NonLocalValue + Send + Sync + 'static {
    type Error: EffectError;

    /// A function that is called once at the top level of the program's execution after everything
    /// has "settled".
    ///
    /// This function is executed outside of the turbo-tasks context, and therefore cannot read any
    /// `Vc`s or call any turbo-task functions. The effect can store [`ResolvedVc`]s (or any other
    /// `Vc` type), but should not read or resolve their contents.
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

// Private wrapper trait to allow dynamic dispatch of an `Effect`. This is similar to the pattern
// that the dynosaur crate uses: https://github.com/spastorino/dynosaur
trait DynEffect: TraceRawVcs + NonLocalValue + Send + Sync + 'static {
    fn dyn_apply<'a>(&'a self) -> DynEffectApplyFuture<'a>;
}

impl<T> DynEffect for T
where
    T: Effect,
{
    fn dyn_apply<'a>(&'a self) -> DynEffectApplyFuture<'a> {
        Box::pin(async move {
            self.apply()
                .await
                .map_err(|err| Arc::new(err) as Arc<dyn EffectError>)
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

#[derive(TraceRawVcs, NonLocalValue)]
enum EffectState {
    NotStarted(Box<dyn DynEffect>),
    /// The `Effect` has already begun execution in another thread. The `DynEffect` is moved here so
    /// that `TraceRawVcs` works as expected. An alternative is that we could always run
    /// `TraceRawVcs` before starting execution and just store a `Vec` of `Vc`s here, but
    /// `TraceRawVcs` is potentially slow.
    Started(Arc<dyn DynEffect>, Event),
    Finished(Result<(), Arc<dyn EffectError>>),

    /// Can occur if we paniced while constructing the Started state
    Invalid,
}

/// The Effect instance collectible that is emitted for effects.
#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
struct EffectInstance {
    // Internal mutability: It's important that if `EffectInstance::apply` is called multiple
    // times, the caller sees the same return value.
    #[turbo_tasks(debug_ignore)]
    inner: Mutex<EffectState>,
}

impl EffectInstance {
    fn new(effect: impl Effect) -> Self {
        Self {
            inner: Mutex::new(EffectState::NotStarted(
                Box::new(effect) as Box<dyn DynEffect>
            )),
        }
    }

    async fn apply(&self) -> Result<()> {
        loop {
            enum State {
                Started(EventListener),
                NotStarted(Arc<dyn DynEffect>),
            }
            let state = {
                let mut guard = self.inner.lock();
                match &*guard {
                    EffectState::Started(_, event) => {
                        let listener = event.listen();
                        State::Started(listener)
                    }
                    EffectState::Finished(result) => {
                        return result.clone().map_err(Into::into);
                    }
                    EffectState::NotStarted(_) => {
                        let EffectState::NotStarted(effect) =
                            std::mem::replace(&mut *guard, EffectState::Invalid)
                        else {
                            unreachable!()
                        };
                        let effect: Arc<dyn DynEffect> = Arc::from(effect);
                        *guard = EffectState::Started(
                            effect.clone(),
                            Event::new(|| || "Effect".to_string()),
                        );
                        State::NotStarted(effect)
                    }
                    EffectState::Invalid => unreachable!(),
                }
            };
            match state {
                State::Started(listener) => listener.await,
                State::NotStarted(effect) => {
                    // This spawn prevents the effect from running within a turbo_tasks context.
                    // This is important because if we read a `Vc`, we want it to fail (panic). If
                    // it didn't, we'd assign the dependency to the wrong task.
                    let join_handle = spawn(ApplyEffectsContext::in_current_scope(async move {
                        effect.dyn_apply().await
                    }));
                    let result = match join_handle.await {
                        Err(err) => Err(err),
                        Ok(()) => Ok(()),
                    };
                    let event = {
                        let mut guard = self.inner.lock();
                        let EffectState::Started(_, event) =
                            replace(&mut *guard, EffectState::Finished(result.clone()))
                        else {
                            unreachable!();
                        };
                        event
                    };
                    event.notify(usize::MAX);
                    return result.map_err(Into::into);
                }
            }
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
/// function should be applied with [`Effect::apply`].
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
/// #[turbo_tasks::value(serialization = "none")]
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
    Ok(Effects { effects })
}

/// Captured effects from an operation. This struct can be used to return Effects from a turbo-tasks
/// function and apply them later.
#[derive(Default)]
#[turbo_tasks::value(shared, eq = "manual", serialization = "none")]
pub struct Effects {
    #[turbo_tasks(debug_ignore)]
    effects: Vec<ReadRef<EffectInstance>>,
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
    /// Applies all effects that have been captured by this struct.
    ///
    /// The order of execution is not defined and effects are executed in parallel.
    ///
    /// `apply` must only be used in a "top-level" task (e.g. [`run_once`][crate::run_once]), after
    /// [`take_effects`] is called from an [operation read with strong
    /// consistency][crate::OperationVc::read_strongly_consistent].
    ///
    /// See [`take_effects`] for example usage.
    pub async fn apply(&self) -> Result<()> {
        debug_assert_in_top_level_task(
            "Effects::apply must be called from a top-level task to avoid unintended \
             re-executions due to eventual consistency",
        );
        let span = tracing::info_span!("apply effects", count = self.effects.len());
        if self.effects.is_empty() {
            return Ok(());
        }
        APPLY_EFFECTS_CONTEXT
            .scope(Default::default(), async move {
                // Limit the concurrency of effects
                futures::stream::iter(&self.effects)
                    .map(Ok)
                    .try_for_each_concurrent(APPLY_EFFECTS_CONCURRENCY_LIMIT, async |effect| {
                        effect.apply().await
                    })
                    .await
            })
            .instrument(span)
            .await
    }
}

task_local! {
    /// The context of the current effects application.
    static APPLY_EFFECTS_CONTEXT: Arc<Mutex<ApplyEffectsContext>>;
}

#[derive(Default)]
pub struct ApplyEffectsContext {
    data: FxHashMap<TypeId, Box<dyn Any + Send + Sync>>,
}

impl ApplyEffectsContext {
    fn in_current_scope<F: Future>(f: F) -> impl Future<Output = F::Output> {
        let current = Self::current();
        APPLY_EFFECTS_CONTEXT.scope(current, f)
    }

    fn current() -> Arc<Mutex<Self>> {
        APPLY_EFFECTS_CONTEXT
            .try_with(|mutex| mutex.clone())
            .expect("No effect context found")
    }

    fn with_context<T, F: FnOnce(&mut Self) -> T>(f: F) -> T {
        APPLY_EFFECTS_CONTEXT
            .try_with(|mutex| f(&mut mutex.lock()))
            .expect("No effect context found")
    }

    pub fn set<T: Any + Send + Sync>(value: T) {
        Self::with_context(|this| {
            this.data.insert(TypeId::of::<T>(), Box::new(value));
        })
    }

    pub fn with<T: Any + Send + Sync, R>(f: impl FnOnce(&mut T) -> R) -> Option<R> {
        Self::with_context(|this| {
            this.data
                .get_mut(&TypeId::of::<T>())
                .map(|value| {
                    // Safety: the map is keyed by TypeId
                    unsafe { value.downcast_unchecked_mut() }
                })
                .map(f)
        })
    }

    pub fn with_or_insert_with<T: Any + Send + Sync, R>(
        insert_with: impl FnOnce() -> T,
        f: impl FnOnce(&mut T) -> R,
    ) -> R {
        Self::with_context(|this| {
            let value = this.data.entry(TypeId::of::<T>()).or_insert_with(|| {
                let value = insert_with();
                Box::new(value)
            });
            f(
                // Safety: the map is keyed by TypeId
                unsafe { value.downcast_unchecked_mut() },
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::{CollectiblesSource, Effects, take_effects};

    #[test]
    #[allow(dead_code)]
    fn is_sync_and_send() {
        fn assert_sync<T: Sync + Send>(_: T) {}
        fn check_effects_apply() {
            assert_sync(
                Effects {
                    effects: Vec::new(),
                }
                .apply(),
            );
        }
        fn check_take_effects<T: CollectiblesSource + Send + Sync>(t: T) {
            assert_sync(take_effects(t));
        }
    }
}
