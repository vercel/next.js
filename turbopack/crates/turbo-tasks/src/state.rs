use std::{
    any::type_name,
    fmt::Debug,
    mem::take,
    ops::{Deref, DerefMut},
};

use auto_hash_map::AutoSet;
use parking_lot::{Mutex, MutexGuard};
use serde::{Deserialize, Serialize};
use tracing::trace_span;

use crate::{
    Invalidator, OperationValue, SerializationInvalidator, get_invalidator, mark_session_dependent,
    mark_stateful, trace::TraceRawVcs,
};

#[derive(Serialize, Deserialize)]
struct StateInner<T> {
    value: T,
    invalidators: AutoSet<Invalidator>,
}

impl<T> StateInner<T> {
    pub fn new(value: T) -> Self {
        Self {
            value,
            invalidators: AutoSet::new(),
        }
    }

    pub fn add_invalidator(&mut self, invalidator: Invalidator) {
        self.invalidators.insert(invalidator);
    }

    pub fn set_unconditionally(&mut self, value: T) {
        self.value = value;
        let _span = trace_span!("state value changed", value_type = type_name::<T>()).entered();
        for invalidator in take(&mut self.invalidators) {
            invalidator.invalidate();
        }
    }

    pub fn update_conditionally(&mut self, update: impl FnOnce(&mut T) -> bool) -> bool {
        if !update(&mut self.value) {
            return false;
        }
        let _span = trace_span!("state value changed", value_type = type_name::<T>()).entered();
        for invalidator in take(&mut self.invalidators) {
            invalidator.invalidate();
        }
        true
    }
}

impl<T: PartialEq> StateInner<T> {
    pub fn set(&mut self, value: T) -> bool {
        if self.value == value {
            return false;
        }
        let _span = trace_span!("state value changed", value_type = type_name::<T>()).entered();
        self.value = value;
        for invalidator in take(&mut self.invalidators) {
            invalidator.invalidate();
        }
        true
    }
}

pub struct StateRef<'a, T> {
    serialization_invalidator: Option<&'a SerializationInvalidator>,
    inner: MutexGuard<'a, StateInner<T>>,
    mutated: bool,
}

impl<T> Deref for StateRef<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.inner.value
    }
}

impl<T> DerefMut for StateRef<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.mutated = true;
        &mut self.inner.value
    }
}

impl<T> Drop for StateRef<'_, T> {
    fn drop(&mut self) {
        if self.mutated {
            let _span = trace_span!("state value changed", value_type = type_name::<T>()).entered();
            for invalidator in take(&mut self.inner.invalidators) {
                invalidator.invalidate();
            }
            if let Some(serialization_invalidator) = self.serialization_invalidator {
                serialization_invalidator.invalidate();
            }
        }
    }
}

/// **This API violates core assumption of turbo-tasks, is believed to be unsound, and there's no
/// plan fix it.** You should prefer to use [collectibles][crate::CollectiblesSource] instead of
/// state where at all possible. This API may be removed in the future.
///
/// An [internally-mutable] type, similar to [`RefCell`][std::cell::RefCell] or [`Mutex`] that can
/// be stored inside a [`VcValueType`].
///
/// **[`State`] should only be used with [`OperationVc`] and types that implement
/// [`OperationValue`]**.
///
/// Setting values inside a [`State`] bypasses the normal argument and return value tracking
/// that's tracks child function calls and re-runs tasks until their values settled. That system is
/// needed for [strong consistency]. [`OperationVc`] ensures that function calls are reconnected
/// with the parent/child call graph.
///
/// When reading a `State` with [`State::get`], the state itself (though not any values inside of
/// it) is marked as a dependency of the current task.
///
/// [internally-mutable]: https://doc.rust-lang.org/book/ch15-05-interior-mutability.html
/// [`VcValueType`]: crate::VcValueType
/// [strong consistency]: crate::OperationVc::read_strongly_consistent
/// [`OperationVc`]: crate::OperationVc
/// [`OperationValue`]: crate::OperationValue
#[derive(Serialize, Deserialize)]
pub struct State<T> {
    serialization_invalidator: SerializationInvalidator,
    inner: Mutex<StateInner<T>>,
}

impl<T: Debug> Debug for State<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("State")
            .field("value", &self.inner.lock().value)
            .finish()
    }
}

impl<T: TraceRawVcs> TraceRawVcs for State<T> {
    fn trace_raw_vcs(&self, trace_context: &mut crate::trace::TraceRawVcsContext) {
        self.inner.lock().value.trace_raw_vcs(trace_context);
    }
}

impl<T: Default + OperationValue> Default for State<T> {
    fn default() -> Self {
        // Need to be explicit to ensure marking as stateful.
        Self::new(Default::default())
    }
}

impl<T> PartialEq for State<T> {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}
impl<T> Eq for State<T> {}

impl<T> State<T> {
    pub fn new(value: T) -> Self
    where
        T: OperationValue,
    {
        Self {
            serialization_invalidator: mark_stateful(),
            inner: Mutex::new(StateInner::new(value)),
        }
    }

