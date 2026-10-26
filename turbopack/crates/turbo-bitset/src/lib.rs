//! A fast bitset for algorithms that work on a bounded range of `u32` indices.
//!
//! [`Bitset`] stores its bits in `usize` blocks, but only for a range of blocks around the used
//! ones: the bitset keeps an offset (counted in whole blocks) and stores bit `i` at
//! `i - offset * usize::BITS`. A set whose bits are clustered at high indices therefore doesn't
//! allocate the empty blocks below them. Like a `Vec`, the storage grows with amortized growth,
//! at the front as well as at the back.
//!
//! The blocks are stored in a [`SmallVec`], which keeps up to `INLINE` blocks inline without a heap
//! allocation (see [`Bitset`]). The default, `Bitset<0>`, always stores its blocks on the heap.
//!
//! Compared to a `RoaringBitmap`, which is optimized for compact storage, every operation is a
//! simple loop over machine words. That makes unions and subset checks fast when the bits span a
//! limited range, at the cost of using one bit of memory per index in that range.
//!
//! The bincode encoding (see the `encode` module) stores either the trimmed bytes of the range or,
//! if that is clearly smaller, the delta-encoded list of bits, so sparse sets stay compact when
//! persisted while dense ones are copied in bulk.

mod encode;

use std::{
    fmt,
    hash::{Hash, Hasher},
    ops::{BitAnd, BitOrAssign, Sub},
};

use roaring::RoaringBitmap;
use shrink_to_fit::ShrinkToFit;
use smallvec::SmallVec;

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
/// `INLINE` is the number of `usize` blocks stored inline, without a heap allocation. A set with
/// more blocks stores all of them on the heap. The default of 0 has the size of a `Vec`.
#[derive(Clone, Default)]
pub struct Bitset<const INLINE: usize = 0> {
    /// The index of the first stored block, i.e. the first stored bit is
    /// `offset * usize::BITS`.
    offset: usize,
    /// The stored blocks. Bit `i` of block `j` is the bit `(offset + j) * usize::BITS + i`.
    blocks: SmallVec<[usize; INLINE]>,
}

/// The number of blocks that hold the bits `0..bits`.
fn blocks_for(bits: u32) -> usize {
    (bits as usize).div_ceil(BLOCK_BITS)
}

impl<const INLINE: usize> Bitset<INLINE> {
    /// Creates an empty set without allocating.
    pub const fn new() -> Self {
        Self {
            offset: 0,
            blocks: SmallVec::new_const(),
        }
    }

    /// Creates an empty set that stores the blocks for the bits `0..bits`, so that inserting any of
    /// them doesn't grow the storage.
    ///
    /// The storage holds exactly these blocks: they are stored inline if they fit, otherwise in a
    /// heap allocation without spare capacity.
    pub fn with_len(bits: u32) -> Self {
        Self {
            offset: 0,
            blocks: SmallVec::from_elem(0, blocks_for(bits)),
        }
    }

    /// Creates an empty set with capacity for the blocks of `bits` bits, but without storing any
    /// block yet.
    ///
    /// The stored range starts at the first inserted bit. Inserts don't reallocate as long as the
    /// stored range fits into the capacity, e.g. when all inserted bits are below `bits`.
    pub fn with_capacity(bits: u32) -> Self {
        Self {
            offset: 0,
            blocks: SmallVec::with_capacity(blocks_for(bits)),
        }
    }

