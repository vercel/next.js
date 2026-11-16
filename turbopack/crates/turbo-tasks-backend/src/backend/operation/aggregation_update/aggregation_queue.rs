//! Synthetic removal fixtures shared by the Criterion benches and normal-library profiling.
//!
//! This intentionally isolates queue handlers: all tasks are restored, backing storage is disabled,
//! there is one backend worker, and aggregation-number optimizations are disabled. There are no
//! task executions, concurrent graph mutations or active roots. It is not an end-to-end workload.

use std::sync::Arc;

use smallvec::smallvec;
use turbo_tasks::{CellId, TaskId, TraitTypeId, TurboTasks, ValueTypeId};

use crate::{
    backend::{
        BackendOptions, TaskDataCategory, TurboTasksBackend,
        operation::{
            ExecuteContext,
            aggregation_update::{AggregationUpdateJob, AggregationUpdateQueue},
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{AggregationNumber, CellRef, CollectibleRef},
    noop_backing_storage,
};

const UPPER: u32 = 1;
const UPPER_NUMBER: u32 = 100;
const INNER_NUMBER: u32 = 10;
const FOLLOWER_NUMBER: u32 = 200;
const SIZES: [usize; 7] = [1, 8, 16, 32, 33, 64, 66];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Placement {
    Inner,
    Follower,
    /// Even-indexed edge IDs are inner; odd-indexed edge IDs are followers.
    Mixed,
}

impl Placement {
    fn is_inner(self, index: usize) -> bool {
        match self {
            Self::Inner => true,
            Self::Follower => false,
            Self::Mixed => index.is_multiple_of(2),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Inner => "inner",
            Self::Follower => "follower",
            Self::Mixed => "mixed",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JobShape {
    /// One `InnerOfUppersLostFollower` per edge (the single-follower/Option path).
    SingleEdge,
    /// One `InnerOfUpperLostFollowers` per edge, with a one-ID vector payload.
    SingletonBatch,
    /// One `InnerOfUpperLostFollowers` containing every edge ID.
    FullBatch,
}

impl JobShape {
    fn name(self) -> &'static str {
        match self {
            Self::SingleEdge => "single_edge",
            Self::SingletonBatch => "singleton_batch",
            Self::FullBatch => "full_batch",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputOrder {
    Aligned,
    Reversed,
    /// Fisher-Yates shuffle using xorshift64, seeded with `0xA661_E6A7`.
    Permuted,
}

impl InputOrder {
    fn name(self) -> &'static str {
        match self {
            Self::Aligned => "aligned",
            Self::Reversed => "reversed",
            Self::Permuted => "permuted",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Config {
    pub edges: usize,
    pub placement: Placement,
    pub jobs: JobShape,
    pub data: bool,
    /// Either 1 (last-reference removal) or 2 (retained-reference removal).
    pub references: u32,
    pub order: InputOrder,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            edges: 32,
            placement: Placement::Follower,
            jobs: JobShape::FullBatch,
            data: true,
            references: 1,
            order: InputOrder::Aligned,
        }
    }
}

impl Config {
    pub fn follower_count(self) -> usize {
        (0..self.edges)
            .filter(|&index| !self.placement.is_inner(index))
            .count()
    }

    /// Includes both total edges and follower-side cardinality, which differ for mixed placement.
    /// Cardinality alone does not describe the backing map representation for arbitrary histories.
    pub fn name(self) -> String {
        format!(
            "{}/{}/edges{}_followers{}/data{}_refs{}/{}",
            self.placement.name(),
            self.jobs.name(),
            self.edges,
            self.follower_count(),
            u8::from(self.data),
            self.references,
            self.order.name(),
        )
    }

    /// The ten routine cases, or the full filterable 756-case matrix.
    pub fn cases(extended: bool) -> Vec<Self> {
        let mut cases = Vec::new();
        for placement in [Placement::Inner, Placement::Follower, Placement::Mixed] {
            for jobs in [
                JobShape::SingleEdge,
                JobShape::SingletonBatch,
                JobShape::FullBatch,
            ] {
                for &edges in if extended { &SIZES[..] } else { &[32] } {
                    for data in if extended {
                        &[false, true][..]
                    } else {
                        &[true]
                    } {
                        for &references in if extended { &[1, 2][..] } else { &[1] } {
                            for &order in if extended {
                                &[
                                    InputOrder::Aligned,
                                    InputOrder::Reversed,
                                    InputOrder::Permuted,
                                ][..]
                            } else {
                                &[InputOrder::Aligned]
                            } {
                                cases.push(Self {
                                    edges,
                                    placement,
                                    jobs,
                                    data: *data,
                                    references,
                                    order,
                                });
                            }
                        }
                    }
                }
            }
        }
        if !extended {
            cases.push(Self {
                edges: 33,
                ..Self::default()
            });
        }
        cases
    }
}

/// A deliberately small, unstable benchmark interface; queue jobs and task guards stay private.
///
/// Construction requires an entered multi-threaded Tokio runtime. Call [`Self::shutdown`] before
/// dropping that runtime. Check both phases outside timing to detect missing or repeated work.
pub struct Fixture {
    tt: Arc<TurboTasks<TurboTasksBackend>>,
    config: Config,
    removal_ids: Vec<TaskId>,
}

impl Fixture {
    pub fn new(config: Config) -> Self {
        assert!(SIZES.contains(&config.edges));
        assert!(matches!(config.references, 1 | 2));
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                num_workers: Some(1),
                small_preallocation: true,
                ..Default::default()
            },
            noop_backing_storage(),
        ));
        for task in 1..=config.edges as u32 + 1 {
            tt.backend()
                .storage
                .access_mut(id(task))
                .flags
                .set_restored(TaskDataCategory::All);
        }
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            for task_id in 1..=config.edges as u32 + 1 {
                let number = if task_id == UPPER {
                    UPPER_NUMBER
                } else if config.placement.is_inner((task_id - 2) as usize) {
                    INNER_NUMBER
                } else {
                    FOLLOWER_NUMBER
                };
                let mut task = ctx.task(id(task_id), TaskDataCategory::All);
                task.set_aggregation_number(AggregationNumber {
                    base: number,
                    distance: 0,
                    effective: number,
                });
                if config.data {
                    let _ = task.update_collectibles_positive_crossing(collectible(), 1);
                }
            }
        }
        let mut removal_ids: Vec<_> = (2..=config.edges as u32 + 1).map(id).collect();
        match config.order {
            InputOrder::Aligned => {}
            InputOrder::Reversed => removal_ids.reverse(),
            InputOrder::Permuted => {
                let mut state = 0xA661_E6A7_u64;
                for i in (1..removal_ids.len()).rev() {
                    state ^= state << 13;
                    state ^= state >> 7;
                    state ^= state << 17;
                    removal_ids.swap(i, (state % (i as u64 + 1)) as usize);
                }
            }
        }
        let fixture = Self {
            tt,
            config,
            removal_ids,
        };
        for _ in 0..config.references {
            fixture.restore();
        }
        fixture.check_restored();
        fixture
    }

    /// Times may include this entire call: payload construction, queue/context construction and
    /// draining real removal jobs, including their effects. No restoration or checks run here.
    pub fn remove(&self) {
        let mut ctx = ExecuteContext::new(self.tt.backend(), &self.tt);
        let mut queue = AggregationUpdateQueue::new_without_optimizations();
        match self.config.jobs {
            JobShape::SingleEdge => {
                queue.extend(self.removal_ids.iter().map(|&lost_follower_id| {
                    AggregationUpdateJob::InnerOfUppersLostFollower {
                        upper_ids: smallvec![id(UPPER)],
                        lost_follower_id,
                    }
                }));
            }
            JobShape::SingletonBatch => {
                queue.extend(self.removal_ids.iter().map(|&lost_follower_id| {
                    AggregationUpdateJob::InnerOfUpperLostFollowers {
                        upper_id: id(UPPER),
                        lost_follower_ids: smallvec![lost_follower_id],
                    }
                }));
            }
            JobShape::FullBatch => {
                queue.push(AggregationUpdateJob::InnerOfUpperLostFollowers {
                    upper_id: id(UPPER),
                    lost_follower_ids: self.removal_ids.iter().copied().collect(),
                });
            }
        }
        queue.execute(&mut ctx);
    }

    /// Restores one reference per edge in fixed insertion order, irrespective of removal order.
    pub fn restore(&self) {
        let mut ctx = ExecuteContext::new(self.tt.backend(), &self.tt);
        let mut queue = AggregationUpdateQueue::new_without_optimizations();
        // Separate one-ID additions keep insertion order fixed even for mixed placement: the
        // multi-ID addition handler may swap-remove inner IDs before inserting follower IDs.
        queue.extend((2..=self.config.edges as u32 + 1).map(|follower| {
            AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                upper_id: id(UPPER),
                new_follower_ids: smallvec![id(follower)],
            }
        }));
        queue.execute(&mut ctx);
    }

    pub fn check_removed(&self) {
        self.check(self.config.references - 1);
    }

    pub fn check_restored(&self) {
        self.check(self.config.references);
    }

    fn check(&self, references: u32) {
        let mut ctx = ExecuteContext::new(self.tt.backend(), &self.tt);
        let upper = ctx.task(id(UPPER), TaskDataCategory::All);
        let expected_followers = if references == 0 {
            0
        } else {
            self.config.follower_count()
        };
        assert_eq!(upper.followers_len(), expected_followers);
        assert!(upper.is_upper_empty());
        for index in 0..self.config.edges {
            let follower = id(index as u32 + 2);
            let expected = if self.config.placement.is_inner(index) {
                0
            } else {
                references
            };
            assert_eq!(
                i64::from(upper.get_followers(&follower).copied().unwrap_or_default()),
                i64::from(expected),
                "follower count for {follower}"
            );
        }
        let expected_data = if self.config.data && references > 0 {
            (self.config.edges - self.config.follower_count()) as i32
        } else {
            0
        };
        assert_eq!(
            upper
                .get_aggregated_collectibles(&collectible())
                .copied()
                .unwrap_or_default(),
            expected_data,
        );
        assert_eq!(
            upper.aggregated_collectibles_len(),
            usize::from(expected_data != 0)
        );
        // Own collectibles are never removed by changing an aggregation edge.
        assert_eq!(
            upper
                .get_collectibles(&collectible())
                .copied()
                .unwrap_or_default(),
            i32::from(self.config.data)
        );
        drop(upper);
        for index in 0..self.config.edges {
            let follower = id(index as u32 + 2);
            let task = ctx.task(follower, TaskDataCategory::All);
            let expected = if self.config.placement.is_inner(index) {
                references
            } else {
                0
            };
            assert_eq!(
                task.get_upper(&id(UPPER)).copied().unwrap_or_default(),
                expected
            );
            assert_eq!(task.upper_len(), usize::from(expected != 0));
            assert!(task.is_followers_empty());
            assert!(task.is_aggregated_collectibles_empty());
            assert_eq!(
                task.get_collectibles(&collectible())
                    .copied()
                    .unwrap_or_default(),
                i32::from(self.config.data)
            );
        }
    }

    /// Drains runtime work and releases the synthetic backend, outside all measurements.
    pub async fn shutdown(self) {
        self.tt.stop_and_wait().await;
    }
}

fn id(value: u32) -> TaskId {
    TaskId::new(value).unwrap()
}

fn collectible() -> CollectibleRef {
    CollectibleRef {
        collectible_type: TraitTypeId::new(1).unwrap(),
        cell: CellRef {
            task: id(1000),
            cell: CellId::new(ValueTypeId::new(1).unwrap(), 0),
        },
    }
}

#[cfg(test)]
mod tests {
    use crate::private::aggregation_queue::{Config, Fixture, InputOrder, Placement};

    #[tokio::test(flavor = "multi_thread")]
    async fn fixture_matrix_checks_removal_and_restoration() {
        let cases = Config::cases(true);
        assert_eq!(cases.len(), 756);
        for config in cases {
            let fixture = Fixture::new(config);
            for _ in 0..3 {
                fixture.remove();
                fixture.check_removed();
                fixture.restore();
                fixture.check_restored();
            }
            fixture.shutdown().await;
        }
    }

    #[test]
    fn routine_selection_names_both_cardinalities() {
        assert_eq!(Config::cases(false).len(), 10);
        let mixed = Config {
            placement: Placement::Mixed,
            edges: 66,
            ..Config::default()
        };
        assert_eq!(mixed.follower_count(), 33);
        assert!(mixed.name().contains("edges66_followers33"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn permutation_is_reproducible_and_preserves_ids() {
        let config = Config {
            order: InputOrder::Permuted,
            ..Config::default()
        };
        let first = Fixture::new(config);
        let second = Fixture::new(config);
        assert_eq!(first.removal_ids, second.removal_ids);
        let mut sorted = first.removal_ids.clone();
        sorted.sort_unstable();
        assert_ne!(first.removal_ids, sorted);
        assert_eq!(sorted.len(), config.edges);
        assert!(sorted.windows(2).all(|pair| pair[0] < pair[1]));
        first.shutdown().await;
        second.shutdown().await;
    }
}
