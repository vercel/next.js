/// The merge and move jobs that the compaction algorithm has computed. It's expected that all move
/// jobs are executed in parallel and when that has finished the move jobs are executed in parallel.
#[derive(Debug)]
pub struct CompactionJobs {
    pub merge_jobs: Vec<Vec<usize>>,
    pub move_jobs: Vec<usize>,
}

impl CompactionJobs {
    #[cfg(test)]
    pub(self) fn is_empty(&self) -> bool {
        self.merge_jobs.is_empty() && self.move_jobs.is_empty()
    }
}

type Range = (u64, u64);

/// The trait for the input of the compaction algorithm.
pub trait Compactable {
    /// Returns the range of the compactable.
    fn range(&self) -> Range;
}

fn is_overlapping(a: &Range, b: &Range) -> bool {
    a.0 <= b.1 && b.0 <= a.1
}

fn spread(range: &Range) -> u64 {
    range.1 - range.0
}

/// Extends the range `a` to include the range `b`, returns `true` if the range was extended.
fn extend_range(a: &mut Range, b: &Range) -> bool {
    let mut extended = false;
    if b.0 < a.0 {
        a.0 = b.0;
        extended = true;
    }
    if b.1 > a.1 {
        a.1 = b.1;
        extended = true;
    }
    extended
}

/// Computes the total coverage of the compactables.
pub fn total_coverage<T: Compactable>(compactables: &[T], full_range: Range) -> f32 {
    let mut coverage = 0.0f32;
    for c in compactables {
        let range = c.range();
        coverage += spread(&range) as f32;
    }
    coverage / spread(&full_range) as f32
}

/// Configuration for the compaction algorithm.
pub struct CompactConfig {
    /// The maximum number of files to merge at once.
    pub max_merge: usize,

    /// The minimum number of files to merge at once.
    pub min_merge: usize,
}

/// For a list of compactables, computes merge and move jobs that are expected to perform best.
pub fn get_compaction_jobs<T: Compactable>(
    compactables: &[T],
    config: &CompactConfig,
) -> CompactionJobs {
    let (jobs, _) = get_compaction_jobs_internal(compactables, config, 0);
    jobs
}

fn get_compaction_jobs_internal<T: Compactable>(
    compactables: &[T],
    config: &CompactConfig,
    start_index: usize,
) -> (CompactionJobs, f32) {
    let len = compactables.len();
    let mut used_compactables = vec![false; len];
    let mut need_move = vec![false; len];
    let mut merge_jobs = Vec::new();
    let mut merge_jobs_reducation = 0.0f32;
    let mut move_jobs = Vec::new();

    let age = |i| (len - 1 - i) as f32;

    loop {
        // Find the first unused compactable.
        let Some(start) = used_compactables
            .iter()
            .skip(start_index)
            .position(|&used| !used)
            .map(|i| i + start_index)
        else {
            break;
        };
        if start >= len - 1 {
            break;
        }
        used_compactables[start] = true;
        let start_range = compactables[start].range();
        let mut range = start_range;

        let mut merge_job = Vec::new();
        merge_job.push(start);
        let mut merge_job_input_spread = spread(&start_range) as f32;

        'outer: loop {
            // Find the next overlapping unused compactable and extend the range to cover it.
            // If it already covers it, add this to the current set.
            let mut i = start + 1;
            loop {
                if !used_compactables[i] {
                    let range_for_i = compactables[i].range();
                    if is_overlapping(&range, &range_for_i) {
                        let mut extended_range = range;
                        if !extend_range(&mut extended_range, &range_for_i) {
                            used_compactables[i] = true;
                            merge_job.push(i);
                            merge_job_input_spread += spread(&range_for_i) as f32;
                        } else {
                            let s = spread(&range);
                            // Disallow doubling the range spread
                            if merge_job.len() >= config.min_merge
                                && spread(&extended_range) - s > s
                            {
                                break 'outer;
                            }
                            range = extended_range;
                            // Need to restart the search from the beginning as the extended range
                            // may overlap with compactables that were
                            // already processed.
                            break;
                        }
                    }
                }
                i += 1;
                if i >= compactables.len() {
                    break 'outer;
                }
                if merge_job.len() >= config.max_merge {
                    break 'outer;
                }
            }
        }

        if merge_job.len() < config.min_merge {
            continue;
        }
        let mut merge_range = compactables[start].range();
        if !merge_job
            .iter()
            .skip(1)
            .any(|&i| is_overlapping(&merge_range, &compactables[i].range()))
        {
            // No overlapping ranges, skip that merge job.
            continue;
        }

        for &i in merge_job.iter().skip(1) {
            extend_range(&mut merge_range, &compactables[i].range());
        }
        merge_jobs_reducation = (merge_job_input_spread - spread(&merge_range) as f32) * age(start);

        for (i, compactable) in compactables
            .iter()
            .enumerate()
            .skip(merge_job.last().unwrap() + 1)
        {
            if used_compactables[i] {
                continue;
            }
            let range = compactable.range();
            if is_overlapping(&merge_range, &range) && !need_move[i] {
                need_move[i] = true;
                used_compactables[i] = true;
                move_jobs.push(i);
            }
        }

        merge_jobs.push(merge_job);
    }

    // Check if there is an alternative with better reduction.
    if !move_jobs.is_empty() {
        let offset = move_jobs[0];
        let (result, estimated_reduction) =
            get_compaction_jobs_internal(compactables, config, offset);
        if estimated_reduction > merge_jobs_reducation {
            return (result, estimated_reduction);
        }
    }

    move_jobs.sort_unstable();

    (
        CompactionJobs {
            merge_jobs,
            move_jobs,
        },
        merge_jobs_reducation,
    )
}

