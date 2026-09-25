use std::{
    fmt::Debug,
    mem::{replace, take},
    ops::Deref,
};

use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use parking_lot::{Mutex, MutexGuard};
use tracing::trace_span;

use crate::{
    InteriorMutator, Invalidator, OperationValue, get_interior_mutator, get_invalidator,
    manager::{mark_stateful, with_turbo_tasks},
};

#[derive(Encode, Decode)]
struct StateInner<T> {
    value: T,
    invalidators: AutoSet<Invalidator>,
}

// The mutators return the drained invalidators, and `set` and `set_unconditionally` also return
// whichever value is no longer stored. The caller must run the invalidators via
// [`run_invalidators`] and drop the value only after releasing the mutex and after
// [`InteriorMutator::mutate`] returns: both may call into turbo-tasks, which takes backend locks
// and starts operations (see `run_invalidators`).
impl<T> StateInner<T> {
    fn new(value: T) -> Self {
        Self {
            value,
            invalidators: AutoSet::new(),
        }
    }

    fn add_invalidator(&mut self, invalidator: Invalidator) {
        self.invalidators.insert(invalidator);
    }

    #[must_use]
    fn set_unconditionally(&mut self, value: T) -> (T, AutoSet<Invalidator>) {
        (
            replace(&mut self.value, value),
            take(&mut self.invalidators),
        )
    }

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
    /// Returns the replaced value, or `value` itself if it was equal to the stored one (with no
    /// invalidators, since nothing changed).
    #[must_use]
    fn set(&mut self, value: T) -> (T, Option<AutoSet<Invalidator>>) {
        if self.value == value {
            return (value, None);
        }
        let (old, invalidators) = self.set_unconditionally(value);
        (old, Some(invalidators))
    }
}

/// Invalidates every task that read the state before it changed.
///
/// Must be called *outside* the [`StateInner`] mutex guard and after [`InteriorMutator::mutate`]
/// has returned: invalidating reaches into the backend, which takes task locks (a snapshot takes
/// the mutex while holding those) and starts an operation of its own (which could wait on a
/// snapshot that is waiting on `mutate`).
fn run_invalidators(invalidators: AutoSet<Invalidator>) {
    if invalidators.is_empty() {
        return;
    }
    let _span = trace_span!("state value changed").entered();
    with_turbo_tasks(|tt| {
        for invalidator in invalidators {
            invalidator.invalidate(&**tt);
        }
    });
}

/// Read access to the value of a [`TransientState`], returned by [`TransientState::get`].
///
/// There is deliberately no mutable access: every change must go through the state's mutators so
/// that the tasks that read it are invalidated.
pub struct StateRef<'a, T> {
    inner: MutexGuard<'a, StateInner<T>>,
}

impl<T> Deref for StateRef<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.inner.value
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
    interior_mutator: InteriorMutator,
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
            interior_mutator: get_interior_mutator(),
            inner: Mutex::new(StateInner::new(value)),
        }
    }

    /// Applies `mutate` to the inner state as a change the backend must persist; see
    /// [`InteriorMutator::mutate`] for why marking and mutating are one step and what `mutate` must
    /// not do. Every change to the inner state, including registering a reader, goes through here.
    fn mutate<R>(&self, mutate: impl FnOnce(&mut StateInner<T>) -> R) -> R {
        self.interior_mutator
            .mutate(|| mutate(&mut self.inner.lock()))
    }

    /// Gets a copy of the current value of the state. The current task will be registered as
    /// dependency of the state and will be invalidated when the state changes.
    ///
    /// This returns a copy rather than a reference so that the state's lock is never held beyond
    /// this call: a caller holding it while calling into turbo-tasks could deadlock against a
    /// concurrent change to the state, which takes the lock inside a backend operation.
    pub fn get(&self) -> T
    where
        T: Clone,
    {
        let Some(invalidator) = get_invalidator() else {
            return self.get_untracked();
        };
        {
            let inner = self.inner.lock();
            if inner.invalidators.contains(&invalidator) {
                return inner.value.clone();
            }
        }
        // The invalidator set is persisted along with the value, so registering a new reader
        // changes this state's persisted form just as a `set` does. Done outside `mutate`, eviction
        // could drop the only copy that knows about the reader, and it would never be invalidated
        // again.
        self.mutate(|inner| inner.add_invalidator(invalidator));
        // Read the value only after registering, so a `set` in between invalidates this reader.
        self.get_untracked()
    }

    /// Gets a copy of the current value of the state. Untracked.
    pub fn get_untracked(&self) -> T
    where
        T: Clone,
    {
        self.inner.lock().value.clone()
    }

    /// Sets the current state without comparing it with the old value. This
    /// should only be used if one is sure that the value has changed.
    pub fn set_unconditionally(&self, value: T) {
        let (old, invalidators) = self.mutate(|inner| inner.set_unconditionally(value));
        drop(old);
        run_invalidators(invalidators);
    }

    /// Updates the current state with the `update` function. The `update`
    /// function need to return `true` when the value was modified. Exposing
    /// the current value from the `update` function is not allowed and will
    /// result in incorrect cache invalidation.
    ///
    /// `update` runs inside [`InteriorMutator::mutate`], so it must not call back into turbo-tasks,
    /// and must not drop anything that does (such as a `GcRoot` it replaces); see there. The state
    /// is marked for persisting even when `update` returns `false`.
    pub fn update_conditionally(&self, update: impl FnOnce(&mut T) -> bool) {
        if let Some(invalidators) = self.mutate(|inner| inner.update_conditionally(update)) {
            run_invalidators(invalidators);
        }
    }
}

