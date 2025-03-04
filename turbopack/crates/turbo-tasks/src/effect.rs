use std::{borrow::Cow, future::Future, mem::replace, panic, pin::Pin};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoSet;
use parking_lot::Mutex;
use rustc_hash::FxHashSet;
use tracing::{Instrument, Span};

use crate::{
    self as turbo_tasks,
    debug::ValueDebugFormat,
    emit,
    event::{Event, EventListener},
    manager::turbo_tasks_future_scope,
    trace::TraceRawVcs,
    util::SharedError,
    CollectiblesSource, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, Vc,
};

/// A trait to emit a task effect as collectible. This trait only has one
/// implementation, `EffectInstance` and no other implementation is allowed.
/// The trait is private to this module so that no other implementation can be
/// added.
#[turbo_tasks::value_trait]
trait Effect {}

/// A future that represents the effect of a task. The future is executed when
/// the effect is applied.
type EffectFuture = Pin<Box<dyn Future<Output = Result<()>> + Send + Sync + 'static>>;

/// The inner state of an effect instance if it has not been applied yet.
struct EffectInner {
    future: EffectFuture,
}

enum EffectState {
    NotStarted(EffectInner),
    Started(Event),
    Finished(Result<(), SharedError>),
}

/// The Effect instance collectible that is emitted for effects.
#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
struct EffectInstance {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    inner: Mutex<EffectState>,
}

impl EffectInstance {
    fn new(future: impl Future<Output = Result<()>> + Send + Sync + 'static) -> Self {
        Self {
            inner: Mutex::new(EffectState::NotStarted(EffectInner {
                future: Box::pin(future),
            })),
        }
    }

