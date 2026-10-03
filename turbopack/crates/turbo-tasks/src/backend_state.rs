//! Identity and registered type information for backend-owned state.
//!
//! A [`StateSlot`] is a static declaration, not the state value: each owner gets
//! one independent [`TurboTasksState`] for a given slot.

use std::{
    any::{Any, TypeId},
    fmt,
    hash::{Hash, Hasher},
    marker::PhantomData,
    sync::Arc,
};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;

use crate::{
    NonLocalValue, OperationValue, TaskId, TaskInput, TurboTasksApi,
    id::{StateFactoryId, StateId},
    manager::{current_task, with_turbo_tasks},
    registry::{self, RegistryType, impl_ptr_identity},
};

/// The namespace in which a registered state slot has one instance.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Encode, Decode)]
pub enum StateOwner {
    /// The creator task owns the state, independently of any of its cells.
    Task(TaskId),
    /// A named owner can be created without a current task, provided it is rooted.
    Named(RcStr),
}

/// A named backend state namespace pinned for the lifetime of this guard.
/// Dropping the last guard starts normal GC aging; it does not immediately
/// erase the named state's persisted value.
pub struct StateOwnerRoot {
    name: RcStr,
    tt: Arc<dyn TurboTasksApi>,
}

impl StateOwnerRoot {
    /// Create a stable named owner, including in `TurboTasks::run` where no
    /// task ID exists. Use a name unique within this TurboTasks instance.
    pub fn named(name: RcStr) -> Self {
        let tt = crate::turbo_tasks();
        tt.pin_named_state_owner(&name);
        Self { name, tt }
    }

    pub fn name(&self) -> &RcStr {
        &self.name
    }
}

impl Clone for StateOwnerRoot {
    fn clone(&self) -> Self {
        self.tt.pin_named_state_owner(&self.name);
        Self {
            name: self.name.clone(),
            tt: self.tt.clone(),
        }
    }
}

impl Drop for StateOwnerRoot {
    fn drop(&mut self) {
        self.tt.unpin_named_state_owner(&self.name);
    }
}

/// Logical lookup key retained by the backend, not stored in handles.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Encode, Decode)]
pub struct StateLookupKey {
    pub owner: StateOwner,
    pub slot: StateFactoryId,
}

/// Allocated identity used in inputs and dependencies. Neither the owner's
/// name nor the mutable value is copied with this reference.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Encode, Decode)]
pub struct StateKey {
    pub slot: StateFactoryId,
    pub id: StateId,
}

/// Erased codec for values of a registered state slot.
#[doc(hidden)]
#[derive(Debug)]
pub struct StateFactory {
    pub ty: RegistryType,
    pub value_type_id: TypeId,
    pub encode: fn(&(dyn Any + Send + Sync)) -> Result<Vec<u8>>,
    pub decode: fn(&[u8]) -> Result<Box<dyn Any + Send + Sync>>,
}

impl_ptr_identity!(StateFactory);

impl StateFactory {
    /// A distinct marker type per declaration keeps two slots with the same
    /// value type distinct in the link-time registry.
    pub const fn new<Marker: 'static, T: Encode + Decode<()> + Send + Sync + 'static>(
        name: &'static str,
        global_name: &'static str,
    ) -> Self {
        Self {
            ty: RegistryType::new::<Marker>(name, global_name),
            value_type_id: TypeId::of::<T>(),
            encode: |value| {
                let value = value
                    .downcast_ref::<T>()
                    .context("state slot value type mismatch")?;
                Ok(turbo_bincode::turbo_bincode_encode(value)?.into_vec())
            },
            decode: |bytes| Ok(Box::new(turbo_bincode::turbo_bincode_decode::<T>(bytes)?)),
        }
    }
}

/// A static declaration of one state value per owner.
///
/// A `#[turbo_tasks::state]` declaration attaches registered type information
/// to the slot. Values are provided on first creation, not by this declaration.
pub struct StateSlot<T> {
    factory: Option<&'static StateFactory>,
    _marker: PhantomData<fn() -> T>,
}

