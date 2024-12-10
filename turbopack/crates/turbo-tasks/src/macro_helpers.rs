//! Runtime helpers for [turbo-tasks-macro].
use std::ops::{Deref, DerefMut};

pub use async_trait::async_trait;
pub use once_cell::sync::{Lazy, OnceCell};
pub use serde;
pub use tracing;

pub use super::{
    magic_any::MagicAny,
    manager::{find_cell_by_type, notify_scheduled_tasks, spawn_detached_for_testing},
};
use crate::{
    debug::ValueDebugFormatString, shrink_to_fit::ShrinkToFit, task::TaskOutput, NonLocalValue,
    RawVc, TaskInput, TaskPersistence, Vc,
};

#[inline(never)]
pub async fn value_debug_format_field(value: ValueDebugFormatString<'_>) -> String {
    match value.try_to_value_debug_string().await {
        Ok(result) => match result.await {
            Ok(result) => result.to_string(),
            Err(err) => format!("{0:?}", err),
        },
        Err(err) => format!("{0:?}", err),
    }
}

pub fn get_non_local_persistence_from_inputs(inputs: &impl TaskInput) -> TaskPersistence {
    if inputs.is_transient() {
        TaskPersistence::Transient
    } else {
        TaskPersistence::Persistent
    }
}

pub fn get_non_local_persistence_from_inputs_and_this(
    this: RawVc,
    inputs: &impl TaskInput,
) -> TaskPersistence {
    if this.is_transient() || inputs.is_transient() {
        TaskPersistence::Transient
    } else {
        TaskPersistence::Persistent
    }
}

pub fn assert_returns_non_local_value<ReturnType, Rv>()
where
    ReturnType: TaskOutput<Return = Vc<Rv>>,
    Rv: NonLocalValue + Send,
{
}

#[macro_export]
macro_rules! stringify_path {
    ($path:path) => {
        stringify!($path)
    };
}

/// A wrapper type that uses the [autoderef specialization hack][autoderef] to call
/// [`ShrinkToFit::shrink_to_fit`] on types that implement [`ShrinkToFit`].
///
/// This uses a a no-op method [`ShrinkToFitFallbackNoop::shrink_to_fit`] on types that do not
/// implement [`ShrinkToFit`].
///
/// This is used by the derive macro for [`ShrinkToFit`], which is called by the
/// [turbo_tasks::value][crate::value] macro.
///
/// [autoderef]: http://lukaskalbertodt.github.io/2019/12/05/generalized-autoref-based-specialization.html
pub struct ShrinkToFitDerefSpecialization<'a, T> {
    inner: ShrinkToFitFallbackNoop<'a, T>,
}

impl<'a, T> ShrinkToFitDerefSpecialization<'a, T> {
    pub fn new(real: &'a mut T) -> Self {
        Self {
            inner: ShrinkToFitFallbackNoop { real },
        }
    }
}

impl<T> ShrinkToFitDerefSpecialization<'_, T>
where
    T: ShrinkToFit,
{
    pub fn shrink_to_fit(&mut self) {
        // call the real `ShrinkToFit::shrink_to_fit` method
        self.inner.real.shrink_to_fit()
    }
}

impl<'a, T> Deref for ShrinkToFitDerefSpecialization<'a, T> {
    type Target = ShrinkToFitFallbackNoop<'a, T>;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl<T> DerefMut for ShrinkToFitDerefSpecialization<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

// Implements `ShrinkToFit` using a no-op `ShrinkToFit::shrink_to_fit` method.
pub struct ShrinkToFitFallbackNoop<'a, T> {
    real: &'a mut T,
}

impl<T> ShrinkToFitFallbackNoop<'_, T> {
    /// A no-op function called as part of [`ShrinkToFitDerefSpecialization`] when `T` does not
    /// implement [`ShrinkToFit`].
    pub fn shrink_to_fit(&mut self) {}
}
