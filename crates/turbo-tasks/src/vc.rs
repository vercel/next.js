use std::{any::Any, fmt::Debug, future::IntoFuture, hash::Hash, marker::PhantomData};

use anyhow::Result;
use lazy_static::lazy_static;

use crate::{
    id::ValueTypeId,
    manager::{find_slot_by_key, find_slot_by_type},
    registry,
    trace::{TraceRawVcs, TraceRawVcsContext},
    FromTaskInput, RawVc, RawVcReadResult, ReadRawVcFuture, TaskInput, Typed, TypedForInput,
    ValueType,
};

#[derive(PartialEq, Eq, Clone)]
pub struct Vc<T: Any + TraceRawVcs + Send + Sync> {
    raw: RawVc,
    phantom_data: PhantomData<T>,
}

lazy_static! {
    pub(crate) static ref VALUE_TYPE: ValueType = ValueType::new::<Vc<()>>();
    static ref VALUE_TYPE_ID: ValueTypeId = registry::get_value_type_id(&VALUE_TYPE);
}

impl<T: Any + TraceRawVcs + Send + Sync> Vc<T> {
    /// Resolve the reference until it points to a slot directly.
    ///
    /// This is async and will rethrow any fatal error that happened during task
    /// execution.
    pub async fn resolve(self) -> Result<Self> {
        Ok(Self {
            raw: self.raw.resolve().await?,
            phantom_data: PhantomData,
        })
    }
}

impl<T: Any + PartialEq + Eq + TraceRawVcs + Send + Sync> Vc<T> {
    /// Places a value in a slot of the current task.
    /// If there is already a value in the slot it only overrides the value when
    /// it's not equal to the provided value. (Requires `Eq` trait to be
    /// implemented on the type.)
    ///
    /// Slot is selected based on the value type and call order of `slot`.
    pub fn slot(content: T) -> Self {
        let slot = find_slot_by_type(*VALUE_TYPE_ID);
        slot.compare_and_update_shared(content);
        Self {
            raw: slot.into(),
            phantom_data: PhantomData,
        }
    }
}

impl<T: Hash + PartialEq + Eq + TraceRawVcs + Send + Sync + 'static> Vc<T> {
    /// Places a value in a slot of the current task.
    /// If there is already a value in the slot it only overrides the value when
    /// it's not equal to the provided value. (Requires `Eq` trait to be
    /// implemented on the type.)
    ///
    /// Slot is selected by the provided `key`. `key` must not be used twice
    /// during the current task.
    pub fn keyed_slot<
        K: Debug + Eq + Ord + Hash + Typed + TypedForInput + Send + Sync + 'static,
    >(
        key: K,
        content: T,
    ) -> Self {
        let slot = find_slot_by_key(*VALUE_TYPE_ID, key);
        slot.compare_and_update_shared(content);
        Self {
            raw: slot.into(),
            phantom_data: PhantomData,
        }
    }
}

impl<T: Any + TraceRawVcs + Send + Sync> Vc<T> {
    /// Places a value in a slot of the current task.
    /// If there is already a value in the slot it only overrides the value when
    /// it's not equal to the provided value. (Requires `Eq` trait to be
    /// implemented on the type.)
    ///
    /// Slot is selected based on the value type and call order of `slot`.
    pub fn slot_new(content: T) -> Self {
        let slot = find_slot_by_type(*VALUE_TYPE_ID);
        slot.update_shared(content);
        Self {
            raw: slot.into(),
            phantom_data: PhantomData,
        }
    }
}

impl<T: Any + Default + PartialEq + Eq + TraceRawVcs + Send + Sync> Vc<T> {
    pub fn default() -> Self {
        let slot = find_slot_by_type(*VALUE_TYPE_ID);
        slot.compare_and_update_shared(T::default());
        Self {
            raw: slot.into(),
            phantom_data: PhantomData,
        }
    }
}

impl<T: Any + TraceRawVcs + Send + Sync> From<RawVc> for Vc<T> {
    fn from(node: RawVc) -> Self {
        Self {
            raw: node,
            phantom_data: PhantomData,
        }
    }
}

impl<T: Any + TraceRawVcs + Send + Sync> From<Vc<T>> for RawVc {
    fn from(vc: Vc<T>) -> Self {
        vc.raw
    }
}

impl<T: Any + TraceRawVcs + Send + Sync> From<Vc<T>> for TaskInput {
    fn from(vc: Vc<T>) -> Self {
        vc.raw.into()
    }
}

impl<T: Any + TraceRawVcs + Send + Sync> FromTaskInput<'_> for Vc<T> {
    type Error = anyhow::Error;

    fn try_from(value: &TaskInput) -> Result<Self, Self::Error> {
        Ok(Self {
            raw: value.try_into()?,
            phantom_data: PhantomData,
        })
    }
}

impl<T: Any + TraceRawVcs + Send + Sync> TraceRawVcs for Vc<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.raw, context);
    }
}

impl<T: Any + TraceRawVcs + Send + Sync> IntoFuture for Vc<T> {
    type Output = Result<RawVcReadResult<T>>;

    type IntoFuture = ReadRawVcFuture<T>;

    fn into_future(self) -> Self::IntoFuture {
        self.raw.into_read::<T>()
    }
}
