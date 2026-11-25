//! A fast bitset for algorithms that work on a bounded range of `u32` indices.
//!
//! [`Bitset`] stores its bits in `usize` blocks, but only for a range of blocks around the used
//! ones: the bitset keeps an offset (counted in whole blocks) and stores bit `i` at
//! `i - offset * usize::BITS`. A set whose bits are clustered at high indices therefore doesn't
//! allocate the empty blocks below them. Like a `Vec`, the storage grows with amortized growth,
//! at the front as well as at the back.
//!
//! The blocks are stored in a [`BlockStorage`]: a `Vec<usize>` by default, or a
//! `SmallVec<[usize; N]>` or `ArrayVec<usize, N>` to keep small sets inline, e.g.
//! `Bitset<SmallVec<[usize; 2]>>`.
//!
//! Every operation is a simple loop over machine words. That makes unions and subset checks fast
//! when the bits span a limited range, at the cost of using one bit of memory per index in that
//! range.
//!
//! The bincode encoding (see the `encode` module) stores either the trimmed bytes of the range or,
//! if that is clearly smaller, the delta-encoded list of bits, so sparse sets stay compact when
//! persisted while dense ones are copied in bulk.

mod encode;
mod storage;

use std::{
    fmt,
    hash::{Hash, Hasher},
    ops::{BitAnd, BitOrAssign, Sub},
};

use shrink_to_fit::ShrinkToFit;

pub use crate::storage::BlockStorage;

/// Number of bits per storage block.
const BLOCK_BITS: usize = usize::BITS as usize;

/// The number of blocks that the subset check compares before it branches on the result. Reducing
/// a whole chunk first lets the compiler vectorize the comparison.
const CHUNK_BLOCKS: usize = 4;

/// A set of `u32` indices stored as `usize` blocks that only cover the block-aligned range between
/// the lowest and the highest stored bit.
///
/// The storage grows at the front or the back when a bit outside of the current range is
/// inserted. Equality and hashing only depend on which bits are set, not on the storage range.
///
/// `S` is the storage of the blocks, see [`BlockStorage`]. With a storage of limited size (an
/// `ArrayVec`), every operation that needs more blocks than the storage holds panics, and decoding
/// such a set returns an error.
#[derive(Clone)]
pub struct Bitset<S: BlockStorage = Vec<usize>> {
    /// The index of the first stored block, i.e. the first stored bit is
    /// `offset * usize::BITS`.
    offset: usize,
    /// The stored blocks. Bit `i` of block `j` is the bit `(offset + j) * usize::BITS + i`.
    blocks: S,
}

impl<S: BlockStorage> Default for Bitset<S> {
    fn default() -> Self {
        Self::new()
    }
}

/// The number of blocks that hold the bits `0..bits`.
fn blocks_for(bits: u32) -> usize {
    (bits as usize).div_ceil(BLOCK_BITS)
}

impl<S: BlockStorage> Bitset<S> {
    /// Creates an empty set without allocating.
    pub fn new() -> Self {
        Self {
            offset: 0,
            blocks: S::new(),
        }
    }

    /// Creates an empty set that stores the blocks for the bits `0..bits`, so that inserting any of
    /// them doesn't grow the storage.
    ///
    /// If the storage allocates, it holds exactly these blocks, without spare capacity. Panics if
    /// the storage can't hold that many blocks.
    pub fn with_len(bits: u32) -> Self {
        let len = blocks_for(bits);
        let mut blocks = S::with_capacity(len);
        blocks.resize(len);
        Self { offset: 0, blocks }
    }

    /// Creates an empty set with capacity for the blocks of `bits` bits, but without storing any
    /// block yet.
    ///
    /// The stored range starts at the first inserted bit. Inserts don't reallocate as long as the
    /// stored range fits into the capacity, e.g. when all inserted bits are below `bits`. Panics if
    /// the storage can't hold that many blocks.
    pub fn with_capacity(bits: u32) -> Self {
        Self {
            offset: 0,
            blocks: S::with_capacity(blocks_for(bits)),
        }
    }

    /// The stored blocks.
    fn blocks(&self) -> &[usize] {
        self.blocks.as_slice()
    }

