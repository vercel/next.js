use std::{any::TypeId, cell::SyncUnsafeCell, fmt::Debug};

pub struct RegistryType {
    // The globally unique name for this function, used when persisting.
    pub global_name: &'static str,
    /// A readable name of the function that is used to reporting purposes.
    pub name: &'static str,
    /// The type's globally-unique TypeId.
    pub type_id: TypeId,
    /// Assigned during registry init (single-threaded inside Lazy).
    pub(crate) id: SyncUnsafeCell<u16>,
}

impl Eq for RegistryType {}
impl PartialEq for RegistryType {
    fn eq(&self, other: &Self) -> bool {
        self.type_id == other.type_id
    }
}

impl Debug for RegistryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.global_name)
    }
}

impl RegistryType {
    pub const fn new<T: 'static>(name: &'static str, global_name: &'static str) -> Self {
        Self {
            name,
            global_name,
            type_id: TypeId::of::<T>(),
            id: SyncUnsafeCell::new(0),
        }
    }
}
