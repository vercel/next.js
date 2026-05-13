use std::{
    fmt::Debug,
    mem::take,
    ops::{Deref, DerefMut},
};

use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use parking_lot::{Mutex, MutexGuard};
use tracing::trace_span;

use crate::{
    Invalidator, OperationValue, SerializationInvalidator, get_invalidator,
    get_serialization_invalidator, manager::with_turbo_tasks, trace::TraceRawVcs,
};

#[derive(Encode, Decode)]
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

    /// Sets the value and returns the drained invalidators. The caller MUST
    /// run them via [`run_invalidators`] *after* dropping the [`Mutex`] guard
    /// — calling [`Invalidator::invalidate`] may grab locks in the backend which can lead to cycles
    #[must_use]
    fn set_unconditionally(&mut self, value: T) -> AutoSet<Invalidator> {
        self.value = value;
        take(&mut self.invalidators)
    }

    /// See [`Self::set_unconditionally`] for the locking contract on the
    /// returned invalidators.
    #[must_use]
    fn update_conditionally(
        &mut self,
        update: impl FnOnce(&mut T) -> bool,
    ) -> Option<AutoSet<Invalidator>> {
        if !update(&mut self.value) {
            return None;
        }
        Some(take(&mut self.invalidators))
    }
}

impl<T: PartialEq> StateInner<T> {
    /// See [`Self::set_unconditionally`] for the locking contract on the
    /// returned invalidators.
    #[must_use]
    fn set(&mut self, value: T) -> Option<AutoSet<Invalidator>> {
        if self.value == value {
            return None;
        }
        self.value = value;
        Some(take(&mut self.invalidators))
    }
}

/// Notifies the backend that the [`State`] has been mutated: runs every
/// dependent [`Invalidator`] and invalidates the serialized state. Must be
/// called *outside* the [`StateInner`] mutex guard; see
/// [`StateInner::set_unconditionally`] for why.
///
/// Both notifications resolve `TURBO_TASKS` from a task-local, so we do them
/// inside a single [`with_turbo_tasks`] call to amortize that lookup.
fn notify_mutated(
    invalidators: AutoSet<Invalidator>,
    serialization_invalidator: Option<&SerializationInvalidator>,
) {
    if invalidators.is_empty() && serialization_invalidator.is_none() {
        return;
    }
    let _span = trace_span!("state value changed").entered();
    with_turbo_tasks(|tt| {
        for invalidator in invalidators {
            invalidator.invalidate(&**tt);
        }
        if let Some(serialization_invalidator) = serialization_invalidator {
            tt.invalidate_serialization(serialization_invalidator.task());
        }
    });
}

pub struct StateRef<'a, T> {
    serialization_invalidator: Option<&'a SerializationInvalidator>,
    // `Option` so `Drop` can `take()` the guard and release it before running
    // invalidators. Always `Some` for the lifetime of the `StateRef` outside
    // of `Drop`.
    inner: Option<MutexGuard<'a, StateInner<T>>>,
    mutated: bool,
}

impl<'a, T> StateRef<'a, T> {
    fn new(
        inner: MutexGuard<'a, StateInner<T>>,
        serialization_invalidator: Option<&'a SerializationInvalidator>,
    ) -> Self {
        Self {
            serialization_invalidator,
            inner: Some(inner),
            mutated: false,
        }
    }

    fn inner(&self) -> &StateInner<T> {
        self.inner.as_deref().expect("inner only None during Drop")
    }

    fn inner_mut(&mut self) -> &mut StateInner<T> {
        self.inner
            .as_deref_mut()
            .expect("inner only None during Drop")
    }
}

impl<T> Deref for StateRef<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.inner().value
    }
}

impl<T> DerefMut for StateRef<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.mutated = true;
        &mut self.inner_mut().value
    }
}

impl<T> Drop for StateRef<'_, T> {
    fn drop(&mut self) {
        if !self.mutated {
            return;
        }
        // Drain invalidators while we still hold the guard, then drop the
        // guard before running them. Running invalidators reaches into the
        // backend and acquires task-storage shard locks, and the snapshot
        // path takes the State mutex while holding such a shard lock — so
        // running them under the guard is a lock-order inversion.
        let mut guard = self.inner.take().expect("Drop only called once");
        let invalidators = take(&mut guard.invalidators);
        drop(guard);
        notify_mutated(invalidators, self.serialization_invalidator);
    }
}

pub mod parking_lot_mutex_bincode {
    use bincode::{
        BorrowDecode,
        de::{BorrowDecoder, Decoder},
        enc::Encoder,
        error::{DecodeError, EncodeError},
    };

    use super::*;

    pub fn encode<T: Encode, E: Encoder>(
        mutex: &Mutex<T>,
        encoder: &mut E,
    ) -> Result<(), EncodeError> {
        mutex.lock().encode(encoder)
    }

    pub fn decode<Context, T: Decode<Context>, D: Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<Mutex<T>, DecodeError> {
        Ok(Mutex::new(T::decode(decoder)?))
    }

    pub fn borrow_decode<
        'de,
        Context,
        T: BorrowDecode<'de, Context>,
        D: BorrowDecoder<'de, Context = Context>,
    >(
        decoder: &mut D,
    ) -> Result<Mutex<T>, DecodeError> {
        Ok(Mutex::new(T::borrow_decode(decoder)?))
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
#[derive(Encode, Decode)]
pub struct State<T> {
    serialization_invalidator: SerializationInvalidator,
    #[bincode(with = "parking_lot_mutex_bincode")]
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
            serialization_invalidator: get_serialization_invalidator(),
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
        StateRef::new(inner, Some(&self.serialization_invalidator))
    }

    /// Gets the current value of the state. Untracked.
    pub fn get_untracked(&self) -> StateRef<'_, T> {
        let inner = self.inner.lock();
        StateRef::new(inner, Some(&self.serialization_invalidator))
    }

    /// Sets the current state without comparing it with the old value. This
    /// should only be used if one is sure that the value has changed.
    pub fn set_unconditionally(&self, value: T) {
        let invalidators = {
            let mut inner = self.inner.lock();
            inner.set_unconditionally(value)
        };
        notify_mutated(invalidators, Some(&self.serialization_invalidator));
    }

    /// Updates the current state with the `update` function. The `update`
    /// function need to return `true` when the value was modified. Exposing
    /// the current value from the `update` function is not allowed and will
    /// result in incorrect cache invalidation.
    pub fn update_conditionally(&self, update: impl FnOnce(&mut T) -> bool) {
        let Some(invalidators) = ({
            let mut inner = self.inner.lock();
            inner.update_conditionally(update)
        }) else {
            return;
        };
        notify_mutated(invalidators, Some(&self.serialization_invalidator));
    }
}

impl<T: PartialEq> State<T> {
    /// Update the current state when the `value` is different from the current
    /// value. `T` must implement [PartialEq] for this to work.
    pub fn set(&self, value: T) {
        let Some(invalidators) = ({
            let mut inner = self.inner.lock();
            inner.set(value)
        }) else {
            return;
        };
        notify_mutated(invalidators, Some(&self.serialization_invalidator));
    }
}
