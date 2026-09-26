//! Key hash shards.
//!
//! The key space of a family is split into `2^bits` shards by the leading bits of the key hash.
//! Commits split their SST files at shard boundaries and compaction merges each shard on its own,
//! so SST files never span a shard boundary. Since shards are hash prefixes, doubling
//! the shard count splits every shard exactly in half.

use std::ops::RangeInclusive;

use crate::meta_file::StaticSortedFileRange;

/// The number of leading key hash bits that select the shard, i.e. a family has `2^bits` shards.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct ShardBits(u8);

impl ShardBits {
    /// The largest supported value, i.e. 4096 shards.
    pub const MAX: ShardBits = ShardBits(12);

    /// Panics if `bits` exceeds [`ShardBits::MAX`].
    pub const fn new(bits: u8) -> Self {
        assert!(bits <= Self::MAX.0, "too many shard bits");
        Self(bits)
    }

    /// The number of shards.
    pub fn count(self) -> u32 {
        1 << self.0
    }

    /// Returns the shard that contains `hash`.
    pub fn shard_of(self, hash: u64) -> u32 {
        if self.0 == 0 {
            0
        } else {
            (hash >> (u64::BITS - u32::from(self.0))) as u32
        }
    }

    /// Returns the range of key hashes in the shard `index`.
    pub fn range(self, index: u32) -> RangeInclusive<u64> {
        debug_assert!(index < self.count());
        if self.0 == 0 {
            return 0..=u64::MAX;
        }
        let shift = u64::BITS - u32::from(self.0);
        let start = u64::from(index) << shift;
        let end = start | (u64::MAX >> u32::from(self.0));
        start..=end
    }

    /// The shard bits for a family with `bytes` of compacted data, so that shards hold about
    /// `target_shard_size` bytes. Never less than `min`.
    pub fn for_size(bytes: u64, target_shard_size: u64, min: ShardBits) -> Self {
        let needed = bytes.div_ceil(target_shard_size.max(1)).max(1);
        // ceil(log2(needed))
        let bits = u64::BITS - (needed - 1).leading_zeros();
        Self(bits.min(u32::from(Self::MAX.0)) as u8).max(min)
    }
}

/// The SST files that can contain the keys of a shard, newest first, which is the order lookups
/// consult them in. The hash ranges are stored densely so that a lookup scans them sequentially.
#[derive(Default)]
pub(crate) struct ShardFiles {
    pub ranges: Box<[StaticSortedFileRange]>,
    /// For each range, the index of the meta file and of the entry in the meta file.
    pub locations: Box<[(u32, u32)]>,
}

/// The SST files of each shard of a family, so lookups only consult the files of the key's shard
/// instead of every file of the family.
pub(crate) struct ShardIndex {
    bits: ShardBits,
    shards: Box<[ShardFiles]>,
}

impl Default for ShardIndex {
    fn default() -> Self {
        Self {
            bits: ShardBits::default(),
            shards: Box::new([ShardFiles::default()]),
        }
    }
}