impl<T> StateSlot<T> {
    /// Initializer for a `#[turbo_tasks::state]` static declaration.
    pub const fn new() -> Self {
        Self {
            factory: None,
            _marker: PhantomData,
        }
    }

    #[doc(hidden)]
    pub const fn with_factory(factory: &'static StateFactory) -> Self {
        Self {
            factory: Some(factory),
            _marker: PhantomData,
        }
    }

    pub(crate) fn factory(&self) -> &'static StateFactory {
        self.factory
            .expect("StateSlot must be #[turbo_tasks::state]")
    }

    /// Get or create this slot in the current task's namespace. The initial
    /// value is used only for the first creation, not on task re-execution.
    pub fn for_current_task(&'static self, initial: T) -> TurboTasksState<T>
    where
        T: Encode + Decode<()> + Send + Sync + 'static,
    {
        let owner = StateOwner::Task(current_task("creating backend state"));
        self.for_owner(owner, initial)
    }

    /// Get or create a state in a named top-level owner's namespace.
    pub fn for_named_owner(&'static self, root: &StateOwnerRoot, initial: T) -> TurboTasksState<T>
    where
        T: Encode + Decode<()> + Send + Sync + 'static,
    {
        with_turbo_tasks(|tt| {
            assert!(
                Arc::ptr_eq(tt, &root.tt),
                "state owner belongs to another TurboTasks instance"
            )
        });
        self.for_owner(StateOwner::Named(root.name.clone()), initial)
    }

    /// Shared lookup for task and rooted named owners.
    fn for_owner(&'static self, owner: StateOwner, initial: T) -> TurboTasksState<T>
    where
        T: Encode + Decode<()> + Send + Sync + 'static,
    {
        let factory = self.factory();
        assert_eq!(
            factory.value_type_id,
            TypeId::of::<T>(),
            "state slot value type mismatch"
        );
        let lookup = StateLookupKey {
            owner,
            slot: registry::get_state_factory_id(factory),
        };
        let key = with_turbo_tasks(|tt| {
            tt.create_state(&lookup, &mut || {
                (factory.encode)(&initial).expect("state value could not be encoded")
            })
        });
        TurboTasksState::new(key)
    }
}

impl<T> Default for StateSlot<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// A typed reference to the backend's canonical value of a state slot.
/// Copying or serializing this handle does not copy the current state value.
#[derive(Encode, Decode)]
#[bincode(bounds = "")]
pub struct TurboTasksState<T> {
    key: StateKey,
    _marker: PhantomData<fn() -> T>,
}

impl<T> Copy for TurboTasksState<T> {}

impl<T> Clone for TurboTasksState<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> TurboTasksState<T> {
    pub(crate) fn new(key: StateKey) -> Self {
        Self {
            key,
            _marker: PhantomData,
        }
    }

    pub fn key(&self) -> &StateKey {
        &self.key
    }

    /// Clone the current value and record a dependency of the calling task.
    /// There is no asynchronous producer to wait for.
    pub fn get(&self) -> T
    where
        T: 'static,
    {
        self.read(true)
    }

    /// Clone the current value without registering a dependency.
    pub fn get_untracked(&self) -> T
    where
        T: 'static,
    {
        self.read(false)
    }

    /// Read the value, returning an explicit error if its owner was collected
    /// or the stored value cannot be restored.
    pub fn try_get(&self) -> Result<T>
    where
        T: 'static,
    {
        self.try_read(true)
    }

    pub fn try_get_untracked(&self) -> Result<T>
    where
        T: 'static,
    {
        self.try_read(false)
    }

    fn read(&self, tracked: bool) -> T
    where
        T: 'static,
    {
        self.try_read(tracked)
            .expect("could not read backend-owned state")
    }

    fn try_read(&self, tracked: bool) -> Result<T>
    where
        T: 'static,
    {
        let factory = registry::get_state_factory(self.key.slot);
        anyhow::ensure!(
            factory.value_type_id == TypeId::of::<T>(),
            "state slot value type mismatch"
        );
        let bytes = with_turbo_tasks(|tt| tt.read_state(&self.key, tracked))?;
        let value = (factory.decode)(&bytes)?;
        Ok(*value
            .downcast::<T>()
            .map_err(|_| anyhow::anyhow!("state slot value type mismatch"))?)
    }

    /// Publish a new value, dirtying current readers before they can observe it.
    pub fn set(&self, value: T)
    where
        T: Encode + Send + Sync + 'static,
    {
        let factory = registry::get_state_factory(self.key.slot);
        assert_eq!(
            factory.value_type_id,
            TypeId::of::<T>(),
            "state slot value type mismatch"
        );
        let bytes = (factory.encode)(&value).expect("state value could not be encoded");
        with_turbo_tasks(|tt| tt.set_state(&self.key, bytes))
            .expect("could not update backend-owned state");
    }
}

impl<T> fmt::Debug for TurboTasksState<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("TurboTasksState").field(&self.key).finish()
    }
}

