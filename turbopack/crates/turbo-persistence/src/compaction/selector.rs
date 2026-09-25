//! Chooses which SST files to merge.
//!
//! The key space of each family is split into shards (see [`crate::shard`]) and SST files don't
//! span shard boundaries, so every shard is compacted on its own. A shard consists of a bottom run
//! (the files written by the last merge of the whole shard, flagged as bottom) and the files
//! written since then, above it. Two kinds of merge jobs keep a shard in shape:
//!
//! - A bottom merge merges all files of the shard into a new bottom run. It drops all superseded
//!   entries and all tombstones, so it bounds the space amplification: it runs when the files above
//!   the bottom run are larger than `max_space_amplification` times the bottom run. A tombstone is
//!   small, but deletes an entry of the bottom run, so it counts as an average bottom entry.
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
//! When the shard count of a family grows, older files cover multiple of the new shards. A merge
//! job then covers all shards that such a file overlaps (a "component"), and its output is split at
//! the new shard boundaries.

use std::ops::RangeInclusive;

use smallvec::SmallVec;

use crate::shard::shard_index;

/// Represents part of a database (i.e. an SST file) with a range of keys (i.e. hashes) and a size
/// of that data in bytes.
pub trait Compactable {
    /// The range of keys stored in this database segment.
    fn range(&self) -> RangeInclusive<u64>;

    /// The size of the compactable database segment in bytes.
    fn size(&self) -> u64;

    /// Whether the segment is part of the bottom run of its shard.
    fn is_bottom(&self) -> bool {
        false
    }

    /// Whether the segment was written by a commit and not compacted yet.
    fn is_fresh(&self) -> bool {
        false
    }

    /// The number of entries in the segment.
    fn entry_count(&self) -> u64 {
        0
    }

    /// The number of tombstones in the segment.
    fn tombstone_count(&self) -> u64 {
        0
    }
}

/// Configuration for the compaction algorithm.
#[derive(Clone, Debug)]
pub struct CompactConfig {
    /// A shard is merged into a new bottom run when the files above its bottom run are larger than
    /// this factor times the bottom run. `0.0` merges every shard that has files above the bottom.
    pub max_space_amplification: f32,

    /// The files above the bottom run of a shard are merged when there are more than this many.
    pub max_files_above_bottom: usize,

    /// Bottom merges of a family stop once they rewrote this factor times the size of the fresh
    /// files of the family. The first bottom merge of a family always runs.
    pub max_rewrite_factor: f32,

    /// The maximum number of merge jobs, across all families.
    pub max_merge_segment_count: usize,
}

impl Default for CompactConfig {
    fn default() -> Self {
        Self {
            max_space_amplification: 0.5,
            max_files_above_bottom: 4,
            max_rewrite_factor: 2.0,
            max_merge_segment_count: 8,
        }
    }
}

impl CompactConfig {
    /// A config that merges every shard with files above its bottom run into a new bottom run.
    pub fn full() -> Self {
        Self {
            max_space_amplification: 0.0,
            max_files_above_bottom: usize::MAX,
            max_rewrite_factor: f32::INFINITY,
            max_merge_segment_count: usize::MAX,
        }
    }
}

/// A set of compactables to merge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeJob {
    /// Indices of the compactables, in ascending (read) order.
    pub members: SmallVec<[usize; 1]>,
    /// Whether the job merges all files of its shards, i.e. writes a new bottom run.
    pub bottom: bool,
}

/// A planned merge job and how urgent it is, before merge jobs are selected across families.
struct Candidate {
    job: MergeJob,
    /// Higher is more urgent.
    priority: f32,
}

