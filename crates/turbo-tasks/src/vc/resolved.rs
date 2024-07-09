use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    hash::{Hash, Hasher},
    marker::PhantomData,
    ops::Deref,
    path::{Path, PathBuf},
    sync::{
        atomic::{
            AtomicBool, AtomicI16, AtomicI32, AtomicI64, AtomicI8, AtomicU16, AtomicU32, AtomicU64,
            AtomicU8, AtomicUsize,
        },
        Arc, Mutex,
    },
    time::Duration,
};

use auto_hash_map::{AutoMap, AutoSet};
use indexmap::{IndexMap, IndexSet};

use crate::{vc::Vc, RcStr};

#[derive(Copy, Clone)]
pub struct ResolvedVc<T>
where
    T: ?Sized + Send,
{
    pub(crate) node: Vc<T>,
}

impl<T> Deref for ResolvedVc<T>
where
    T: ?Sized + Send,
{
    type Target = Vc<T>;

    fn deref(&self) -> &Self::Target {
        &self.node
    }
}

impl<T> Hash for ResolvedVc<T>
where
    T: ?Sized + Send,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.node.hash(state);
    }
}

/// Indicates that a type does not contain any instances of [`Vc`]. It may
/// contain [`ResolvedVc`].
///
/// # Safety
///
/// This trait is marked as unsafe. You should not derive it yourself, but
/// instead you should rely on [`#[turbo_tasks::value(resolved)]`][macro@
/// turbo_tasks::value] to do it for you.
pub unsafe trait ResolvedValue {}

unsafe impl<T: ?Sized + Send + ResolvedValue> ResolvedValue for ResolvedVc<T> {}

macro_rules! impl_resolved {
    ($ty:ty) => {
        unsafe impl ResolvedValue for $ty {}
    };

    ($ty:ty, $($tys:ty),+) => {
        impl_resolved!($ty);
        impl_resolved!($($tys),+);
    }
}

impl_resolved!(i8, u8, i16, u16, i32, u32, i64, u64, f32, f64, char, bool, usize);
impl_resolved!(
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
impl_resolved!((), str, String, Duration, anyhow::Error, RcStr);
impl_resolved!(Path, PathBuf);
impl_resolved!(serde_json::Value);

// based on stdlib's internal `tuple_impls!` macro
macro_rules! impl_resolved_tuple {
    ($T:ident) => {
        impl_resolved_tuple!(@impl $T);
    };
    ($T:ident $( $U:ident )+) => {
        impl_resolved_tuple!($( $U )+);
        impl_resolved_tuple!(@impl $T $( $U )+);
    };
    (@impl $( $T:ident )+) => {
        unsafe impl<$($T: ResolvedValue),+> ResolvedValue for ($($T,)+) {}
    };
}

impl_resolved_tuple!(E D C B A Z Y X W V U T);

unsafe impl<T: ResolvedValue> ResolvedValue for Option<T> {}
unsafe impl<T: ResolvedValue> ResolvedValue for Vec<T> {}
unsafe impl<T: ResolvedValue, const N: usize> ResolvedValue for [T; N] {}
unsafe impl<T: ResolvedValue> ResolvedValue for [T] {}
unsafe impl<T: ResolvedValue, S> ResolvedValue for HashSet<T, S> {}
unsafe impl<T: ResolvedValue, S, const I: usize> ResolvedValue for AutoSet<T, S, I> {}
unsafe impl<T: ResolvedValue> ResolvedValue for BTreeSet<T> {}
unsafe impl<T: ResolvedValue, S> ResolvedValue for IndexSet<T, S> {}
unsafe impl<K: ResolvedValue, V: ResolvedValue, S> ResolvedValue for HashMap<K, V, S> {}
unsafe impl<K: ResolvedValue, V: ResolvedValue, S, const I: usize> ResolvedValue
    for AutoMap<K, V, S, I>
{
}
unsafe impl<K: ResolvedValue, V: ResolvedValue> ResolvedValue for BTreeMap<K, V> {}
unsafe impl<K: ResolvedValue, V: ResolvedValue, S> ResolvedValue for IndexMap<K, V, S> {}
unsafe impl<T: ResolvedValue + ?Sized> ResolvedValue for Box<T> {}
unsafe impl<T: ResolvedValue + ?Sized> ResolvedValue for Arc<T> {}
unsafe impl<T: ResolvedValue, E: ResolvedValue> ResolvedValue for Result<T, E> {}
unsafe impl<T: ResolvedValue + ?Sized> ResolvedValue for Mutex<T> {}
unsafe impl<T: ResolvedValue + ?Sized> ResolvedValue for RefCell<T> {}
unsafe impl<T: ?Sized> ResolvedValue for PhantomData<T> {}

unsafe impl<T: ResolvedValue + ?Sized> ResolvedValue for &T {}
unsafe impl<T: ResolvedValue + ?Sized> ResolvedValue for &mut T {}
