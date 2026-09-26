//! Chooses which SST files to merge.
//!
//! The key space of each family is split into shards (see [`crate::shard`]) and SST files don't
//! span shard boundaries, so every shard is compacted on its own. A shard consists of a bottom run
//! (the files written by the last merge of the whole shard, flagged as bottom) and the files
//! written since then, above it. Two kinds of merge jobs keep a shard in shape:
//!
//! - A bottom merge merges all files of the shard into a new bottom run. It drops all superseded
//!   entries and all tombstones, so it bounds the space amplification: it runs when the files above
//!   the bottom run are larger than `max_space_amplification_percent` of the bottom run. A
//!   tombstone is small, but deletes an entry of the bottom run, so it counts as an average bottom
//!   entry.
//! - An intermediate merge merges only the files above the bottom run, when there are more than
//!   `max_files_above_bottom` of them. This bounds the number of files a lookup has to consult
//!   without rewriting the bottom run.
//!
//! The bytes rewritten by bottom merges are limited to `max_rewrite_factor` times the fresh bytes
//! (written by commits and not compacted yet) of the family, so that the cost of compaction follows
//! the amount of new data. Since keys are hashes, all shards of a family grow at the same rate; the
//! budget spreads their bottom merges over multiple compactions. Fresh files that are not compacted
//! keep counting, so an interrupted or skipped compaction only increases the next budget.
//!
//! When the shard count of a family grows, files written before cover multiple of the new shards.
//! A merge job then covers all shards that such a file overlaps (a "component"), and its output is
//! split at the new shard boundaries.

use std::{num::NonZeroU16, ops::RangeInclusive};

use crate::shard::ShardBits;

/// Represents part of a database (i.e. an SST file) with a range of keys (i.e. hashes) and a size
/// of that data in bytes.
pub trait Compactable {
    /// The range of keys stored in this database segment.
    fn range(&self) -> RangeInclusive<u64>;

    /// The size of the compactable database segment in bytes.
    fn size(&self) -> u64;

    /// Whether the segment is part of the bottom run of its shard.
    fn is_bottom(&self) -> bool;

    /// Whether the segment was written by a commit and not compacted yet.
    fn is_fresh(&self) -> bool;

    /// The number of entries in the segment.
    fn entry_count(&self) -> u64;

    /// The number of tombstones in the segment.
    fn tombstone_count(&self) -> u64;
}

/// Configuration for the compaction algorithm.
#[derive(Clone, Copy, Debug)]
pub struct CompactConfig {
    /// A shard is merged into a new bottom run when the files above its bottom run are larger than
    /// this percentage of the bottom run. E.g. `50` merges a shard with a 100MB bottom run once
    /// more than 50MB are above it. `None` merges every shard that has files above its bottom run.
    pub max_space_amplification_percent: Option<NonZeroU16>,

    /// A shard is only merged into a new bottom run when at least this many bytes are above its
    /// bottom run. Tiny families, which rewrite all their data with every commit, only get
    /// intermediate merges.
    pub min_bottom_merge_bytes: u64,

    /// The files above the bottom run of a shard are merged when there are more than this many.
    pub max_files_above_bottom: usize,

    /// Bottom merges of a family stop once they rewrote this factor times the size of the fresh
    /// files of the family. The first bottom merge of a family always runs. E.g. with `2.0`, after
    /// commits wrote 10MB to a family, its bottom merges stop once they rewrote 20MB.
    pub max_rewrite_factor: f32,

    /// The maximum number of merge jobs in a compaction, across all families. Merge jobs run in
    /// parallel, so this bounds the work of a compaction. It doesn't limit the number of files
    /// merged by a job.
    pub max_merge_jobs: usize,
}

impl Default for CompactConfig {
    fn default() -> Self {
        Self {
            max_space_amplification_percent: NonZeroU16::new(50),
            min_bottom_merge_bytes: 1024 * 1024,
            max_files_above_bottom: 4,
            max_rewrite_factor: 2.0,
            max_merge_jobs: 8,
        }
    }
}

impl CompactConfig {
    /// A config that merges every shard with files above its bottom run into a new bottom run.
    pub fn full() -> Self {
        Self {
            max_space_amplification_percent: None,
            min_bottom_merge_bytes: 0,
            // Irrelevant, as bottom merges are always chosen.
            max_files_above_bottom: usize::MAX,
            max_rewrite_factor: f32::INFINITY,
            max_merge_jobs: usize::MAX,
        }
    }
}

