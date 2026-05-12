//! `TaskStorageBox`: an owning pointer to a [`TaskStorage`].
//!
//! This type starts life as a thin wrapper around `Box<TaskStorage>`. In a follow-up step
//! it will be reworked to manage a custom allocation that includes a packed tail of lazy
//! field payloads. Migrating call sites to this wrapper first lets that change happen
//! with no further churn at the call sites.

use std::{
    fmt,
    ops::{Deref, DerefMut},
};

use crate::backend::storage_schema::TaskStorage;

/// Owning pointer to a [`TaskStorage`].
///
/// Conceptually equivalent to `Box<TaskStorage>` today. The reason it exists as a separate
/// type is so that we can later replace the underlying allocation with one that contains
/// both the `TaskStorage` head and a packed tail of lazy field payloads, without touching
/// every call site again.
pub struct TaskStorageBox(Box<TaskStorage>);

impl TaskStorageBox {
    /// Create a fresh, empty `TaskStorageBox`.
    pub fn new() -> Self {
        Self(Box::new(TaskStorage::new()))
    }

    /// Wrap an existing `Box<TaskStorage>`.
    ///
    /// Used during the migration so call sites that build a `TaskStorage` and box it can
    /// be converted incrementally. Will go away once the underlying allocation is owned
    /// directly by `TaskStorageBox`.
    pub fn from_boxed(boxed: Box<TaskStorage>) -> Self {
        Self(boxed)
    }
}

impl Default for TaskStorageBox {
    fn default() -> Self {
        Self::new()
    }
}

impl Deref for TaskStorageBox {
    type Target = TaskStorage;
    #[inline]
    fn deref(&self) -> &TaskStorage {
        &self.0
    }
}

impl DerefMut for TaskStorageBox {
    #[inline]
    fn deref_mut(&mut self) -> &mut TaskStorage {
        &mut self.0
    }
}

impl fmt::Debug for TaskStorageBox {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&*self.0, f)
    }
}
