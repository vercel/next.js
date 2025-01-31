use std::sync::{Arc, OnceLock};

use serde::{ser::SerializeMap, Serialize, Serializer};

use crate::{registry, FunctionId, FxDashMap};

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

    pub fn is_enabled(&self) -> bool {
        self.inner.get().is_some()
    }

    // Calls `func` if statistics have been enabled (via
    // [`TaskStatisticsApi::enable`]).
    pub fn map<T>(&self, func: impl FnOnce(&Arc<TaskStatistics>) -> T) -> Option<T> {
        self.get().map(func)
    }

    // Calls `func` if statistics have been enabled (via
    // [`TaskStatisticsApi::enable`]).
    pub fn get(&self) -> Option<&Arc<TaskStatistics>> {
        self.inner.get()
    }
}

/// A type representing the enabled state of [`TaskStatisticsApi`]. Implements [`serde::Serialize`].
pub struct TaskStatistics {
    inner: FxDashMap<FunctionId, TaskFunctionStatistics>,
}

impl TaskStatistics {
    pub fn increment_cache_hit(&self, function_id: FunctionId) {
        self.with_task_type_statistics(function_id, |stats| stats.cache_hit += 1)
    }

    pub fn increment_cache_miss(&self, function_id: FunctionId) {
        self.with_task_type_statistics(function_id, |stats| stats.cache_miss += 1)
    }

    fn with_task_type_statistics(
        &self,
        task_function_id: FunctionId,
        func: impl Fn(&mut TaskFunctionStatistics),
    ) {
        func(self.inner.entry(task_function_id).or_default().value_mut())
    }
}

/// Statistics for an individual function.
#[derive(Default, Serialize)]
struct TaskFunctionStatistics {
    cache_hit: u32,
    cache_miss: u32,
}

impl Serialize for TaskStatistics {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.inner.len()))?;
        for entry in &self.inner {
            let key = registry::get_function_global_name(*entry.key());
            map.serialize_entry(key, entry.value())?;
        }
        map.end()
    }
}
