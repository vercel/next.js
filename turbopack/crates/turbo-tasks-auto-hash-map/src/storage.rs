//! Backing storage abstractions for [`RawAutoMap`](crate::RawAutoMap) and
//! [`RawAutoSet`](crate::RawAutoSet).
//!
//! A [`RawAutoMap`](crate::RawAutoMap) stores its entries either in a small linear list (a
//! [`BackingListStorage`]) or, once it grows beyond
//! `MAX_USEFUL_LINEAR_SCAN` entries, in a real map (a [`BackingMapStorage`]).
//!
//! * [`BackingMapStorage`] is implemented for [`hashbrown::HashMap`] (unordered) and
//!   [`indexmap::IndexMap`] (insertion ordered). It also decides whether iteration order is
//!   meaningful ([`BackingMapStorage::UNORDERED`]) and how two map storages compare
//!   ([`BackingMapStorage::eq`]). Other map types can implement it too: all its iterator, entry and
//!   extraction types are associated types, so [`RawAutoMap`](crate::RawAutoMap) doesn't depend on
//!   the concrete map type. Their borrowed iterators also implement [`BackingMapIter`].
//! * [`IndexedBackingMapStorage`] adds positional access (`get_index`, `get_index_of`) for
//!   insertion ordered map storages. It is implemented for [`indexmap::IndexMap`].
//! * [`BackingListStorage`] is implemented for [`TinyVec`], [`Vec`] and [`ArrayVec`]. A list holds
//!   at most [`MAX_USEFUL_LINEAR_SCAN`] items. Other list types can implement it too.
//!
//! Key lookups take any `Q: Hash + `[`Equivalent`]`<K>`, like `hashbrown` and `indexmap` do. Every
//! `Q` that `K` borrows as is equivalent to `K`.

use std::{
    hash::{BuildHasher, Hash},
    iter::FusedIterator,
    marker::PhantomData,
    ops::{Deref, DerefMut},
    ptr,
};

use arrayvec::ArrayVec;
use hashbrown::{HashMap, hash_map as hashbrown_map};
/// The key equivalence trait of `hashbrown` and `indexmap`, used by all key lookups.
pub use indexmap::Equivalent;
use indexmap::{IndexMap, map as indexmap_map, map::RawEntryApiV1};

use crate::{
    MAX_USEFUL_LINEAR_SCAN, TinyVec,
    map::{ListIter, ListIterMut, ListValues, ListValuesMut},
    tiny_vec,
};

/// A borrowed iterator of a [`BackingMapStorage`] (e.g. [`BackingMapStorage::Iter`]), together
/// with the iterator type ([`BackingMapIter::List`]) yielding the same items from the list
/// variant of a [`RawAutoMap`](crate::RawAutoMap).
///
/// The [`RawAutoMap`](crate::RawAutoMap) iterators (e.g. [`crate::map::Iter`]) are generic over
/// this trait and take their `Item` type from it. That keeps their trait impls free of where
/// clauses that relate lifetimes, like `MI: Iterator<Item = (&'a K, &'a V)>`. Such where clauses
/// can't be proven when checking whether a future holding the iterator across an `.await` is
/// `Send`, because all lifetimes in the future's state are erased and treated as unrelated there.
/// The compiler then fails with "lifetime bound not satisfied" (rust-lang/rust#100013), e.g. for
/// `maps.iter().flat_map(|m| m.iter())`. Implementations of this trait shouldn't have such where
/// clauses either.
pub trait BackingMapIter: Iterator {
    /// The iterator over the list variant, yielding the same items as this iterator.
    type List: Iterator<Item = Self::Item>;
}

macro_rules! impl_backing_map_iter {
    ($($ty:ident :: $iter:ident => $list:ident),* $(,)?) => {
        $(
            impl<'a, K, V> BackingMapIter for $ty::$iter<'a, K, V> {
                type List = $list<'a, K, V>;
            }
        )*
    };
}

impl_backing_map_iter!(
    hashbrown_map::Iter => ListIter,
    hashbrown_map::IterMut => ListIterMut,
    hashbrown_map::Values => ListValues,
    hashbrown_map::ValuesMut => ListValuesMut,
    indexmap_map::Iter => ListIter,
    indexmap_map::IterMut => ListIterMut,
    indexmap_map::Values => ListValues,
    indexmap_map::ValuesMut => ListValuesMut,
);

/// The result of looking up a key in a [`BackingMapStorage`] via
/// [`BackingMapStorage::entry`] or [`BackingMapStorage::raw_entry_mut`].
pub enum MapEntry<O, V> {
    Occupied(O),
    Vacant(V),
}

/// A predicate for [`BackingListStorage::extract_if`].
///
/// It's implemented for all `FnMut(&mut T) -> bool` closures. It's a separate trait so that
/// adapters (e.g. [`crate::map::EntryPredicate`]) can be named in the extraction iterator types,
/// which isn't possible for closures.
pub trait ListPredicate<T> {
    /// Returns `true` if `item` should be extracted.
    fn test(&mut self, item: &mut T) -> bool;
}

impl<T, F: FnMut(&mut T) -> bool> ListPredicate<T> for F {
    fn test(&mut self, item: &mut T) -> bool {
        self(item)
    }
}

/// Storage for the list variant of a [`RawAutoMap`](crate::RawAutoMap): a small vector holding
/// at most `MAX_USEFUL_LINEAR_SCAN` items.
pub trait BackingListStorage<T>:
    Deref<Target = [T]> + DerefMut + IntoIterator<Item = T> + Sized
{
    type Drain<'a>: Iterator<Item = T>
    where
        Self: 'a;

    /// The iterator returned by [`Self::extract_if`].
    type ExtractIf<'a, P>: Iterator<Item = T>
    where
        Self: 'a,
        P: ListPredicate<T>;

    /// An empty list.
    const EMPTY: Self;

    fn with_capacity(capacity: usize) -> Self;
    fn capacity(&self) -> usize;
    /// Appends `value`. The caller guarantees `len < MAX_USEFUL_LINEAR_SCAN`.
    fn push(&mut self, value: T);
    /// Inserts `value` at `index`, shifting later items. The caller
    /// guarantees `len < MAX_USEFUL_LINEAR_SCAN`.
    fn insert(&mut self, index: usize, value: T);
    /// Removes the item at `index`, replacing it with the last item.
    fn swap_remove(&mut self, index: usize) -> T;
    /// Removes the item at `index`, shifting later items (order preserving).
    fn remove(&mut self, index: usize) -> T;
    fn clear(&mut self);
    /// Removes and yields all items in order.
    fn drain(&mut self) -> Self::Drain<'_>;
    /// Removes and yields the items for which `pred` returns `true`, like
    /// [`Vec::extract_if`] over the whole list.
    ///
    /// The items are visited in order, each exactly once, and the remaining items keep their
    /// order. Items not visited because the iterator is dropped early stay in the list. This
    /// should take O(n) time overall (not one O(n) removal per extracted item).
    fn extract_if<P: ListPredicate<T>>(&mut self, pred: P) -> Self::ExtractIf<'_, P>;
    /// Keeps only the items for which `f` returns `true`, preserving their order.
    ///
    /// Every item is visited once, in order. When the removed items are dropped is unspecified:
    /// the provided implementation drops them after visiting all items. If `f` panics, all items
    /// that weren't dropped yet stay in the list, in an unspecified order.
    fn retain<F: FnMut(&mut T) -> bool>(&mut self, mut f: F) {
        // Move the kept items to the front (in order) and the removed ones behind them, then
        // remove the tail. This is O(n), unlike calling `remove` for every removed item.
        let len = self.len();
        let mut kept = 0;
        for i in 0..len {
            if f(&mut self.deref_mut()[i]) {
                self.deref_mut().swap(kept, i);
                kept += 1;
            }
        }
        while self.len() > kept {
            self.swap_remove(self.len() - 1);
        }
    }
    /// Keeps only the items for which `f` returns `true`. Unlike [`Self::retain`], the order of
    /// the remaining items may change (a removed item is replaced with the last item).
    ///
    /// Every item is visited once. If `f` panics, the items that weren't removed yet stay in the
    /// list.
    fn swap_retain<F: FnMut(&mut T) -> bool>(&mut self, mut f: F) {
        let mut i = 0;
        while i < self.len() {
            if f(&mut self.deref_mut()[i]) {
                i += 1;
            } else {
                // Moves the (not yet visited) last item to `i`, which is visited next.
                self.swap_remove(i);
            }
        }
    }
    fn shrink_to_fit(&mut self);
    /// Shrinks the list (see [`Self::shrink_to_fit`]) once less than a third of its capacity is
    /// used. Called by [`RawAutoMap::shrink_amortized`](crate::RawAutoMap::shrink_amortized)
    /// after removals.
    ///
    /// The threshold leaves room for growing again, so alternating inserts and removals around
    /// a capacity boundary don't reallocate every time.
    fn shrink_amortized(&mut self) {
        if self.capacity() > self.len() * 3 {
            self.shrink_to_fit();
        }
    }
}

