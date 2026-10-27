//! The storage of the blocks of a [`Bitset`](crate::Bitset).

use arrayvec::ArrayVec;
use smallvec::SmallVec;

/// A growable list of `usize` blocks that a [`Bitset`](crate::Bitset) stores its bits in.
///
/// Implemented for:
///
/// - `Vec<usize>` (the default): grows without a limit, and [`shrink_to_fit`] releases all spare
///   capacity.
/// - `SmallVec<[usize; N]>`: stores up to `N` blocks inline and moves to the heap beyond that, like
///   a `Vec`. [`shrink_to_fit`] moves the blocks back inline when they fit.
/// - `ArrayVec<usize, N>`: always stores the blocks inline, so it holds at most `N` blocks. Growing
///   beyond that panics, and [`shrink_to_fit`] can't release anything.
///
/// The methods follow the `Vec` methods of the same name. Every method that adds blocks panics if
/// the result would exceed [`max_len`] blocks. Collecting more blocks than that from an iterator
/// (`FromIterator`) panics the same way.
///
/// [`shrink_to_fit`]: BlockStorage::shrink_to_fit
/// [`max_len`]: BlockStorage::max_len
pub trait BlockStorage: Clone + FromIterator<usize> {
    /// Creates an empty storage without allocating.
    fn new() -> Self;

    /// Creates an empty storage with capacity for at least `capacity` blocks.
    ///
    /// The capacity is exact if the storage needs to allocate for it.
    fn with_capacity(capacity: usize) -> Self;

    /// The maximum number of blocks that the storage can hold.
    fn max_len() -> usize;

    /// The number of blocks that the storage can hold without reallocating.
    fn capacity(&self) -> usize;

    /// The capacity that a storage of `len` blocks has after [`BlockStorage::shrink_to_fit`]. A
    /// set only moves its blocks to shrink the storage if this is below the current capacity.
    fn shrunk_capacity(len: usize) -> usize;

    /// The stored blocks.
    fn as_slice(&self) -> &[usize];

    /// The stored blocks, mutably.
    fn as_mut_slice(&mut self) -> &mut [usize];

    /// Resizes the storage to `len` blocks, appending zero blocks if it grows.
    fn resize(&mut self, len: usize);

    /// Appends `blocks`.
    fn extend_from_slice(&mut self, blocks: &[usize]);

    /// Reserves capacity for exactly `additional` more blocks, if the storage allocates.
    fn reserve_exact(&mut self, additional: usize);

    /// Keeps the first `len` blocks, dropping the rest.
    fn truncate(&mut self, len: usize);

    /// Removes the first `len` blocks, moving the others to the front.
    fn remove_prefix(&mut self, len: usize);

    /// Removes all blocks, keeping the capacity.
    fn clear(&mut self);

    /// Releases as much capacity as possible.
    fn shrink_to_fit(&mut self);
}

// The methods are `#[inline]`: the `Vec` implementation isn't generic, so without it its small
// wrappers would stay out of line in other crates, in the hot paths of every operation.

impl BlockStorage for Vec<usize> {
    #[inline]
    fn new() -> Self {
        Vec::new()
    }

    #[inline]
    fn with_capacity(capacity: usize) -> Self {
        Vec::with_capacity(capacity)
    }

    #[inline]
    fn max_len() -> usize {
        usize::MAX
    }

    #[inline]
    fn capacity(&self) -> usize {
        self.capacity()
    }

    #[inline]
    fn shrunk_capacity(len: usize) -> usize {
        len
    }

    #[inline]
    fn as_slice(&self) -> &[usize] {
        self
    }

    #[inline]
    fn as_mut_slice(&mut self) -> &mut [usize] {
        self
    }

    #[inline]
    fn resize(&mut self, len: usize) {
        self.resize(len, 0);
    }

    #[inline]
    fn extend_from_slice(&mut self, blocks: &[usize]) {
        self.extend_from_slice(blocks);
    }

    #[inline]
    fn reserve_exact(&mut self, additional: usize) {
        self.reserve_exact(additional);
    }