    /// The stored blocks, mutably.
    fn blocks_mut(&mut self) -> &mut [usize] {
        self.blocks.as_mut_slice()
    }

    /// The index of the block after the last stored block.
    fn end(&self) -> usize {
        self.offset + self.blocks().len()
    }

    /// The stored blocks with leading and trailing zero blocks removed, together with the block
    /// index of the first returned block. The empty set always returns `(0, &[])`.
    fn trimmed(&self) -> (usize, &[usize]) {
        let blocks = self.blocks();
        let Some(first) = blocks.iter().position(|&b| b != 0) else {
            return (0, &[]);
        };
        // There is a non-zero block, so `rposition` finds one.
        let last = blocks.iter().rposition(|&b| b != 0).unwrap_or(first);
        (self.offset + first, &blocks[first..=last])
    }

    /// Drops the leading and trailing zero blocks from the storage, keeping its capacity.
    fn trim_storage(&mut self) {
        let blocks = self.blocks();
        let Some(first) = blocks.iter().position(|&b| b != 0) else {
            self.blocks.clear();
            self.offset = 0;
            return;
        };
        let last = blocks.iter().rposition(|&b| b != 0).unwrap_or(first);
        self.blocks.truncate(last + 1);
        self.blocks.remove_prefix(first);
        self.offset += first;
    }

    /// The position of `block` in the stored blocks, if it is stored.
    ///
    /// A block below the offset wraps around to a huge position, so a single comparison against
    /// the length checks both ends of the range.
    fn position(&self, block: usize) -> Option<usize> {
        let position = block.wrapping_sub(self.offset);
        (position < self.blocks().len()).then_some(position)
    }

    /// Makes sure that the blocks `start..end` are stored, keeping all existing bits.
    ///
    /// Growth at the back uses the amortized growth of the storage. Growth at the front is
    /// amortized the same way: the existing blocks are moved so that the stored range ends at the
    /// end of the capacity, which leaves all spare capacity in front of them. Further growth at the
    /// front then only uses that headroom, without moving the blocks again, until it is used up. If
    /// the new range doesn't fit into the capacity, the storage is reallocated with at least twice
    /// the capacity (but at most the storage's maximum length), copying the existing blocks once,
    /// directly to their new position.
    ///
    /// If the new range exceeds the storage's maximum length, which the zero blocks left by the
    /// front growth can cause with a storage of limited size, the zero blocks at both ends of the
    /// storage are dropped first. Panics if the storage still can't hold the new range.
    #[cold]
    fn ensure_blocks(&mut self, start: usize, end: usize) {
        debug_assert!(start < end);
        let mut len = self.blocks().len();
        if len > 0 && end.max(self.offset + len) - start.min(self.offset) > S::max_len() {
            self.trim_storage();
            len = self.blocks().len();
        }
        if len == 0 {
            self.blocks.resize(end - start);
            self.offset = start;
            return;
        }
        let new_start = start.min(self.offset);
        let new_end = end.max(self.offset + len);
        if new_start == self.offset {
            // Only grow at the back.
            self.blocks.resize(new_end - new_start);
            return;
        }
        let new_len = new_end - new_start;
        let capacity = if new_len <= self.blocks.capacity() {
            self.blocks.capacity()
        } else {
            // The same amortized growth as `Vec::reserve`, limited to what the storage can hold. A
            // range beyond that keeps `new_len`, so allocating the storage panics.
            new_len.max((self.blocks.capacity() * 2).min(S::max_len()))
        };
        // End the stored range at the end of the capacity, but don't go below block 0. This is at
        // most `new_start`, as the capacity holds the new range.
        let new_start = new_end.saturating_sub(capacity);
        let new_len = new_end - new_start;
        let shift = self.offset - new_start;
        if capacity == self.blocks.capacity() {
            // Move the existing blocks up within the capacity and clear the blocks before them.
            self.blocks.resize(new_len);
            let blocks = self.blocks_mut();
            blocks.copy_within(..len, shift);
            blocks[..shift].fill(0);
        } else {
            let mut blocks = S::with_capacity(capacity);
            blocks.resize(shift);
            blocks.extend_from_slice(self.blocks());
            blocks.resize(new_len);
            self.blocks = blocks;
        }
        self.offset = new_start;
    }

