//! The [`IsTransient`] trait and its implementations for common types.
//!
//! Split out from [`TaskInput`][crate::TaskInput] so the same "does this value transitively
//! reference a transient task?" question can be answered without committing to the full
//! `TaskInput` interface. This lets [`NonLocalValue`][crate::NonLocalValue] types use the
//! blanket [`TaskInput`][crate::TaskInput] impl without each one having to re-implement
//! `is_transient` through `TaskInput`'s now-empty interface.

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, OnceLock},
    time::Duration,
};

use either::Either;
use turbo_frozenmap::{FrozenMap, FrozenSet};
use turbo_rcstr::RcStr;
use turbo_tasks_hash::HashAlgorithm;

use crate::{
    ReadRef, ResolvedVc, TaskId, TransientInstance, TransientValue, ValueTypeId, Vc,
    task::task_input::EitherTaskInput, vc::OperationVc,
};

/// Returns whether a value transitively references a transient task.
///
/// Any task whose inputs include a transient value becomes transient itself: it's not cached
/// persistently and is dropped when the surrounding [`run_once`][crate::run_once] scope ends.
///
/// The default impl returns `false`, which is correct for leaf types containing no
/// [`Vc`]/[`ResolvedVc`]/[`OperationVc`]. The `#[derive(IsTransient)]` macro emits a
/// field-walking implementation; container impls below delegate to their element types.
pub trait IsTransient {
    fn is_transient(&self) -> bool {
        false
    }
}

// ---- Leaf types (no Vc, never transient) ----

macro_rules! impl_is_transient_leaf {
    ($($t:ty),* $(,)?) => {
        $(
            impl IsTransient for $t {}
        )*
    };
}

impl_is_transient_leaf! {
    (), bool, char,
    u8, u16, u32, u64, u128, usize,
    i8, i16, i32, i64, i128, isize,
    f32, f64,
    String, RcStr, Duration, HashAlgorithm,
    TaskId, ValueTypeId,
    std::path::PathBuf, std::path::Path,
    anyhow::Error,
    mime::Mime,
}

// ---- Vc-shaped types: defer to RawVc's transient bit ----

impl<T: ?Sized> IsTransient for Vc<T> {
    fn is_transient(&self) -> bool {
        self.node.is_transient()
    }
}

impl<T: ?Sized> IsTransient for ResolvedVc<T> {
    fn is_transient(&self) -> bool {
        self.node.node.is_transient()
    }
}

impl<T: ?Sized> IsTransient for OperationVc<T> {
    fn is_transient(&self) -> bool {
        // OperationVc.node: Vc<T>, Vc<T>.node: RawVc
        self.node.node.is_transient()
    }
}

// ---- Transient-by-construction wrappers ----

impl<T> IsTransient for TransientValue<T> {
    fn is_transient(&self) -> bool {
        true
    }
}

impl<T> IsTransient for TransientInstance<T> {
    fn is_transient(&self) -> bool {
        true
    }
}

// ---- Container types: any-of recursion ----