/// A set of compactables to merge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeJob {
    /// Indices of the compactables, in ascending (read) order.
    pub members: Vec<usize>,
    /// Whether the job merges all files of its shards, i.e. writes a new bottom run.
    pub bottom: bool,
}

/// A planned merge job and how urgent it is, before merge jobs are selected across families.
struct Candidate {
    job: MergeJob,
    /// How far the shard is over the limit that triggers the job, e.g. `2.0` for twice the allowed
    /// space amplification or file count. Higher is more urgent.
    priority: f32,
}

/// Groups the compactables into components, sets of shards that are merged together.
///
/// Normally a compactable is within a single shard and a component is one shard. But when the
/// shard count of a family grows, compactables written before cover multiple of the new shards.
/// Such a compactable can only be merged together with everything else in the shards it covers, so
/// all shards it covers belong to one component. Returns the members of each component in
/// ascending order.
fn components<T: Compactable>(compactables: &[T], shard_bits: ShardBits) -> Vec<Vec<usize>> {
    let mut spans = compactables
        .iter()
        .enumerate()
        .map(|(index, c)| {
            let range = c.range();
            let shard_start = shard_bits.shard_of(*range.start());
            let shard_end = shard_bits.shard_of(*range.end());
            (shard_start, shard_end, index)
        })
        .collect::<Vec<_>>();
    spans.sort_unstable();
    let mut result: Vec<(u32, Vec<usize>)> = Vec::new();
    for (shard_start, shard_end, index) in spans {
        match result.last_mut() {
            Some((component_end, members)) if shard_start <= *component_end => {
                *component_end = (*component_end).max(shard_end);
                members.push(index);
            }
            _ => result.push((shard_end, vec![index])),
        }
    }
    result
        .into_iter()
        .map(|(_, mut members)| {
            members.sort_unstable();
            members
        })
        .collect()
}

/// Produces a [`Candidate`] for an intermediate merge of the files `above` the bottom run of a
/// shard. Intermediate merges are ranked by how far the number of files above the bottom run
/// exceeds `max_files_above_bottom`.
fn intermediate_candidate(above: Vec<usize>, config: &CompactConfig) -> Candidate {
    Candidate {
        priority: above.len() as f32 / config.max_files_above_bottom.max(1) as f32,
        job: MergeJob {
            members: above,
            bottom: false,
        },
    }
}

/// Plans the merge jobs of one family, bottom merges first, each kind most urgent first.
fn plan_family<T: Compactable>(
    compactables: &[T],
    shard_bits: ShardBits,
    config: &CompactConfig,
) -> Vec<Candidate> {
    let fresh_bytes = compactables
        .iter()
        .filter(|c| c.is_fresh())
        .map(|c| c.size())
        .sum::<u64>();

    let mut bottom_candidates = Vec::new();
    let mut intermediate_candidates = Vec::new();
    for members in components(compactables, shard_bits) {
        let (bottom, above): (Vec<usize>, Vec<usize>) =
            members.iter().partition(|&&i| compactables[i].is_bottom());
        if above.is_empty() {
            continue;
        }
        debug_assert!(
            bottom.last() < above.first(),
            "bottom files must be older than the files above them"
        );
        // The bottom run consists of multiple files when the bottom merge output exceeds the size
        // of a file, or when the component spans multiple shards after the shard count grew.
        let bottom_bytes = bottom.iter().map(|&i| compactables[i].size()).sum::<u64>();
        let above_bytes = above.iter().map(|&i| compactables[i].size()).sum::<u64>();
        // A bottom merge drops the entries deleted by tombstones above the bottom run, which are
        // much larger than the tombstones. Estimate them with the average entry size of the bottom
        // run, which has no tombstones. This overestimates, as tombstones can delete entries above
        // the bottom run, or nothing, and entries above the bottom run shadow each other, but it
        // makes a shard with many deletes merge, which it wouldn't by size alone.
        let bottom_entries = bottom
            .iter()
            .map(|&i| compactables[i].entry_count())
            .sum::<u64>();
        let above_tombstones = above
            .iter()
            .map(|&i| compactables[i].tombstone_count())
            .sum::<u64>();
        let deleted_bytes = bottom_bytes
            .checked_div(bottom_entries)
            .unwrap_or(0)
            .saturating_mul(above_tombstones);
        // Both the files above the bottom run and the entries they delete are garbage that a
        // bottom merge reclaims.
        let reclaimable_bytes = above_bytes.saturating_add(deleted_bytes);
        let limit = config
            .max_space_amplification_percent
            .map_or(0.0, |percent| f64::from(percent.get()) / 100.0);
        let amplification = if bottom_bytes == 0 {
            f64::INFINITY
        } else {
            reclaimable_bytes as f64 / bottom_bytes as f64
        };
        if amplification > limit && reclaimable_bytes >= config.min_bottom_merge_bytes {
            let candidate = Candidate {
                job: MergeJob {
                    members,
                    bottom: true,
                },
                priority: if limit > 0.0 {
                    (amplification / limit) as f32
                } else {
                    f32::INFINITY
                },
            };
            bottom_candidates.push((candidate, bottom_bytes + above_bytes, above));
        } else if above.len() > config.max_files_above_bottom {
            intermediate_candidates.push(intermediate_candidate(above, config));
        }
    }

    // Spend the budget on the most amplified shards. Shards that don't fit into the budget still
    // get an intermediate merge if they have too many files.
    bottom_candidates.sort_by(|a, b| b.0.priority.total_cmp(&a.0.priority));
    // Float to int casts saturate, so an infinite factor is an unlimited budget.
    let budget = (f64::from(config.max_rewrite_factor) * fresh_bytes as f64) as u64;
    let mut spent = 0u64;
    let mut result = Vec::new();
    for (candidate, cost, above) in bottom_candidates {
        if result.is_empty() || spent < budget {
            spent = spent.saturating_add(cost);
            result.push(candidate);
        } else if above.len() > config.max_files_above_bottom {
            // The budget is exhausted, but an intermediate merge of the same shard is cheap and
            // still bounds the number of files a lookup consults.
            intermediate_candidates.push(intermediate_candidate(above, config));
        }
    }
    intermediate_candidates.sort_by(|a, b| b.priority.total_cmp(&a.priority));
    result.extend(intermediate_candidates);
    result
}

