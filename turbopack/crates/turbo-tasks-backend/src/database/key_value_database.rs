use anyhow::Result;
use smallvec::SmallVec;
use turbo_persistence::{FamilyConfig, FamilyKind};

use crate::database::write_batch::ConcurrentWriteBatch;

#[derive(Debug, Clone, Copy)]
pub enum KeySpace {
    Infra = 0,
    TaskMeta = 1,
    TaskData = 2,
    TaskCache = 3,
}
impl KeySpace {
    /// Constructs a [`KeySpace`] from its numeric index (i.e., the `usize` discriminant).
    ///
    /// # Panics
    ///
    /// Panics if `i` is out of range (i.e., `>= FAMILIES`).
    pub const fn from_index(i: usize) -> Self {
        match i {
            0 => KeySpace::Infra,
            1 => KeySpace::TaskMeta,
            2 => KeySpace::TaskData,
            3 => KeySpace::TaskCache,
            _ => panic!("KeySpace index out of range"),
        }
    }

    const fn name(&self) -> &'static str {
        match self {
            KeySpace::Infra => "Infra",
            KeySpace::TaskMeta => "TaskMeta",
            KeySpace::TaskData => "TaskData",
            KeySpace::TaskCache => "TaskCache",
        }
    }

    /// Returns the persistence configuration for this keyspace.
    pub const fn family_config(&self) -> FamilyConfig {
        match self {
            KeySpace::Infra | KeySpace::TaskMeta | KeySpace::TaskData => FamilyConfig {
                name: self.name(),
                kind: FamilyKind::SingleValue,
            },
            KeySpace::TaskCache => FamilyConfig {
                name: self.name(),
                // TaskCache uses hash-based lookups with potential collisions.
                kind: FamilyKind::MultiValue,
            },
        }
    }
}

pub trait KeyValueDatabase {
    fn is_empty(&self) -> bool {
        false
    }

    type ValueBuffer<'l>: std::borrow::Borrow<[u8]>
    where
        Self: 'l;

    fn get(&self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'_>>>;
    /// Looks up a key and returns all matching values.
    ///
    /// Useful for keyspaces where keys are hashes and collisions are possible (e.g., TaskCache).
    /// The default implementation returns at most one value (from `get`), but implementations
    /// that support multiple values per key should override this.
    fn get_multiple(
        &self,
        key_space: KeySpace,
        key: &[u8],
    ) -> Result<SmallVec<[Self::ValueBuffer<'_>; 1]>> {
        Ok(self.get(key_space, key)?.into_iter().collect())
    }

    fn batch_get(
        &self,
        key_space: KeySpace,
        keys: &[&[u8]],
    ) -> Result<Vec<Option<Self::ValueBuffer<'_>>>> {
        let mut results = Vec::with_capacity(keys.len());
        for key in keys {
            let value = self.get(key_space, key)?;
            results.push(value);
        }
        Ok(results)
    }

    type ConcurrentWriteBatch<'l>: ConcurrentWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::ConcurrentWriteBatch<'_>>;

    /// Called when the database has been invalidated via
    /// [`crate::backing_storage::BackingStorage::invalidate`]
    ///
    /// This typically means that we'll restart the process or `turbo-tasks` soon with a fresh
    /// database. If this happens, there's no point in writing anything else to disk, or flushing
    /// during [`KeyValueDatabase::shutdown`].
    ///
    /// This is a best-effort optimization hint, and the database may choose to ignore this and
    /// continue file writes. This happens after the database is invalidated, so it is valid for
    /// this to leave the database in a half-updated and corrupted state.
    fn prevent_writes(&self) {
        // this is an optional performance hint to the database
    }

    /// Triggers compaction of the database.
    ///
    /// Returns `Ok(true)` if compaction actually merged files, `Ok(false)` if there was nothing
    /// to compact. The default implementation is a no-op.
    fn compact(&self) -> Result<bool> {
        Ok(false)
    }

    fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    /// Returns true if the database is in an unrecoverable error state where a previous write or
    /// compaction failed and the rollback also failed, permanently disabling further writes.
    fn has_unrecoverable_write_error(&self) -> bool {
        false
    }
}
