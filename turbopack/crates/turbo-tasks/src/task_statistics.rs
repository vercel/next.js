use std::sync::{Arc, OnceLock};

use serde::{Serialize, Serializer, ser::SerializeMap};

use crate::{FxDashMap, macro_helpers::NativeFunction};

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
#[derive(Default, Serialize, Clone)]
pub struct TaskFunctionStatistics {
    pub cache_hit: u32,
    pub cache_miss: u32,
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
