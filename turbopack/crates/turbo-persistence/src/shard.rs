//! Key hash shards.
//!
//! The key space of a family is split into a power-of-two number of shards by the leading bits of
//! the key hash. Commits split their SST files at shard boundaries and compaction merges each shard
//! on its own, so SST files never span a shard boundary. Since shards are hash prefixes, doubling
//! the shard count splits every shard exactly in half.

use std::ops::RangeInclusive;

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