    #[inline]
    fn truncate(&mut self, len: usize) {
        self.truncate(len);
    }

    #[inline]
    fn remove_prefix(&mut self, len: usize) {
        self.drain(..len);
    }

    #[inline]
    fn clear(&mut self) {
        self.clear();
    }

    #[inline]
    fn shrink_to_fit(&mut self) {
        self.shrink_to_fit();
    }
}

impl<const N: usize> BlockStorage for SmallVec<[usize; N]> {
    #[inline]
    fn new() -> Self {
        SmallVec::new()
    }

    #[inline]
    fn with_capacity(capacity: usize) -> Self {
        SmallVec::with_capacity(capacity)
    }

    #[inline]
    fn max_len() -> usize {
        usize::MAX
    }

    #[inline]
    fn capacity(&self) -> usize {
        self.capacity()
    }

    #[inline]
    fn shrunk_capacity(len: usize) -> usize {
        len.max(N)
    }

    #[inline]
    fn as_slice(&self) -> &[usize] {
        self
    }

    #[inline]
    fn as_mut_slice(&mut self) -> &mut [usize] {
        self
    }

    #[inline]
    fn resize(&mut self, len: usize) {
        self.resize(len, 0);
    }

    #[inline]
    fn extend_from_slice(&mut self, blocks: &[usize]) {
        self.extend_from_slice(blocks);
    }

    #[inline]
    fn reserve_exact(&mut self, additional: usize) {
        self.reserve_exact(additional);
    }

    #[inline]
    fn truncate(&mut self, len: usize) {
        self.truncate(len);
    }

    #[inline]
    fn remove_prefix(&mut self, len: usize) {
        self.drain(..len);
    }

    #[inline]
    fn clear(&mut self) {
        self.clear();
    }

    #[inline]
    fn shrink_to_fit(&mut self) {
        self.shrink_to_fit();
    }
}

/// Panics because an `ArrayVec` with capacity `N` can't hold `len` blocks.
#[cold]
#[track_caller]
fn array_overflow<const N: usize>(len: usize) -> ! {
    panic!("a Bitset storage of ArrayVec<usize, {N}> can't hold {len} blocks")
}

impl<const N: usize> BlockStorage for ArrayVec<usize, N> {
    #[inline]
    fn new() -> Self {
        ArrayVec::new()
    }

    #[inline]
    #[track_caller]
    fn with_capacity(capacity: usize) -> Self {
        if capacity > N {
            array_overflow::<N>(capacity);
        }
        ArrayVec::new()
    }

    #[inline]
    fn max_len() -> usize {
        N
    }

    #[inline]
    fn capacity(&self) -> usize {
        N
    }

    #[inline]
    fn shrunk_capacity(_len: usize) -> usize {
        N
    }

    #[inline]
    fn as_slice(&self) -> &[usize] {
        self
    }

    #[inline]
    fn as_mut_slice(&mut self) -> &mut [usize] {
        self
    }

    #[inline]
    #[track_caller]
    fn resize(&mut self, len: usize) {
        if len > N {
            array_overflow::<N>(len);
        }
        if len <= self.len() {
            self.truncate(len);
        } else {
            for _ in self.len()..len {
                self.push(0);
            }
        }
    }

    #[inline]
    #[track_caller]
    fn extend_from_slice(&mut self, blocks: &[usize]) {
        if self.try_extend_from_slice(blocks).is_err() {
            array_overflow::<N>(self.len() + blocks.len());
        }
    }

    #[inline]
    #[track_caller]
    fn reserve_exact(&mut self, additional: usize) {
        if self.len() + additional > N {
            array_overflow::<N>(self.len() + additional);
        }
    }

    #[inline]
    fn truncate(&mut self, len: usize) {
        self.truncate(len);
    }

    #[inline]
    fn remove_prefix(&mut self, len: usize) {
        self.drain(..len);
    }

    #[inline]
    fn clear(&mut self) {
        self.clear();
    }

    #[inline]
    fn shrink_to_fit(&mut self) {}
}