impl<T> PartialEq for TurboTasksState<T> {
    fn eq(&self, other: &Self) -> bool {
        self.key == other.key
    }
}
impl<T> Eq for TurboTasksState<T> {}
impl<T> Hash for TurboTasksState<T> {
    fn hash<H: Hasher>(&self, hasher: &mut H) {
        self.key.hash(hasher);
    }
}

impl<T: Send + Sync + 'static> TaskInput for TurboTasksState<T> {
    fn is_transient(&self) -> bool {
        self.key.id.is_transient()
    }
}

// The handle contains only a stable identifier; it never borrows cell-local data.
unsafe impl<T: Send + Sync> NonLocalValue for TurboTasksState<T> {}
// Reading a value containing operations still requires the caller to connect them.
unsafe impl<T: OperationValue> OperationValue for TurboTasksState<T> {}

#[cfg(test)]
mod tests {
    use crate as turbo_tasks;
    use crate::{StateSlot, registry::get_state_factory_id};

    #[turbo_tasks::state]
    static FIRST: StateSlot<i32> = StateSlot::new();
    #[turbo_tasks::state]
    static SECOND: StateSlot<i32> = StateSlot::new();
    #[turbo_tasks::state]
    static STRING: StateSlot<turbo_rcstr::RcStr> = StateSlot::new();

    #[test]
    fn unknown_factory_id_is_rejected_during_decode() {
        let encoded = turbo_bincode::turbo_bincode_encode(&u16::MAX).unwrap();
        assert!(turbo_bincode::turbo_bincode_decode::<crate::StateFactoryId>(&encoded).is_err());
    }

    #[test]
    fn slot_codec_round_trips_rcstr() {
        let factory = STRING.factory();
        let original: turbo_rcstr::RcStr = "project".into();
        let bytes = (factory.encode)(&original).unwrap();
        let decoded = (factory.decode)(&bytes).unwrap();
        assert_eq!(*decoded.downcast::<turbo_rcstr::RcStr>().unwrap(), original);
    }

    #[test]
    fn a_deserialized_handle_cannot_read_a_slot_of_another_type() {
        use crate::backend_state::{StateKey, TurboTasksState};

        let handle = TurboTasksState::<i32>::new(StateKey {
            id: crate::StateId::MIN,
            slot: get_state_factory_id(FIRST.factory()),
        });
        let encoded = turbo_bincode::turbo_bincode_encode(&handle).unwrap();
        let wrong_type: TurboTasksState<bool> =
            turbo_bincode::turbo_bincode_decode(&encoded).unwrap();
        assert!(wrong_type.try_get_untracked().is_err());
    }

    #[test]
    fn distinct_slots_of_the_same_value_type_have_distinct_ids() {
        let first = get_state_factory_id(FIRST.factory());
        let second = get_state_factory_id(SECOND.factory());
        assert_ne!(first, second);
        assert_eq!(get_state_factory_id(FIRST.factory()), first);
    }
}
