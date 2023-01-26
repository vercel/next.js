use std::{collections::BTreeMap, hash::Hash, ops::DerefMut};

use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

use super::ContentSourceDataFilter;

/// A parsed query string from a http request
#[derive(Clone, Debug, PartialEq, Eq, Default, Hash, TraceRawVcs, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Query(BTreeMap<String, QueryValue>);

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
