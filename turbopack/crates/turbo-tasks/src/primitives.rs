use std::{
    hash::{BuildHasher, Hash},
    ops::{Deref, DerefMut},
    time::Duration,
};

use anyhow::Result;
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use rustc_hash::FxBuildHasher;
use turbo_rcstr::RcStr;
use turbo_tasks_macros::{TraceRawVcs, primitive as __turbo_tasks_internal_primitive};

use crate::{
    self as turbo_tasks, FxIndexSet, NonLocalValue, TaskInput, Vc,
    value_type::{ManualDecodeWrapper, ManualEncodeWrapper},
};

__turbo_tasks_internal_primitive!(());
__turbo_tasks_internal_primitive!(String);
__turbo_tasks_internal_primitive!(RcStr);
__turbo_tasks_internal_primitive!(Option<String>);
__turbo_tasks_internal_primitive!(Option<RcStr>);
__turbo_tasks_internal_primitive!(Vec<RcStr>);
__turbo_tasks_internal_primitive!(Option<u16>);
__turbo_tasks_internal_primitive!(Option<u64>);
__turbo_tasks_internal_primitive!(bool);
__turbo_tasks_internal_primitive!(Option<bool>);
__turbo_tasks_internal_primitive!(u8);
__turbo_tasks_internal_primitive!(u16);
__turbo_tasks_internal_primitive!(u32);
__turbo_tasks_internal_primitive!(u64);
__turbo_tasks_internal_primitive!(u128);
__turbo_tasks_internal_primitive!(i8);
__turbo_tasks_internal_primitive!(i16);
__turbo_tasks_internal_primitive!(i32);
__turbo_tasks_internal_primitive!(i64);
__turbo_tasks_internal_primitive!(i128);
__turbo_tasks_internal_primitive!(usize);
__turbo_tasks_internal_primitive!(isize);
__turbo_tasks_internal_primitive!(
    serde_json::Value,
    bincode_wrappers(JsonValueEncodeWrapper, JsonValueDecodeWrapper),
);
__turbo_tasks_internal_primitive!(Duration);
__turbo_tasks_internal_primitive!(Vec<u8>);
__turbo_tasks_internal_primitive!(Vec<bool>);

struct JsonValueEncodeWrapper<'a>(&'a serde_json::Value);

impl ManualEncodeWrapper for JsonValueEncodeWrapper<'_> {
    type Value = serde_json::Value;

    fn new<'a>(value: &'a Self::Value) -> impl Encode + 'a {
        JsonValueEncodeWrapper(value)
    }
}

impl Encode for JsonValueEncodeWrapper<'_> {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        turbo_bincode::serde_self_describing::encode(self.0, encoder)
    }
}

struct JsonValueDecodeWrapper(serde_json::Value);

impl ManualDecodeWrapper for JsonValueDecodeWrapper {
    type Value = serde_json::Value;

    fn inner(self) -> Self::Value {
        self.0
    }
}

impl<Context> Decode<Context> for JsonValueDecodeWrapper {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self(turbo_bincode::serde_self_describing::decode(decoder)?))
    }
}

/// An IndexSet with a Hash implementation that is order-independent (and just like IndexSet,
/// equality is also order-independent).
#[derive(Clone, Debug, PartialEq, Eq, Decode, Encode, TraceRawVcs)]

pub struct HashableIndexSet<T: Hash + Eq + Decode<()> + Encode>(
    #[bincode(with = "turbo_bincode::indexset")] pub FxIndexSet<T>,
);

impl<T: Hash + Eq + Decode<()> + Encode> From<FxIndexSet<T>> for HashableIndexSet<T> {
    fn from(set: FxIndexSet<T>) -> Self {
        HashableIndexSet(set)
    }
}

impl<T: Hash + Eq + Decode<()> + Encode> FromIterator<T> for HashableIndexSet<T> {
    fn from_iter<I: IntoIterator<Item = T>>(iter: I) -> Self {
        HashableIndexSet(iter.into_iter().collect())
    }
}

impl<T: Hash + Eq + Decode<()> + Encode> Deref for HashableIndexSet<T> {
    type Target = FxIndexSet<T>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl<T: Hash + Eq + Decode<()> + Encode> DerefMut for HashableIndexSet<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl<T: Hash + Eq + Decode<()> + Encode> Hash for HashableIndexSet<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        let mut result = 0u64;
        for item in self.iter() {
            let item_hash = FxBuildHasher.hash_one(item);
            result ^= item_hash;
        }
        state.write_u64(result);
    }
}

impl<T> TaskInput for HashableIndexSet<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        self.iter().all(TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.iter().any(TaskInput::is_transient)
    }

    async fn resolve_input(&self) -> Result<Self> {
        let mut resolved = FxIndexSet::with_capacity_and_hasher(self.len(), Default::default());
        for value in self.iter() {
            resolved.insert(value.resolve_input().await?);
        }
        Ok(HashableIndexSet(resolved))
    }
}

unsafe impl<T: NonLocalValue + Hash + Eq + Decode<()> + Encode> NonLocalValue
    for HashableIndexSet<T>
{
}
