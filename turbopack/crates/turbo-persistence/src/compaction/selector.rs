use std::ops::RangeInclusive;

use smallvec::{SmallVec, smallvec};

use crate::compaction::interval_map::IntervalMap;

/// Represents part of a database (i.e. an SST file) with a range of keys (i.e. hashes) and a size
/// of that data in bytes.
pub trait Compactable {
    /// The range of keys stored in this database segment.
    fn range(&self) -> RangeInclusive<u64>;

    /// The size of the compactable database segment in bytes.
    fn size(&self) -> u64;
}

fn is_overlapping(a: &RangeInclusive<u64>, b: &RangeInclusive<u64>) -> bool {
    a.start() <= b.end() && b.start() <= a.end()
}

fn spread(range: &RangeInclusive<u64>) -> u128 {
    // the spread of `0..=u64::MAX` is `u64::MAX + 1`, so this could overflow as u64
    u128::from(range.end() - range.start()) + 1
}

/// Extends the range `a` to include the range `b`, returns `true` if the range was extended.
fn extend_range(a: &mut RangeInclusive<u64>, b: &RangeInclusive<u64>) -> bool {
    let mut extended = false;
    if b.start() < a.start() {
        *a = (*b.start())..=(*a.end());
        extended = true;
    }
    if b.end() > a.end() {
        *a = (*a.start())..=(*b.end());
        extended = true;
    }
    extended
}

#[derive(Debug)]
pub struct CompactableMetrics {
    /// The total coverage of the compactables.
    pub coverage: f32,

    /// The maximum overlap of the compactables.
    pub overlap: f32,

    /// The possible duplication of the compactables.
    pub duplicated_size: u64,

    /// The possible duplication of the compactables as factor to total size.
    pub duplication: f32,
}

/// Computes metrics about the compactables.
pub fn compute_metrics<T: Compactable>(
    compactables: &[T],
    full_range: RangeInclusive<u64>,
) -> CompactableMetrics {
    let mut interval_map = IntervalMap::<Option<(DuplicationInfo, usize)>>::new();
    let mut coverage = 0.0f32;
    for c in compactables {
        let range = c.range();
        coverage += spread(&range) as f32;
        interval_map.update(range.clone(), |value| {
            let (dup_info, count) = value.get_or_insert_default();
            dup_info.add(c.size(), &range);
            *count += 1;
        });
    }
    let full_spread = spread(&full_range) as f32;

    let (duplicated_size, duplication, overlap) = interval_map
        .iter()
        .flat_map(|(range, value)| Some((range, value.as_ref()?)))
        .map(|(range, (dup_info, count))| {
            let duplicated_size = dup_info.duplication(&range);
            let total_size = dup_info.size(&range);
            let overlap = spread(&range) as f32 * count.saturating_sub(1) as f32;
            (duplicated_size, total_size, overlap)
        })
        .reduce(|(dup1, total1, overlap1), (dup2, total2, overlap2)| {
            (dup1 + dup2, total1 + total2, overlap1 + overlap2)
        })
        .map(|(duplicated_size, total_size, overlap)| {
            (
                duplicated_size,
                if total_size > 0 {
                    duplicated_size as f32 / total_size as f32
                } else {
                    0.0
                },
                overlap,
            )
        })
        .unwrap_or((0, 0.0, 0.0));

    CompactableMetrics {
        coverage: coverage / full_spread,
        overlap: overlap / full_spread,
        duplicated_size,
        duplication,
    }
}

/// Configuration for the compaction algorithm.
#[derive(Clone)]
pub struct CompactConfig {
    /// The minimum number of files to merge at once.
    pub min_merge_count: usize,

    /// The optimal number of files to merge at once.
    pub optimal_merge_count: usize,

    /// The maximum number of files to merge at once.
    pub max_merge_count: usize,

    /// The maximum size of all files to merge at once.
    pub max_merge_bytes: u64,

    /// The amount of duplication that need to be in a merge job to be considered for merging.
    pub min_merge_duplication_bytes: u64,

    /// The optimal duplication size for merging.
    pub optimal_merge_duplication_bytes: u64,

    /// The maximum number of merge segments to determine.
    pub max_merge_segment_count: usize,
}

impl Default for CompactConfig {
    fn default() -> Self {
        const MB: u64 = 1024 * 1024;
        Self {
            min_merge_count: 2,
            optimal_merge_count: 8,
            max_merge_count: 32,
            max_merge_bytes: 500 * MB,
            min_merge_duplication_bytes: 50 * MB,
            optimal_merge_duplication_bytes: 100 * MB,
            max_merge_segment_count: 8,
        }
    }
}

