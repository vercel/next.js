use std::{cell::RefCell, hash::BuildHasherDefault};

use indexmap::IndexSet;
use rustc_hash::FxHasher;
use scoped_tls::scoped_thread_local;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::RcStr;

scoped_thread_local!(
    /// Map of strings to their interned ids.
    ///
    /// This is used to serialize strings to their interned ids.
    static SER_MAP: RefCell<IndexSet<RcStr, BuildHasherDefault<FxHasher>>>
);

scoped_thread_local!(
    /// Read-only map of strings to their interned ids
    static DE_MAP: Vec<RcStr>
);

pub fn set_ser_map<F, R>(f: F) -> (R, IndexSet<RcStr, BuildHasherDefault<FxHasher>>)
where
    F: FnOnce() -> R,
{
    let map = Default::default();

    let r = { SER_MAP.set(&map, f) };

    (r, map.into_inner())
}

pub fn set_de_map<F, R>(map: &Vec<RcStr>, f: F) -> R
where
    F: FnOnce() -> R,
{
    DE_MAP.set(map, f)
}

/// Intern a string for serialization.
///
/// This function exists to move the logic for accessing the SER_MAP out of the hot path of
/// `Serialize::serialize`.
#[inline(never)]
fn intern_for_serialize(str: &RcStr) -> Option<u32> {
    if !SER_MAP.is_set() {
        return None;
    }

    Some(SER_MAP.with(|ser| {
        let mut borrow = ser.borrow_mut();
        if let Some(id) = borrow.get_index_of(str) {
            id as u32
        } else {
            let id = borrow.len();
            borrow.insert(str.clone());
            id as u32
        }
    }))
}

impl Serialize for RcStr {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if self.len() >= 3 && self.len() < 512 {
            let id = intern_for_serialize(self);
            if let Some(id) = id {
                return serializer.serialize_u32(id);
            }
        }

        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for RcStr {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Repr {
            String(String),
            Id(u32),
        }

        let repr = Repr::deserialize(deserializer)?;

        match repr {
            Repr::String(s) => Ok(RcStr::from(s)),
            Repr::Id(id) => DE_MAP.with(|map| {
                let s = map
                    .get(id as usize)
                    .ok_or_else(|| D::Error::custom(format!("failed to find id: {}", id)))?;
                Ok(s.clone())
            }),
        }
    }
}