impl ShardIndex {
    /// Builds the index of a family, given the hash ranges of the entries of each meta file,
    /// oldest meta file first. Files that span multiple shards (written with a smaller shard
    /// count) are listed in every shard they overlap.
    pub(crate) fn build<'l>(
        bits: ShardBits,
        meta_files: impl DoubleEndedIterator<Item = &'l [StaticSortedFileRange]> + ExactSizeIterator,
    ) -> Self {
        let mut shards = (0..bits.count())
            .map(|_| (Vec::new(), Vec::new()))
            .collect::<Vec<_>>();
        for (meta_index, ranges) in meta_files.enumerate().rev() {
            for (entry_index, range) in ranges.iter().enumerate().rev() {
                let first = bits.shard_of(range.min_hash);
                let last = bits.shard_of(range.max_hash);
                for (ranges, locations) in &mut shards[first as usize..=last as usize] {
                    ranges.push(*range);
                    locations.push((meta_index as u32, entry_index as u32));
                }
            }
        }
        Self {
            bits,
            shards: shards
                .into_iter()
                .map(|(ranges, locations)| ShardFiles {
                    ranges: ranges.into_boxed_slice(),
                    locations: locations.into_boxed_slice(),
                })
                .collect(),
        }
    }

    pub(crate) fn bits(&self) -> ShardBits {
        self.bits
    }

    /// The SST files that can contain `hash`.
    pub(crate) fn candidates(&self, hash: u64) -> &ShardFiles {
        &self.shards[self.bits.shard_of(hash) as usize]
    }

    /// The SST files that can contain the keys of `shard`.
    pub(crate) fn shard(&self, shard: u32) -> &ShardFiles {
        &self.shards[shard as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shard_ranges_cover_the_key_space() {
        for bits in [0, 1, 2, 3, 10] {
            let bits = ShardBits::new(bits);
            let mut next = 0u64;
            for index in 0..bits.count() {
                let range = bits.range(index);
                assert_eq!(*range.start(), next);
                assert_eq!(bits.shard_of(*range.start()), index);
                assert_eq!(bits.shard_of(*range.end()), index);
                next = range.end().wrapping_add(1);
            }
            assert_eq!(next, 0, "the last shard ends at u64::MAX");
        }
    }

    #[test]
    fn test_one_more_bit_splits_shards() {
        let coarse = ShardBits::new(2).range(3);
        let fine = [ShardBits::new(3).range(6), ShardBits::new(3).range(7)];
        assert_eq!(coarse.start(), fine[0].start());
        assert_eq!(fine[0].end() + 1, *fine[1].start());
        assert_eq!(coarse.end(), fine[1].end());
    }

    #[test]
    fn test_shard_index() {
        let range = |shard, bits| {
            let r = ShardBits::new(bits).range(shard);
            StaticSortedFileRange {
                min_hash: *r.start(),
                max_hash: *r.end(),
            }
        };
        // An old meta file written with 2 shards, a newer one with 4.
        let old = [range(0, 1), range(1, 1)];
        let new = [range(1, 2), range(2, 2), range(3, 2)];
        let index = ShardIndex::build(ShardBits::new(2), [&old[..], &new[..]].into_iter());
        let locations = |shard| index.shard(shard).locations.to_vec();
        assert_eq!(locations(0), vec![(0, 0)]);
        assert_eq!(locations(1), vec![(1, 0), (0, 0)]);
        assert_eq!(locations(2), vec![(1, 1), (0, 1)]);
        assert_eq!(locations(3), vec![(1, 2), (0, 1)]);
        assert_eq!(
            index.candidates(u64::MAX).locations,
            index.shard(3).locations
        );
        for shard in 0..4 {
            let files = index.shard(shard);
            assert_eq!(files.ranges.len(), files.locations.len());
            for (range, &(meta, entry)) in files.ranges.iter().zip(&files.locations) {
                let expected = [&old[..], &new[..]][meta as usize][entry as usize];
                assert_eq!(range.min_hash, expected.min_hash);
            }
        }
    }

    #[test]
    fn test_for_size() {
        const MB: u64 = 1024 * 1024;
        let bits = |b| ShardBits::new(b);
        assert_eq!(ShardBits::for_size(0, 256 * MB, bits(0)), bits(0));
        assert_eq!(ShardBits::for_size(0, 256 * MB, bits(3)), bits(3));
        assert_eq!(ShardBits::for_size(256 * MB, 256 * MB, bits(0)), bits(0));
        assert_eq!(ShardBits::for_size(257 * MB, 256 * MB, bits(0)), bits(1));
        assert_eq!(ShardBits::for_size(2500 * MB, 256 * MB, bits(0)), bits(4));
        assert_eq!(ShardBits::for_size(u64::MAX, 1, bits(0)), ShardBits::MAX);
    }
}