impl<T, const I: usize> BackingListStorage<T> for TinyVec<T, I, MAX_USEFUL_LINEAR_SCAN> {
    type Drain<'a>
        = tiny_vec::Drain<'a, T, I, MAX_USEFUL_LINEAR_SCAN>
    where
        Self: 'a;
    type ExtractIf<'a, P>
        = ListExtractIf<'a, T, Self, P>
    where
        Self: 'a,
        P: ListPredicate<T>;

    const EMPTY: Self = TinyVec::new();

    fn with_capacity(capacity: usize) -> Self {
        TinyVec::with_capacity(capacity)
    }
    fn capacity(&self) -> usize {
        TinyVec::capacity(self)
    }
    fn push(&mut self, value: T) {
        TinyVec::push(self, value)
    }
    fn insert(&mut self, index: usize, value: T) {
        TinyVec::insert(self, index, value)
    }
    fn swap_remove(&mut self, index: usize) -> T {
        TinyVec::swap_remove(self, index)
    }
    fn remove(&mut self, index: usize) -> T {
        TinyVec::remove(self, index)
    }
    fn clear(&mut self) {
        TinyVec::clear(self)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        TinyVec::drain(self)
    }
    fn extract_if<P: ListPredicate<T>>(&mut self, pred: P) -> Self::ExtractIf<'_, P> {
        ListExtractIf::new(self, pred)
    }
    fn shrink_to_fit(&mut self) {
        TinyVec::shrink_to_fit(self)
    }
    fn shrink_amortized(&mut self) {
        TinyVec::shrink_amortized(self)
    }
}

impl<T> BackingListStorage<T> for Vec<T> {
    type Drain<'a>
        = std::vec::Drain<'a, T>
    where
        Self: 'a;
    type ExtractIf<'a, P>
        = ListExtractIf<'a, T, Self, P>
    where
        Self: 'a,
        P: ListPredicate<T>;

    const EMPTY: Self = Vec::new();

    fn with_capacity(capacity: usize) -> Self {
        Vec::with_capacity(capacity)
    }
    fn capacity(&self) -> usize {
        Vec::capacity(self)
    }
    fn push(&mut self, value: T) {
        Vec::push(self, value)
    }
    fn insert(&mut self, index: usize, value: T) {
        Vec::insert(self, index, value)
    }
    fn swap_remove(&mut self, index: usize) -> T {
        Vec::swap_remove(self, index)
    }
    fn remove(&mut self, index: usize) -> T {
        Vec::remove(self, index)
    }
    fn clear(&mut self) {
        Vec::clear(self)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        Vec::drain(self, ..)
    }
    fn extract_if<P: ListPredicate<T>>(&mut self, pred: P) -> Self::ExtractIf<'_, P> {
        ListExtractIf::new(self, pred)
    }
    fn retain<F: FnMut(&mut T) -> bool>(&mut self, f: F) {
        Vec::retain_mut(self, f)
    }
    fn shrink_to_fit(&mut self) {
        Vec::shrink_to_fit(self)
    }
}

impl<T> BackingListStorage<T> for ArrayVec<T, MAX_USEFUL_LINEAR_SCAN> {
    type Drain<'a>
        = arrayvec::Drain<'a, T, MAX_USEFUL_LINEAR_SCAN>
    where
        Self: 'a;
    type ExtractIf<'a, P>
        = ListExtractIf<'a, T, Self, P>
    where
        Self: 'a,
        P: ListPredicate<T>;

    const EMPTY: Self = ArrayVec::new_const();

    fn with_capacity(_capacity: usize) -> Self {
        ArrayVec::new()
    }
    fn capacity(&self) -> usize {
        ArrayVec::capacity(self)
    }
    fn push(&mut self, value: T) {
        ArrayVec::push(self, value)
    }
    fn insert(&mut self, index: usize, value: T) {
        ArrayVec::insert(self, index, value)
    }
    fn swap_remove(&mut self, index: usize) -> T {
        ArrayVec::swap_remove(self, index)
    }
    fn remove(&mut self, index: usize) -> T {
        ArrayVec::remove(self, index)
    }
    fn clear(&mut self) {
        ArrayVec::clear(self)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        ArrayVec::drain(self, ..)
    }
    fn extract_if<P: ListPredicate<T>>(&mut self, pred: P) -> Self::ExtractIf<'_, P> {
        ListExtractIf::new(self, pred)
    }
    // `retain` uses the provided implementation: `ArrayVec::retain` (arrayvec 0.7.6) is reported
    // as undefined behavior by Miri (Stacked Borrows) when the predicate panics.
    fn shrink_to_fit(&mut self) {
        // Inline storage, nothing to shrink.
    }
}

mod sealed {
    /// Raw access to the buffer of the built-in list storages, used by
    /// [`super::ListExtractIf`].
    ///
    /// This trait is sealed (it's in a private module), so it can't be implemented or named
    /// outside of this crate.
    ///
    /// # Safety
    ///
    /// [`Self::buffer_ptr`] must return a pointer to the start of the buffer, which holds
    /// `capacity()` items, the first `len()` of which are initialized. The pointer must stay
    /// valid as long as the list isn't moved or reallocated (changing the length with
    /// [`Self::set_buffer_len`] doesn't reallocate).
    pub unsafe trait ListBuffer<T>: super::BackingListStorage<T> {
        fn buffer_ptr(&mut self) -> *mut T;
        /// # Safety
        ///
        /// `len` must be `<= capacity()` and the first `len` items must be initialized.
        unsafe fn set_buffer_len(&mut self, len: usize);
    }
}