    /// Adds `bit` to the set. Returns whether it wasn't in the set before.
    pub fn insert(&mut self, bit: u32) -> bool {
        let bit = bit as usize;
        let block = bit / BLOCK_BITS;
        let position = match self.position(block) {
            Some(position) => position,
            None => {
                self.ensure_blocks(block, block + 1);
                block - self.offset
            }
        };
        let mask = 1 << (bit % BLOCK_BITS);
        let block = &mut self.blocks_mut()[position];
        let added = *block & mask == 0;
        *block |= mask;
        added
    }

    /// Removes `bit` from the set. Returns whether it was in the set.
    ///
    /// This never shrinks the storage.
    pub fn remove(&mut self, bit: u32) -> bool {
        let bit = bit as usize;
        let Some(position) = self.position(bit / BLOCK_BITS) else {
            return false;
        };
        let mask = 1 << (bit % BLOCK_BITS);
        let block = &mut self.blocks_mut()[position];
        let removed = *block & mask != 0;
        *block &= !mask;
        removed
    }

    /// Returns whether `bit` is in the set.
    pub fn contains(&self, bit: u32) -> bool {
        let bit = bit as usize;
        match self.position(bit / BLOCK_BITS) {
            Some(position) => self.blocks()[position] & (1 << (bit % BLOCK_BITS)) != 0,
            None => false,
        }
    }

    /// Returns whether the set has no bits.
    pub fn is_zero(&self) -> bool {
        self.blocks().iter().all(|&b| b == 0)
    }

    /// Returns the number of bits in the set.
    ///
    /// This counts the bits of every stored block, so it takes time proportional to the stored
    /// range.
    pub fn count_ones(&self) -> usize {
        self.blocks().iter().map(|b| b.count_ones() as usize).sum()
    }