    /// Gets the current value of the state. The current task will be registered
    /// as dependency of the state and will be invalidated when the state
    /// changes.
    pub fn get(&self) -> StateRef<'_, T> {
        let invalidator = get_invalidator();
        let mut inner = self.inner.lock();
        if let Some(invalidator) = invalidator {
            inner.add_invalidator(invalidator);
        }
        StateRef {
            serialization_invalidator: Some(&self.serialization_invalidator),
            inner,
            mutated: false,
        }
    }

    /// Gets the current value of the state. Untracked.
    pub fn get_untracked(&self) -> StateRef<'_, T> {
        let inner = self.inner.lock();
        StateRef {
            serialization_invalidator: Some(&self.serialization_invalidator),
            inner,
            mutated: false,
        }
    }

    /// Sets the current state without comparing it with the old value. This
    /// should only be used if one is sure that the value has changed.
    pub fn set_unconditionally(&self, value: T) {
        {
            let mut inner = self.inner.lock();
            inner.set_unconditionally(value);
        }
        self.serialization_invalidator.invalidate();
    }

    /// Updates the current state with the `update` function. The `update`
    /// function need to return `true` when the value was modified. Exposing
    /// the current value from the `update` function is not allowed and will
    /// result in incorrect cache invalidation.
    pub fn update_conditionally(&self, update: impl FnOnce(&mut T) -> bool) {
        {
            let mut inner = self.inner.lock();
            if !inner.update_conditionally(update) {
                return;
            }
        }
        self.serialization_invalidator.invalidate();
    }
}

impl<T: PartialEq> State<T> {
    /// Update the current state when the `value` is different from the current
    /// value. `T` must implement [PartialEq] for this to work.
    pub fn set(&self, value: T) {
        {
            let mut inner = self.inner.lock();
            if !inner.set(value) {
                return;
            }
        }
        self.serialization_invalidator.invalidate();
    }
}

pub struct TransientState<T> {
    inner: Mutex<StateInner<Option<T>>>,
}

impl<T> Serialize for TransientState<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Serialize::serialize(&(), serializer)
    }
}

impl<'de, T> Deserialize<'de> for TransientState<T> {
    fn deserialize<D>(deserializer: D) -> Result<TransientState<T>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let () = Deserialize::deserialize(deserializer)?;
        Ok(TransientState {
            inner: Mutex::new(StateInner::new(Default::default())),
        })
    }
}

impl<T: Debug> Debug for TransientState<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TransientState")
            .field("value", &self.inner.lock().value)
            .finish()
    }
}

impl<T: TraceRawVcs> TraceRawVcs for TransientState<T> {
    fn trace_raw_vcs(&self, trace_context: &mut crate::trace::TraceRawVcsContext) {
        self.inner.lock().value.trace_raw_vcs(trace_context);
    }
}

impl<T> Default for TransientState<T> {
    fn default() -> Self {
        // Need to be explicit to ensure marking as stateful.
        Self::new()
    }
}

impl<T> PartialEq for TransientState<T> {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}
impl<T> Eq for TransientState<T> {}

impl<T> TransientState<T> {
    pub fn new() -> Self {
        mark_stateful();
        Self {
            inner: Mutex::new(StateInner::new(None)),
        }
    }

    /// Gets the current value of the state. The current task will be registered
    /// as dependency of the state and will be invalidated when the state
    /// changes.
    pub fn get(&self) -> StateRef<'_, Option<T>> {
        mark_session_dependent();
        let invalidator = get_invalidator();
        let mut inner = self.inner.lock();
        if let Some(invalidator) = invalidator {
            inner.add_invalidator(invalidator);
        }
        StateRef {
            serialization_invalidator: None,
            inner,
            mutated: false,
        }
    }

    /// Gets the current value of the state. Untracked.
    pub fn get_untracked(&self) -> StateRef<'_, Option<T>> {
        let inner = self.inner.lock();
        StateRef {
            serialization_invalidator: None,
            inner,
            mutated: false,
        }
    }

    /// Sets the current state without comparing it with the old value. This
    /// should only be used if one is sure that the value has changed.
    pub fn set_unconditionally(&self, value: T) {
        let mut inner = self.inner.lock();
        inner.set_unconditionally(Some(value));
    }

    /// Unset the current value without comparing it with the old value. This
    /// should only be used if one is sure that the value has changed.
    pub fn unset_unconditionally(&self) {
        let mut inner = self.inner.lock();
        inner.set_unconditionally(None);
    }

    /// Updates the current state with the `update` function. The `update`
    /// function need to return `true` when the value was modified. Exposing
    /// the current value from the `update` function is not allowed and will
    /// result in incorrect cache invalidation.
    pub fn update_conditionally(&self, update: impl FnOnce(&mut Option<T>) -> bool) {
        let mut inner = self.inner.lock();
        inner.update_conditionally(update);
    }
}

impl<T: PartialEq> TransientState<T> {
    /// Update the current state when the `value` is different from the current
    /// value. `T` must implement [PartialEq] for this to work.
    pub fn set(&self, value: T) {
        let mut inner = self.inner.lock();
        inner.set(Some(value));
    }

    /// Unset the current value.
    pub fn unset(&self) {
        let mut inner = self.inner.lock();
        inner.set(None);
    }
}