#[derive(Clone, Default, Eq, PartialEq)]
struct DuplicationInfo {
    /// The sum of all encountered scaled sizes.
    total_size: u64,
    /// The largest encountered single scaled size.
    max_size: u64,
}

impl DuplicationInfo {
    /// Get a value in the range `0..=u64` that represents the estimated amount of duplication
    /// across the given range. The units are arbitrary, but linear.
    fn duplication(&self, range: &RangeInclusive<u64>) -> u64 {
        if self.total_size == 0 {
            return 0;
        }
        // the maximum numerator value is `u64::MAX + 1`
        u64::try_from(
            u128::from(self.total_size - self.max_size) * spread(range)
                / (u128::from(u64::MAX) + 1),
        )
        .expect("should not overflow, denominator was `u64::MAX+1`")
    }

    /// The estimated size (in bytes) of a database segment containing `range` keys.
    fn size(&self, range: &RangeInclusive<u64>) -> u64 {
        if self.total_size == 0 {
            return 0;
        }
        // the maximum numerator value is `u64::MAX + 1`
        u64::try_from(u128::from(self.total_size) * spread(range) / (u128::from(u64::MAX) + 1))
            .expect("should not overflow, denominator was `u64::MAX+1`")
    }

    fn add(&mut self, size: u64, range: &RangeInclusive<u64>) {
        // Assumption: `size` is typically much smaller than `spread(range)`. The spread is some
        // fraction of `u64` (the full possible key-space), but no SST file is anywhere close to
        // `u64::MAX` bytes.

        // Scale size to full range:
        let scaled_size =
            u64::try_from(u128::from(size) * (u128::from(u64::MAX) + 1) / spread(range))
                .unwrap_or(u64::MAX);
        self.total_size = self.total_size.saturating_add(scaled_size);
        self.max_size = self.max_size.max(scaled_size);
    }
}

fn total_duplication_size(duplication: &IntervalMap<Option<DuplicationInfo>>) -> u64 {
    duplication
        .iter()
        .flat_map(|(range, info)| Some((range, info.as_ref()?)))
        .map(|(range, info)| info.duplication(&range))
        .sum()
}

type MergeSegments = Vec<SmallVec<[usize; 1]>>;