// SAFETY: `as_mut_ptr` points to the (inline or heap) buffer of `capacity()` items, `set_len`
// only updates the length.
unsafe impl<T, const I: usize> sealed::ListBuffer<T> for TinyVec<T, I, MAX_USEFUL_LINEAR_SCAN> {
    fn buffer_ptr(&mut self) -> *mut T {
        self.as_mut_ptr()
    }
    unsafe fn set_buffer_len(&mut self, len: usize) {
        self.set_len(len)
    }
}

// SAFETY: see `Vec::as_mut_ptr` and `Vec::set_len`.
unsafe impl<T> sealed::ListBuffer<T> for Vec<T> {
    fn buffer_ptr(&mut self) -> *mut T {
        self.as_mut_ptr()
    }
    unsafe fn set_buffer_len(&mut self, len: usize) {
        // SAFETY: guaranteed by the caller.
        unsafe { self.set_len(len) }
    }
}

// SAFETY: see `ArrayVec::as_mut_ptr` and `ArrayVec::set_len`.
unsafe impl<T> sealed::ListBuffer<T> for ArrayVec<T, MAX_USEFUL_LINEAR_SCAN> {
    fn buffer_ptr(&mut self) -> *mut T {
        self.as_mut_ptr()
    }
    unsafe fn set_buffer_len(&mut self, len: usize) {
        // SAFETY: guaranteed by the caller.
        unsafe { self.set_len(len) }
    }
}

/// [`BackingListStorage::ExtractIf`] of the built-in list storages, using the algorithm of
/// [`std::vec::ExtractIf`]: an extracted item is moved out of the buffer, kept items are moved
/// back over the gap, and when the iterator is dropped the unvisited tail is moved back too. That
/// is O(n) overall.
///
/// While the iterator exists, the list's length is set to 0, so if the iterator is leaked (e.g.
/// with [`std::mem::forget`]) the remaining items are leaked too, but never dropped twice.
pub struct ListExtractIf<'a, T, L: sealed::ListBuffer<T>, P> {
    list: &'a mut L,
    /// The index of the next item to visit.
    idx: usize,
    /// The number of items extracted so far.
    del: usize,
    /// The length of the list before extracting.
    old_len: usize,
    pred: P,
    _item: PhantomData<fn() -> T>,
}

impl<'a, T, L: sealed::ListBuffer<T>, P> ListExtractIf<'a, T, L, P> {
    fn new(list: &'a mut L, pred: P) -> Self {
        let old_len = list.len();
        // SAFETY: 0 <= capacity, and no items need to be initialized for length 0. The items stay
        // in the buffer and are managed by this iterator until it's dropped.
        unsafe { list.set_buffer_len(0) };
        Self {
            list,
            idx: 0,
            del: 0,
            old_len,
            pred,
            _item: PhantomData,
        }
    }
}

impl<T, L: sealed::ListBuffer<T>, P: ListPredicate<T>> Iterator for ListExtractIf<'_, T, L, P> {
    type Item = T;

    fn next(&mut self) -> Option<T> {
        while self.idx < self.old_len {
            let ptr = self.list.buffer_ptr();
            let i = self.idx;
            // Invariant: items `0..i - del` are kept (initialized), `i - del..i` are moved out
            // (uninitialized), `i..old_len` are unvisited (initialized).
            // SAFETY: `i < old_len`, so the item at `i` is initialized and unvisited, and no
            // other reference to it exists.
            let item = unsafe { &mut *ptr.add(i) };
            // If `test` panics, `idx` still points at the item, so it's kept by `drop`.
            let extract = self.pred.test(item);
            self.idx += 1;
            if extract {
                self.del += 1;
                // SAFETY: the item is initialized. It's in the gap from now on, so it's never
                // read again.
                return Some(unsafe { ptr::read(ptr.add(i)) });
            } else if self.del > 0 {
                // SAFETY: `i - del` is in the gap (uninitialized) and `del > 0`, so the source
                // and destination don't overlap. The item at `i` becomes part of the gap.
                unsafe { ptr::copy_nonoverlapping(ptr.add(i), ptr.add(i - self.del), 1) };
            }
        }
        None
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (0, Some(self.old_len - self.idx))
    }

    // Same steps as `next`, but in one loop: the buffer pointer is read once, as nothing else
    // can access the list while this iterator borrows it mutably.
    #[inline]
    fn fold<B, F>(mut self, init: B, mut f: F) -> B
    where
        F: FnMut(B, T) -> B,
    {
        let ptr = self.list.buffer_ptr();
        let mut acc = init;
        while self.idx < self.old_len {
            let i = self.idx;
            // Same invariant as in `next`.
            // SAFETY: `i < old_len`, so the item at `i` is initialized and unvisited, and no
            // other reference to it exists.
            let item = unsafe { &mut *ptr.add(i) };
            // If `test` panics, `idx` still points at the item, so it's kept by `drop`.
            let extract = self.pred.test(item);
            self.idx += 1;
            if extract {
                self.del += 1;
                // SAFETY: the item is initialized. It's in the gap from now on, so it's never
                // read again. `idx` and `del` are already updated, so if `f` panics, `drop`
                // closes the gap correctly.
                let item = unsafe { ptr::read(ptr.add(i)) };
                acc = f(acc, item);
            } else if self.del > 0 {
                // SAFETY: see `next`.
                unsafe { ptr::copy_nonoverlapping(ptr.add(i), ptr.add(i - self.del), 1) };
            }
        }
        acc
    }
}

// After returning `None`, `idx == old_len`, so it keeps returning `None`.
impl<T, L: sealed::ListBuffer<T>, P: ListPredicate<T>> FusedIterator
    for ListExtractIf<'_, T, L, P>
{
}

impl<T, L: sealed::ListBuffer<T>, P> Drop for ListExtractIf<'_, T, L, P> {
    fn drop(&mut self) {
        let ptr = self.list.buffer_ptr();
        if self.del > 0 && self.idx < self.old_len {
            // SAFETY: moves the unvisited (initialized) items `idx..old_len` back over the gap
            // of `del` items before them. The ranges may overlap, so use `copy`.
            unsafe {
                ptr::copy(
                    ptr.add(self.idx),
                    ptr.add(self.idx - self.del),
                    self.old_len - self.idx,
                )
            };
        }
        // SAFETY: the first `old_len - del` items are initialized now, and that's <= the
        // original length <= capacity.
        unsafe { self.list.set_buffer_len(self.old_len - self.del) };
    }
}

/// Storage for the map variant of a [`RawAutoMap`](crate::RawAutoMap).
///
/// Methods that need hashing carry the same bounds as the underlying map type,
/// so the trait itself is implemented without bounds on `K`, `V` or the hasher.
pub trait BackingMapStorage<K, V>: Sized {
    type Hasher;

    /// When `true` the iteration order is not meaningful: removals may move other entries (e.g.
    /// swap-remove in the list variant) and equality ignores order.
    ///
    /// When `false` the storage is insertion ordered: all removals preserve the relative order of
    /// the remaining entries (in both the list and the map variant) and equality is order
    /// sensitive.
    const UNORDERED: bool;

