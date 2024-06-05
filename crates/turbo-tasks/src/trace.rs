use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{atomic::*, Arc, Mutex},
    time::Duration,
};

use auto_hash_map::{AutoMap, AutoSet};
use indexmap::{IndexMap, IndexSet};

use crate::{RawVc, RcStr};

pub struct TraceRawVcsContext {
    list: Vec<RawVc>,
}

impl TraceRawVcsContext {
    pub(crate) fn new() -> Self {
        Self { list: Vec::new() }
    }

    pub(crate) fn into_vec(self) -> Vec<RawVc> {
        self.list
    }
}

/// Trait that allows to walk data to find all [RawVc]s contained.
///
/// This is important for Garbage Collection to mark all Cells and therefore
/// Tasks that are still in use.
///
/// It can also be used to optimize transferring of Tasks, where knowning the
/// referenced Cells/Tasks allows pushing them earlier.
///
/// `#[derive(TraceRawVcs)]` is available.
/// `#[trace_ignore]` can be used on fields to skip tracing for them.
pub trait TraceRawVcs {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext);
    fn get_raw_vcs(&self) -> Vec<RawVc> {
        let mut trace_context = TraceRawVcsContext::new();
        self.trace_raw_vcs(&mut trace_context);
        trace_context.into_vec()
    }
}

macro_rules! ignore {
  ($ty:ty) => {
    impl TraceRawVcs for $ty {
      fn trace_raw_vcs(&self, _context: &mut TraceRawVcsContext) {}
    }
  };

  ($ty:ty, $($tys:ty),+) => {
    ignore!($ty);
    ignore!($($tys),+);
  }
}

ignore!(i8, u8, i16, u16, i32, u32, i64, u64, f32, f64, char, bool, usize);
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
ignore!((), String, Duration, anyhow::Error, RcStr);
ignore!(Path, PathBuf);
ignore!(serde_json::Value);

impl<'a> TraceRawVcs for &'a str {
    fn trace_raw_vcs(&self, _trace_context: &mut TraceRawVcsContext) {}
}

impl<A: TraceRawVcs> TraceRawVcs for (A,) {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.0, trace_context);
    }
}

impl<A: TraceRawVcs, B: TraceRawVcs> TraceRawVcs for (A, B) {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.0, trace_context);
        TraceRawVcs::trace_raw_vcs(&self.1, trace_context);
    }
}

impl<A: TraceRawVcs, B: TraceRawVcs, C: TraceRawVcs> TraceRawVcs for (A, B, C) {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.0, trace_context);
        TraceRawVcs::trace_raw_vcs(&self.1, trace_context);
        TraceRawVcs::trace_raw_vcs(&self.2, trace_context);
    }
}

impl<T: TraceRawVcs> TraceRawVcs for Option<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        if let Some(item) = self {
            TraceRawVcs::trace_raw_vcs(item, trace_context);
        }
    }
}

impl<T: TraceRawVcs> TraceRawVcs for Vec<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, trace_context);
        }
    }
}

impl<T: TraceRawVcs, S> TraceRawVcs for HashSet<T, S> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, trace_context);
        }
    }
}

impl<T: TraceRawVcs, S> TraceRawVcs for AutoSet<T, S> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, trace_context);
        }
    }
}

impl<T: TraceRawVcs> TraceRawVcs for BTreeSet<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, trace_context);
        }
    }
}

impl<T: TraceRawVcs, S> TraceRawVcs for IndexSet<T, S> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, trace_context);
        }
    }
}

impl<K: TraceRawVcs, V: TraceRawVcs, S> TraceRawVcs for HashMap<K, V, S> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for (key, value) in self.iter() {
            TraceRawVcs::trace_raw_vcs(key, trace_context);
            TraceRawVcs::trace_raw_vcs(value, trace_context);
        }
    }
}

impl<K: TraceRawVcs, V: TraceRawVcs, S> TraceRawVcs for AutoMap<K, V, S> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for (key, value) in self.iter() {
            TraceRawVcs::trace_raw_vcs(key, trace_context);
            TraceRawVcs::trace_raw_vcs(value, trace_context);
        }
    }
}

impl<K: TraceRawVcs, V: TraceRawVcs> TraceRawVcs for BTreeMap<K, V> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for (key, value) in self.iter() {
            TraceRawVcs::trace_raw_vcs(key, trace_context);
            TraceRawVcs::trace_raw_vcs(value, trace_context);
        }
    }
}

impl<K: TraceRawVcs, V: TraceRawVcs, S> TraceRawVcs for IndexMap<K, V, S> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for (key, value) in self.iter() {
            TraceRawVcs::trace_raw_vcs(key, trace_context);
            TraceRawVcs::trace_raw_vcs(value, trace_context);
        }
    }
}

impl<T: TraceRawVcs + ?Sized> TraceRawVcs for Box<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&**self, trace_context);
    }
}

impl<T: TraceRawVcs + ?Sized> TraceRawVcs for Arc<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&**self, trace_context);
    }
}

impl TraceRawVcs for RawVc {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        trace_context.list.push(*self);
    }
}

impl<T: TraceRawVcs, E: TraceRawVcs> TraceRawVcs for Result<T, E> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        match self {
            Ok(o) => o.trace_raw_vcs(trace_context),
            Err(e) => e.trace_raw_vcs(trace_context),
        }
    }
}

impl<T: TraceRawVcs> TraceRawVcs for Mutex<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        self.lock().unwrap().trace_raw_vcs(trace_context);
    }
}

impl<T: TraceRawVcs> TraceRawVcs for RefCell<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        self.borrow().trace_raw_vcs(trace_context);
    }
}

pub use turbo_tasks_macros::TraceRawVcs;