    /// Iterates over the bits in the set in ascending order.
    pub fn iter(&self) -> Iter<'_> {
        Iter {
            blocks: self.blocks(),
            block_index: self.offset,
            current: 0,
        }
    }

    /// Adds all bits of `other` to the set. Returns whether the set changed, i.e. whether `other`
    /// had a bit that the set didn't have.
    ///
    /// This takes a single pass over the blocks of `other`, so `if set.union_with(&other)` is
    /// cheaper than checking `other.is_subset(&set)` before adding the bits.
    ///
    /// If the set stores no blocks (e.g. a new set), this copies the blocks of `other` without its
    /// leading and trailing zero blocks, so it doesn't need a check for the empty set and a
    /// separate `clone()` before it. The copy uses the reserved capacity if it fits, otherwise a
    /// heap-allocating storage allocates exactly the copied blocks.
    ///
    /// Panics if the storage can't hold the blocks of the union.
    pub fn union_with(&mut self, other: &Self) -> bool {
        if self.blocks().is_empty() {
            let (other_offset, other_blocks) = other.trimmed();
            if other_blocks.is_empty() {
                return false;
            }
            self.offset = other_offset;
            self.blocks.reserve_exact(other_blocks.len());
            self.blocks.extend_from_slice(other_blocks);
            return true;
        }
        if other.offset >= self.offset && other.end() <= self.end() {
            // The stored range of `other` lies within the set's range, so its blocks can be added
            // without trimming or growing.
            let start = other.offset - self.offset;
            let other_blocks = other.blocks();
            return or_blocks(
                &mut self.blocks_mut()[start..start + other_blocks.len()],
                other_blocks,
            );
        }
        let (other_offset, other_blocks) = other.trimmed();
        if other_blocks.is_empty() {
            return false;
        }
        let other_end = other_offset + other_blocks.len();
        if other_offset < self.offset || other_end > self.end() {
            // The new blocks are zero, so `or_blocks` reports the bits of `other` in them as added.
            self.ensure_blocks(other_offset, other_end);
        }
        let start = other_offset - self.offset;
        or_blocks(
            &mut self.blocks_mut()[start..start + other_blocks.len()],
            other_blocks,
        )
    }

    /// Compares the set with `other`. Returns whether the set contains every bit of `other`
    /// (superset). If `STRICT` is true, it also returns whether the set has a bit that `other`
    /// doesn't have (only meaningful if it is a superset); otherwise the second value is `false`.
    fn superset_impl<const STRICT: bool>(&self, other: &Self) -> (bool, bool) {
        let blocks = self.blocks();
        let other_blocks = other.blocks();
        let any = |blocks: &[usize]| blocks.iter().any(|&b| b != 0);

        // The range of block indices stored in both sets.
        let start = self.offset.max(other.offset);
        let end = self.end().min(other.end());
        if start >= end {
            // No overlap: `other` must be empty.
            if any(other_blocks) {
                return (false, false);
            }
            return (true, STRICT && any(blocks));
        }

        // Bits of `other` outside of the overlap aren't in the set.
        let other_start = start - other.offset;
        let other_end = end - other.offset;
        if any(&other_blocks[..other_start]) || any(&other_blocks[other_end..]) {
            return (false, false);
        }

        let self_start = start - self.offset;
        let self_end = end - self.offset;
        let a = &blocks[self_start..self_end];
        let b = &other_blocks[other_start..other_end];
        // Reduce whole chunks before branching so that the compiler can vectorize the loop.
        let mut strict_bits = 0;
        let (a_chunks, a_rest) = a.as_chunks::<CHUNK_BLOCKS>();
        let (b_chunks, b_rest) = b.as_chunks::<CHUNK_BLOCKS>();
        for (a, b) in a_chunks.iter().zip(b_chunks) {
            let mut missing = 0;
            for i in 0..CHUNK_BLOCKS {
                missing |= b[i] & !a[i];
                if STRICT {
                    strict_bits |= a[i] & !b[i];
                }
            }
            if missing != 0 {
                return (false, false);
            }
        }
        let mut missing = 0;
        for (&a, &b) in a_rest.iter().zip(b_rest) {
            missing |= b & !a;
            if STRICT {
                strict_bits |= a & !b;
            }
        }
        if missing != 0 {
            return (false, false);
        }
        let mut strict = strict_bits != 0;
        if STRICT && !strict {
            strict = any(&blocks[..self_start]) || any(&blocks[self_end..]);
        }
        (true, strict)
    }

    /// Returns whether the set contains every bit of `other`.
    pub fn is_superset(&self, other: &Self) -> bool {
        self.superset_impl::<false>(other).0
    }

    /// Returns whether every bit of the set is also in `other`.
    pub fn is_subset(&self, other: &Self) -> bool {
        other.is_superset(self)
    }

    /// Returns whether the set contains every bit of `other` and at least one bit that `other`
    /// doesn't contain.
    pub fn is_proper_superset(&self, other: &Self) -> bool {
        let (superset, strict) = self.superset_impl::<true>(other);
        superset && strict
    }

    /// The blocks of both sets over the range of block indices stored in both, and the index of
    /// the first of them. Bits outside of this range are in at most one of the sets.
    fn overlap<'a>(&'a self, other: &'a Self) -> (usize, &'a [usize], &'a [usize]) {
        let start = self.offset.max(other.offset);
        let end = self.end().min(other.end());
        if start >= end {
            return (start, &[], &[]);
        }
        (
            start,
            &self.blocks()[start - self.offset..end - self.offset],
            &other.blocks()[start - other.offset..end - other.offset],
        )
    }

    /// Returns the set of bits that are in both sets.
    pub fn intersection(&self, other: &Self) -> Self {
        let (start, a, b) = self.overlap(other);
        if a.is_empty() {
            return Self::new();
        }
        // The overlap is at most as long as the stored blocks of the set, so it fits into `S`.
        let blocks: S = a.iter().zip(b).map(|(&a, &b)| a & b).collect();
        Self {
            offset: start,
            blocks,
        }
    }

    /// Returns the set of bits that are in the set but not in `other`.
    pub fn difference(&self, other: &Self) -> Self {
        let mut result = self.clone();
        let (start, _, b) = self.overlap(other);
        if b.is_empty() {
            return result;
        }
        let position = start - self.offset;
        for (block, &other_block) in result.blocks_mut()[position..].iter_mut().zip(b) {
            *block &= !other_block;
        }
        result
    }

    /// Returns whether the sets have no bit in common.
    pub fn is_disjoint(&self, other: &Self) -> bool {
        let (_, a, b) = self.overlap(other);
        a.iter().zip(b).all(|(&a, &b)| a & b == 0)
    }

    /// Returns the number of bits that are in both sets.
    pub fn intersection_len(&self, other: &Self) -> usize {
        let (_, a, b) = self.overlap(other);
        a.iter()
            .zip(b)
            .map(|(&a, &b)| (a & b).count_ones() as usize)
            .sum()
    }
}

