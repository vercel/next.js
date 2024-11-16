use std::{borrow::Cow, future::Future, panic, pin::Pin};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoSet;
use parking_lot::Mutex;
use tokio::task::JoinHandle;
use tracing::{Instrument, Span};

use crate::{self as turbo_tasks, emit, manager::turbo_tasks_future_scope, CollectiblesSource, Vc};

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
    span: Span,
}

/// The Effect instance collectible that is emitted for effects.
#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
struct EffectInstance {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    inner: Mutex<Option<EffectInner>>,
}

impl EffectInstance {
    fn new(future: impl Future<Output = Result<()>> + Send + Sync + 'static) -> Self {
        Self {
            inner: Mutex::new(Some(EffectInner {
                future: Box::pin(future),
                span: Span::current(),
            })),
        }
    }

    fn apply(&self) -> Option<JoinHandle<Result<()>>> {
        let future = self.inner.lock().take();
        future.map(|EffectInner { future, span }| {
            tokio::spawn(
                turbo_tasks_future_scope(turbo_tasks::turbo_tasks(), future).instrument(span),
            )
        })
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
    emit::<Box<dyn Effect>>(Vc::upcast(EffectInstance::new(future).cell()));
}

/// Applies all effects that have been emitted by an operations.
///
/// Usually it's important that effects are strongly consistent, so one want to use `apply_effects`
/// only on operations that have been strongly consistently read before.
///
/// The order of execution is not defined and effects are executed in parallel.
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
    let span = tracing::span!(tracing::Level::INFO, "apply effects", count = effects.len());
    async move {
        let mut first_error = anyhow::Ok(());
        for effect in effects {
            let Some(effect) = Vc::try_resolve_downcast_type::<EffectInstance>(effect).await?
            else {
                panic!("Effect must only be implemented by EffectInstance");
            };
            if let Some(join_handle) = effect.await?.apply() {
                match join_handle.await {
                    Ok(Err(err)) if first_error.is_ok() => {
                        first_error = Err(err);
                    }
                    Err(err) if first_error.is_ok() => {
                        let any = err.into_panic();
                        let panic = match any.downcast::<String>() {
                            Ok(owned) => Some(Cow::Owned(*owned)),
                            Err(any) => match any.downcast::<&'static str>() {
                                Ok(str) => Some(Cow::Borrowed(*str)),
                                Err(_) => None,
                            },
                        };
                        first_error = Err(if let Some(panic) = panic {
                            anyhow!("Task effect panicked: {panic}")
                        } else {
                            anyhow!("Task effect panicked")
                        });
                    }
                    _ => {}
                }
            }
        }
        first_error
    }
    .instrument(span)
    .await
}

#[cfg(test)]
mod tests {
    use crate::{apply_effects, CollectiblesSource};

    #[test]
    #[allow(dead_code)]
    fn apply_effects_is_sync_and_send() {
        fn assert_sync<T: Sync + Send>(_: T) {}
        fn check<T: CollectiblesSource + Send + Sync>(t: T) {
            assert_sync(apply_effects(t));
        }
    }
}
