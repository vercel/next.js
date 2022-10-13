use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{atomic::*, Arc, Mutex},
    time::Duration,
};

use indexmap::{IndexMap, IndexSet};

use crate::RawVc;

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
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext);
    fn get_raw_vcs(&self) -> Vec<RawVc> {
        let mut context = TraceRawVcsContext::new();
        self.trace_raw_vcs(&mut context);
        context.into_vec()
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
ignore!((), String, Duration, anyhow::Error);
ignore!(Path, PathBuf);
ignore!(serde_json::Value);

impl<'a> TraceRawVcs for &'a str {
    fn trace_raw_vcs(&self, _context: &mut TraceRawVcsContext) {}
}

impl<A: TraceRawVcs> TraceRawVcs for (A,) {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.0, context);
    }
}

impl<A: TraceRawVcs, B: TraceRawVcs> TraceRawVcs for (A, B) {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.0, context);
        TraceRawVcs::trace_raw_vcs(&self.1, context);
    }
}

impl<A: TraceRawVcs, B: TraceRawVcs, C: TraceRawVcs> TraceRawVcs for (A, B, C) {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.0, context);
        TraceRawVcs::trace_raw_vcs(&self.1, context);
        TraceRawVcs::trace_raw_vcs(&self.2, context);
    }
}

impl<T: TraceRawVcs> TraceRawVcs for Option<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        if let Some(item) = self {
            TraceRawVcs::trace_raw_vcs(item, context);
        }
    }
}

impl<T: TraceRawVcs> TraceRawVcs for Vec<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, context);
        }
    }
}

impl<T: TraceRawVcs> TraceRawVcs for HashSet<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, context);
        }
    }
}

impl<T: TraceRawVcs> TraceRawVcs for BTreeSet<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, context);
        }
    }
}

impl<T: TraceRawVcs> TraceRawVcs for IndexSet<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, context);
        }
    }
}

impl<K: TraceRawVcs, V: TraceRawVcs> TraceRawVcs for HashMap<K, V> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        for (key, value) in self.iter() {
            TraceRawVcs::trace_raw_vcs(key, context);
            TraceRawVcs::trace_raw_vcs(value, context);
        }
    }
}

impl<K: TraceRawVcs, V: TraceRawVcs> TraceRawVcs for BTreeMap<K, V> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        for (key, value) in self.iter() {
            TraceRawVcs::trace_raw_vcs(key, context);
            TraceRawVcs::trace_raw_vcs(value, context);
        }
    }
}

impl<K: TraceRawVcs, V: TraceRawVcs> TraceRawVcs for IndexMap<K, V> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        for (key, value) in self.iter() {
            TraceRawVcs::trace_raw_vcs(key, context);
            TraceRawVcs::trace_raw_vcs(value, context);
        }
    }
}

impl<T: TraceRawVcs + ?Sized> TraceRawVcs for Box<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&**self, context);
    }
}

impl<T: TraceRawVcs + ?Sized> TraceRawVcs for Arc<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&**self, context);
    }
}

impl TraceRawVcs for RawVc {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        context.list.push(*self);
    }
}

impl<T: TraceRawVcs, E: TraceRawVcs> TraceRawVcs for Result<T, E> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        match self {
            Ok(o) => o.trace_raw_vcs(context),
            Err(e) => e.trace_raw_vcs(context),
        }
    }
}

impl<T: TraceRawVcs> TraceRawVcs for Mutex<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        self.lock().unwrap().trace_raw_vcs(context);
    }
}

impl<T: TraceRawVcs> TraceRawVcs for RefCell<T> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        self.borrow().trace_raw_vcs(context);
    }
}

pub use turbo_tasks_macros::TraceRawVcs;