impl<S: BlockStorage> BitAnd for &Bitset<S> {
    type Output = Bitset<S>;

    fn bitand(self, rhs: Self) -> Bitset<S> {
        self.intersection(rhs)
    }
}

impl<S: BlockStorage> Sub for &Bitset<S> {
    type Output = Bitset<S>;

    fn sub(self, rhs: Self) -> Bitset<S> {
        self.difference(rhs)
    }
}

impl<S: BlockStorage> ShrinkToFit for Bitset<S> {
    /// Drops the leading and trailing zero blocks of the storage and releases its spare capacity.
    ///
    /// This only changes the set if the storage can get smaller (see
    /// [`BlockStorage::shrunk_capacity`]), so e.g. an `ArrayVec` storage is never touched.
    fn shrink_to_fit(&mut self) {
        let (_, trimmed) = self.trimmed();
        if S::shrunk_capacity(trimmed.len()) >= self.blocks.capacity() {
            return;
        }
        if trimmed.is_empty() {
            *self = Self::new();
            return;
        }
        self.trim_storage();
        self.blocks.shrink_to_fit();
    }
}

impl<S: BlockStorage> BitOrAssign<&Bitset<S>> for Bitset<S> {
    fn bitor_assign(&mut self, rhs: &Bitset<S>) {
        self.union_with(rhs);
    }
}

/// Adds the bits of `other` to `blocks`, which has the same length. Returns whether a bit was
/// added that `blocks` didn't have.
fn or_blocks(blocks: &mut [usize], other: &[usize]) -> bool {
    // Collect the added bits instead of branching per block, so the loop stays simple to vectorize.
    let mut added = 0;
    for (block, &other_block) in blocks.iter_mut().zip(other) {
        added |= other_block & !*block;
        *block |= other_block;
    }
    added != 0
}

impl<S: BlockStorage> Extend<u32> for Bitset<S> {
    /// Inserts every bit of `iter`. The storage grows with amortized growth at both ends, so the
    /// order of the bits doesn't matter.
    fn extend<T: IntoIterator<Item = u32>>(&mut self, iter: T) {
        for bit in iter {
            self.insert(bit);
        }
    }
}

impl<S: BlockStorage> FromIterator<u32> for Bitset<S> {
    fn from_iter<T: IntoIterator<Item = u32>>(iter: T) -> Self {
        let mut set = Self::new();
        set.extend(iter);
        set
    }
}

impl<S: BlockStorage> PartialEq for Bitset<S> {
    fn eq(&self, other: &Self) -> bool {
        self.trimmed() == other.trimmed()
    }
}

impl<S: BlockStorage> Eq for Bitset<S> {}

impl<S: BlockStorage> Hash for Bitset<S> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.trimmed().hash(state);
    }
}

impl<S: BlockStorage> fmt::Debug for Bitset<S> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_set().entries(self.iter()).finish()
    }
}

impl<'a, S: BlockStorage> IntoIterator for &'a Bitset<S> {
    type Item = u32;
    type IntoIter = Iter<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// Iterator over the bits of an [`Bitset`] in ascending order, see
/// [`Bitset::iter`].
pub struct Iter<'a> {
    /// The blocks that weren't loaded yet.
    blocks: &'a [usize],
    /// The block index of `current`.
    block_index: usize,
    /// The remaining bits of the current block.
    current: usize,
}

impl Iterator for Iter<'_> {
    type Item = u32;

    fn next(&mut self) -> Option<u32> {
        while self.current == 0 {
            let (&first, rest) = self.blocks.split_first()?;
            self.current = first;
            self.blocks = rest;
            self.block_index += 1;
        }
        let bit = self.current.trailing_zeros() as usize;
        // Clear the lowest set bit.
        self.current &= self.current - 1;
        Some(((self.block_index - 1) * BLOCK_BITS + bit) as u32)
    }
}

#[cfg(test)]
mod storage_tests;
#[cfg(test)]
mod tests;