    type IntoIter: Iterator<Item = (K, V)>;
    type IntoValues: Iterator<Item = V>;
    type Iter<'a>: BackingMapIter<Item = (&'a K, &'a V), List = ListIter<'a, K, V>> + Clone
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type IterMut<'a>: BackingMapIter<Item = (&'a K, &'a mut V), List = ListIterMut<'a, K, V>>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type Values<'a>: BackingMapIter<Item = &'a V, List = ListValues<'a, K, V>>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type ValuesMut<'a>: BackingMapIter<Item = &'a mut V, List = ListValuesMut<'a, K, V>>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type Drain<'a>: Iterator<Item = (K, V)>
    where
        Self: 'a;
    /// Iterator returned by [`Self::extract_if`].
    type ExtractIf<'a, F>: Iterator<Item = (K, V)>
    where
        Self: 'a,
        K: 'a,
        V: 'a,
        F: FnMut(&K, &mut V) -> bool;
    type Occupied<'a>
    where
        Self: 'a;
    type Vacant<'a>
    where
        Self: 'a;
    type RawOccupied<'a>
    where
        Self: 'a;
    type RawVacant<'a>
    where
        Self: 'a;

    fn with_capacity_and_hasher(capacity: usize, hasher: Self::Hasher) -> Self;
    fn len(&self) -> usize;
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
    fn capacity(&self) -> usize;
    fn clear(&mut self);
    fn iter<'a>(&'a self) -> Self::Iter<'a>;
    fn iter_mut<'a>(&'a mut self) -> Self::IterMut<'a>;
    fn values<'a>(&'a self) -> Self::Values<'a>;
    fn values_mut<'a>(&'a mut self) -> Self::ValuesMut<'a>;
    fn into_entries(self) -> Self::IntoIter;
    fn into_values(self) -> Self::IntoValues;
    /// Removes and yields all entries (in order for ordered storages).
    fn drain(&mut self) -> Self::Drain<'_>;
    fn retain<F: FnMut(&K, &mut V) -> bool>(&mut self, f: F);
    /// Removes and yields the entries for which `f` returns `true`. Ordered storages preserve the
    /// order of the remaining entries.
    fn extract_if<'a, F>(&'a mut self, f: F) -> Self::ExtractIf<'a, F>
    where
        K: 'a,
        V: 'a,
        F: FnMut(&K, &mut V) -> bool;

    fn insert(&mut self, key: K, value: V) -> Option<V>
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    /// Removes `key`. Ordered storages preserve the order of the other entries.
    fn remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        Self::Hasher: BuildHasher;
    /// Removes `key` by swapping the last entry into its place. This is O(1) for ordered storages
    /// too, but changes their order. Unordered storages remove the same way as [`Self::remove`].
    fn swap_remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        Self::Hasher: BuildHasher;
    fn extend(&mut self, iter: impl Iterator<Item = (K, V)>)
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        Self::Hasher: BuildHasher;
    fn get_key_value<Q>(&self, key: &Q) -> Option<(&K, &V)>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        Self::Hasher: BuildHasher;
    fn get_mut<Q>(&mut self, key: &Q) -> Option<&mut V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        Self::Hasher: BuildHasher;
    fn contains_key<Q>(&self, key: &Q) -> bool
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        Self::Hasher: BuildHasher;
    fn shrink_to_fit(&mut self)
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;

    fn entry(&mut self, key: K) -> MapEntry<Self::Occupied<'_>, Self::Vacant<'_>>
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    // The entry methods below bound `Self: 'a`, like the entry GATs. Implementations whose entry
    // types don't mention every type parameter of `Self` (e.g. the hasher) rely on it.
    fn occupied_get_mut<'e, 'a>(entry: &'e mut Self::Occupied<'a>) -> &'e mut V
    where
        Self: 'a;
    fn occupied_into_mut<'a>(entry: Self::Occupied<'a>) -> &'a mut V
    where
        Self: 'a;
    /// Removes the entry. Ordered storages preserve the order of the other entries.
    fn occupied_remove<'a>(entry: Self::Occupied<'a>) -> V
    where
        Self: 'a,
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    /// Replaces the entry's value with the result of `func`, or removes the entry when `func`
    /// returns `None`. Ordered storages keep the entry at its position.
    fn occupied_replace_entry_with<'a>(
        entry: Self::Occupied<'a>,
        func: impl FnOnce(&K, V) -> Option<V>,
    ) where
        Self: 'a,
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    fn vacant_insert<'a>(entry: Self::Vacant<'a>, value: V) -> &'a mut V
    where
        Self: 'a,
        K: Eq + Hash,
        Self::Hasher: BuildHasher;

    fn raw_entry_mut<Q>(&mut self, key: &Q) -> MapEntry<Self::RawOccupied<'_>, Self::RawVacant<'_>>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        Self::Hasher: BuildHasher;
    fn raw_occupied_get_mut<'e, 'a>(entry: &'e mut Self::RawOccupied<'a>) -> &'e mut V
    where
        Self: 'a;
    fn raw_occupied_into_mut<'a>(entry: Self::RawOccupied<'a>) -> &'a mut V
    where
        Self: 'a;
    /// Removes the entry. Ordered storages preserve the order of the other entries.
    fn raw_occupied_remove<'a>(entry: Self::RawOccupied<'a>) -> V
    where
        Self: 'a;
    fn raw_vacant_insert<'a>(entry: Self::RawVacant<'a>, key: K, value: V) -> &'a mut V
    where
        Self: 'a,
        K: Eq + Hash,
        Self::Hasher: BuildHasher;

    /// Equality of two map storages. Order insensitive for unordered storages, order sensitive
    /// for ordered ones.
    ///
    /// [`RawAutoMap`](crate::RawAutoMap)'s `PartialEq` uses this when both maps are in the map
    /// variant. This is a separate method instead of a `PartialEq` bound because e.g.
    /// [`IndexMap`]'s `PartialEq` is order insensitive.
    fn eq(a: &Self, b: &Self) -> bool
    where
        K: Eq + Hash,
        V: PartialEq,
        Self::Hasher: BuildHasher;
}

/// A [`BackingMapStorage`] with positional access to its entries.
///
/// Only implemented by insertion ordered storages ([`BackingMapStorage::UNORDERED`] is `false`),
/// so the index of an entry is its position in iteration order, in both the list and the map
/// variant of a [`RawAutoMap`](crate::RawAutoMap).
pub trait IndexedBackingMapStorage<K, V>: BackingMapStorage<K, V> {
    /// The entry at position `index`, if `index < len`.
    fn get_index(&self, index: usize) -> Option<(&K, &V)>;
    /// The position of `key`, if it is in the map.
    fn get_index_of<Q>(&self, key: &Q) -> Option<usize>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        Self::Hasher: BuildHasher;
}

impl<K, V, H> IndexedBackingMapStorage<K, V> for IndexMap<K, V, H> {
    #[inline]
    fn get_index(&self, index: usize) -> Option<(&K, &V)> {
        IndexMap::get_index(self, index)
    }
    #[inline]
    fn get_index_of<Q>(&self, key: &Q) -> Option<usize>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        IndexMap::get_index_of(self, key)
    }
}

