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
