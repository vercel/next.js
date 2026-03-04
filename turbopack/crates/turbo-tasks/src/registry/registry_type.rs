use std::{cell::SyncUnsafeCell, fmt::Debug};

pub struct RegistryType {
    // The globally unique name for this function, used when persisting.
    pub global_name: &'static str,
    /// A readable name of the function that is used to reporting purposes.
    pub name: &'static str,
    hash: usize,
    /// Assigned during registry init (single-threaded inside Lazy).
    pub(crate) id: SyncUnsafeCell<u16>,
}

impl Eq for RegistryType {}
impl PartialEq for RegistryType {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash && self.global_name == other.global_name
    }
}

impl Ord for RegistryType {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.hash
            .cmp(&other.hash)
            .then_with(|| self.global_name.cmp(other.global_name))
    }
}

impl PartialOrd for RegistryType {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Debug for RegistryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.global_name)
    }
}

impl RegistryType {
    pub const fn new(name: &'static str, global_name: &'static str) -> Self {
        Self {
            name,
            global_name,
            hash: registry_const_hash(global_name),
            id: SyncUnsafeCell::new(0),
        }
    }
}

/// A const-compatible hash function using DJB2 algorithm. This does not need
/// to be perfect, but it must mix bits enough to avoid excessive conflict in
/// initial ID allocation.
const fn registry_const_hash(s: &str) -> usize {
    let b = s.as_bytes();
    // DJB2
    let mut hash: usize = 5381_usize.wrapping_mul(b.len());
    let mut i = 0;
    while i < b.len() {
        hash = ((hash << 5).wrapping_add(hash)).wrapping_add(b[i] as usize);
        i += 1;
    }
    hash
}
