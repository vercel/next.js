use std::{collections::BTreeMap, hash::Hash, ops::DerefMut};

use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, TaskInput, trace::TraceRawVcs};

use super::ContentSourceDataFilter;

/// A parsed query string from a http request
#[derive(
    Clone, Debug, PartialEq, Eq, Default, Hash, TraceRawVcs, Serialize, Deserialize, NonLocalValue,
)]
#[serde(transparent)]
pub struct Query(BTreeMap<String, QueryValue>);

// This type contains no VCs so the default implementation works.
// Query is also recursive through QueryValue so the derive macro doesnt work
impl TaskInput for Query {
    fn is_transient(&self) -> bool {
        false
    }
}

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

impl std::ops::Deref for Query {
    type Target = BTreeMap<String, QueryValue>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for Query {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Serialize, Deserialize, NonLocalValue)]
#[serde(untagged)]
pub enum QueryValue {
    /// Simple string value, might be an empty string when there is no value
    String(String),
    /// An array of values
    Array(Vec<QueryValue>),
    /// A nested structure
    Nested(Query),
}
