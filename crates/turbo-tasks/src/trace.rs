use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    sync::{atomic::*, Arc},
    time::Duration,
};

use crate::SlotRef;

pub struct TraceSlotRefsContext {
    list: Vec<SlotRef>,
}

impl TraceSlotRefsContext {
    pub(crate) fn new() -> Self {
        Self { list: Vec::new() }
    }

    pub(crate) fn into_vec(self) -> Vec<SlotRef> {
        self.list
    }
}

/// Trait that allows to walk data to find all [SlotRef]s contained.
///
/// This is important for Garbagge Collection to mark all Slots and
/// therefore Tasks that are still in use.
///
/// It can also be used to optimize transferring of Tasks, where knowning
/// the referenced Slots/Tasks allows pushing them earlier.
///
/// `#[derive(TraceSlotRefs)]` is available.
/// `#[trace_ignore]` can be used on fields to skip tracing for them.
pub trait TraceSlotRefs {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext);
    fn get_node_refs(&self) -> Vec<SlotRef> {
        let mut context = TraceSlotRefsContext::new();
        self.trace_node_refs(&mut context);
        context.into_vec()
    }
}

macro_rules! ignore {
  ($ty:ty) => {
    impl TraceSlotRefs for $ty {
      fn trace_node_refs(&self, _context: &mut TraceSlotRefsContext) {}
    }
  };

  ($ty:ty, $($tys:ty),+) => {
    ignore!($ty);
    ignore!($($tys),+);
  }
}

ignore!(i8, u8, i16, u16, i32, u32, i64, u64, bool, usize);
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

impl<A: TraceSlotRefs> TraceSlotRefs for (A,) {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        TraceSlotRefs::trace_node_refs(&self.0, context);
    }
}

impl<A: TraceSlotRefs, B: TraceSlotRefs> TraceSlotRefs for (A, B) {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        TraceSlotRefs::trace_node_refs(&self.0, context);
        TraceSlotRefs::trace_node_refs(&self.1, context);
    }
}

impl<A: TraceSlotRefs, B: TraceSlotRefs, C: TraceSlotRefs> TraceSlotRefs for (A, B, C) {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        TraceSlotRefs::trace_node_refs(&self.0, context);
        TraceSlotRefs::trace_node_refs(&self.1, context);
        TraceSlotRefs::trace_node_refs(&self.2, context);
    }
}

impl<T: TraceSlotRefs> TraceSlotRefs for Option<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        if let Some(item) = self {
            TraceSlotRefs::trace_node_refs(item, context);
        }
    }
}

impl<T: TraceSlotRefs> TraceSlotRefs for Vec<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        for item in self.iter() {
            TraceSlotRefs::trace_node_refs(item, context);
        }
    }
}

impl<T: TraceSlotRefs> TraceSlotRefs for HashSet<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        for item in self.iter() {
            TraceSlotRefs::trace_node_refs(item, context);
        }
    }
}

impl<T: TraceSlotRefs> TraceSlotRefs for BTreeSet<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        for item in self.iter() {
            TraceSlotRefs::trace_node_refs(item, context);
        }
    }
}

impl<K: TraceSlotRefs, V: TraceSlotRefs> TraceSlotRefs for HashMap<K, V> {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        for (key, value) in self.iter() {
            TraceSlotRefs::trace_node_refs(key, context);
            TraceSlotRefs::trace_node_refs(value, context);
        }
    }
}

impl<K: TraceSlotRefs, V: TraceSlotRefs> TraceSlotRefs for BTreeMap<K, V> {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        for (key, value) in self.iter() {
            TraceSlotRefs::trace_node_refs(key, context);
            TraceSlotRefs::trace_node_refs(value, context);
        }
    }
}

impl<T: TraceSlotRefs + ?Sized> TraceSlotRefs for Box<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        TraceSlotRefs::trace_node_refs(&**self, context);
    }
}

impl<T: TraceSlotRefs + ?Sized> TraceSlotRefs for Arc<T> {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        TraceSlotRefs::trace_node_refs(&**self, context);
    }
}

impl TraceSlotRefs for SlotRef {
    fn trace_node_refs(&self, context: &mut TraceSlotRefsContext) {
        context.list.push(self.clone());
    }
}

pub use turbo_tasks_macros::TraceSlotRefs;