impl<K, V, H> BackingMapStorage<K, V> for HashMap<K, V, H> {
    type Hasher = H;

    const UNORDERED: bool = true;

    type IntoIter = hashbrown::hash_map::IntoIter<K, V>;
    type IntoValues = hashbrown::hash_map::IntoValues<K, V>;
    type Iter<'a>
        = hashbrown::hash_map::Iter<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type IterMut<'a>
        = hashbrown::hash_map::IterMut<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type Values<'a>
        = hashbrown::hash_map::Values<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type ValuesMut<'a>
        = hashbrown::hash_map::ValuesMut<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type Drain<'a>
        = hashbrown::hash_map::Drain<'a, K, V>
    where
        Self: 'a;
    type ExtractIf<'a, F>
        = hashbrown::hash_map::ExtractIf<'a, K, V, F>
    where
        Self: 'a,
        K: 'a,
        V: 'a,
        F: FnMut(&K, &mut V) -> bool;
    type Occupied<'a>
        = hashbrown::hash_map::OccupiedEntry<'a, K, V, H>
    where
        Self: 'a;
    type Vacant<'a>
        = hashbrown::hash_map::VacantEntry<'a, K, V, H>
    where
        Self: 'a;
    type RawOccupied<'a>
        = hashbrown::hash_map::RawOccupiedEntryMut<'a, K, V, H>
    where
        Self: 'a;
    type RawVacant<'a>
        = hashbrown::hash_map::RawVacantEntryMut<'a, K, V, H>
    where
        Self: 'a;

    #[inline]
    fn with_capacity_and_hasher(capacity: usize, hasher: H) -> Self {
        HashMap::with_capacity_and_hasher(capacity, hasher)
    }
    #[inline]
    fn len(&self) -> usize {
        HashMap::len(self)
    }
    #[inline]
    fn capacity(&self) -> usize {
        HashMap::capacity(self)
    }
    #[inline]
    fn clear(&mut self) {
        HashMap::clear(self)
    }
    #[inline]
    fn iter<'a>(&'a self) -> Self::Iter<'a> {
        HashMap::iter(self)
    }
    #[inline]
    fn iter_mut<'a>(&'a mut self) -> Self::IterMut<'a> {
        HashMap::iter_mut(self)
    }
    #[inline]
    fn values<'a>(&'a self) -> Self::Values<'a> {
        HashMap::values(self)
    }
    #[inline]
    fn values_mut<'a>(&'a mut self) -> Self::ValuesMut<'a> {
        HashMap::values_mut(self)
    }
    #[inline]
    fn into_entries(self) -> Self::IntoIter {
        IntoIterator::into_iter(self)
    }
    #[inline]
    fn into_values(self) -> Self::IntoValues {
        HashMap::into_values(self)
    }
    #[inline]
    fn drain(&mut self) -> Self::Drain<'_> {
        HashMap::drain(self)
    }
    #[inline]
    fn retain<F: FnMut(&K, &mut V) -> bool>(&mut self, f: F) {
        HashMap::retain(self, f)
    }
    #[inline]
    fn extract_if<'a, F>(&'a mut self, f: F) -> Self::ExtractIf<'a, F>
    where
        K: 'a,
        V: 'a,
        F: FnMut(&K, &mut V) -> bool,
    {
        HashMap::extract_if(self, f)
    }

    #[inline]
    fn insert(&mut self, key: K, value: V) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        HashMap::insert(self, key, value)
    }
    #[inline]
    fn remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        HashMap::remove(self, key)
    }
    #[inline]
    fn swap_remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        HashMap::remove(self, key)
    }
    #[inline]
    fn extend(&mut self, iter: impl Iterator<Item = (K, V)>)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        Extend::extend(self, iter)
    }
    #[inline]
    fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        HashMap::get(self, key)
    }
    #[inline]
    fn get_key_value<Q>(&self, key: &Q) -> Option<(&K, &V)>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        HashMap::get_key_value(self, key)
    }
    #[inline]
    fn get_mut<Q>(&mut self, key: &Q) -> Option<&mut V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        HashMap::get_mut(self, key)
    }
    #[inline]
    fn contains_key<Q>(&self, key: &Q) -> bool
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        HashMap::contains_key(self, key)
    }
    #[inline]
    fn shrink_to_fit(&mut self)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        HashMap::shrink_to_fit(self)
    }

    #[inline]
    fn entry(&mut self, key: K) -> MapEntry<Self::Occupied<'_>, Self::Vacant<'_>>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        match HashMap::entry(self, key) {
            hashbrown::hash_map::Entry::Occupied(entry) => MapEntry::Occupied(entry),
            hashbrown::hash_map::Entry::Vacant(entry) => MapEntry::Vacant(entry),
        }
    }
    #[inline]
    fn occupied_get_mut<'e, 'a>(entry: &'e mut Self::Occupied<'a>) -> &'e mut V
    where
        Self: 'a,
    {
        entry.get_mut()
    }
    #[inline]
    fn occupied_into_mut<'a>(entry: Self::Occupied<'a>) -> &'a mut V
    where
        Self: 'a,
    {
        entry.into_mut()
    }
    #[inline]
    fn occupied_remove<'a>(entry: Self::Occupied<'a>) -> V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.remove()
    }
    #[inline]
    fn occupied_replace_entry_with<'a>(
        entry: Self::Occupied<'a>,
        func: impl FnOnce(&K, V) -> Option<V>,
    ) where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.replace_entry_with(func);
    }
    #[inline]
    fn vacant_insert<'a>(entry: Self::Vacant<'a>, value: V) -> &'a mut V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.insert(value)
    }

    #[inline]
    fn raw_entry_mut<Q>(&mut self, key: &Q) -> MapEntry<Self::RawOccupied<'_>, Self::RawVacant<'_>>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        match HashMap::raw_entry_mut(self).from_key(key) {
            hashbrown::hash_map::RawEntryMut::Occupied(entry) => MapEntry::Occupied(entry),
            hashbrown::hash_map::RawEntryMut::Vacant(entry) => MapEntry::Vacant(entry),
        }
    }
    #[inline]
    fn raw_occupied_get_mut<'e, 'a>(entry: &'e mut Self::RawOccupied<'a>) -> &'e mut V
    where
        Self: 'a,
    {
        entry.get_mut()
    }
    #[inline]
    fn raw_occupied_into_mut<'a>(entry: Self::RawOccupied<'a>) -> &'a mut V
    where
        Self: 'a,
    {
        entry.into_mut()
    }
    #[inline]
    fn raw_occupied_remove<'a>(entry: Self::RawOccupied<'a>) -> V
    where
        Self: 'a,
    {
        entry.remove()
    }
    #[inline]
    fn raw_vacant_insert<'a>(entry: Self::RawVacant<'a>, key: K, value: V) -> &'a mut V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.insert(key, value).1
    }

    fn eq(a: &Self, b: &Self) -> bool
    where
        K: Eq + Hash,
        V: PartialEq,
        H: BuildHasher,
    {
        a == b
    }
}

