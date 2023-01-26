use std::{collections::BTreeMap, hash::Hash, mem::replace, ops::DerefMut};

use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

/// A parsed query string from a http request
#[derive(Clone, Debug, PartialEq, Eq, Default, Hash, TraceRawVcs, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Headers(BTreeMap<String, HeaderValue>);

/// The value of an http header. HTTP headers might contain non-utf-8 bytes. An
/// header might also occur multiple times.
#[derive(
    Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, TraceRawVcs, Serialize, Deserialize,
)]
#[serde(untagged)]
pub enum HeaderValue {
    SingleString(String),
    SingleBytes(Vec<u8>),
    MultiStrings(Vec<String>),
    MultiBytes(Vec<Vec<u8>>),
}

impl PartialOrd for Headers {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Headers {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0
            .len()
            .cmp(&other.0.len())
            .then_with(|| self.0.iter().cmp(other.0.iter()))
    }
}

impl std::ops::Deref for Headers {
    type Target = BTreeMap<String, HeaderValue>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for Headers {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl HeaderValue {
    /// Extends the current value with another occurrence of that header which
    /// is a string
    pub fn extend_with_string(&mut self, new: String) {
        *self = match replace(self, HeaderValue::SingleBytes(Vec::new())) {
            HeaderValue::SingleString(s) => HeaderValue::MultiStrings(vec![s, new]),
            HeaderValue::SingleBytes(b) => HeaderValue::MultiBytes(vec![b, new.into()]),
            HeaderValue::MultiStrings(mut v) => {
                v.push(new);
                HeaderValue::MultiStrings(v)
            }
            HeaderValue::MultiBytes(mut v) => {
                v.push(new.into());
                HeaderValue::MultiBytes(v)
            }
        }
    }
    /// Extends the current value with another occurrence of that header which
    /// is a non-utf-8 valid byte sequence
    pub fn extend_with_bytes(&mut self, new: Vec<u8>) {
        *self = match replace(self, HeaderValue::SingleBytes(Vec::new())) {
            HeaderValue::SingleString(s) => HeaderValue::MultiBytes(vec![s.into(), new]),
            HeaderValue::SingleBytes(b) => HeaderValue::MultiBytes(vec![b, new]),
            HeaderValue::MultiStrings(v) => {
                let mut v: Vec<Vec<u8>> = v.into_iter().map(|s| s.into()).collect();
                v.push(new);
                HeaderValue::MultiBytes(v)
            }
            HeaderValue::MultiBytes(mut v) => {
                v.push(new);
                HeaderValue::MultiBytes(v)
            }
        }
    }

    pub fn contains(&self, string_value: &str) -> bool {
        match self {
            HeaderValue::SingleString(s) => s.contains(string_value),
            HeaderValue::MultiStrings(s) => s.iter().any(|s| s.contains(string_value)),
            _ => false,
        }
    }
}
