use std::{
    collections::{BinaryHeap, HashMap, VecDeque},
    ffi::OsString,
    hash::{BuildHasher, Hash},
    path::PathBuf,
};

use indexmap::{IndexMap, IndexSet};
pub use turbo_tasks_macros::ShrinkToFit;

/// A type that might have memory capacity that can be shrunk. See [`Vec::shrink_to_fit`] as an
/// example.
///
/// This method may be a no-op. Due to limitaitons of Rust's macro system, it is derived for every
/// [`VcValueType`][crate::VcValueType], even if that type contains no shrinkable collections.
pub trait ShrinkToFit {
    fn shrink_to_fit(&mut self);
}

impl ShrinkToFit for String {
    fn shrink_to_fit(&mut self) {
        String::shrink_to_fit(self);
    }
}

impl ShrinkToFit for OsString {
    fn shrink_to_fit(&mut self) {
        OsString::shrink_to_fit(self);
    }
}

impl ShrinkToFit for PathBuf {
    fn shrink_to_fit(&mut self) {
        PathBuf::shrink_to_fit(self);
    }
}

impl<T> ShrinkToFit for Vec<T> {
    // NOTE: without real specialization (not the autoderef specialization hack that works in
    // macros, but not generics) or negative impls, we cannot call `shrink_to_fit` on nested
    // collections inside `T`, so we have to settle with just shrinking the outermost collection.
    fn shrink_to_fit(&mut self) {
        Vec::shrink_to_fit(self);
    }
}

impl<T> ShrinkToFit for VecDeque<T> {
    fn shrink_to_fit(&mut self) {
        VecDeque::shrink_to_fit(self);
    }
}

impl<K, V, S> ShrinkToFit for HashMap<K, V, S>
where
    K: Hash + Eq,
    S: BuildHasher,
{
    fn shrink_to_fit(&mut self) {
        HashMap::shrink_to_fit(self);
    }
}

impl<T> ShrinkToFit for BinaryHeap<T> {
    fn shrink_to_fit(&mut self) {
        BinaryHeap::shrink_to_fit(self);
    }
}

impl<K, V, S> ShrinkToFit for IndexMap<K, V, S> {
    fn shrink_to_fit(&mut self) {
        IndexMap::shrink_to_fit(self);
    }
}

impl<T, S> ShrinkToFit for IndexSet<T, S> {
    fn shrink_to_fit(&mut self) {
        IndexSet::shrink_to_fit(self);
    }
}
