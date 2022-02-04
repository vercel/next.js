use std::{
    collections::HashMap,
    sync::{atomic::*, Arc, Mutex, MutexGuard},
    time::Duration,
};

use crate::{NodeRef, WeakNodeRef};

pub struct TraceNodeRefsContext {
    list: Vec<WeakNodeRef>,
}

impl TraceNodeRefsContext {
    pub(crate) fn new() -> Self {
        Self { list: Vec::new() }
    }

    pub(crate) fn into_vec(self) -> Vec<WeakNodeRef> {
        self.list
    }
}

pub trait TraceNodeRefs {
    fn trace_node_refs(&self, context: &mut TraceNodeRefsContext);
    fn get_node_refs(&self) -> Vec<WeakNodeRef> {
        let mut context = TraceNodeRefsContext::new();
        self.trace_node_refs(&mut context);
        context.into_vec()
    }
}

macro_rules! ignore {
  ($ty:ty) => {
    impl TraceNodeRefs for $ty {
      fn trace_node_refs(&self, _context: &mut TraceNodeRefsContext) {}
    }
  };

  ($ty:ty, $($tys:ty),+) => {
    ignore!($ty);
    ignore!($($tys),+);
  }
}

ignore!(i8, u8, i16, u16, i32, u32, i64, u64);
ignore!(AtomicI8, AtomicU8, AtomicI16, AtomicU16, AtomicI32, AtomicU32, AtomicI64, AtomicU64);
ignore!(String, Duration);

impl<K: TraceNodeRefs, V: TraceNodeRefs> TraceNodeRefs for HashMap<K, V> {
    fn trace_node_refs(&self, context: &mut TraceNodeRefsContext) {
        for (key, val) in self.iter() {
            TraceNodeRefs::trace_node_refs(key, context);
            TraceNodeRefs::trace_node_refs(val, context)
        }
    }
}

impl<T: TraceNodeRefs> TraceNodeRefs for Vec<T> {
    fn trace_node_refs(&self, context: &mut TraceNodeRefsContext) {
        for item in self.iter() {
            TraceNodeRefs::trace_node_refs(item, context);
        }
    }
}

impl<T: TraceNodeRefs + ?Sized> TraceNodeRefs for Box<T> {
    fn trace_node_refs(&self, context: &mut TraceNodeRefsContext) {
        TraceNodeRefs::trace_node_refs(&**self, context);
    }
}

impl<T: TraceNodeRefs + ?Sized> TraceNodeRefs for Arc<T> {
    fn trace_node_refs(&self, context: &mut TraceNodeRefsContext) {
        TraceNodeRefs::trace_node_refs(&**self, context);
    }
}

impl TraceNodeRefs for NodeRef {
    fn trace_node_refs(&self, context: &mut TraceNodeRefsContext) {
        context.list.push(self.downgrade())
    }
}

impl TraceNodeRefs for WeakNodeRef {
    fn trace_node_refs(&self, context: &mut TraceNodeRefsContext) {
        context.list.push(self.clone())
    }
}

pub use turbo_tasks_macros::TraceNodeRefs;