/// [`BackingMapStorage::Occupied`] for [`IndexMap`]. Holds the map and the
/// index of the entry, so that the entry can be replaced in place.
pub struct IndexMapOccupiedEntry<'a, K, V, H> {
    map: &'a mut IndexMap<K, V, H>,
    index: usize,
}

/// Used by `occupied_replace_entry_with` for [`IndexMap`]: when dropped, moves the entry at
/// `index` to the end of the map, shifting the following entries back by one.
struct IndexMapMoveToEndOnDrop<'a, K, V, H> {
    /// `None` when the move isn't needed anymore.
    map: Option<&'a mut IndexMap<K, V, H>>,
    index: usize,
}

impl<K, V, H> Drop for IndexMapMoveToEndOnDrop<'_, K, V, H> {
    fn drop(&mut self) {
        if let Some(map) = self.map.take()
            && self.index < map.len()
        {
            map.move_index(self.index, map.len() - 1);
        }
    }
}

/// [`BackingMapStorage::Vacant`] for [`IndexMap`].
pub struct IndexMapVacantEntry<'a, K, V, H> {
    map: &'a mut IndexMap<K, V, H>,
    key: K,
}

impl<K, V, H> BackingMapStorage<K, V> for IndexMap<K, V, H> {
    type Hasher = H;

    const UNORDERED: bool = false;

    type IntoIter = indexmap::map::IntoIter<K, V>;
    type IntoValues = indexmap::map::IntoValues<K, V>;
    type Iter<'a>
        = indexmap::map::Iter<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type IterMut<'a>
        = indexmap::map::IterMut<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type Values<'a>
        = indexmap::map::Values<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type ValuesMut<'a>
        = indexmap::map::ValuesMut<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type Drain<'a>
        = indexmap::map::Drain<'a, K, V>
    where
        Self: 'a;
    type ExtractIf<'a, F>
        = indexmap::map::ExtractIf<'a, K, V, F>
    where
        Self: 'a,
        K: 'a,
        V: 'a,
        F: FnMut(&K, &mut V) -> bool;
    type Occupied<'a>
        = IndexMapOccupiedEntry<'a, K, V, H>
    where
        Self: 'a;
    type Vacant<'a>
        = IndexMapVacantEntry<'a, K, V, H>
    where
        Self: 'a;
    type RawOccupied<'a>
        = indexmap::map::raw_entry_v1::RawOccupiedEntryMut<'a, K, V, H>
    where
        Self: 'a;
    type RawVacant<'a>
        = indexmap::map::raw_entry_v1::RawVacantEntryMut<'a, K, V, H>
    where
        Self: 'a;

    #[inline]
    fn with_capacity_and_hasher(capacity: usize, hasher: H) -> Self {
        IndexMap::with_capacity_and_hasher(capacity, hasher)
    }
    #[inline]
    fn len(&self) -> usize {
        IndexMap::len(self)
    }
    #[inline]
    fn capacity(&self) -> usize {
        IndexMap::capacity(self)
    }
    #[inline]
    fn clear(&mut self) {
        IndexMap::clear(self)
    }
    #[inline]
    fn iter<'a>(&'a self) -> Self::Iter<'a> {
        IndexMap::iter(self)
    }
    #[inline]
    fn iter_mut<'a>(&'a mut self) -> Self::IterMut<'a> {
        IndexMap::iter_mut(self)
    }
    #[inline]
    fn values<'a>(&'a self) -> Self::Values<'a> {
        IndexMap::values(self)
    }
    #[inline]
    fn values_mut<'a>(&'a mut self) -> Self::ValuesMut<'a> {
        IndexMap::values_mut(self)
    }
    #[inline]
    fn into_entries(self) -> Self::IntoIter {
        IntoIterator::into_iter(self)
    }
    #[inline]
    fn into_values(self) -> Self::IntoValues {
        IndexMap::into_values(self)
    }
    #[inline]
    fn drain(&mut self) -> Self::Drain<'_> {
        IndexMap::drain(self, ..)
    }
    #[inline]
    fn retain<F: FnMut(&K, &mut V) -> bool>(&mut self, mut f: F) {
        IndexMap::retain(self, |k, v| f(k, v))
    }
    #[inline]
    fn extract_if<'a, F>(&'a mut self, f: F) -> Self::ExtractIf<'a, F>
    where
        K: 'a,
        V: 'a,
        F: FnMut(&K, &mut V) -> bool,
    {
        IndexMap::extract_if(self, .., f)
    }

    #[inline]
    fn insert(&mut self, key: K, value: V) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        IndexMap::insert(self, key, value)
    }
    #[inline]
    fn remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        IndexMap::shift_remove(self, key)
    }
    #[inline]
    fn swap_remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        IndexMap::swap_remove(self, key)
    }
    #[inline]
    fn extend(&mut self, iter: impl Iterator<Item = (K, V)>)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        Extend::extend(self, iter)
    }
    #[inline]
    fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        IndexMap::get(self, key)
    }
    #[inline]
    fn get_key_value<Q>(&self, key: &Q) -> Option<(&K, &V)>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        IndexMap::get_key_value(self, key)
    }
    #[inline]
    fn get_mut<Q>(&mut self, key: &Q) -> Option<&mut V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        IndexMap::get_mut(self, key)
    }
    #[inline]
    fn contains_key<Q>(&self, key: &Q) -> bool
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        IndexMap::contains_key(self, key)
    }
    #[inline]
    fn shrink_to_fit(&mut self)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        IndexMap::shrink_to_fit(self)
    }

    #[inline]
    fn entry(&mut self, key: K) -> MapEntry<Self::Occupied<'_>, Self::Vacant<'_>>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        match IndexMap::get_index_of(self, &key) {
            Some(index) => MapEntry::Occupied(IndexMapOccupiedEntry { map: self, index }),
            None => MapEntry::Vacant(IndexMapVacantEntry { map: self, key }),
        }
    }
    #[inline]
    fn occupied_get_mut<'e, 'a>(entry: &'e mut Self::Occupied<'a>) -> &'e mut V
    where
        Self: 'a,
    {
        &mut entry.map[entry.index]
    }
    #[inline]
    fn occupied_into_mut<'a>(entry: Self::Occupied<'a>) -> &'a mut V
    where
        Self: 'a,
    {
        &mut entry.map[entry.index]
    }
    #[inline]
    fn occupied_remove<'a>(entry: Self::Occupied<'a>) -> V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry
            .map
            .shift_remove_index(entry.index)
            .expect("index of an occupied entry is valid")
            .1
    }
    #[inline]
    fn occupied_replace_entry_with<'a>(
        entry: Self::Occupied<'a>,
        func: impl FnOnce(&K, V) -> Option<V>,
    ) where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        let IndexMapOccupiedEntry { map, index } = entry;
        // Take the entry out with `swap_remove_index`, which moves the last entry into `index`.
        // Until the entry is put back, the guard would move that entry back to the end (one shift
        // of the following entries), which restores the order of the other entries also when
        // `func` panics.
        let (key, value) = map
            .swap_remove_index(index)
            .expect("index of an occupied entry is valid");
        let mut guard = IndexMapMoveToEndOnDrop {
            map: Some(&mut *map),
            index,
        };
        if let Some(value) = func(&key, value) {
            // Put the entry back at the end and swap it with the moved entry, which returns both
            // to their original positions without shifting.
            let map = guard.map.take().unwrap();
            let (last, _) = map.insert_full(key, value);
            map.swap_indices(index, last);
        }
    }
    #[inline]
    fn vacant_insert<'a>(entry: Self::Vacant<'a>, value: V) -> &'a mut V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        let IndexMapVacantEntry { map, key } = entry;
        let (index, _) = map.insert_full(key, value);
        &mut map[index]
    }

    #[inline]
    fn raw_entry_mut<Q>(&mut self, key: &Q) -> MapEntry<Self::RawOccupied<'_>, Self::RawVacant<'_>>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        match self.raw_entry_mut_v1().from_key(key) {
            indexmap::map::raw_entry_v1::RawEntryMut::Occupied(entry) => MapEntry::Occupied(entry),
            indexmap::map::raw_entry_v1::RawEntryMut::Vacant(entry) => MapEntry::Vacant(entry),
        }
    }
    #[inline]
    fn raw_occupied_get_mut<'e, 'a>(entry: &'e mut Self::RawOccupied<'a>) -> &'e mut V
    where
        Self: 'a,
    {
        entry.get_mut()
    }
    #[inline]
    fn raw_occupied_into_mut<'a>(entry: Self::RawOccupied<'a>) -> &'a mut V
    where
        Self: 'a,
    {
        entry.into_mut()
    }
    #[inline]
    fn raw_occupied_remove<'a>(entry: Self::RawOccupied<'a>) -> V
    where
        Self: 'a,
    {
        entry.shift_remove()
    }
    #[inline]
    fn raw_vacant_insert<'a>(entry: Self::RawVacant<'a>, key: K, value: V) -> &'a mut V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.insert(key, value).1
    }

    fn eq(a: &Self, b: &Self) -> bool
    where
        K: Eq + Hash,
        V: PartialEq,
        H: BuildHasher,
    {
        // Ordered: same entries in the same order. `IndexMap`'s `PartialEq` ignores the order.
        a.len() == b.len() && a.iter().eq(b.iter())
    }
}

