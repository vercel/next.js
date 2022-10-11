use std::{hash::Hash, ops::DerefMut};

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

use super::ContentSourceDataFilter;

/// A parsed query string from a http request
#[derive(Clone, Debug, PartialEq, Eq, Default, TraceRawVcs, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Query(#[turbo_tasks(trace_ignore)] IndexMap<String, QueryValue>);

impl Query {
    pub fn filter_with(&mut self, filter: &ContentSourceDataFilter) {
        match filter {
            ContentSourceDataFilter::All => {
                // fast path without iterating query
            }
            _ => self.0.retain(|k, _| filter.contains(k)),
        }
    }
}

impl PartialOrd for Query {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Query {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0
            .len()
            .cmp(&other.0.len())
            .then_with(|| self.0.iter().cmp(other.0.iter()))
    }
}

// clippy: IndexMap forgot to implement Hash, but PartialEq matches Hash
#[allow(clippy::derive_hash_xor_eq)]
impl Hash for Query {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        for (k, v) in &self.0 {
            k.hash(state);
            v.hash(state);
        }
    }
}

impl std::ops::Deref for Query {
    type Target = IndexMap<String, QueryValue>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for Query {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

#[derive(
    Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, TraceRawVcs, Serialize, Deserialize,
)]
#[serde(untagged)]
pub enum QueryValue {
    /// Simple string value, might be an empty string when there is no value
    String(String),
    /// An array of values
    Array(Vec<QueryValue>),
    /// A nested structure
    Nested(Query),
}
