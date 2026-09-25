//! Key hash shards.
//!
//! The key space of a family is split into a power-of-two number of shards by the leading bits of
//! the key hash. Commits split their SST files at shard boundaries and compaction merges each shard
//! on its own, so SST files never span a shard boundary. Since shards are hash prefixes, doubling
//! the shard count splits every shard exactly in half.

use std::ops::RangeInclusive;

use crate::meta_file::StaticSortedFileRange;

/// The largest supported shard count.
pub const MAX_SHARD_COUNT: u32 = 1 << 12;

/// Returns the shard that contains `hash`. `shard_count` must be a power of two.
pub fn shard_index(hash: u64, shard_count: u32) -> u32 {
    debug_assert!(shard_count.is_power_of_two());
    if shard_count <= 1 {
        0
    } else {
        (hash >> (u64::BITS - shard_count.trailing_zeros())) as u32
    }
}

/// Returns the range of key hashes in the shard `index`. `shard_count` must be a power of two.
pub fn shard_range(index: u32, shard_count: u32) -> RangeInclusive<u64> {
    debug_assert!(shard_count.is_power_of_two() && index < shard_count);
    if shard_count <= 1 {
        return 0..=u64::MAX;
    }
    let shift = u64::BITS - shard_count.trailing_zeros();
    let start = u64::from(index) << shift;
    let end = start | (u64::MAX >> (u64::BITS - shift));
    start..=end
}

/// The shard count for a family with `bytes` of compacted data, so that shards hold about
/// `target_shard_size` bytes. Never less than `min_shard_count`, which must be a power of two.
pub fn shard_count_for(bytes: u64, target_shard_size: u64, min_shard_count: u32) -> u32 {
    let needed = bytes.div_ceil(target_shard_size.max(1)).max(1);
    let count = u32::try_from(needed)
        .unwrap_or(u32::MAX)
        .min(MAX_SHARD_COUNT)
        .next_power_of_two();
    count.max(min_shard_count).min(MAX_SHARD_COUNT)
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
    shard_count: u32,
    shards: Box<[ShardFiles]>,
}

impl Default for ShardIndex {
    fn default() -> Self {
        Self {
            shard_count: 1,
            shards: Box::new([ShardFiles::default()]),
        }
    }
}

impl ShardIndex {
    /// Builds the index of a family, given the hash ranges of the entries of each meta file,
    /// oldest meta file first. Files that span multiple shards (written with a smaller shard
    /// count) are listed in every shard they overlap.
    pub(crate) fn build<'l>(
        shard_count: u32,
        meta_files: impl DoubleEndedIterator<Item = &'l [StaticSortedFileRange]> + ExactSizeIterator,
    ) -> Self {
        let mut shards = (0..shard_count)
            .map(|_| (Vec::new(), Vec::new()))
            .collect::<Vec<_>>();
        for (meta_index, ranges) in meta_files.enumerate().rev() {
            for (entry_index, range) in ranges.iter().enumerate().rev() {
                let first = shard_index(range.min_hash, shard_count);
                let last = shard_index(range.max_hash, shard_count);
                for (ranges, locations) in &mut shards[first as usize..=last as usize] {
                    ranges.push(*range);
                    locations.push((meta_index as u32, entry_index as u32));
                }
            }
        }
        Self {
            shard_count,
            shards: shards
                .into_iter()
                .map(|(ranges, locations)| ShardFiles {
                    ranges: ranges.into_boxed_slice(),
                    locations: locations.into_boxed_slice(),
                })
                .collect(),
        }
    }

    pub(crate) fn shard_count(&self) -> u32 {
        self.shard_count
    }

    /// The SST files that can contain `hash`.
    pub(crate) fn candidates(&self, hash: u64) -> &ShardFiles {
        &self.shards[shard_index(hash, self.shard_count) as usize]
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
        for count in [1, 2, 4, 8, 1024] {
            let mut next = 0u64;
            for index in 0..count {
                let range = shard_range(index, count);
                assert_eq!(*range.start(), next);
                assert_eq!(shard_index(*range.start(), count), index);
                assert_eq!(shard_index(*range.end(), count), index);
                next = range.end().wrapping_add(1);
            }
            assert_eq!(next, 0, "the last shard ends at u64::MAX");
        }
    }

    #[test]
    fn test_doubling_splits_shards() {
        let coarse = shard_range(3, 4);
        let fine = [shard_range(6, 8), shard_range(7, 8)];
        assert_eq!(coarse.start(), fine[0].start());
        assert_eq!(fine[0].end() + 1, *fine[1].start());
        assert_eq!(coarse.end(), fine[1].end());
    }

    #[test]
    fn test_shard_index() {
        let range = |shard, count| {
            let r = shard_range(shard, count);
            StaticSortedFileRange {
                min_hash: *r.start(),
                max_hash: *r.end(),
            }
        };
        // An old meta file written with 2 shards, a newer one with 4.
        let old = [range(0, 2), range(1, 2)];
        let new = [range(1, 4), range(2, 4), range(3, 4)];
        let index = ShardIndex::build(4, [&old[..], &new[..]].into_iter());
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
    fn test_shard_count_for() {
        const MB: u64 = 1024 * 1024;
        assert_eq!(shard_count_for(0, 256 * MB, 1), 1);
        assert_eq!(shard_count_for(0, 256 * MB, 8), 8);
        assert_eq!(shard_count_for(256 * MB, 256 * MB, 1), 1);
        assert_eq!(shard_count_for(257 * MB, 256 * MB, 1), 2);
        assert_eq!(shard_count_for(2500 * MB, 256 * MB, 1), 16);
        assert_eq!(shard_count_for(u64::MAX, 1, 1), MAX_SHARD_COUNT);
    }
}