#[cfg(test)]
mod tests {
    use std::{
        cell::RefCell,
        panic::{AssertUnwindSafe, catch_unwind},
        rc::Rc,
    };

    use super::*;

    /// An item that logs when it's dropped, to check that every item is dropped exactly once.
    #[derive(Debug)]
    struct Tracked {
        id: u32,
        drops: Rc<RefCell<Vec<u32>>>,
    }

    impl Drop for Tracked {
        fn drop(&mut self) {
            self.drops.borrow_mut().push(self.id);
        }
    }

    fn sorted(mut items: Vec<u32>) -> Vec<u32> {
        items.sort();
        items
    }

    fn make<L: BackingListStorage<Tracked>>(n: u32, drops: &Rc<RefCell<Vec<u32>>>) -> L {
        let mut list = L::with_capacity(n as usize);
        for id in 0..n {
            list.push(Tracked {
                id,
                drops: drops.clone(),
            });
        }
        list
    }

    fn ids(list: &[Tracked]) -> Vec<u32> {
        list.iter().map(|t| t.id).collect()
    }

    const N: u32 = 20;

    fn check_retain<L: BackingListStorage<Tracked>>() {
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut visited = Vec::new();
        list.retain(|t| {
            visited.push(t.id);
            t.id % 3 != 0
        });
        assert_eq!(visited, (0..N).collect::<Vec<_>>());
        let kept: Vec<u32> = (0..N).filter(|id| id % 3 != 0).collect();
        assert_eq!(ids(&list), kept);
        let removed: Vec<u32> = (0..N).filter(|id| id % 3 == 0).collect();
        assert_eq!(sorted(RefCell::borrow(&drops).clone()), removed);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );
    }

    fn check_swap_retain<L: BackingListStorage<Tracked>>() {
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut visited = Vec::new();
        list.swap_retain(|t| {
            visited.push(t.id);
            t.id % 3 != 0
        });
        assert_eq!(sorted(visited), (0..N).collect::<Vec<_>>());
        let kept: Vec<u32> = (0..N).filter(|id| id % 3 != 0).collect();
        assert_eq!(sorted(ids(&list)), kept);
        let removed: Vec<u32> = (0..N).filter(|id| id % 3 == 0).collect();
        assert_eq!(sorted(RefCell::borrow(&drops).clone()), removed);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );
    }

    /// A panic in the predicate leaves a valid list: nothing is dropped twice, and all items are
    /// dropped exactly once in the end.
    fn check_retain_panic<L: BackingListStorage<Tracked>>(swap: bool) {
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let result = catch_unwind(AssertUnwindSafe(|| {
            let f = |t: &mut Tracked| {
                if t.id == N / 2 {
                    panic!("predicate panic");
                }
                t.id % 2 == 0
            };
            if swap {
                list.swap_retain(f);
            } else {
                list.retain(f);
            }
        }));
        assert!(result.is_err());
        let in_list = ids(&list);
        let dropped = RefCell::borrow(&drops).clone();
        assert!(in_list.iter().all(|id| !dropped.contains(id)));
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );
    }

    fn check_extract_if<L: BackingListStorage<Tracked>>() {
        // Extract everything that matches.
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut visited = Vec::new();
        let extracted: Vec<Tracked> = list
            .extract_if(|t: &mut Tracked| {
                visited.push(t.id);
                t.id % 3 == 0
            })
            .collect();
        assert_eq!(visited, (0..N).collect::<Vec<_>>());
        assert_eq!(
            ids(&extracted),
            (0..N).filter(|id| id % 3 == 0).collect::<Vec<_>>()
        );
        assert_eq!(
            ids(&list),
            (0..N).filter(|id| id % 3 != 0).collect::<Vec<_>>()
        );
        assert!(RefCell::borrow(&drops).is_empty());
        drop(extracted);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );

        // Drop the iterator early: the unvisited items stay in order.
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut iter = list.extract_if(|t: &mut Tracked| t.id % 2 == 1);
        assert_eq!(iter.next().map(|t| t.id), Some(1));
        assert_eq!(iter.next().map(|t| t.id), Some(3));
        drop(iter);
        let mut expected = vec![0, 2];
        expected.extend(4..N);
        assert_eq!(ids(&list), expected);
        assert_eq!(sorted(RefCell::borrow(&drops).clone()), vec![1, 3]);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );

        // Extract nothing, and all.
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        assert_eq!(list.extract_if(|_: &mut Tracked| false).count(), 0);
        assert_eq!(ids(&list), (0..N).collect::<Vec<_>>());
        assert_eq!(list.extract_if(|_: &mut Tracked| true).count(), N as usize);
        assert!(list.is_empty());
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );
        // The list is still usable.
        list.push(Tracked {
            id: N,
            drops: drops.clone(),
        });
        assert_eq!(ids(&list), vec![N]);
    }

    /// A panic in the predicate: the extracted items so far are gone, all others stay in the
    /// list in order, and nothing is dropped twice.
    fn check_extract_if_panic<L: BackingListStorage<Tracked>>() {
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut extracted = Vec::new();
        let result = catch_unwind(AssertUnwindSafe(|| {
            for t in list.extract_if(|t: &mut Tracked| {
                if t.id == N / 2 {
                    panic!("predicate panic");
                }
                t.id % 2 == 0
            }) {
                extracted.push(t);
            }
        }));
        assert!(result.is_err());
        let mut expected: Vec<u32> = (0..N / 2).filter(|id| id % 2 == 1).collect();
        expected.extend(N / 2..N);
        assert_eq!(ids(&list), expected);
        assert_eq!(
            ids(&extracted),
            (0..N / 2).filter(|id| id % 2 == 0).collect::<Vec<_>>()
        );
        assert!(RefCell::borrow(&drops).is_empty());
        drop(extracted);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );
    }

    /// Leaking the iterator leaks the items, but it's not UB (checked by Miri) and the list is
    /// still valid. Uses plain items, as Miri reports leaked heap allocations.
    fn check_extract_if_forget<L: BackingListStorage<u32>>() {
        let mut list = L::with_capacity(N as usize);
        for i in 0..N {
            list.push(i);
        }
        let mut iter = list.extract_if(|i: &mut u32| *i % 2 == 0);
        assert_eq!(iter.next(), Some(0));
        std::mem::forget(iter);
        // The remaining items are leaked, the list is empty.
        assert!(list.is_empty());
        list.push(N);
        assert_eq!(&list[..], &[N]);
    }

    /// `fold` extracts the same items as `next`, also after `next` was called, and a panic in
    /// the predicate or the `fold` closure keeps the list consistent like an early drop.
    fn check_extract_if_fold<L: BackingListStorage<Tracked>>() {
        fn push(mut acc: Vec<Tracked>, t: Tracked) -> Vec<Tracked> {
            acc.push(t);
            acc
        }

        // Full `fold`.
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut visited = Vec::new();
        let extracted = list
            .extract_if(|t: &mut Tracked| {
                visited.push(t.id);
                t.id % 3 == 0
            })
            .fold(Vec::new(), push);
        assert_eq!(visited, (0..N).collect::<Vec<_>>());
        assert_eq!(
            ids(&extracted),
            (0..N).filter(|id| id % 3 == 0).collect::<Vec<_>>()
        );
        assert_eq!(
            ids(&list),
            (0..N).filter(|id| id % 3 != 0).collect::<Vec<_>>()
        );
        assert!(RefCell::borrow(&drops).is_empty());
        drop(extracted);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );

        // `next` first (leaving a gap), then `fold` the rest.
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut iter = list.extract_if(|t: &mut Tracked| t.id % 2 == 1);
        let first = iter.next().unwrap();
        assert_eq!(first.id, 1);
        let rest = iter.fold(vec![first], push);
        assert_eq!(
            ids(&rest),
            (0..N).filter(|id| id % 2 == 1).collect::<Vec<_>>()
        );
        assert_eq!(
            ids(&list),
            (0..N).filter(|id| id % 2 == 0).collect::<Vec<_>>()
        );
        drop(rest);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );

        // A panic in the predicate during `fold`.
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut extracted = Vec::new();
        let result = catch_unwind(AssertUnwindSafe(|| {
            list.extract_if(|t: &mut Tracked| {
                if t.id == N / 2 {
                    panic!("predicate panic");
                }
                t.id % 2 == 0
            })
            .fold((), |(), t| extracted.push(t))
        }));
        assert!(result.is_err());
        let mut expected: Vec<u32> = (0..N / 2).filter(|id| id % 2 == 1).collect();
        expected.extend(N / 2..N);
        assert_eq!(ids(&list), expected);
        assert_eq!(
            ids(&extracted),
            (0..N / 2).filter(|id| id % 2 == 0).collect::<Vec<_>>()
        );
        assert!(RefCell::borrow(&drops).is_empty());
        drop(extracted);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );

        // A panic in the `fold` closure: the item passed to it is dropped while unwinding, the
        // unvisited items stay in order.
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let result = catch_unwind(AssertUnwindSafe(|| {
            list.extract_if(|t: &mut Tracked| t.id % 2 == 0)
                .fold((), |(), t| {
                    if t.id == 4 {
                        panic!("fold panic");
                    }
                })
        }));
        assert!(result.is_err());
        let mut expected = vec![1, 3];
        expected.extend(5..N);
        assert_eq!(ids(&list), expected);
        assert_eq!(sorted(RefCell::borrow(&drops).clone()), vec![0, 2, 4]);
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..N).collect::<Vec<_>>()
        );

        // Fused: `None` after the end.
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list: L = make(N, &drops);
        let mut iter = list.extract_if(|t: &mut Tracked| t.id == 0);
        assert_eq!(iter.next().map(|t| t.id), Some(0));
        assert!(iter.next().is_none());
        assert!(iter.next().is_none());
    }

    fn check_all<L: BackingListStorage<Tracked>>() {
        check_retain::<L>();
        check_swap_retain::<L>();
        check_retain_panic::<L>(false);
        check_retain_panic::<L>(true);
        check_extract_if::<L>();
        check_extract_if_panic::<L>();
        check_extract_if_fold::<L>();
    }

    #[test]
    fn list_tiny_vec_heap() {
        check_all::<TinyVec<Tracked, 0, MAX_USEFUL_LINEAR_SCAN>>();
        check_extract_if_forget::<TinyVec<u32, 0, MAX_USEFUL_LINEAR_SCAN>>();
    }

    #[test]
    fn list_tiny_vec_inline() {
        // Spills to the heap for `N` items.
        check_all::<TinyVec<Tracked, 4, MAX_USEFUL_LINEAR_SCAN>>();
        // Stays inline.
        check_all::<TinyVec<Tracked, { N as usize }, MAX_USEFUL_LINEAR_SCAN>>();
        check_extract_if_forget::<TinyVec<u32, { N as usize }, MAX_USEFUL_LINEAR_SCAN>>();
    }

    #[test]
    fn list_vec() {
        check_all::<Vec<Tracked>>();
        check_extract_if_forget::<Vec<u32>>();
    }

    #[test]
    fn list_array_vec() {
        check_all::<ArrayVec<Tracked, MAX_USEFUL_LINEAR_SCAN>>();
        check_extract_if_forget::<ArrayVec<u32, MAX_USEFUL_LINEAR_SCAN>>();
    }

    fn check_zst<L: BackingListStorage<()>>() {
        let mut list = L::with_capacity(10);
        for _ in 0..10 {
            list.push(());
        }
        let mut i = 0;
        let extracted = list
            .extract_if(|_: &mut ()| {
                i += 1;
                i % 2 == 0
            })
            .count();
        assert_eq!(extracted, 5);
        assert_eq!(list.len(), 5);
        let mut iter = list.extract_if(|_: &mut ()| true);
        iter.next();
        drop(iter);
        assert_eq!(list.len(), 4);
        list.retain(|_| false);
        assert!(list.is_empty());
    }

    #[test]
    fn list_zst() {
        check_zst::<TinyVec<(), 0, MAX_USEFUL_LINEAR_SCAN>>();
        check_zst::<TinyVec<(), 4, MAX_USEFUL_LINEAR_SCAN>>();
        check_zst::<Vec<()>>();
        check_zst::<ArrayVec<(), MAX_USEFUL_LINEAR_SCAN>>();
    }
}