#[cfg(test)]
mod tests {
    use std::{
        fmt::Debug,
        mem::{swap, take},
    };

    use rand::{Rng, SeedableRng};

    use super::*;

    struct TestCompactable {
        range: Range,
    }

    impl Compactable for TestCompactable {
        fn range(&self) -> Range {
            self.range
        }
    }

    fn compact<const N: usize>(ranges: [(u64, u64); N], max_merge: usize) -> CompactionJobs {
        let compactables = ranges
            .iter()
            .map(|&range| TestCompactable { range })
            .collect::<Vec<_>>();
        let config = CompactConfig {
            max_merge,
            min_merge: 2,
        };
        get_compaction_jobs(&compactables, &config)
    }

    #[test]
    fn test_compaction_jobs() {
        let CompactionJobs {
            merge_jobs,
            move_jobs,
            ..
        } = compact(
            [
                (0, 10),
                (10, 30),
                (9, 13),
                (0, 30),
                (40, 44),
                (41, 42),
                (41, 47),
                (90, 100),
                (30, 40),
            ],
            3,
        );
        assert_eq!(merge_jobs, vec![vec![0, 1, 2], vec![4, 5, 6]]);
        assert_eq!(move_jobs, vec![3, 8]);
    }

    #[test]
    fn simulate_compactions() {
        let mut rnd = rand::rngs::SmallRng::from_seed([0; 32]);
        let mut keys = (0..1000)
            .map(|_| rnd.gen_range(0..10000))
            .collect::<Vec<_>>();

        let mut containers = keys
            .chunks(100)
            .map(|keys| Container::new(keys.to_vec()))
            .collect::<Vec<_>>();

        let mut warm_keys = (0..100)
            .map(|_| {
                let i = rnd.gen_range(0..keys.len());
                keys.swap_remove(i)
            })
            .collect::<Vec<_>>();

        let mut number_of_compactions = 0;

        for _ in 0..100 {
            let coverage = total_coverage(&containers, (0, 10000));
            println!(
                "{containers:#?} coverage: {}, items: {}",
                coverage,
                containers.len()
            );

            if coverage > 10.0 {
                let config = CompactConfig {
                    max_merge: 4,
                    min_merge: 2,
                };
                let jobs = get_compaction_jobs(&containers, &config);
                if !jobs.is_empty() {
                    println!("{jobs:?}");

                    do_compact(&mut containers, jobs);
                    number_of_compactions += 1;
                }
            } else {
                println!("No compaction needed");
            }

            // Modify warm keys
            containers.push(Container::new(warm_keys.clone()));

            // Change some warm keys
            for _ in 0..10 {
                let i = rnd.gen_range(0..warm_keys.len());
                let j = rnd.gen_range(0..keys.len());
                swap(&mut warm_keys[i], &mut keys[j]);
            }
        }
        println!("Number of compactions: {}", number_of_compactions);

        assert!(containers.len() < 40);
        let coverage = total_coverage(&containers, (0, 10000));
        assert!(coverage < 12.0);
    }

    struct Container {
        keys: Vec<u64>,
    }

    impl Container {
        fn new(mut keys: Vec<u64>) -> Self {
            keys.sort_unstable();
            Self { keys }
        }
    }

    impl Compactable for Container {
        fn range(&self) -> Range {
            (self.keys[0], *self.keys.last().unwrap())
        }
    }

    impl Debug for Container {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            let (l, r) = self.range();
            write!(f, "{} {l} - {r} ({})", self.keys.len(), r - l)
        }
    }

    fn do_compact(containers: &mut Vec<Container>, jobs: CompactionJobs) {
        for merge_job in jobs.merge_jobs {
            let mut keys = Vec::new();
            for i in merge_job {
                keys.append(&mut containers[i].keys);
            }
            keys.sort_unstable();
            keys.dedup();
            containers.extend(keys.chunks(100).map(|keys| Container {
                keys: keys.to_vec(),
            }));
        }

        for i in jobs.move_jobs {
            let moved_container = Container {
                keys: take(&mut containers[i].keys),
            };
            containers.push(moved_container);
        }

        containers.retain(|c| !c.keys.is_empty());
    }
}