    async fn apply(&self) -> Result<()> {
        loop {
            enum State {
                Started(EventListener),
                NotStarted(EffectInner),
            }
            let state = {
                let mut guard = self.inner.lock();
                match &*guard {
                    EffectState::Started(event) => {
                        let listener = event.listen();
                        State::Started(listener)
                    }
                    EffectState::Finished(result) => {
                        return result.clone().map_err(Into::into);
                    }
                    EffectState::NotStarted(_) => {
                        let EffectState::NotStarted(inner) = std::mem::replace(
                            &mut *guard,
                            EffectState::Started(Event::new(|| "Effect".to_string())),
                        ) else {
                            unreachable!();
                        };
                        State::NotStarted(inner)
                    }
                }
            };
            match state {
                State::Started(listener) => {
                    listener.await;
                }
                State::NotStarted(EffectInner { future }) => {
                    let join_handle = tokio::spawn(
                        turbo_tasks_future_scope(turbo_tasks::turbo_tasks(), future)
                            .instrument(Span::current()),
                    );
                    let result = match join_handle.await {
                        Ok(Err(err)) => Err(SharedError::new(err)),
                        Err(err) => {
                            let any = err.into_panic();
                            let panic = match any.downcast::<String>() {
                                Ok(owned) => Some(Cow::Owned(*owned)),
                                Err(any) => match any.downcast::<&'static str>() {
                                    Ok(str) => Some(Cow::Borrowed(*str)),
                                    Err(_) => None,
                                },
                            };
                            Err(SharedError::new(if let Some(panic) = panic {
                                anyhow!("Task effect panicked: {panic}")
                            } else {
                                anyhow!("Task effect panicked")
                            }))
                        }
                        Ok(Ok(())) => Ok(()),
                    };
                    let event = {
                        let mut guard = self.inner.lock();
                        let EffectState::Started(event) =
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
impl Effect for EffectInstance {}

/// Schedules an effect to be applied. The passed future is executed once `apply_effects` is called.
///
/// The effect will only executed once. The passed future is executed outside of the current task
/// and can't read any Vcs. These need to be read before. ReadRefs can be passed into the future.
///
/// Effects are executed in parallel, so they might need to use async locking to avoid problems.
/// Order of execution of multiple effects is not defined. You must not use mutliple conflicting
/// effects to avoid non-deterministic behavior.
pub fn effect(future: impl Future<Output = Result<()>> + Send + Sync + 'static) {
    emit::<Box<dyn Effect>>(ResolvedVc::upcast(
        EffectInstance::new(future).resolved_cell(),
    ));
}

/// Applies all effects that have been emitted by an operations.
///
/// Usually it's important that effects are strongly consistent, so one want to use `apply_effects`
/// only on operations that have been strongly consistently read before.
///
/// The order of execution is not defined and effects are executed in parallel.
///
/// `apply_effects` must only be used in a "once" task. When used in a "root" task, a
/// combination of `get_effects` and `Effects::apply` must be used.
///
/// # Example
///
/// ```rust
/// let operation = some_turbo_tasks_function(args);
/// let result = operation.strongly_consistent().await?;
/// apply_effects(operation).await?;
/// ```
pub async fn apply_effects(source: impl CollectiblesSource) -> Result<()> {
    let effects: AutoSet<Vc<Box<dyn Effect>>> = source.take_collectibles();
    if effects.is_empty() {
        return Ok(());
    }
    let span = tracing::info_span!("apply effects", count = effects.len());
    async move {
        let mut first_error = anyhow::Ok(());
        for effect in effects {
            let Some(effect) = Vc::try_resolve_downcast_type::<EffectInstance>(effect).await?
            else {
                panic!("Effect must only be implemented by EffectInstance");
            };
            apply_effect(&effect.await?, &mut first_error).await;
        }
        first_error
    }
    .instrument(span)
    .await
}

/// Capture effects from an turbo-tasks operation. Since this captures collectibles it might
/// invalidate the current task when effects are changing or even temporary change.
///
/// Therefore it's important to wrap this in a strongly consistent read before applying the effects
/// with `Effects::apply`.
///
/// # Example
///
/// ```rust
/// async fn some_turbo_tasks_function_with_effects(args: Args) -> Result<ResultWithEffects> {
///     let operation = some_turbo_tasks_function(args);
///     let result = operation.strongly_consistent().await?;
///     let effects = get_effects(operation).await?;
///     Ok(ResultWithEffects { result, effects })
/// }
///
/// let result_with_effects = some_turbo_tasks_function_with_effects(args).strongly_consistent().await?;
/// result_with_effects.effects.apply().await?;
/// ```
pub async fn get_effects(source: impl CollectiblesSource) -> Result<Effects> {
    let effects: AutoSet<Vc<Box<dyn Effect>>> = source.take_collectibles();
    let effects = effects
        .into_iter()
        .map(|effect| async move {
            if let Some(effect) = Vc::try_resolve_downcast_type::<EffectInstance>(effect).await? {
                Ok(effect.await?)
            } else {
                panic!("Effect must only be implemented by EffectInstance");
            }
        })
        .try_join()
        .await?;
    Ok(Effects { effects })
}

/// Captured effects from an operation. This struct can be used to return Effects from a turbo-tasks
/// function and apply them later.
#[derive(TraceRawVcs, Default, ValueDebugFormat, NonLocalValue)]
pub struct Effects {
    #[turbo_tasks(trace_ignore, debug_ignore)]
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
    pub async fn apply(&self) -> Result<()> {
        let span = tracing::info_span!("apply effects", count = self.effects.len());
        async move {
            let mut first_error = anyhow::Ok(());
            for effect in self.effects.iter() {
                apply_effect(effect, &mut first_error).await;
            }
            first_error
        }
        .instrument(span)
        .await
    }
}

async fn apply_effect(
    effect: &ReadRef<EffectInstance>,
    first_error: &mut std::result::Result<(), anyhow::Error>,
) {
    match effect.apply().await {
        Err(err) if first_error.is_ok() => {
            *first_error = Err(err);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use crate::{apply_effects, get_effects, CollectiblesSource};

    #[test]
    #[allow(dead_code)]
    fn is_sync_and_send() {
        fn assert_sync<T: Sync + Send>(_: T) {}
        fn check_apply_effects<T: CollectiblesSource + Send + Sync>(t: T) {
            assert_sync(apply_effects(t));
        }
        fn check_get_effects<T: CollectiblesSource + Send + Sync>(t: T) {
            assert_sync(get_effects(t));
        }
    }
}
