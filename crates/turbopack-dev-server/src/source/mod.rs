pub mod asset_graph;
pub mod combined;
pub mod query;
pub mod router;
pub mod sub_path;

use std::{
    collections::{BTreeMap, HashSet},
    hash::Hash,
    mem::replace,
};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, Value};
use turbopack_core::version::VersionedContentVc;

use self::query::Query;

#[turbo_tasks::value(shared)]
// TODO add Dynamic variant in future to allow streaming and server responses
pub enum ContentSourceResult {
    NotFound,
    Static(VersionedContentVc),
}

impl From<VersionedContentVc> for ContentSourceResultVc {
    fn from(content: VersionedContentVc) -> Self {
        ContentSourceResult::Static(content).cell()
    }
}

/// The value of an http header. HTTP headers might contain non-utf-8 bytes. An
/// header might also occur multiple times.
#[derive(
    Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, TraceRawVcs, Serialize, Deserialize,
)]
pub enum HeaderValue {
    SingleString(String),
    SingleBytes(Vec<u8>),
    MultiStrings(Vec<String>),
    MultiBytes(Vec<Vec<u8>>),
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
}

/// Additional info passed to the ContentSource. It was extracted from the http
/// request.
///
/// Note that you might not receive information that has not been requested via
/// `ContentSource::vary()`. So make sure to request all information that's
/// needed.
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Clone, Debug, PartialOrd, Ord, Hash, Default)]
pub struct ContentSourceData {
    /// http method, if requested
    pub method: Option<String>,
    /// query string items, empty when not requested
    pub query: Query,
    /// http headers, might contain multiple headers with the same name, empty
    /// when not requested
    pub headers: BTreeMap<String, HeaderValue>,
}

/// Filter function that describes which information is required.
#[derive(Debug, Clone, PartialEq, Eq, TraceRawVcs, Serialize, Deserialize)]
pub enum ContentSourceDataFilter {
    All,
    Subset(HashSet<String>),
}

impl ContentSourceDataFilter {
    /// Merges the filtering to get a filter that covers both filters.
    pub fn extend(&mut self, other: &ContentSourceDataFilter) {
        match self {
            ContentSourceDataFilter::All => {}
            ContentSourceDataFilter::Subset(set) => match other {
                ContentSourceDataFilter::All => *self = ContentSourceDataFilter::All,
                ContentSourceDataFilter::Subset(set2) => set.extend(set2.iter().cloned()),
            },
        }
    }

    /// Merges the filtering to get a filter that covers both filters. Works on
    /// Option<DataFilter> where None is considers as empty filter.
    pub fn extend_options(
        this: &mut Option<ContentSourceDataFilter>,
        other: &Option<ContentSourceDataFilter>,
    ) {
        if let Some(this) = this.as_mut() {
            if let Some(other) = other.as_ref() {
                this.extend(other);
            }
        } else {
            *this = other.clone();
        }
    }

    /// Returns true if the filter contains the given key.
    pub fn contains(&self, key: &str) -> bool {
        match self {
            ContentSourceDataFilter::All => true,
            ContentSourceDataFilter::Subset(set) => set.contains(key),
        }
    }
}

/// Describes additional information that need to be sent to requests to
/// ContentSource. By sending these information ContentSource responses are
/// cached-keyed by them and they can access them.
#[turbo_tasks::value]
#[derive(Debug, Default)]
pub struct ContentSourceDataVary {
    pub method: bool,
    pub query: Option<ContentSourceDataFilter>,
    pub headers: Option<ContentSourceDataFilter>,
}

impl ContentSourceDataVary {
    /// Merges two vary specification to create a combination of both that cover
    /// all information requested by either one
    pub fn extend(&mut self, other: &ContentSourceDataVary) {
        self.method = self.method || other.method;
        ContentSourceDataFilter::extend_options(&mut self.query, &other.query);
        ContentSourceDataFilter::extend_options(&mut self.headers, &other.headers);
    }
}

/// A source of content that the dev server uses to respond to http requests.
#[turbo_tasks::value_trait]
pub trait ContentSource {
    /// Describes which information should be sent as `data` to the `get`
    /// method.
    fn vary(&self, _path: &str) -> ContentSourceDataVaryVc {
        ContentSourceDataVary::default().cell()
    }
    /// Gets content by `path` and request `data` from the source. `data` is
    /// filled with information requested from `vary` (or maybe more).
    fn get(&self, path: &str, data: Value<ContentSourceData>) -> ContentSourceResultVc;
    /// Gets content by `id` from the source. `id` is defined by this content
    /// source and previous responses from this content source might access the
    /// API with that id. It should be unique.
    fn get_by_id(&self, id: &str) -> ContentSourceResultVc;
}

/// An empty ContentSource implementation that responds with NotFound for every
/// request.
#[turbo_tasks::value]
pub struct NoContentSource;

#[turbo_tasks::value_impl]
impl NoContentSourceVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        NoContentSource.cell()
    }
}
#[turbo_tasks::value_impl]
impl ContentSource for NoContentSource {
    #[turbo_tasks::function]
    fn get(&self, _path: &str, _data: Value<ContentSourceData>) -> ContentSourceResultVc {
        ContentSourceResult::NotFound.into()
    }
    #[turbo_tasks::function]
    fn get_by_id(&self, _id: &str) -> ContentSourceResultVc {
        ContentSourceResult::NotFound.into()
    }
}
