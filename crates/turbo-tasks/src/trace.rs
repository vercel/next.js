use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    sync::{atomic::*, Arc},
    time::Duration,
};

use crate::SlotVc;

pub struct TraceSlotVcsContext {
    list: Vec<SlotVc>,
}

impl TraceSlotVcsContext {
    pub(crate) fn new() -> Self {
        Self { list: Vec::new() }
    }

    pub(crate) fn into_vec(self) -> Vec<SlotVc> {
        self.list
    }
}

/// Trait that allows to walk data to find all [SlotVc]s contained.
///
/// This is important for Garbagge Collection to mark all Slots and
/// therefore Tasks that are still in use.
///
/// It can also be used to optimize transferring of Tasks, where knowning
/// the referenced Slots/Tasks allows pushing them earlier.
///
/// `#[derive(TraceSlotVcs)]` is available.
/// `#[trace_ignore]` can be used on fields to skip tracing for them.
pub trait TraceSlotVcs {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext);
    fn get_node_refs(&self) -> Vec<SlotVc> {
        let mut context = TraceSlotVcsContext::new();
        self.trace_node_refs(&mut context);
        context.into_vec()
    }
}

macro_rules! ignore {
  ($ty:ty) => {
    impl TraceSlotVcs for $ty {
      fn trace_node_refs(&self, _context: &mut TraceSlotVcsContext) {}
    }
  };

  ($ty:ty, $($tys:ty),+) => {
    ignore!($ty);
    ignore!($($tys),+);
  }
}

ignore!(i8, u8, i16, u16, i32, u32, i64, u64, char, bool, usize);
ignore!(
    AtomicI8,
    AtomicU8,
    AtomicI16,
    AtomicU16,
    AtomicI32,
    AtomicU32,
    AtomicI64,
    AtomicU64,
    AtomicBool,
    AtomicUsize
);
ignore!(String, Duration);

impl<A: TraceSlotVcs> TraceSlotVcs for (A,) {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        TraceSlotVcs::trace_node_refs(&self.0, context);
    }
}

impl<A: TraceSlotVcs, B: TraceSlotVcs> TraceSlotVcs for (A, B) {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        TraceSlotVcs::trace_node_refs(&self.0, context);
        TraceSlotVcs::trace_node_refs(&self.1, context);
    }
}

impl<A: TraceSlotVcs, B: TraceSlotVcs, C: TraceSlotVcs> TraceSlotVcs for (A, B, C) {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        TraceSlotVcs::trace_node_refs(&self.0, context);
        TraceSlotVcs::trace_node_refs(&self.1, context);
        TraceSlotVcs::trace_node_refs(&self.2, context);
    }
}

impl<T: TraceSlotVcs> TraceSlotVcs for Option<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        if let Some(item) = self {
            TraceSlotVcs::trace_node_refs(item, context);
        }
    }
}

impl<T: TraceSlotVcs> TraceSlotVcs for Vec<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        for item in self.iter() {
            TraceSlotVcs::trace_node_refs(item, context);
        }
    }
}

impl<T: TraceSlotVcs> TraceSlotVcs for HashSet<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        for item in self.iter() {
            TraceSlotVcs::trace_node_refs(item, context);
        }
    }
}

impl<T: TraceSlotVcs> TraceSlotVcs for BTreeSet<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        for item in self.iter() {
            TraceSlotVcs::trace_node_refs(item, context);
        }
    }
}

impl<K: TraceSlotVcs, V: TraceSlotVcs> TraceSlotVcs for HashMap<K, V> {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        for (key, value) in self.iter() {
            TraceSlotVcs::trace_node_refs(key, context);
            TraceSlotVcs::trace_node_refs(value, context);
        }
    }
}

impl<K: TraceSlotVcs, V: TraceSlotVcs> TraceSlotVcs for BTreeMap<K, V> {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        for (key, value) in self.iter() {
            TraceSlotVcs::trace_node_refs(key, context);
            TraceSlotVcs::trace_node_refs(value, context);
        }
    }
}

impl<T: TraceSlotVcs + ?Sized> TraceSlotVcs for Box<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        TraceSlotVcs::trace_node_refs(&**self, context);
    }
}

impl<T: TraceSlotVcs + ?Sized> TraceSlotVcs for Arc<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        TraceSlotVcs::trace_node_refs(&**self, context);
    }
}

impl TraceSlotVcs for SlotVc {
    fn trace_node_refs(&self, context: &mut TraceSlotVcsContext) {
        context.list.push(self.clone());
    }
}

pub use turbo_tasks_macros::TraceSlotVcs;