/// Computes the set of merge segments that should be run to compact the given compactables.
///
/// Returns both the mergeable segments and the actual number of merge segments that were created.
pub fn get_merge_segments<T: Compactable>(
    compactables: &[T],
    config: &CompactConfig,
) -> (MergeSegments, usize) {
    // Process all compactables in reverse order.
    // For each compactable, find the smallest set of compactables that overlaps with it and matches
    // the conditions.
    // To find the set:
    // - Set the current range to the range of the first unused compactable.
    // - When the set matches the conditions, add the set as merge job, mark all used compactables
    //   and continue.
    // - Find the next unused compactable that overlaps with the current range.
    // - If the range need to be extended, restart the search with the new range.
    // - If the compactable is within the range, add it to the current set.
    // - If the set is too large, mark the starting compactable as used and continue with the next

    let mut unused_compactables = compactables.iter().collect::<Vec<_>>();
    let mut used_compactables = vec![false; compactables.len()];

    let mut merge_segments: MergeSegments = Vec::new();
    let mut real_merge_segments = 0;

    // Iterate in reverse order to process the compactables from the end.
    // That's the order in which compactables are read, so we need to keep that order.
    'outer: while let Some(start_compactable) = unused_compactables.pop() {
        let start_index = unused_compactables.len();
        if used_compactables[start_index] {
            continue;
        }
        if real_merge_segments >= config.max_merge_segment_count {
            // We have reached the maximum number of merge jobs, so we stop here.
            break;
        }
        let start_compactable_range = start_compactable.range();
        let start_compactable_size = start_compactable.size();
        let mut current_range = start_compactable_range.clone();

        // We might need to restart the search if we need to extend the range.
        'search: loop {
            let mut current_set = smallvec![start_index];
            let mut current_size = start_compactable_size;
            let mut duplication = IntervalMap::<Option<DuplicationInfo>>::new();
            duplication.update(start_compactable_range.clone(), |dup_info| {
                dup_info
                    .get_or_insert_default()
                    .add(start_compactable_size, &start_compactable_range);
            });
            let mut current_skip = 0;

            // We will capture compactables in the current_range until we find a optimal merge
            // segment or are limited by size or count.
            loop {
                // Early exit if we have found an optimal merge segment.
                let duplication_size = total_duplication_size(&duplication);
                let optimal_merge_job = current_set.len() >= config.optimal_merge_count
                    && duplication_size >= config.optimal_merge_duplication_bytes;
                if optimal_merge_job {
                    for &i in current_set.iter() {
                        used_compactables[i] = true;
                    }
                    current_set.reverse();
                    merge_segments.push(current_set);
                    real_merge_segments += 1;
                    continue 'outer;
                }

                // If we are limited by size or count, we might also create a merge segment if it's
                // within the limits.
                let valid_merge_job = current_set.len() >= config.min_merge_count
                    && duplication_size >= config.min_merge_duplication_bytes;
                let mut end_job =
                    |mut current_set: SmallVec<[usize; 1]>, used_compactables: &mut Vec<bool>| {
                        if valid_merge_job {
                            for &i in current_set.iter() {
                                used_compactables[i] = true;
                            }
                            current_set.reverse();
                            merge_segments.push(current_set);
                            real_merge_segments += 1;
                        } else {
                            merge_segments.push(smallvec![start_index]);
                        }
                    };

                // Check if we run into the count or size limit.
                if current_set.len() >= config.max_merge_count
                    || current_size >= config.max_merge_bytes
                {
                    // The set is so large so we can't add more compactables to it.
                    end_job(current_set, &mut used_compactables);
                    continue 'outer;
                }

                // Find the next compactable that overlaps with the current range.
                let Some((next_index, compactable)) = unused_compactables
                    .iter()
                    .enumerate()
                    .rev()
                    .skip(current_skip)
                    .find(|(i, compactable)| {
                        if used_compactables[*i] {
                            return false;
                        }
                        let range = compactable.range();
                        is_overlapping(&current_range, &range)
                    })
                else {
                    // There are no more compactables that overlap with the current range.
                    end_job(current_set, &mut used_compactables);
                    continue 'outer;
                };
                current_skip = unused_compactables.len() - next_index;

                // Check if we run into the size limit.
                let size = compactable.size();
                if current_size + size > config.max_merge_bytes {
                    // The next compactable is too large to be added to the current set.
                    end_job(current_set, &mut used_compactables);
                    continue 'outer;
                }

                // Check if the next compactable is larger than the current range. We need to
                // restart from beginning here as there could be previously skipped compactables
                // that are within the larger range.
                let range = compactable.range();
                if extend_range(&mut current_range, &range) {
                    // The range was extended, so we need to restart the search.
                    continue 'search;
                }

                // The next compactable is within the current range, so we can add it to the current
                // set.
                current_set.push(next_index);
                current_size += size;
                duplication.update(range.clone(), |dup_info| {
                    dup_info.get_or_insert_default().add(size, &range);
                });
            }
        }
    }

    while merge_segments.last().is_some_and(|s| s.len() == 1) {
        // Remove segments that only contain a single compactable.
        merge_segments.pop();
    }

    // Reverse it since we processed in reverse order.
    merge_segments.reverse();

    // Remove single compectable segments that don't overlap with previous segments. We don't need
    // to touch them.
    let mut used_ranges = IntervalMap::<bool>::new();
    merge_segments.retain(|segment| {
        // Remove a single element segments which doesn't overlap with previous used ranges.
        if segment.len() == 1 {
            let range = compactables[segment[0]].range();
            if !used_ranges.iter_intersecting(range).any(|(_, v)| *v) {
                return false;
            }
        }
        // Mark the ranges of the segment as used.
        for i in segment {
            let range = compactables[*i].range();
            used_ranges.replace(range, true);
        }
        true
    });

    (merge_segments, real_merge_segments)
}

#[cfg(test)]
mod tests {
    use std::{
        fmt::Debug,
        mem::{replace, swap},
    };

    use rand::{Rng, SeedableRng, seq::SliceRandom};

    use super::*;

    struct TestCompactable {
        range: RangeInclusive<u64>,
        size: u64,
    }

    impl Compactable for TestCompactable {
        fn range(&self) -> RangeInclusive<u64> {
            self.range.clone()
        }

        fn size(&self) -> u64 {
            self.size
        }
    }

    fn compact<const N: usize>(
        ranges: [RangeInclusive<u64>; N],
        config: &CompactConfig,
    ) -> Vec<Vec<usize>> {
        let compactables = ranges
            .into_iter()
            .map(|range| TestCompactable { range, size: 100 })
            .collect::<Vec<_>>();
        let (jobs, _) = get_merge_segments(&compactables, config);
        jobs.into_iter()
            .map(|job| job.into_iter().collect())
            .collect()
    }

