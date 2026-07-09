//! Unified cell storage.
//!
//! Every task cell — whether its value type is bincode-serializable, hash-only,
//! derivable, or non-reconstructible — lives in a single `CellData` map keyed
//! by [`CellId`].

use std::{
    hash::BuildHasherDefault,
    ops::{Deref, DerefMut},
};

use auto_hash_map::{AutoMap, map::Entry};
use bincode::{
    Decode, Encode,
    error::{DecodeError, EncodeError},
};
use rustc_hash::FxHasher;
use turbo_bincode::{
    TurboBincodeDecode, TurboBincodeDecoder, TurboBincodeEncode, TurboBincodeEncoder,
    impl_decode_for_turbo_bincode_decode, impl_encode_for_turbo_bincode_encode,
};
use turbo_tasks::{
    CellId, Evictability, SharedReference, ShrinkToFit, ValueTypePersistence, registry,
};

use crate::backend::storage_schema::{DropPartial, DropPartialOutcome, MergeRestore};

/// The value is stored as [`SharedReference`] rather than
/// [`TypedSharedReference`] because the `CellId` key already carries the
/// [`ValueTypeId`] — duplicating it in each map entry would waste memory.
/// Encode / decode recover the value type from the key.
/// Default inline size is 1 because this optimizes storage layout and a non-trivial number of tasks
/// have <=1 cells
type InnerMap = AutoMap<CellId, SharedReference, BuildHasherDefault<FxHasher>, 1>;

/// Map of cell id → shared reference, with bincode that filters out entries
/// whose value type has no bincode function.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CellData(InnerMap);

impl CellData {
    #[cfg(test)]
    pub fn new() -> Self {
        Self::default()
    }
}

impl MergeRestore for CellData {
    type Item = (CellId, SharedReference);
    fn merge_restore(&mut self, items: impl IntoIterator<Item = Self::Item>) {
        for (k, v) in items {
            match self.entry(k) {
                Entry::Vacant(e) => {
                    e.insert(v);
                }
                Entry::Occupied(_e) => {
                    // Residue exists for this CellId. Keep it; the in-memory
                    // value is more authoritative than the decoded one.
                    debug_assert!(
                        !matches!(
                            registry::get_value_type(k.type_id()).evictability,
                            Evictability::Always,
                        ),
                        "Found an evictable cell in a task we are restoring into: {}",
                        registry::get_value_type(k.type_id()).ty.name,
                    );
                }
            }
        }
    }
}

impl DropPartial for CellData {
    /// Drop cells whose value type is freely evictable, retain those that
    /// are not. Called by the macro-generated `TaskStorage::drop_partial`
    /// on the data-eviction path.
    ///
    /// Dropped (`Evictability::Always`): persistable cells (restored from
    /// disk on next access), skip cells (re-derived by re-running the task),
    /// and hash-only cells (re-derived; hash gates spurious invalidation).
    ///
    /// Retained:
    /// - `Evictability::Expensive` — re-derivation is non-trivial, prefer keeping in memory.
    /// - `Evictability::Never` — value type holds session-scoped state that must not leave memory
    ///   (`State<>` cells, file watchers, worker pools).
    fn drop_partial(&mut self) -> DropPartialOutcome {
        self.0.retain(|cell_id, _| {
            match registry::get_value_type(cell_id.type_id()).evictability {
                Evictability::Always => false,
                Evictability::Expensive | Evictability::Never => true,
            }
        });
        if self.0.is_empty() {
            return DropPartialOutcome::Empty;
        }
        self.shrink_to_fit();
        DropPartialOutcome::HasResidue
    }
}

