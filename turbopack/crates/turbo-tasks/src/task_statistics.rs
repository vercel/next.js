use std::sync::{Arc, OnceLock};

use serde::{
    Serialize, Serializer,
    ser::{SerializeMap, SerializeStruct},
};

use crate::{FxDashMap, backend::TaskExecutionAbortReason, macro_helpers::NativeFunction};

/// An API for optionally enabling, updating, and reading aggregated statistics.
#[derive(Default)]
pub struct TaskStatisticsApi {
    inner: OnceLock<Arc<TaskStatistics>>,
}

impl TaskStatisticsApi {
    pub fn enable(&self) -> &Arc<TaskStatistics> {
        self.inner.get_or_init(|| {
            Arc::new(TaskStatistics {
                inner: FxDashMap::with_hasher(Default::default()),
            })
        })
    }

    // Calls `func` if statistics have been enabled (via
    // [`TaskStatisticsApi::enable`]).
    pub fn map<T>(&self, func: impl FnOnce(&Arc<TaskStatistics>) -> T) -> Option<T> {
        self.get().map(func)
    }

    // Returns the statistics if they have been enabled (via
    // [`TaskStatisticsApi::enable`]).
    pub fn get(&self) -> Option<&Arc<TaskStatistics>> {
        self.inner.get()
    }
}

/// A type representing the enabled state of [`TaskStatisticsApi`]. Implements [`serde::Serialize`].
pub struct TaskStatistics {
    inner: FxDashMap<&'static NativeFunction, TaskFunctionStatistics>,
}

impl TaskStatistics {
    pub fn increment_cache_hit(&self, native_fn: &'static NativeFunction) {
        self.with_task_type_statistics(native_fn, |stats| stats.cache_hit += 1)
    }

    pub fn increment_cache_miss(&self, native_fn: &'static NativeFunction) {
        self.with_task_type_statistics(native_fn, |stats| stats.cache_miss += 1)
    }

    pub fn increment_execution_started(&self, native_fn: &'static NativeFunction) {
        self.with_task_type_statistics(native_fn, |stats| stats.execution_started += 1)
    }

    pub fn increment_execution_completed(&self, native_fn: &'static NativeFunction) {
        self.with_task_type_statistics(native_fn, |stats| stats.execution_completed += 1)
    }

    pub fn increment_abort_requested(
        &self,
        native_fn: &'static NativeFunction,
        reason: TaskExecutionAbortReason,
    ) {
        self.with_task_type_statistics(native_fn, |stats| match reason {
            TaskExecutionAbortReason::Invalidation => stats.abort_requested_invalidation += 1,
            TaskExecutionAbortReason::Inactive => stats.abort_requested_inactive += 1,
            TaskExecutionAbortReason::Gc => stats.abort_requested_gc += 1,
        })
    }

    pub fn increment_abort_observed(
        &self,
        native_fn: &'static NativeFunction,
        reason: TaskExecutionAbortReason,
    ) {
        self.with_task_type_statistics(native_fn, |stats| match reason {
            TaskExecutionAbortReason::Invalidation => stats.abort_observed_invalidation += 1,
            TaskExecutionAbortReason::Inactive => stats.abort_observed_inactive += 1,
            TaskExecutionAbortReason::Gc => stats.abort_observed_gc += 1,
        })
    }

    pub fn increment_abort_raced_completion(
        &self,
        native_fn: &'static NativeFunction,
        reason: TaskExecutionAbortReason,
    ) {
        self.with_task_type_statistics(native_fn, |stats| match reason {
            TaskExecutionAbortReason::Invalidation => {
                stats.abort_raced_completion_invalidation += 1
            }
            TaskExecutionAbortReason::Inactive => stats.abort_raced_completion_inactive += 1,
            TaskExecutionAbortReason::Gc => stats.abort_raced_completion_gc += 1,
        })
    }

    pub fn increment_abort_skipped(
        &self,
        native_fn: &'static NativeFunction,
        reason: TaskExecutionAbortReason,
    ) {
        self.with_task_type_statistics(native_fn, |stats| match reason {
            TaskExecutionAbortReason::Invalidation => stats.abort_skipped_invalidation += 1,
            TaskExecutionAbortReason::Inactive => stats.abort_skipped_inactive += 1,
            TaskExecutionAbortReason::Gc => stats.abort_skipped_gc += 1,
        })
    }

    fn with_task_type_statistics(
        &self,
        native_fn: &'static NativeFunction,
        func: impl Fn(&mut TaskFunctionStatistics),
    ) {
        func(self.inner.entry(native_fn).or_default().value_mut())
    }

    pub fn get(&self, f: &'static NativeFunction) -> TaskFunctionStatistics {
        self.inner.get(f).unwrap().value().clone()
    }
}

/// Statistics for an individual function.
#[derive(Default, Clone)]
pub struct TaskFunctionStatistics {
    pub cache_hit: u32,
    pub cache_miss: u32,
    pub execution_started: u64,
    pub execution_completed: u64,
    pub abort_requested_invalidation: u64,
    pub abort_requested_inactive: u64,
    pub abort_requested_gc: u64,
    pub abort_observed_invalidation: u64,
    pub abort_observed_inactive: u64,
    pub abort_observed_gc: u64,
    pub abort_raced_completion_invalidation: u64,
    pub abort_raced_completion_inactive: u64,
    pub abort_raced_completion_gc: u64,
    pub abort_skipped_invalidation: u64,
    pub abort_skipped_inactive: u64,
    pub abort_skipped_gc: u64,
}

