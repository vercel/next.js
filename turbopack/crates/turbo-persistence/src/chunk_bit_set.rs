/// A set of positions below [`ChunkBitSet::CAPACITY`], stored inline as a bitset. It tracks the
/// keys of a batched lookup chunk that have been found already.
pub(crate) struct ChunkBitSet {
    words: [u64; ChunkBitSet::CAPACITY / 64],
    len: usize,
}

const _: () = assert!(
    ChunkBitSet::CAPACITY.is_multiple_of(64),
    "`ChunkBitSet` stores its positions in whole words"
);

impl ChunkBitSet {
    /// The number of positions the set can hold.
    pub(crate) const CAPACITY: usize = 256;

    pub(crate) const fn new() -> Self {
        Self {
            words: [0; Self::CAPACITY / 64],
            len: 0,
        }
    }

    /// The number of positions in the set.
    #[inline]
    pub(crate) fn len(&self) -> usize {
        self.len
    }

    /// Returns whether `position` is in the set. Panics if `position >= Self::CAPACITY`.
    #[inline]
    pub(crate) fn contains(&self, position: usize) -> bool {
        self.words[position / 64] & (1 << (position % 64)) != 0
    }

    /// Adds `position` to the set and returns whether it was not in the set yet. Panics if
    /// `position >= Self::CAPACITY`.
    #[inline]
    pub(crate) fn insert(&mut self, position: usize) -> bool {
        let word = &mut self.words[position / 64];
        let bit = 1 << (position % 64);
        let inserted = *word & bit == 0;
        *word |= bit;
        self.len += usize::from(inserted);
        inserted
    }
}

#[cfg(test)]
mod tests {
    use crate::chunk_bit_set::ChunkBitSet;

    #[test]
    fn inserts_positions() {
        let mut set = ChunkBitSet::new();
        assert_eq!(set.len(), 0);
        assert!((0..ChunkBitSet::CAPACITY).all(|position| !set.contains(position)));
        let inserted = [0, 1, 63, 64, 127, 128, 200, 255];
        for (count, position) in inserted.into_iter().enumerate() {
            assert!(set.insert(position));
            assert_eq!(set.len(), count + 1);
        }
        // Inserting a position again doesn't change the set.
        assert!(!set.insert(64));
        assert_eq!(set.len(), inserted.len());
        for position in 0..ChunkBitSet::CAPACITY {
            assert_eq!(
                set.contains(position),
                inserted.contains(&position),
                "{position}"
            );
        }
    }

    #[test]
    #[should_panic]
    fn insert_out_of_bounds_panics() {
        ChunkBitSet::new().insert(ChunkBitSet::CAPACITY);
    }
}
