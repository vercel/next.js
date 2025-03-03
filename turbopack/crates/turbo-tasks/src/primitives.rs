use std::{
    hash::{BuildHasher, Hash},
    ops::Deref,
    time::Duration,
};

use anyhow::Result;
use rustc_hash::FxBuildHasher;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
// This specific macro identifier is detected by turbo-tasks-build.
use turbo_tasks_macros::{primitive as __turbo_tasks_internal_primitive, TraceRawVcs};

use crate::{self as turbo_tasks, FxIndexSet, NonLocalValue, TaskInput, Vc};

__turbo_tasks_internal_primitive!(());
__turbo_tasks_internal_primitive!(String, manual_shrink_to_fit);
__turbo_tasks_internal_primitive!(RcStr);
__turbo_tasks_internal_primitive!(Option<String>);
__turbo_tasks_internal_primitive!(Option<RcStr>);
__turbo_tasks_internal_primitive!(Vec<RcStr>, manual_shrink_to_fit);
__turbo_tasks_internal_primitive!(Option<u16>);
__turbo_tasks_internal_primitive!(Option<u64>);
__turbo_tasks_internal_primitive!(bool);
__turbo_tasks_internal_primitive!(u8);
__turbo_tasks_internal_primitive!(u16);
__turbo_tasks_internal_primitive!(u32);
__turbo_tasks_internal_primitive!(u64);
__turbo_tasks_internal_primitive!(u128);
__turbo_tasks_internal_primitive!(i8);
__turbo_tasks_internal_primitive!(i16);
__turbo_tasks_internal_primitive!(i32);
__turbo_tasks_internal_primitive!(i64);
__turbo_tasks_internal_primitive!(i128);
__turbo_tasks_internal_primitive!(usize);
__turbo_tasks_internal_primitive!(isize);
__turbo_tasks_internal_primitive!(serde_json::Value);
__turbo_tasks_internal_primitive!(Duration);
__turbo_tasks_internal_primitive!(Vec<u8>, manual_shrink_to_fit);
__turbo_tasks_internal_primitive!(Vec<bool>, manual_shrink_to_fit);

#[turbo_tasks::value(transparent, eq = "manual")]
#[derive(Debug, Clone)]
pub struct Regex(
    #[turbo_tasks(trace_ignore)]
    #[serde(with = "serde_regex")]
    pub regex::Regex,
);

impl Deref for Regex {
    type Target = regex::Regex;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl PartialEq for Regex {
    fn eq(&self, other: &Regex) -> bool {
        // Context: https://github.com/rust-lang/regex/issues/313#issuecomment-269898900
        self.0.as_str() == other.0.as_str()
    }
}
impl Eq for Regex {}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
#[serde(bound(
    deserialize = "T: Hash + Eq + Deserialize<'de>",
    serialize = "T: Hash + Eq + Serialize"
))]
pub struct HashableIndexSet<T: Hash + Eq>(pub FxIndexSet<T>);

impl<T: Hash + Eq> From<FxIndexSet<T>> for HashableIndexSet<T> {
    fn from(set: FxIndexSet<T>) -> Self {
        HashableIndexSet(set)
    }
}

impl<T: Hash + Eq> FromIterator<T> for HashableIndexSet<T> {
    fn from_iter<I: IntoIterator<Item = T>>(iter: I) -> Self {
        HashableIndexSet(iter.into_iter().collect())
    }
}

impl<T: Hash + Eq> Deref for HashableIndexSet<T> {
    type Target = FxIndexSet<T>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl<T: Hash + Eq> Hash for HashableIndexSet<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        let mut result = 0u64;
        for item in self.iter() {
            let item_hash = FxBuildHasher.hash_one(item);
            result ^= item_hash;
        }
        state.write_u64(result);
    }
}

impl<T> TaskInput for HashableIndexSet<T>
where
    T: TaskInput,
{
    fn is_resolved(&self) -> bool {
        self.iter().all(TaskInput::is_resolved)
    }

    fn is_transient(&self) -> bool {
        self.iter().any(TaskInput::is_transient)
    }

    async fn resolve_input(&self) -> Result<Self> {
        let mut resolved = FxIndexSet::with_capacity_and_hasher(self.len(), Default::default());
        for value in self.iter() {
            resolved.insert(value.resolve_input().await?);
        }
        Ok(HashableIndexSet(resolved))
    }
}

unsafe impl<T: NonLocalValue + Hash + Eq> NonLocalValue for HashableIndexSet<T> {}