impl TaskFunctionStatistics {
    fn has_abort_activity(&self) -> bool {
        self.abort_requested_invalidation != 0
            || self.abort_requested_inactive != 0
            || self.abort_requested_gc != 0
            || self.abort_observed_invalidation != 0
            || self.abort_observed_inactive != 0
            || self.abort_observed_gc != 0
            || self.abort_raced_completion_invalidation != 0
            || self.abort_raced_completion_inactive != 0
            || self.abort_raced_completion_gc != 0
            || self.abort_skipped_invalidation != 0
            || self.abort_skipped_inactive != 0
            || self.abort_skipped_gc != 0
    }
}

impl Serialize for TaskFunctionStatistics {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let has_abort_activity = self.has_abort_activity();
        let mut len = 2;
        if has_abort_activity {
            len += 2;
            len += [
                self.abort_requested_invalidation,
                self.abort_requested_inactive,
                self.abort_requested_gc,
                self.abort_observed_invalidation,
                self.abort_observed_inactive,
                self.abort_observed_gc,
                self.abort_raced_completion_invalidation,
                self.abort_raced_completion_inactive,
                self.abort_raced_completion_gc,
                self.abort_skipped_invalidation,
                self.abort_skipped_inactive,
                self.abort_skipped_gc,
            ]
            .into_iter()
            .filter(|value| *value != 0)
            .count();
        }

        let mut state = serializer.serialize_struct("TaskFunctionStatistics", len)?;
        state.serialize_field("cache_hit", &self.cache_hit)?;
        state.serialize_field("cache_miss", &self.cache_miss)?;
        if has_abort_activity {
            state.serialize_field("execution_started", &self.execution_started)?;
            state.serialize_field("execution_completed", &self.execution_completed)?;
            macro_rules! serialize_nonzero {
                ($field:ident) => {
                    if self.$field != 0 {
                        state.serialize_field(stringify!($field), &self.$field)?;
                    }
                };
            }
            serialize_nonzero!(abort_requested_invalidation);
            serialize_nonzero!(abort_requested_inactive);
            serialize_nonzero!(abort_requested_gc);
            serialize_nonzero!(abort_observed_invalidation);
            serialize_nonzero!(abort_observed_inactive);
            serialize_nonzero!(abort_observed_gc);
            serialize_nonzero!(abort_raced_completion_invalidation);
            serialize_nonzero!(abort_raced_completion_inactive);
            serialize_nonzero!(abort_raced_completion_gc);
            serialize_nonzero!(abort_skipped_invalidation);
            serialize_nonzero!(abort_skipped_inactive);
            serialize_nonzero!(abort_skipped_gc);
        }
        state.end()
    }
}

impl Serialize for TaskStatistics {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        // Sort by `global_name` so the emitted JSON is deterministic — the
        // underlying `FxDashMap` has unspecified iteration order. The map is
        // small (~1500 entries in practice), so the sort cost is negligible
        // and not worth optimizing.
        let mut entries: Vec<_> = self
            .inner
            .iter()
            .map(|e| (e.key().ty.global_name, e.value().clone()))
            .collect();
        entries.sort_unstable_by_key(|(name, _)| *name);
        let mut map = serializer.serialize_map(Some(entries.len()))?;
        for (name, stats) in &entries {
            map.serialize_entry(name, stats)?;
        }
        map.end()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};

    use serde_json::json;

    use super::{TaskFunctionStatistics, TaskStatisticsApi};

    #[test]
    fn disabled_statistics_do_not_run_updates() {
        let api = TaskStatisticsApi::default();
        let called = AtomicBool::new(false);
        assert!(api.map(|_| called.store(true, Ordering::Relaxed)).is_none());
        assert!(!called.load(Ordering::Relaxed));
        assert!(api.get().is_none());
    }

    #[test]
    fn cache_only_statistics_keep_existing_shape() {
        let stats = TaskFunctionStatistics {
            cache_hit: 3,
            cache_miss: 2,
            execution_started: 5,
            execution_completed: 5,
            ..Default::default()
        };
        assert_eq!(
            serde_json::to_value(stats).unwrap(),
            json!({ "cache_hit": 3, "cache_miss": 2 })
        );
    }

    #[test]
    fn abort_activity_adds_denominators_and_nonzero_counters() {
        let stats = TaskFunctionStatistics {
            cache_hit: 3,
            cache_miss: 2,
            execution_started: 5,
            execution_completed: 4,
            abort_requested_invalidation: 1,
            abort_observed_invalidation: 1,
            ..Default::default()
        };
        assert_eq!(
            serde_json::to_value(stats).unwrap(),
            json!({
                "cache_hit": 3,
                "cache_miss": 2,
                "execution_started": 5,
                "execution_completed": 4,
                "abort_requested_invalidation": 1,
                "abort_observed_invalidation": 1,
            })
        );
    }
}
