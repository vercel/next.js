use std::{
    fmt::Debug,
    mem::take,
    ops::{Deref, DerefMut},
};

use auto_hash_map::AutoSet;
use parking_lot::{Mutex, MutexGuard};
use serde::{Deserialize, Deserializer, Serialize};

use crate::{get_invalidator, mark_stateful, trace::TraceRawVcs, Invalidator};

pub struct State<T> {
    inner: Mutex<StateInner<T>>,
}

struct StateInner<T> {
    value: T,
    invalidators: AutoSet<Invalidator>,
}

pub struct StateRef<'a, T> {
    inner: MutexGuard<'a, StateInner<T>>,
    mutated: bool,
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

impl<T: Default> Default for State<T> {
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

impl<T> Serialize for State<T> {
    fn serialize<S: serde::Serializer>(&self, _serializer: S) -> Result<S::Ok, S::Error> {
        // For this to work at all we need to do more. Changing the state need to
        // invalidate the serialization of the task that contains the state. So we
        // probably need to store the state outside of the task to be able to serialize
        // it independent from the creating task.
        panic!("State serialization is not implemented yet");
    }
}

impl<'de, T> Deserialize<'de> for State<T> {
    fn deserialize<D: Deserializer<'de>>(_deserializer: D) -> Result<Self, D::Error> {
        panic!("State serialization is not implemented yet");
    }
}

impl<T> Drop for State<T> {
    fn drop(&mut self) {
        let mut inner = self.inner.lock();
        for invalidator in take(&mut inner.invalidators) {
            invalidator.invalidate();
        }
    }
}

impl<T> State<T> {
    pub fn new(value: T) -> Self {
        mark_stateful();
        Self {
            inner: Mutex::new(StateInner {
                value,
                invalidators: AutoSet::new(),
            }),
        }
    }

    /// Gets the current value of the state. The current task will be registered
    /// as dependency of the state and will be invalidated when the state
    /// changes.
    pub fn get(&self) -> StateRef<'_, T> {
        let invalidator = get_invalidator();
        let mut inner = self.inner.lock();
        inner.invalidators.insert(invalidator);
        StateRef {
            inner,
            mutated: false,
        }
    }

    /// Gets the current value of the state. Untracked.
    pub fn get_untracked(&self) -> StateRef<'_, T> {
        let inner = self.inner.lock();
        StateRef {
            inner,
            mutated: false,
        }
    }

    /// Sets the current state without comparing it with the old value. This
    /// should only be used if one is sure that the value has changed.
    pub fn set_unconditionally(&self, value: T) {
        let mut inner = self.inner.lock();
        inner.value = value;
        for invalidator in take(&mut inner.invalidators) {
            invalidator.invalidate();
        }
    }

    /// Updates the current state with the `update` function. The `update`
    /// function need to return `true` when the value was modified. Exposing
    /// the current value from the `update` function is not allowed and will
    /// result in incorrect cache invalidation.
    pub fn update_conditionally(&self, update: impl FnOnce(&mut T) -> bool) {
        let mut inner = self.inner.lock();
        if !update(&mut inner.value) {
            return;
        }
        for invalidator in take(&mut inner.invalidators) {
            invalidator.invalidate();
        }
    }
}

impl<T: PartialEq> State<T> {
    /// Update the current state when the `value` is different from the current
    /// value. `T` must implement [PartialEq] for this to work.
    pub fn set(&self, value: T) {
        let mut inner = self.inner.lock();
        if inner.value == value {
            return;
        }
        inner.value = value;
        for invalidator in take(&mut inner.invalidators) {
            invalidator.invalidate();
        }
    }
}

impl<'a, T> Deref for StateRef<'a, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.inner.value
    }
}

impl<'a, T> DerefMut for StateRef<'a, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.mutated = true;
        &mut self.inner.value
    }
}

impl<'a, T> Drop for StateRef<'a, T> {
    fn drop(&mut self) {
        if self.mutated {
            for invalidator in take(&mut self.inner.invalidators) {
                invalidator.invalidate();
            }
        }
    }
}