impl<T: PartialEq> State<T> {
    /// Update the current state when the `value` is different from the current
    /// value. `T` must implement [PartialEq] for this to work.
    pub fn set(&self, value: T) {
        // Checked up front as well as inside `mutate`: an unchanged value then costs no more than
        // the comparison, without entering `mutate` at all.
        if self.inner.lock().value == value {
            return;
        }
        let (unused, invalidators) = self.mutate(|inner| inner.set(value));
        drop(unused);
        if let Some(invalidators) = invalidators {
            run_invalidators(invalidators);
        }
    }
}

/// Like [`State`], but never persisted: for values that are themselves never persisted, i.e.
/// declared with `serialization = "skip"`.
///
/// A [`State`] keeps its persisted copy in sync on every change, which costs a backend operation
/// and forbids calling back into turbo-tasks from an update closure. A `TransientState` needs none
/// of that, since there is no persisted copy to keep in sync. For the same reason it can hand out
/// a reference to its value instead of a copy.
///
/// The same warnings apply as for [`State`].
pub struct TransientState<T> {
    inner: Mutex<StateInner<T>>,
}

impl<T: Debug> Debug for TransientState<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TransientState")
            .field("value", &self.inner.lock().value)
            .finish()
    }
}

impl<T: Default + OperationValue> Default for TransientState<T> {
    fn default() -> Self {
        Self::new(Default::default())
    }
}

impl<T> PartialEq for TransientState<T> {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}
impl<T> Eq for TransientState<T> {}

impl<T> TransientState<T> {
    pub fn new(value: T) -> Self
    where
        T: OperationValue,
    {
        mark_stateful();
        Self {
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
        StateRef { inner }
    }

    /// Gets the current value of the state. Untracked.
    pub fn get_untracked(&self) -> StateRef<'_, T> {
        StateRef {
            inner: self.inner.lock(),
        }
    }

    /// Sets the current state without comparing it with the old value. This
    /// should only be used if one is sure that the value has changed.
    pub fn set_unconditionally(&self, value: T) {
        let (old, invalidators) = self.inner.lock().set_unconditionally(value);
        drop(old);
        run_invalidators(invalidators);
    }

    /// Updates the current state with the `update` function. The `update`
    /// function need to return `true` when the value was modified. Exposing
    /// the current value from the `update` function is not allowed and will
    /// result in incorrect cache invalidation.
    pub fn update_conditionally(&self, update: impl FnOnce(&mut T) -> bool) {
        let invalidators = self.inner.lock().update_conditionally(update);
        if let Some(invalidators) = invalidators {
            run_invalidators(invalidators);
        }
    }
}

impl<T: PartialEq> TransientState<T> {
    /// Update the current state when the `value` is different from the current
    /// value. `T` must implement [PartialEq] for this to work.
    pub fn set(&self, value: T) {
        let (unused, invalidators) = self.inner.lock().set(value);
        drop(unused);
        if let Some(invalidators) = invalidators {
            run_invalidators(invalidators);
        }
    }
}