/// Plans the merge jobs for all families, limited to `max_merge_jobs` jobs in total. Each family is
/// given as its compactables, in the order they are read (oldest first), and its shards.
///
/// Returns the merge jobs of each family. The jobs of a family don't overlap each other, and each
/// includes all files overlapping it, except that an intermediate merge leaves out the bottom run,
/// which is older. So the outputs can be placed after all existing files without moving any file.
pub fn plan_compaction<T: Compactable>(
    families: &[(&[T], ShardBits)],
    config: &CompactConfig,
) -> Vec<Vec<MergeJob>> {
    let mut candidates = families
        .iter()
        .enumerate()
        .flat_map(|(family, (compactables, shard_bits))| {
            plan_family(compactables, *shard_bits, config)
                .into_iter()
                .enumerate()
                .map(move |(order, candidate)| (family, order, candidate))
        })
        .collect::<Vec<_>>();
    // Most over its limit first, so that intermediate merges, which bound the files a lookup
    // consults, are not starved by bottom merges. Ties prefer bottom merges, then keep each
    // family's order, then family order.
    candidates.sort_by(|a, b| {
        b.2.priority
            .total_cmp(&a.2.priority)
            .then(b.2.job.bottom.cmp(&a.2.job.bottom))
            .then(a.1.cmp(&b.1))
            .then(a.0.cmp(&b.0))
    });
    let mut result = vec![Vec::new(); families.len()];
    for (family, _, candidate) in candidates.into_iter().take(config.max_merge_jobs) {
        result[family].push(candidate.job);
    }
    for jobs in &mut result {
        jobs.sort_by_key(|job| job.members[0]);
    }
    result
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};

    use rand::{RngExt, SeedableRng, seq::SliceRandom};

    use super::*;

    #[derive(Clone, Debug)]
    struct File {
        range: RangeInclusive<u64>,
        size: u64,
        bottom: bool,
        fresh: bool,
    }

    impl Compactable for File {
        fn range(&self) -> RangeInclusive<u64> {
            self.range.clone()
        }

        fn size(&self) -> u64 {
            self.size
        }

        fn is_bottom(&self) -> bool {
            self.bottom
        }

        fn is_fresh(&self) -> bool {
            self.fresh
        }

        fn entry_count(&self) -> u64 {
            0
        }

        fn tombstone_count(&self) -> u64 {
            0
        }
    }

    fn file(shard: u32, shard_bits: u8, size: u64, bottom: bool, fresh: bool) -> File {
        File {
            range: ShardBits::new(shard_bits).range(shard),
            size,
            bottom,
            fresh,
        }
    }

    /// The default config without the byte floor, since test files are tiny.
    fn test_config() -> CompactConfig {
        CompactConfig {
            min_bottom_merge_bytes: 0,
            ..Default::default()
        }
    }

    fn plan(files: &[File], shard_bits: u8, config: &CompactConfig) -> Vec<(Vec<usize>, bool)> {
        plan_compaction(&[(files, ShardBits::new(shard_bits))], config)
            .remove(0)
            .into_iter()
            .map(|job| (job.members, job.bottom))
            .collect()
    }

    #[test]
    fn test_shard_without_bottom_run_gets_one() {
        let files = [file(0, 0, 100, false, true), file(0, 0, 100, false, true)];
        assert_eq!(plan(&files, 0, &test_config()), vec![(vec![0, 1], true)]);
    }

    #[test]
    fn test_bottom_merge_by_space_amplification() {
        let config = test_config();
        // 40% above the bottom run: nothing to do.
        let files = [file(0, 0, 1000, true, false), file(0, 0, 400, false, true)];
        assert_eq!(plan(&files, 0, &config), vec![]);
        // 60%: merge the shard into a new bottom run.
        let files = [file(0, 0, 1000, true, false), file(0, 0, 600, false, true)];
        assert_eq!(plan(&files, 0, &config), vec![(vec![0, 1], true)]);
    }

    #[test]
    fn test_intermediate_merge_by_file_count() {
        let mut files = vec![file(0, 0, 1000, true, false)];
        files.extend((0..5).map(|_| file(0, 0, 10, false, true)));
        assert_eq!(
            plan(&files, 0, &test_config()),
            vec![(vec![1, 2, 3, 4, 5], false)]
        );
        files.pop();
        assert_eq!(plan(&files, 0, &test_config()), vec![]);
    }

    #[test]
    fn test_budget_spreads_bottom_merges() {
        // All four shards are above the threshold, but the fresh data only pays for one bottom
        // merge. The most amplified shard goes first.
        let mut files = (0..4)
            .map(|shard| file(shard, 2, 1000, true, false))
            .collect::<Vec<_>>();
        files.extend((0..4).map(|shard| file(shard, 2, 600 + u64::from(shard), false, true)));
        let config = CompactConfig {
            max_rewrite_factor: 0.1,
            ..test_config()
        };
        assert_eq!(plan(&files, 2, &config), vec![(vec![3, 7], true)]);
        // With enough budget, all of them are merged.
        assert_eq!(
            plan(&files, 2, &test_config()),
            vec![
                (vec![0, 4], true),
                (vec![1, 5], true),
                (vec![2, 6], true),
                (vec![3, 7], true)
            ]
        );
    }

    #[test]
    fn test_byte_floor_skips_bottom_merges_of_tiny_shards() {
        // Every commit rewrites the whole (tiny) family: always amplified, but not worth a bottom
        // merge. It only gets an intermediate merge once there are enough files.
        let mut files = vec![file(0, 0, 50, true, false)];
        files.push(file(0, 0, 50, false, true));
        let config = CompactConfig {
            min_bottom_merge_bytes: 1000,
            ..test_config()
        };
        assert_eq!(plan(&files, 0, &config), vec![]);
        files.extend((0..4).map(|_| file(0, 0, 50, false, true)));
        assert_eq!(plan(&files, 0, &config), vec![(vec![1, 2, 3, 4, 5], false)]);
    }

    #[test]
    fn test_intermediate_merges_are_not_starved() {
        // One job slot: a family with far too many files above its bottom run wins over a family
        // that is only slightly over the space amplification threshold.
        let mut many_files = vec![file(0, 0, 1000, true, false)];
        many_files.extend((0..8).map(|_| file(0, 0, 1, false, true)));
        let amplified = [file(0, 0, 1000, true, false), file(0, 0, 600, false, true)];
        let config = CompactConfig {
            max_merge_jobs: 1,
            ..test_config()
        };
        let jobs = plan_compaction(
            &[
                (&many_files[..], ShardBits::new(0)),
                (&amplified[..], ShardBits::new(0)),
            ],
            &config,
        );
        assert_eq!(jobs[0].len(), 1);
        assert!(!jobs[0][0].bottom);
        assert!(jobs[1].is_empty());
    }

    #[test]
    fn test_coarse_files_merge_the_shards_they_span() {
        // A bottom run written with 2 shards, and fresh files written with 4 shards.
        let files = [
            file(0, 1, 1000, true, false),
            file(1, 1, 1000, true, false),
            file(0, 2, 600, false, true),
            file(1, 2, 10, false, true),
            file(3, 2, 10, false, true),
        ];
        assert_eq!(plan(&files, 2, &test_config()), vec![(vec![0, 2, 3], true)]);
    }

    #[test]
    fn test_merge_job_limit_across_families() {
        let a = [file(0, 0, 100, false, true), file(0, 0, 100, false, true)];
        let b = [file(0, 0, 100, false, true), file(0, 0, 100, false, true)];
        let config = CompactConfig {
            max_merge_jobs: 1,
            ..test_config()
        };
        let jobs = plan_compaction(
            &[(&a[..], ShardBits::new(0)), (&b[..], ShardBits::new(0))],
            &config,
        );
        assert_eq!(jobs.iter().map(Vec::len).sum::<usize>(), 1);
    }

    /// A simulated SST file.
    struct Container {
        /// Sorted keys, and whether the entry is a tombstone.
        keys: Vec<(u64, bool)>,
        bottom: bool,
        fresh: bool,
    }

    impl Compactable for Container {
        fn range(&self) -> RangeInclusive<u64> {
            self.keys[0].0..=self.keys.last().unwrap().0
        }

        fn size(&self) -> u64 {
            self.keys.len() as u64
        }

        fn is_bottom(&self) -> bool {
            self.bottom
        }

        fn is_fresh(&self) -> bool {
            self.fresh
        }

        fn entry_count(&self) -> u64 {
            self.keys.len() as u64
        }

        fn tombstone_count(&self) -> u64 {
            self.keys.iter().filter(|(_, tombstone)| *tombstone).count() as u64
        }
    }

    /// Splits sorted entries at shard boundaries, like commits and merges do.
    fn split_by_shard(
        entries: Vec<(u64, bool)>,
        shard_bits: ShardBits,
        bottom: bool,
        fresh: bool,
    ) -> Vec<Container> {
        let mut by_shard = BTreeMap::<u32, Vec<(u64, bool)>>::new();
        for entry in entries {
            by_shard
                .entry(shard_bits.shard_of(entry.0))
                .or_default()
                .push(entry);
        }
        by_shard
            .into_values()
            .map(|keys| Container {
                keys,
                bottom,
                fresh,
            })
            .collect()
    }

    /// Runs the merge jobs like the database does. Returns the number of entries written.
    fn run_jobs(
        containers: &mut Vec<Container>,
        jobs: Vec<MergeJob>,
        shard_bits: ShardBits,
    ) -> u64 {
        let mut written = 0;
        let mut outputs = Vec::new();
        let mut merged = BTreeSet::new();
        for job in jobs {
            let oldest = job.members[0];
            // Newer entries win.
            let mut entries = job
                .members
                .iter()
                .rev()
                .flat_map(|&i| containers[i].keys.iter().copied())
                .collect::<Vec<_>>();
            entries.sort_by_key(|(key, _)| *key);
            entries.dedup_by_key(|(key, _)| *key);
            // Tombstones are dropped when no older file holds the key.
            entries.retain(|&(key, tombstone)| {
                !tombstone
                    || containers[..oldest]
                        .iter()
                        .any(|c| c.keys.binary_search_by_key(&key, |(k, _)| *k).is_ok())
            });
            written += entries.len() as u64;
            outputs.extend(split_by_shard(entries, shard_bits, job.bottom, false));
            merged.extend(job.members);
        }
        let mut i = 0;
        containers.retain(|_| {
            i += 1;
            !merged.contains(&(i - 1))
        });
        containers.extend(outputs);
        written
    }

    const KEY_COUNT: u64 = 20_000;
    /// Spreads keys over the hash space like real key hashes.
    const KEY_SCALE: u64 = u64::MAX / KEY_COUNT;

    struct SimulationResult {
        compactions_with_bottom_merges: usize,
        /// Entries written by commits and by compactions.
        written: u64,
        rewritten: u64,
        /// The highest space amplification (stored / live entries) after a compaction, once
        /// everything was compacted once.
        max_space_amplification: f64,
        /// The most files a lookup has to consult, after a compaction.
        max_files_per_shard: usize,
    }

    /// A commit rewrites a churning set of hot keys and deletes some cold keys, like a build with
    /// garbage collection. The database is compacted after every commit.
    fn simulate(
        config: &CompactConfig,
        shard_bits: ShardBits,
        iterations: usize,
    ) -> SimulationResult {
        let mut rnd = rand::rngs::SmallRng::from_seed([0; 32]);
        let mut live = (0..KEY_COUNT).map(|k| k * KEY_SCALE).collect::<Vec<_>>();
        live.shuffle(&mut rnd);
        let mut containers = split_by_shard(
            {
                let mut all = live.iter().map(|&k| (k, false)).collect::<Vec<_>>();
                all.sort_unstable();
                all
            },
            shard_bits,
            false,
            true,
        );
        let mut written = KEY_COUNT;
        let mut rewritten = 0;
        let mut result = SimulationResult {
            compactions_with_bottom_merges: 0,
            written: 0,
            rewritten: 0,
            max_space_amplification: 0.0,
            max_files_per_shard: 0,
        };
        let hot_count = KEY_COUNT as usize / 20;
        for iteration in 0..iterations {
            let jobs = plan_compaction(&[(&containers[..], shard_bits)], config).remove(0);
            if jobs.iter().any(|job| job.bottom) {
                result.compactions_with_bottom_merges += 1;
            }
            rewritten += run_jobs(&mut containers, jobs, shard_bits);
            if iteration >= iterations / 4 {
                let stored = containers.iter().map(|c| c.keys.len()).sum::<usize>();
                result.max_space_amplification = result
                    .max_space_amplification
                    .max(stored as f64 / live.len() as f64);
                for shard in 0..shard_bits.count() {
                    let range = shard_bits.range(shard);
                    let files = containers
                        .iter()
                        .filter(|c| {
                            let r = c.range();
                            r.start() <= range.end() && range.start() <= r.end()
                        })
                        .count();
                    result.max_files_per_shard = result.max_files_per_shard.max(files);
                }
            }

            // Rewrite the hot keys (the first part of `live`) and churn the hot set a bit.
            let mut commit = live[..hot_count]
                .iter()
                .map(|&k| (k, false))
                .collect::<Vec<_>>();
            for _ in 0..hot_count / 10 {
                let i = rnd.random_range(0..hot_count);
                let j = rnd.random_range(hot_count..live.len());
                live.swap(i, j);
            }
            // Delete some cold keys and add as many new keys, like tasks collected and created by
            // a build, so the live data stays about the same size.
            for _ in 0..rnd.random_range(0..KEY_COUNT as usize / 200) {
                let i = rnd.random_range(hot_count..live.len());
                commit.push((live[i], true));
                let new_key = rnd.random::<u64>();
                live[i] = new_key;
                commit.push((new_key, false));
            }
            commit.sort_unstable();
            written += commit.len() as u64;
            containers.extend(split_by_shard(commit, shard_bits, false, true));
        }
        result.written = written;
        result.rewritten = rewritten;
        result
    }

    fn simulation_config(
        max_space_amplification_percent: u16,
        max_rewrite_factor: f32,
    ) -> CompactConfig {
        CompactConfig {
            max_space_amplification_percent: NonZeroU16::new(max_space_amplification_percent),
            max_rewrite_factor,
            max_merge_jobs: usize::MAX,
            ..test_config()
        }
    }

    #[test]
    fn simulate_compactions() {
        let config = simulation_config(50, 2.0);
        let result = simulate(&config, ShardBits::new(3), 200);
        let write_amplification = result.rewritten as f64 / result.written as f64;
        println!(
            "space amp {:.2}, write amp {write_amplification:.2}, files per shard {}, compactions \
             with bottom merges {}",
            result.max_space_amplification,
            result.max_files_per_shard,
            result.compactions_with_bottom_merges
        );
        // The bottom run of a shard lags its data by at most the threshold, plus one commit and the
        // shards waiting for budget.
        assert!(result.max_space_amplification < 1.6);
        assert!(result.max_files_per_shard <= config.max_files_above_bottom + 1);
        assert!(write_amplification < 2.0);
    }

    /// Prints the trade-off between space and write amplification.
    /// Run with `cargo test -p turbo-persistence -- --ignored --nocapture sweep`.
    #[test]
    #[ignore]
    fn sweep_space_amplification() {
        println!("space amp threshold % | rewrite factor | space amp | write amp | files/shard");
        for threshold in [25, 50, 100, 200] {
            for factor in [1.0, 2.0, 4.0, f32::INFINITY] {
                let result = simulate(
                    &simulation_config(threshold, factor),
                    ShardBits::new(3),
                    300,
                );
                println!(
                    "{threshold:>21} | {factor:>14} | {:>9.2} | {:>9.2} | {:>11}",
                    result.max_space_amplification,
                    result.rewritten as f64 / result.written as f64,
                    result.max_files_per_shard
                );
            }
        }
    }
}
