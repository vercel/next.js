//! Unified cell storage.
//!
//! Every task cell — whether its value type is bincode-serializable, hash-only,
//! derivable, or non-reconstructible — lives in a single `CellData` map keyed
//! by [`CellId`]. The map's bincode impl decides at encode time which entries
//! to persist, by consulting the global [`ValueType`] registry: entries whose
//! value type has no bincode function are omitted from the serialized output.
//!
//! This replaces the older split of `persistent_cell_data` /
//! `transient_cell_data` fields which routed every cell write through an
//! `is_serializable_cell_content: bool` that threaded through ~14 call sites.
//! By keying the bincode decision on the value type itself, the routing
//! collapses to an unconditional insert.
//!
//! The inner value is stored as [`SharedReference`] rather than
//! [`TypedSharedReference`] because the `CellId` key already carries the
//! [`ValueTypeId`] — duplicating it in each map entry would waste memory.
//! Encode / decode recover the value type from the key.

use std::{
    hash::BuildHasherDefault,
    ops::{Deref, DerefMut},
};

use auto_hash_map::AutoMap;
use bincode::{
    Decode, Encode,
    error::{DecodeError, EncodeError},
};
use rustc_hash::FxHasher;
use turbo_bincode::{
    TurboBincodeDecode, TurboBincodeDecoder, TurboBincodeEncode, TurboBincodeEncoder,
    impl_decode_for_turbo_bincode_decode, impl_encode_for_turbo_bincode_encode,
};
use turbo_tasks::{CellId, SharedReference, ShrinkToFit, ValueTypePersistence, registry};

type InnerMap = AutoMap<CellId, SharedReference, BuildHasherDefault<FxHasher>, 1>;

/// Map of cell id → shared reference, with bincode that filters out entries
/// whose value type has no bincode function.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CellData(InnerMap);

impl CellData {
    pub fn new() -> Self {
        Self::default()
    }

    /// Drop cells that can be cheaply reconstructed on next access, retain
    /// those that cannot. Called by the macro-generated `TaskStorage::drop_partial`
    /// on the data-eviction path.
    ///
    /// Dropped:
    /// - `Persistable` — restored from disk.
    /// - `SkipPersist { expensive: false }` — cheap to re-derive by re-running the task.
    /// - `HashOnly` — the hash lives in `cell_data_hash`; value is re-derived.
    ///
    /// Retained:
    /// - `SkipPersist { expensive: true }` — expensive to re-derive.
    /// - `SessionStateful` — would lose accumulated state if dropped.
    ///
    /// Returns `true` if entries remain, so the caller can drop the whole
    /// `LazyField::CellData` variant when empty.
    pub fn drop_partial(&mut self) -> bool {
        let len_start = self.len();
        self.0.retain(
            |cell_id, _| match registry::get_value_type(cell_id.type_id).persistence {
                ValueTypePersistence::Persistable(_, _)
                | ValueTypePersistence::SkipPersist { expensive: false }
                | ValueTypePersistence::HashOnly => {
                    // these are either persisted or determined to not be worth persisting because
                    // they are cheap to re-derive
                    false
                }
                ValueTypePersistence::SkipPersist { expensive: true }
                | ValueTypePersistence::SessionStateful => {
                    // These are either impossible to derive or expensive so we retain.
                    true
                }
            },
        );
        if self.0.is_empty() {
            return false;
        }
        if self.len() < len_start {
            self.shrink_to_fit();
        }
        true
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
    /// `(CellId, encoded-value)`. Entries whose value type is `SkipPersist`
    /// or `SessionStateful` (no bincode) are skipped; they will be
    /// reconstructed on the next task execution after restore.
    fn encode(&self, encoder: &mut TurboBincodeEncoder) -> Result<(), EncodeError> {
        // First pass: count persistable entries. One extra O(N) iteration over
        // the registry — cold path (snapshot time only) and the registry is a
        // static array indexed by ValueTypeId, so each lookup is cheap.
        let count = self
            .0
            .iter()
            .filter(|(cell, _)| {
                matches!(
                    registry::get_value_type(cell.type_id).persistence,
                    ValueTypePersistence::Persistable(_, _),
                )
            })
            .count();
        count.encode(encoder)?;
        // TODO: consider sorting by type_id and delta encoding indices to reduce serialized size
        for (cell_id, reference) in self.0.iter() {
            let value_type = registry::get_value_type(cell_id.type_id);
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
            let value_type = registry::get_value_type(cell.type_id);
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
    //! `drop_partial` must partition cells by their `ValueTypePersistence` —
    //! keep the non-recoverable ones, drop the rest. Tests below declare one
    //! value type per persistence variant and exercise every partition.
    use turbo_tasks::{self as turbo_tasks, VcValueType};

    use super::*;

    #[turbo_tasks::value]
    struct PersistableV(#[allow(dead_code)] u32);

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
        CellId {
            type_id: V::get_value_type_id(),
            index,
        }
    }

    fn dummy_ref() -> SharedReference {
        // The drop_partial logic only inspects the key's type_id, not the
        // value, so any Any + Send + Sync works.
        SharedReference::new(triomphe::Arc::new(0u32))
    }

    #[test]
    fn drop_partial_partitions_by_persistence() {
        let mut data = CellData::new();
        data.insert(cell_of::<PersistableV>(0), dummy_ref());
        data.insert(cell_of::<SkipCheapV>(0), dummy_ref());
        data.insert(cell_of::<SkipExpensiveV>(0), dummy_ref());
        data.insert(cell_of::<SessionStatefulV>(0), dummy_ref());
        data.insert(cell_of::<HashOnlyV>(0), dummy_ref());

        let still_has_entries = data.drop_partial();

        assert!(still_has_entries, "two non-recoverable entries remain");
        assert_eq!(data.len(), 2);
        assert!(data.contains_key(&cell_of::<SkipExpensiveV>(0)));
        assert!(data.contains_key(&cell_of::<SessionStatefulV>(0)));
        assert!(!data.contains_key(&cell_of::<PersistableV>(0)));
        assert!(!data.contains_key(&cell_of::<SkipCheapV>(0)));
        assert!(!data.contains_key(&cell_of::<HashOnlyV>(0)));
    }

    #[test]
    fn drop_partial_fully_empties_when_all_recoverable() {
        let mut data = CellData::new();
        data.insert(cell_of::<PersistableV>(0), dummy_ref());
        data.insert(cell_of::<SkipCheapV>(0), dummy_ref());
        data.insert(cell_of::<HashOnlyV>(0), dummy_ref());

        let still_has_entries = data.drop_partial();

        assert!(!still_has_entries);
        assert!(data.is_empty());
    }

    #[test]
    fn drop_partial_keeps_everything_when_all_non_recoverable() {
        let mut data = CellData::new();
        data.insert(cell_of::<SkipExpensiveV>(0), dummy_ref());
        data.insert(cell_of::<SessionStatefulV>(0), dummy_ref());

        let still_has_entries = data.drop_partial();

        assert!(still_has_entries);
        assert_eq!(data.len(), 2);
    }

    #[test]
    fn drop_partial_on_empty_returns_false() {
        let mut data = CellData::new();
        assert!(!data.drop_partial());
    }
}
