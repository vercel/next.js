use std::{collections::BTreeMap, hash::Hash, sync::Arc};

use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, TaskInput};

/// A parsed query string from a http request
#[derive(
    Clone, Debug, PartialEq, Eq, Default, Hash, TraceRawVcs, Serialize, Deserialize, NonLocalValue,
)]
#[serde(transparent)]
pub struct Query(Arc<BTreeMap<String, QueryValue>>);

impl From<BTreeMap<String, QueryValue>> for Query {
    fn from(map: BTreeMap<String, QueryValue>) -> Self {
        Query(Arc::new(map))
    }
}

impl TaskInput for Query {
    fn is_transient(&self) -> bool {
        false
    }
}

impl std::ops::Deref for Query {
    type Target = BTreeMap<String, QueryValue>;
    fn deref(&self) -> &Self::Target {
        &self.0
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