    #[test]
    fn test_compaction_jobs_by_count() {
        let merge_jobs = compact(
            [
                0..=10,
                10..=30,
                9..=13,
                0..=30,
                40..=44,
                41..=42,
                41..=47,
                90..=100,
                30..=40,
            ],
            &CompactConfig {
                min_merge_count: 2,
                optimal_merge_count: 3,
                max_merge_count: 4,
                max_merge_bytes: u64::MAX,
                min_merge_duplication_bytes: 0,
                optimal_merge_duplication_bytes: 0,
                max_merge_segment_count: usize::MAX,
            },
        );
        assert_eq!(merge_jobs, vec![vec![1, 2, 3], vec![5, 6, 8]]);
    }

    #[test]
    fn test_compaction_jobs_by_size() {
        let merge_jobs = compact(
            [
                0..=10,
                10..=30,
                9..=13,
                0..=30,
                40..=44,
                41..=42,
                41..=47,
                90..=100,
                30..=40,
            ],
            &CompactConfig {
                min_merge_count: 2,
                optimal_merge_count: 2,
                max_merge_count: usize::MAX,
                max_merge_bytes: 300,
                min_merge_duplication_bytes: 0,
                optimal_merge_duplication_bytes: u64::MAX,
                max_merge_segment_count: usize::MAX,
            },
        );
        assert_eq!(merge_jobs, vec![vec![1, 2, 3], vec![5, 6, 8]]);
    }

    #[test]
    fn test_compaction_jobs_full() {
        let merge_jobs = compact(
            [
                0..=10,
                10..=30,
                9..=13,
                0..=30,
                40..=44,
                41..=42,
                41..=47,
                90..=100,
                30..=40,
            ],
            &CompactConfig {
                min_merge_count: 2,
                optimal_merge_count: usize::MAX,
                max_merge_count: usize::MAX,
                max_merge_bytes: u64::MAX,
                min_merge_duplication_bytes: 0,
                optimal_merge_duplication_bytes: u64::MAX,
                max_merge_segment_count: usize::MAX,
            },
        );
        assert_eq!(merge_jobs, vec![vec![0, 1, 2, 3, 4, 5, 6, 8]]);
    }

    #[test]
    fn test_compaction_jobs_big() {
        let merge_jobs = compact(
            [
                0..=10,
                10..=30,
                9..=13,
                0..=30,
                40..=44,
                41..=42,
                41..=47,
                90..=100,
                30..=40,
            ],
            &CompactConfig {
                min_merge_count: 2,
                optimal_merge_count: 7,
                max_merge_count: usize::MAX,
                max_merge_bytes: u64::MAX,
                min_merge_duplication_bytes: 0,
                optimal_merge_duplication_bytes: 0,
                max_merge_segment_count: usize::MAX,
            },
        );
        assert_eq!(merge_jobs, vec![vec![1, 2, 3, 4, 5, 6, 8]]);
    }

    #[test]
    fn test_compaction_jobs_small() {
        let merge_jobs = compact(
            [
                0..=10,
                10..=30,
                9..=13,
                0..=30,
                40..=44,
                41..=42,
                41..=47,
                90..=100,
                30..=40,
            ],
            &CompactConfig {
                min_merge_count: 2,
                optimal_merge_count: 2,
                max_merge_count: usize::MAX,
                max_merge_bytes: u64::MAX,
                min_merge_duplication_bytes: 0,
                optimal_merge_duplication_bytes: 0,
                max_merge_segment_count: usize::MAX,
            },
        );
        assert_eq!(
            merge_jobs,
            vec![vec![0, 1], vec![2, 3], vec![4, 5], vec![6, 8]]
        );
    }

    pub fn debug_print_compactables<T: Compactable>(compactables: &[T], max_key: u64) {
        const WIDTH: usize = 128;
        let char_width: u64 = max_key / WIDTH as u64;
        for (i, c) in compactables.iter().enumerate() {
            let range = c.range();
            let size = c.size();
            let start = usize::try_from(range.start() / char_width).unwrap();
            let end = usize::try_from(range.end() / char_width).unwrap();
            let mut line = format!("{i:>3} | ");
            for j in 0..WIDTH {
                if j >= start && j <= end {
                    line.push('█');
                } else {
                    line.push(' ');
                }
            }
            println!("{line} | {size:>6}");
        }
    }