/// Groups the compactables into components: each file covers all shards its range overlaps, and
/// overlapping covers are merged. With files that don't span shard boundaries, each component is a
/// single shard. Returns the members of each component in ascending order.
fn components<T: Compactable>(compactables: &[T], shard_count: u32) -> Vec<Vec<usize>> {
    let mut spans = compactables
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let range = c.range();
            (
                shard_index(*range.start(), shard_count),
                shard_index(*range.end(), shard_count),
                i,
            )
        })
        .collect::<Vec<_>>();
    spans.sort_unstable();
    let mut result: Vec<(u32, Vec<usize>)> = Vec::new();
    for (first, last, i) in spans {
        match result.last_mut() {
            Some((end, members)) if first <= *end => {
                *end = (*end).max(last);
                members.push(i);
            }
            _ => result.push((last, vec![i])),
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

fn intermediate_candidate(above: Vec<usize>, config: &CompactConfig) -> Candidate {
    Candidate {
        priority: above.len() as f32 / config.max_files_above_bottom.max(1) as f32,
        job: MergeJob {
            members: above.into_iter().collect(),
            bottom: false,
        },
    }
}

/// Plans the merge jobs of one family, bottom merges first, each kind most urgent first.
fn plan_family<T: Compactable>(
    compactables: &[T],
    shard_count: u32,
    config: &CompactConfig,
) -> Vec<Candidate> {
    let fresh_bytes = compactables
        .iter()
        .filter(|c| c.is_fresh())
        .map(|c| c.size())
        .sum::<u64>();

    let mut bottom_candidates = Vec::new();
    let mut intermediate_candidates = Vec::new();
    for members in components(compactables, shard_count) {
        let (bottom, above): (Vec<usize>, Vec<usize>) =
            members.iter().partition(|&&i| compactables[i].is_bottom());
        if above.is_empty() {
            continue;
        }
        debug_assert!(
            bottom.last() < above.first(),
            "bottom files must be older than the files above them"
        );
        let bottom_bytes = bottom.iter().map(|&i| compactables[i].size()).sum::<u64>();
        let above_bytes = above.iter().map(|&i| compactables[i].size()).sum::<u64>();
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
        let amplification = if bottom_bytes == 0 {
            f32::INFINITY
        } else {
            ((above_bytes + deleted_bytes) as f64 / bottom_bytes as f64) as f32
        };
        if amplification > config.max_space_amplification {
            let candidate = Candidate {
                job: MergeJob {
                    members: members.into_iter().collect(),
                    bottom: true,
                },
                priority: amplification,
            };
            bottom_candidates.push((candidate, bottom_bytes + above_bytes, above));
        } else if above.len() > config.max_files_above_bottom {
            intermediate_candidates.push(intermediate_candidate(above, config));
        }
    }

    // Spend the budget on the most amplified shards. Shards that don't fit into the budget still
    // get an intermediate merge if they have too many files.
    bottom_candidates.sort_by(|a, b| b.0.priority.total_cmp(&a.0.priority));
    let budget = if config.max_rewrite_factor.is_finite() {
        (f64::from(config.max_rewrite_factor) * fresh_bytes as f64) as u64
    } else {
        u64::MAX
    };
    let mut spent = 0u64;
    let mut result = Vec::new();
    for (candidate, cost, above) in bottom_candidates {
        if result.is_empty() || spent < budget {
            spent = spent.saturating_add(cost);
            result.push(candidate);
        } else if above.len() > config.max_files_above_bottom {
            intermediate_candidates.push(intermediate_candidate(above, config));
        }
    }
    intermediate_candidates.sort_by(|a, b| b.priority.total_cmp(&a.priority));
    result.extend(intermediate_candidates);
    result
}

/// Plans the merge jobs for all families, limited to `max_merge_segment_count` jobs in total.
/// Each family is given as its compactables, in the order they are read (oldest first), and its
/// shard count.
///
/// Returns the merge jobs of each family. The jobs of a family don't overlap each other, and each
/// includes all files overlapping it, except that an intermediate merge leaves out the bottom run,
/// which is older. So the outputs can be placed after all existing files without moving any file.
pub fn plan_compaction<T: Compactable>(
    families: &[(&[T], u32)],
    config: &CompactConfig,
) -> Vec<Vec<MergeJob>> {
    let mut candidates = families
        .iter()
        .enumerate()
        .flat_map(|(family, (compactables, shard_count))| {
            plan_family(compactables, *shard_count, config)
                .into_iter()
                .enumerate()
                .map(move |(order, candidate)| (family, order, candidate))
        })
        .collect::<Vec<_>>();
    // Bottom merges first, then by priority. Ties keep each family's order, then family order.
    candidates.sort_by(|a, b| {
        b.2.job
            .bottom
            .cmp(&a.2.job.bottom)
            .then(b.2.priority.total_cmp(&a.2.priority))
            .then(a.1.cmp(&b.1))
            .then(a.0.cmp(&b.0))
    });
    let mut result = vec![Vec::new(); families.len()];
    for (family, _, candidate) in candidates.into_iter().take(config.max_merge_segment_count) {
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
    use crate::shard::shard_range;

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
    }

    fn file(shard: u32, shard_count: u32, size: u64, bottom: bool, fresh: bool) -> File {
        File {
            range: shard_range(shard, shard_count),
            size,
            bottom,
            fresh,
        }
    }

    fn plan(files: &[File], shard_count: u32, config: &CompactConfig) -> Vec<(Vec<usize>, bool)> {
        plan_compaction(&[(files, shard_count)], config)
            .remove(0)
            .into_iter()
            .map(|job| (job.members.to_vec(), job.bottom))
            .collect()
    }

    #[test]
    fn test_shard_without_bottom_run_gets_one() {
        let files = [file(0, 1, 100, false, true), file(0, 1, 100, false, true)];
        assert_eq!(
            plan(&files, 1, &CompactConfig::default()),
            vec![(vec![0, 1], true)]
        );
    }

    #[test]
    fn test_bottom_merge_by_space_amplification() {
        let config = CompactConfig::default();
        // 40% above the bottom run: nothing to do.
        let files = [file(0, 1, 1000, true, false), file(0, 1, 400, false, true)];
        assert_eq!(plan(&files, 1, &config), vec![]);
        // 60%: merge the shard into a new bottom run.
        let files = [file(0, 1, 1000, true, false), file(0, 1, 600, false, true)];
        assert_eq!(plan(&files, 1, &config), vec![(vec![0, 1], true)]);
    }

    #[test]
    fn test_intermediate_merge_by_file_count() {
        let mut files = vec![file(0, 1, 1000, true, false)];
        files.extend((0..5).map(|_| file(0, 1, 10, false, true)));
        assert_eq!(
            plan(&files, 1, &CompactConfig::default()),
            vec![(vec![1, 2, 3, 4, 5], false)]
        );
        files.pop();
        assert_eq!(plan(&files, 1, &CompactConfig::default()), vec![]);
    }

    #[test]
    fn test_budget_spreads_bottom_merges() {
        // All four shards are above the threshold, but the fresh data only pays for one bottom
        // merge. The most amplified shard goes first.
        let mut files = (0..4)
            .map(|shard| file(shard, 4, 1000, true, false))
            .collect::<Vec<_>>();
        files.extend((0..4).map(|shard| file(shard, 4, 600 + u64::from(shard), false, true)));
        let config = CompactConfig {
            max_rewrite_factor: 0.1,
            ..Default::default()
        };
        assert_eq!(plan(&files, 4, &config), vec![(vec![3, 7], true)]);
        // With enough budget, all of them are merged.
        assert_eq!(
            plan(&files, 4, &CompactConfig::default()),
            vec![
                (vec![0, 4], true),
                (vec![1, 5], true),
                (vec![2, 6], true),
                (vec![3, 7], true)
            ]
        );
    }

    #[test]
    fn test_coarse_files_merge_the_shards_they_span() {
        // A bottom run written with 2 shards, and fresh files written with 4 shards.
        let files = [
            file(0, 2, 1000, true, false),
            file(1, 2, 1000, true, false),
            file(0, 4, 600, false, true),
            file(1, 4, 10, false, true),
            file(3, 4, 10, false, true),
        ];
        assert_eq!(
            plan(&files, 4, &CompactConfig::default()),
            vec![(vec![0, 2, 3], true)]
        );
    }

    #[test]
    fn test_merge_job_limit_across_families() {
        let a = [file(0, 1, 100, false, true), file(0, 1, 100, false, true)];
        let b = [file(0, 1, 100, false, true), file(0, 1, 100, false, true)];
        let config = CompactConfig {
            max_merge_segment_count: 1,
            ..Default::default()
        };
        let jobs = plan_compaction(&[(&a[..], 1), (&b[..], 1)], &config);
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
        shard_count: u32,
        bottom: bool,
        fresh: bool,
    ) -> Vec<Container> {
        let mut by_shard = BTreeMap::<u32, Vec<(u64, bool)>>::new();
        for entry in entries {
            by_shard
                .entry(shard_index(entry.0, shard_count))
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
    fn run_jobs(containers: &mut Vec<Container>, jobs: Vec<MergeJob>, shard_count: u32) -> u64 {
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
            outputs.extend(split_by_shard(entries, shard_count, job.bottom, false));
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
    fn simulate(config: &CompactConfig, shard_count: u32, iterations: usize) -> SimulationResult {
        let mut rnd = rand::rngs::SmallRng::from_seed([0; 32]);
        let mut live = (0..KEY_COUNT).map(|k| k * KEY_SCALE).collect::<Vec<_>>();
        live.shuffle(&mut rnd);
        let mut containers = split_by_shard(
            {
                let mut all = live.iter().map(|&k| (k, false)).collect::<Vec<_>>();
                all.sort_unstable();
                all
            },
            shard_count,
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
            let jobs = plan_compaction(&[(&containers[..], shard_count)], config).remove(0);
            if jobs.iter().any(|job| job.bottom) {
                result.compactions_with_bottom_merges += 1;
            }
            rewritten += run_jobs(&mut containers, jobs, shard_count);
            if iteration >= iterations / 4 {
                let stored = containers.iter().map(|c| c.keys.len()).sum::<usize>();
                result.max_space_amplification = result
                    .max_space_amplification
                    .max(stored as f64 / live.len() as f64);
                for shard in 0..shard_count {
                    let range = shard_range(shard, shard_count);
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
            containers.extend(split_by_shard(commit, shard_count, false, true));
        }
        result.written = written;
        result.rewritten = rewritten;
        result
    }

    fn simulation_config(max_space_amplification: f32, max_rewrite_factor: f32) -> CompactConfig {
        CompactConfig {
            max_space_amplification,
            max_rewrite_factor,
            max_merge_segment_count: usize::MAX,
            ..Default::default()
        }
    }

    #[test]
    fn simulate_compactions() {
        let config = simulation_config(0.5, 2.0);
        let result = simulate(&config, 8, 200);
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
        println!("space amp threshold | rewrite factor | space amp | write amp | files/shard");
        for threshold in [0.25, 0.5, 1.0, 2.0] {
            for factor in [1.0, 2.0, 4.0, f32::INFINITY] {
                let result = simulate(&simulation_config(threshold, factor), 8, 300);
                println!(
                    "{threshold:>19} | {factor:>14} | {:>9.2} | {:>9.2} | {:>11}",
                    result.max_space_amplification,
                    result.rewritten as f64 / result.written as f64,
                    result.max_files_per_shard
                );
            }
        }
    }
}