impl<T: IsTransient> IsTransient for Vec<T> {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<T: IsTransient + ?Sized> IsTransient for Box<T> {
    fn is_transient(&self) -> bool {
        (**self).is_transient()
    }
}

impl<T: IsTransient + ?Sized> IsTransient for Arc<T> {
    fn is_transient(&self) -> bool {
        (**self).is_transient()
    }
}

impl<T: IsTransient> IsTransient for OnceLock<T> {
    fn is_transient(&self) -> bool {
        self.get().is_some_and(IsTransient::is_transient)
    }
}

impl<T: IsTransient, E: IsTransient> IsTransient for std::result::Result<T, E> {
    fn is_transient(&self) -> bool {
        match self {
            Ok(t) => t.is_transient(),
            Err(e) => e.is_transient(),
        }
    }
}

impl<T: IsTransient + ?Sized> IsTransient for std::sync::Mutex<T> {
    fn is_transient(&self) -> bool {
        match self.lock() {
            Ok(guard) => guard.is_transient(),
            Err(_) => false,
        }
    }
}

impl<T: IsTransient + ?Sized> IsTransient for parking_lot::Mutex<T> {
    fn is_transient(&self) -> bool {
        self.lock().is_transient()
    }
}

impl<T: IsTransient> IsTransient for Option<T> {
    fn is_transient(&self) -> bool {
        match self {
            Some(value) => value.is_transient(),
            None => false,
        }
    }
}

impl<T: IsTransient> IsTransient for BTreeSet<T> {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<K: IsTransient, V: IsTransient> IsTransient for BTreeMap<K, V> {
    fn is_transient(&self) -> bool {
        self.iter()
            .any(|(k, v)| k.is_transient() || v.is_transient())
    }
}

// Hash/index containers used by `#[turbo_tasks::value]` types. Mirror the set the
// `impl_auto_marker_trait!` macro covers for `NonLocalValue`, since any field that can be
// `NonLocalValue` should also be checkable for transience.
impl<T: IsTransient, S> IsTransient for std::collections::HashSet<T, S> {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<K: IsTransient, V: IsTransient, S> IsTransient for std::collections::HashMap<K, V, S> {
    fn is_transient(&self) -> bool {
        self.iter()
            .any(|(k, v)| k.is_transient() || v.is_transient())
    }
}

impl<T: IsTransient, S> IsTransient for indexmap::IndexSet<T, S> {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<K: IsTransient, V: IsTransient, S> IsTransient for indexmap::IndexMap<K, V, S> {
    fn is_transient(&self) -> bool {
        self.iter()
            .any(|(k, v)| k.is_transient() || v.is_transient())
    }
}

impl<T: IsTransient, S, const I: usize> IsTransient for auto_hash_map::AutoSet<T, S, I> {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<K: IsTransient, V: IsTransient, S, const I: usize> IsTransient
    for auto_hash_map::AutoMap<K, V, S, I>
{
    fn is_transient(&self) -> bool {
        self.iter()
            .any(|(k, v)| k.is_transient() || v.is_transient())
    }
}

impl<T: IsTransient, const N: usize> IsTransient for smallvec::SmallVec<[T; N]> {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<T: IsTransient, const N: usize> IsTransient for [T; N] {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<T: IsTransient> IsTransient for [T] {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<T: IsTransient + ?Sized> IsTransient for &T {
    fn is_transient(&self) -> bool {
        (**self).is_transient()
    }
}

impl<B: IsTransient + ToOwned + ?Sized> IsTransient for std::borrow::Cow<'_, B> {
    fn is_transient(&self) -> bool {
        (**self).is_transient()
    }
}

impl<T: ?Sized> IsTransient for std::marker::PhantomData<T> {}

impl<T: IsTransient + 'static> IsTransient for FrozenSet<T> {
    fn is_transient(&self) -> bool {
        self.iter().any(IsTransient::is_transient)
    }
}

impl<K: IsTransient + 'static, V: IsTransient + 'static> IsTransient for FrozenMap<K, V> {
    fn is_transient(&self) -> bool {
        self.iter()
            .any(|(k, v)| k.is_transient() || v.is_transient())
    }
}

// ReadRef wraps a value whose raw form may contain Vc; check via as_raw_ref. The bound mirrors
// the existing `TaskInput for ReadRef<T>` shape — `as_raw_ref` returns a `&T`, so `T: IsTransient`
// is needed for method resolution.
impl<T: IsTransient> IsTransient for ReadRef<T> {
    fn is_transient(&self) -> bool {
        Self::as_raw_ref(self).is_transient()
    }
}

impl<L: IsTransient, R: IsTransient> IsTransient for EitherTaskInput<L, R> {
    fn is_transient(&self) -> bool {
        match self.as_ref() {
            Either::Left(l) => l.is_transient(),
            Either::Right(r) => r.is_transient(),
        }
    }
}

// ---- Tuple impls (1..=12) ----

macro_rules! impl_is_transient_tuple {
    ( $( $name:ident )+ ) => {
        impl<$($name: IsTransient),+> IsTransient for ($($name,)+) {
            #[allow(non_snake_case)]
            fn is_transient(&self) -> bool {
                let ($($name,)+) = self;
                $($name.is_transient() ||)+ false
            }
        }
    };
}

impl_is_transient_tuple! { A }
impl_is_transient_tuple! { A B }
impl_is_transient_tuple! { A B C }
impl_is_transient_tuple! { A B C D }
impl_is_transient_tuple! { A B C D E }
impl_is_transient_tuple! { A B C D E F }
impl_is_transient_tuple! { A B C D E F G }
impl_is_transient_tuple! { A B C D E F G H }
impl_is_transient_tuple! { A B C D E F G H I }
impl_is_transient_tuple! { A B C D E F G H I J }
impl_is_transient_tuple! { A B C D E F G H I J K }
impl_is_transient_tuple! { A B C D E F G H I J K L }