    #[test]
    fn simulate_compactions() {
        const KEY_RANGE: u64 = 10000;
        const WARM_KEY_COUNT: usize = 100;
        const INITIAL_CHUNK_SIZE: usize = 100;
        const ITERATIONS: usize = 100;

        let mut rnd = rand::rngs::SmallRng::from_seed([0; 32]);
        let mut keys = (0..KEY_RANGE).collect::<Vec<_>>();
        keys.shuffle(&mut rnd);

        let mut batch_index = 0;
        let mut containers = keys
            .chunks(INITIAL_CHUNK_SIZE)
            .map(|keys| Container::new(batch_index, keys.to_vec()))
            .collect::<Vec<_>>();

        let mut warm_keys = (0..WARM_KEY_COUNT)
            .map(|_| {
                let i = rnd.random_range(0..keys.len());
                keys.swap_remove(i)
            })
            .collect::<Vec<_>>();

        let mut number_of_compactions = 0;

        for _ in 0..ITERATIONS {
            let total_size = containers.iter().map(|c| c.keys.len()).sum::<usize>();
            let metrics = compute_metrics(&containers, 0..=KEY_RANGE);
            debug_print_compactables(&containers, KEY_RANGE);
            println!(
                "size: {}, coverage: {}, overlap: {}, duplication: {}, items: {}",
                total_size,
                metrics.coverage,
                metrics.overlap,
                metrics.duplication,
                containers.len()
            );

            assert!(containers.len() < 400);
            // assert!(metrics.duplication < 4.0);

            let config = CompactConfig {
                max_merge_count: 16,
                min_merge_count: 2,
                optimal_merge_count: 4,
                max_merge_bytes: 5000,
                min_merge_duplication_bytes: 500,
                optimal_merge_duplication_bytes: 1000,
                max_merge_segment_count: 4,
            };
            let (jobs, _) = get_merge_segments(&containers, &config);
            if !jobs.is_empty() {
                println!("{jobs:?}");

                batch_index += 1;
                do_compact(&mut containers, jobs, batch_index);
                number_of_compactions += 1;

                let new_metrics = compute_metrics(&containers, 0..=KEY_RANGE);
                println!(
                    "Compaction done: coverage: {} ({}), overlap: {} ({}), duplication: {} ({})",
                    new_metrics.coverage,
                    new_metrics.coverage - metrics.coverage,
                    new_metrics.overlap,
                    new_metrics.overlap - metrics.overlap,
                    new_metrics.duplication,
                    new_metrics.duplication - metrics.duplication
                );
            } else {
                println!("No compaction needed");
            }

            // Modify warm keys
            batch_index += 1;
            let pieces = rnd.random_range(1..4);
            for chunk in warm_keys.chunks(warm_keys.len().div_ceil(pieces)) {
                containers.push(Container::new(batch_index, chunk.to_vec()));
            }

            // Change some warm keys
            let changes = rnd.random_range(0..100);
            for _ in 0..changes {
                let i = rnd.random_range(0..warm_keys.len());
                let j = rnd.random_range(0..keys.len());
                swap(&mut warm_keys[i], &mut keys[j]);
            }
        }
        println!("Number of compactions: {number_of_compactions}");

        let metrics = compute_metrics(&containers, 0..=KEY_RANGE);
        assert!(number_of_compactions < 30);
        assert!(containers.len() < 30);
        assert!(metrics.duplication < 0.5);
    }

    struct Container {
        batch_index: usize,
        keys: Vec<u64>,
    }

    impl Container {
        fn new(batch_index: usize, mut keys: Vec<u64>) -> Self {
            keys.sort_unstable();
            Self { batch_index, keys }
        }
    }

    impl Compactable for Container {
        fn range(&self) -> RangeInclusive<u64> {
            (self.keys[0])..=(*self.keys.last().unwrap())
        }

        fn size(&self) -> u64 {
            self.keys.len() as u64
        }
    }

    impl Debug for Container {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            let (l, r) = self.range().into_inner();
            write!(
                f,
                "#{} {}b {l} - {r} ({})",
                self.batch_index,
                self.keys.len(),
                r - l
            )
        }
    }

    fn do_compact(containers: &mut Vec<Container>, segments: MergeSegments, batch_index: usize) {
        let total_size = containers.iter().map(|c| c.keys.len()).sum::<usize>();
        for merge_job in segments {
            if merge_job.len() < 2 {
                let container = replace(
                    &mut containers[merge_job[0]],
                    Container {
                        batch_index: 0,
                        keys: Default::default(),
                    },
                );
                containers.push(container);
            } else {
                let mut keys = Vec::new();
                for i in merge_job {
                    keys.append(&mut containers[i].keys);
                }
                keys.sort_unstable();
                keys.dedup();
                containers.extend(keys.chunks(1000).map(|keys| Container {
                    batch_index,
                    keys: keys.to_vec(),
                }));
            }
        }

        containers.retain(|c| !c.keys.is_empty());
        let total_size2 = containers.iter().map(|c| c.keys.len()).sum::<usize>();
        println!("Compaction done: {total_size} -> {total_size2}",);
    }
}