    /// The stored blocks.
    fn blocks(&self) -> &[usize] {
        &self.blocks
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

    /// The position of `block` in the stored blocks, if it is stored.
    ///
    /// A block below the offset wraps around to a huge position, so a single comparison against
    /// the length checks both ends of the range.
    fn position(&self, block: usize) -> Option<usize> {
        let position = block.wrapping_sub(self.offset);
        (position < self.blocks.len()).then_some(position)
    }

    /// Makes sure that the blocks `start..end` are stored, keeping all existing bits.
    ///
    /// Growth at the back uses the amortized growth of the `SmallVec`. Growth at the front is
    /// amortized the same way: the existing blocks are moved so that the stored range ends at the
    /// end of the capacity, which leaves all spare capacity in front of them. Further growth at the
    /// front then only uses that headroom, without moving the blocks again, until it is used up. If
    /// the new range doesn't fit into the capacity, the storage is reallocated with at least twice
    /// the capacity, copying the existing blocks once, directly to their new position.
    #[cold]
    fn ensure_blocks(&mut self, start: usize, end: usize) {
        debug_assert!(start < end);
        let len = self.blocks.len();
        if len == 0 {
            self.offset = start;
            self.blocks.resize(end - start, 0);
            return;
        }
        let new_start = start.min(self.offset);
        let new_end = end.max(self.offset + len);
        if new_start == self.offset {
            // Only grow at the back.
            self.blocks.resize(new_end - new_start, 0);
            return;
        }
        let new_len = new_end - new_start;
        let capacity = if new_len <= self.blocks.capacity() {
            self.blocks.capacity()
        } else {
            // The same amortized growth as `SmallVec::reserve`.
            new_len.max(self.blocks.capacity() * 2)
        };
        // End the stored range at the end of the capacity, but don't go below block 0. This is at
        // most `new_start`, as the capacity holds the new range.
        let new_start = new_end.saturating_sub(capacity);
        let new_len = new_end - new_start;
        let shift = self.offset - new_start;
        if capacity == self.blocks.capacity() {
            // Move the existing blocks up within the capacity and clear the blocks before them.
            self.blocks.resize(new_len, 0);
            self.blocks.copy_within(..len, shift);
            self.blocks[..shift].fill(0);
        } else {
            let mut blocks = SmallVec::with_capacity(capacity);
            blocks.resize(shift, 0);
            blocks.extend_from_slice(&self.blocks);
            blocks.resize(new_len, 0);
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
        let block = &mut self.blocks[position];
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
        let block = &mut self.blocks[position];
        let removed = *block & mask != 0;
        *block &= !mask;
        removed
    }

    /// Returns whether `bit` is in the set.
    pub fn contains(&self, bit: u32) -> bool {
        let bit = bit as usize;
        match self.position(bit / BLOCK_BITS) {
            Some(position) => self.blocks[position] & (1 << (bit % BLOCK_BITS)) != 0,
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
    pub fn union_with(&mut self, other: &Self) -> bool {
        if other.offset >= self.offset && other.end() <= self.end() {
            // The stored range of `other` lies within the set's range, so its blocks can be added
            // without trimming or growing.
            let start = other.offset - self.offset;
            return or_blocks(
                &mut self.blocks[start..start + other.blocks.len()],
                &other.blocks,
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
            &mut self.blocks[start..start + other_blocks.len()],
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

    /// Converts the set into a [`RoaringBitmap`] with the same bits.
    ///
    /// This builds every roaring container (a range of 2^16 bits) directly from the stored blocks
    /// instead of inserting each bit, and produces the same container types as inserting the bits
    /// one by one would, so the result is equal (and serializes identically) to an inserted one.
    pub fn to_roaring(&self) -> RoaringBitmap {
        /// The number of blocks per roaring container.
        const CONTAINER_BLOCKS: usize = (1 << 16) / BLOCK_BITS;
        /// Roaring stores a container with up to this many bits as a sorted array.
        const ROARING_ARRAY_LIMIT: u32 = 4096;

        let (first_block, blocks) = self.trimmed();
        let end = first_block + blocks.len();
        let mut result = RoaringBitmap::new();
        let mut bytes = Vec::new();
        let mut index = first_block;
        while index < end {
            let chunk_end = ((index / CONTAINER_BLOCKS + 1) * CONTAINER_BLOCKS).min(end);
            let chunk = &blocks[index - first_block..chunk_end - first_block];
            let count = chunk.iter().map(|b| b.count_ones()).sum::<u32>();
            let part = if count == 0 {
                None
            } else if count == ROARING_ARRAY_LIMIT {
                // `from_lsb0_bytes` stores exactly this many bits as a bitmap, but inserting them
                // stores them as an array, so insert them instead.
                let bits = Iter {
                    blocks: chunk,
                    block_index: index,
                    current: 0,
                };
                Some(
                    RoaringBitmap::from_sorted_iter(bits)
                        .expect("the bits of an Bitset are iterated in ascending order"),
                )
            } else {
                bytes.clear();
                bytes.extend(chunk.iter().flat_map(|block| block.to_le_bytes()));
                // A chunk is at most one container, so the range fits into `u32`.
                Some(RoaringBitmap::from_lsb0_bytes(
                    (index * BLOCK_BITS) as u32,
                    &bytes,
                ))
            };
            if let Some(part) = part {
                if result.is_empty() {
                    result = part;
                } else {
                    // The parts are in different containers, so this only adds containers.
                    result |= part;
                }
            }
            index = chunk_end;
        }
        result
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
            &self.blocks[start - self.offset..end - self.offset],
            &other.blocks[start - other.offset..end - other.offset],
        )
    }

    /// Returns the set of bits that are in both sets.
    pub fn intersection(&self, other: &Self) -> Self {
        let (start, a, b) = self.overlap(other);
        let blocks: SmallVec<[usize; INLINE]> = a.iter().zip(b).map(|(&a, &b)| a & b).collect();
        if blocks.is_empty() {
            return Self::new();
        }
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
        for (block, &other_block) in result.blocks[position..].iter_mut().zip(b) {
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

impl<const INLINE: usize> BitAnd for &Bitset<INLINE> {
    type Output = Bitset<INLINE>;

    fn bitand(self, rhs: Self) -> Bitset<INLINE> {
        self.intersection(rhs)
    }
}

impl<const INLINE: usize> Sub for &Bitset<INLINE> {
    type Output = Bitset<INLINE>;

    fn sub(self, rhs: Self) -> Bitset<INLINE> {
        self.difference(rhs)
    }
}

impl<const INLINE: usize> ShrinkToFit for Bitset<INLINE> {
    /// Drops the leading and trailing zero blocks of the storage and releases its spare capacity,
    /// which moves the blocks inline if they fit.
    fn shrink_to_fit(&mut self) {
        let Some(first) = self.blocks.iter().position(|&b| b != 0) else {
            *self = Self::new();
            return;
        };
        let last = self.blocks.iter().rposition(|&b| b != 0).unwrap_or(first);
        self.blocks.truncate(last + 1);
        self.blocks.drain(..first);
        self.offset += first;
        self.blocks.shrink_to_fit();
    }
}

impl<const INLINE: usize> BitOrAssign<&Bitset<INLINE>> for Bitset<INLINE> {
    fn bitor_assign(&mut self, rhs: &Bitset<INLINE>) {
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

impl<const INLINE: usize> Extend<u32> for Bitset<INLINE> {
    /// Inserts every bit of `iter`. The storage grows with amortized growth at both ends, so the
    /// order of the bits doesn't matter.
    fn extend<T: IntoIterator<Item = u32>>(&mut self, iter: T) {
        for bit in iter {
            self.insert(bit);
        }
    }
}

impl<const INLINE: usize> FromIterator<u32> for Bitset<INLINE> {
    fn from_iter<T: IntoIterator<Item = u32>>(iter: T) -> Self {
        let mut set = Self::new();
        set.extend(iter);
        set
    }
}

impl<const INLINE: usize> PartialEq for Bitset<INLINE> {
    fn eq(&self, other: &Self) -> bool {
        self.trimmed() == other.trimmed()
    }
}

impl<const INLINE: usize> Eq for Bitset<INLINE> {}

impl<const INLINE: usize> Hash for Bitset<INLINE> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.trimmed().hash(state);
    }
}

impl<const INLINE: usize> fmt::Debug for Bitset<INLINE> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_set().entries(self.iter()).finish()
    }
}

impl<'a, const INLINE: usize> IntoIterator for &'a Bitset<INLINE> {
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
mod tests;
