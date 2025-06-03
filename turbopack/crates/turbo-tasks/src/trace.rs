use std::{
    borrow::Cow,
    cell::RefCell,
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    marker::PhantomData,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, atomic::*},
    time::Duration,
};

use auto_hash_map::{AutoMap, AutoSet};
use either::Either;
use indexmap::{IndexMap, IndexSet};
use smallvec::SmallVec;
use turbo_rcstr::RcStr;

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

ignore!(
    i8, u8, i16, u16, i32, u32, i64, u64, i128, u128, f32, f64, char, bool, isize, usize
);
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
ignore!((), str, String, Duration, anyhow::Error, RcStr);
ignore!(Path, PathBuf);
ignore!(serde_json::Value, serde_json::Map<String, serde_json::Value>);

impl<T: ?Sized> TraceRawVcs for PhantomData<T> {
    fn trace_raw_vcs(&self, _trace_context: &mut TraceRawVcsContext) {}
}

// based on stdlib's internal `tuple_impls!` macro
macro_rules! impl_trace_tuple {
    ($T:ident) => {
        impl_trace_tuple!(@impl $T);
    };
    ($T:ident $( $U:ident )+) => {
        impl_trace_tuple!($( $U )+);
        impl_trace_tuple!(@impl $T $( $U )+);
    };
    (@impl $( $T:ident )+) => {
        impl<$($T: TraceRawVcs),+> TraceRawVcs for ($($T,)+) {
            #[allow(non_snake_case)]
            fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
                let ($($T,)+) = self;
                $(
                    TraceRawVcs::trace_raw_vcs($T, trace_context);
                )+
            }
        }
    };
}

impl_trace_tuple!(E D C B A Z Y X W V U T);

/// Function pointers (the lowercase `fn` type, not `Fn`) don't contain any data, so it's not
/// possible for them to contain a `Vc`.
macro_rules! impl_trace_fn_ptr {
    ($T:ident) => {
        impl_trace_fn_ptr!(@impl $T);
    };
    ($T:ident $( $U:ident )+) => {
        impl_trace_fn_ptr!($( $U )+);
        impl_trace_fn_ptr!(@impl $T $( $U )+);
    };
    (@impl $( $T:ident )+) => {
        impl<$($T,)+ Return> TraceRawVcs for fn($($T),+) -> Return {
            fn trace_raw_vcs(&self, _trace_context: &mut TraceRawVcsContext) {}
        }
    };
}

impl_trace_fn_ptr!(E D C B A Z Y X W V U T);

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

impl<T: TraceRawVcs> TraceRawVcs for Box<[T]> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, trace_context);
        }
    }
}

impl<T: TraceRawVcs, const N: usize> TraceRawVcs for SmallVec<[T; N]> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for item in self.iter() {
            TraceRawVcs::trace_raw_vcs(item, trace_context);
        }
    }
}

impl<T: TraceRawVcs, const N: usize> TraceRawVcs for [T; N] {
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

impl<T: TraceRawVcs, S, const I: usize> TraceRawVcs for AutoSet<T, S, I> {
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

impl<K: TraceRawVcs, V: TraceRawVcs, S, const I: usize> TraceRawVcs for AutoMap<K, V, S, I> {
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

impl<B: TraceRawVcs + ToOwned + ?Sized> TraceRawVcs for Cow<'_, B> {
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

impl<T: TraceRawVcs + ?Sized> TraceRawVcs for Mutex<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        self.lock().unwrap().trace_raw_vcs(trace_context);
    }
}

impl<T: TraceRawVcs + ?Sized> TraceRawVcs for RefCell<T> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        self.borrow().trace_raw_vcs(trace_context);
    }
}

impl<T: TraceRawVcs + ?Sized> TraceRawVcs for &T {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        (**self).trace_raw_vcs(trace_context);
    }
}
impl<T: TraceRawVcs + ?Sized> TraceRawVcs for &mut T {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        (**self).trace_raw_vcs(trace_context);
    }
}

impl<L: TraceRawVcs, R: TraceRawVcs> TraceRawVcs for Either<L, R> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        match self {
            Either::Left(l) => l.trace_raw_vcs(trace_context),
            Either::Right(r) => r.trace_raw_vcs(trace_context),
        }
    }
}

pub use turbo_tasks_macros::TraceRawVcs;