impl IntoIterator for CellData {
    type Item = (CellId, SharedReference);
    type IntoIter = <InnerMap as IntoIterator>::IntoIter;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl Deref for CellData {
    type Target = InnerMap;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for CellData {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl ShrinkToFit for CellData {
    fn shrink_to_fit(&mut self) {
        self.0.shrink_to_fit();
    }
}

impl TurboBincodeEncode for CellData {
    /// Writes `count-of-persistable-entries` followed by each persistable
    /// `(CellId, encoded-value)`. Entries whose value type is `Skip` or
    /// `HashOnly` (no bincode codec) are skipped; they will be reconstructed
    /// on the next task execution after restore.
    fn encode(&self, encoder: &mut TurboBincodeEncoder) -> Result<(), EncodeError> {
        // First pass: count persistable entries. One extra O(N) iteration over
        // the registry — cold path (snapshot time only) and the registry is a
        // static array indexed by ValueTypeId, so each lookup is cheap.
        let count = self
            .0
            .iter()
            .filter(|(cell, _)| {
                matches!(
                    registry::get_value_type(cell.type_id()).persistence,
                    ValueTypePersistence::Persistable(_, _),
                )
            })
            .count();
        count.encode(encoder)?;
        // TODO: consider sorting by type_id and delta encoding indices to reduce serialized size
        for (cell_id, reference) in self.0.iter() {
            let value_type = registry::get_value_type(cell_id.type_id());
            let ValueTypePersistence::Persistable(encode_fn, _) = value_type.persistence else {
                continue;
            };
            cell_id.encode(encoder)?;
            encode_fn(&*reference.0, encoder)?;
        }
        Ok(())
    }
}

impl<Context> TurboBincodeDecode<Context> for CellData {
    /// Reads the count written by [`CellData::encode`] and decodes each
    /// `(CellId, SharedReference)` entry by looking up the value type's
    /// bincode decode function.
    ///
    /// Missing cell types — or cells whose value type isn't `Persistable` —
    /// are a decode error: the encoder filters them out, so they should not
    /// appear on the wire.
    fn decode(decoder: &mut TurboBincodeDecoder) -> Result<Self, DecodeError> {
        let count = usize::decode(decoder)?;
        let mut map = InnerMap::with_capacity_and_hasher(count, BuildHasherDefault::default());
        for _ in 0..count {
            let cell = CellId::decode(decoder)?;
            let value_type = registry::get_value_type(cell.type_id());
            let ValueTypePersistence::Persistable(_, decode_fn) = value_type.persistence else {
                return Err(DecodeError::OtherString(format!(
                    "cell of type {} has no bincode decoder",
                    value_type.ty.global_name
                )));
            };
            let reference = decode_fn(decoder)?;
            map.insert(cell, reference);
        }
        Ok(Self(map))
    }
}

impl_encode_for_turbo_bincode_encode!(CellData);
impl_decode_for_turbo_bincode_decode!(CellData);

#[cfg(test)]
mod tests {
    //! `drop_partial` must partition cells by their `Evictability` — keep
    //! the non-evictable ones, drop the rest. Tests below cover every
    //! `(persistence, evictability)` combination the macro currently emits,
    //! including the `Persistable + Never` combo (e.g. `DiskFileSystem`).
    use turbo_tasks::{self as turbo_tasks, VcValueType};

    use super::*;

    #[turbo_tasks::value]
    struct PersistableV(#[allow(dead_code)] u32);

    #[turbo_tasks::value(evict = "never")]
    struct PersistableNeverV(#[allow(dead_code)] u32);

    #[turbo_tasks::value(serialization = "skip")]
    struct SkipCheapV(
        #[turbo_tasks(trace_ignore)]
        #[allow(dead_code)]
        u32,
    );

    #[turbo_tasks::value(serialization = "skip", evict = "last")]
    struct SkipExpensiveV(
        #[turbo_tasks(trace_ignore)]
        #[allow(dead_code)]
        u32,
    );

    #[turbo_tasks::value(serialization = "skip", evict = "never", cell = "new", eq = "manual")]
    struct SessionStatefulV;

    #[turbo_tasks::value(serialization = "hash")]
    struct HashOnlyV(#[allow(dead_code)] u32);

    fn cell_of<V: VcValueType>(index: u32) -> CellId {
        CellId::new(V::get_value_type_id(), index)
    }

    fn dummy_ref() -> SharedReference {
        // The drop_partial logic only inspects the key's type_id, not the
        // value, so any Any + Send + Sync works.
        SharedReference::new(triomphe::Arc::new(0u32))
    }

    #[test]
    fn drop_partial_partitions_by_evictability() {
        let mut data = CellData::new();
        data.insert(cell_of::<PersistableV>(0), dummy_ref());
        data.insert(cell_of::<PersistableNeverV>(0), dummy_ref());
        data.insert(cell_of::<SkipCheapV>(0), dummy_ref());
        data.insert(cell_of::<SkipExpensiveV>(0), dummy_ref());
        data.insert(cell_of::<SessionStatefulV>(0), dummy_ref());
        data.insert(cell_of::<HashOnlyV>(0), dummy_ref());

        assert_eq!(data.drop_partial(), DropPartialOutcome::HasResidue);
        assert_eq!(data.len(), 3);
        assert!(data.contains_key(&cell_of::<PersistableNeverV>(0)));
        assert!(data.contains_key(&cell_of::<SkipExpensiveV>(0)));
        assert!(data.contains_key(&cell_of::<SessionStatefulV>(0)));
        assert!(!data.contains_key(&cell_of::<PersistableV>(0)));
        assert!(!data.contains_key(&cell_of::<SkipCheapV>(0)));
        assert!(!data.contains_key(&cell_of::<HashOnlyV>(0)));
    }

    #[test]
    fn drop_partial_fully_empties_when_all_evictable() {
        let mut data = CellData::new();
        data.insert(cell_of::<PersistableV>(0), dummy_ref());
        data.insert(cell_of::<SkipCheapV>(0), dummy_ref());
        data.insert(cell_of::<HashOnlyV>(0), dummy_ref());

        assert_eq!(data.drop_partial(), DropPartialOutcome::Empty);
        assert!(data.is_empty());
    }

    #[test]
    fn drop_partial_keeps_everything_when_all_non_evictable() {
        let mut data = CellData::new();
        data.insert(cell_of::<PersistableNeverV>(0), dummy_ref());
        data.insert(cell_of::<SkipExpensiveV>(0), dummy_ref());
        data.insert(cell_of::<SessionStatefulV>(0), dummy_ref());

        assert_eq!(data.drop_partial(), DropPartialOutcome::HasResidue);
        assert_eq!(data.len(), 3);
    }

    #[test]
    fn drop_partial_on_empty_returns_empty() {
        let mut data = CellData::new();
        assert_eq!(data.drop_partial(), DropPartialOutcome::Empty);
    }
}
