pub mod asset_graph;
pub mod combined;
pub mod conditional;
pub mod lazy_instatiated;
pub mod query;
pub mod router;
pub mod static_assets;

use std::{
    collections::{BTreeMap, HashSet},
    hash::Hash,
    mem::replace,
};

use anyhow::Result;
use serde::{Deserialize, Serialize, Serializer};
use turbo_tasks::{trace::TraceRawVcs, Value};
use turbopack_core::version::VersionedContentVc;

use self::query::Query;

/// The result of proxying a request to another HTTP server.
#[turbo_tasks::value(shared)]
pub struct ProxyResult {
    /// The HTTP status code to return.
    pub status: u16,
    /// Headers arranged as contiguous (name, value) pairs.
    pub headers: Vec<String>,
    /// The body to return.
    pub body: Vec<u8>,
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
// TODO add Dynamic variant in future to allow streaming and server responses
pub enum ContentSourceResult {
    NotFound,
    Static(VersionedContentVc),
    HttpProxy(ProxyResultVc),
    NeedData {
        source: ContentSourceVc,
        path: String,
        vary: ContentSourceDataVary,
    },
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
#[serde(untagged)]
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

    pub fn contains(&self, string_value: &str) -> bool {
        match self {
            HeaderValue::SingleString(s) => s.contains(string_value),
            HeaderValue::MultiStrings(s) => s.iter().any(|s| s.contains(string_value)),
            _ => false,
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
    /// The full url (including query string), if requested
    pub url: Option<String>,
    /// query string items, if requested
    pub query: Option<Query>,
    /// http headers, might contain multiple headers with the same name, if
    /// requested
    pub headers: Option<BTreeMap<String, HeaderValue>>,
    /// request body, if requested
    pub body: Option<BodyVc>,
    /// see [ContentSourceDataVary::cache_buster]
    pub cache_buster: u64,
}

/// A request body.
#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct Body {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    chunks: Vec<Bytes>,
}

impl Body {
    /// Creates a new body from a list of chunks.
    pub fn new(chunks: Vec<Bytes>) -> Self {
        Self { chunks }
    }

    /// Returns an iterator over the body's chunks.
    pub fn chunks(&self) -> impl Iterator<Item = &Bytes> {
        self.chunks.iter()
    }
}

/// A wrapper around [hyper::body::Bytes] that implements [Serialize] and
/// [Deserialize].
#[derive(Clone, Eq, PartialEq)]
pub struct Bytes(hyper::body::Bytes);

impl Bytes {
    /// Returns the bytes as a slice.
    pub fn as_bytes(&self) -> &[u8] {
        self.0.as_ref()
    }
}

impl From<hyper::body::Bytes> for Bytes {
    fn from(bytes: hyper::body::Bytes) -> Self {
        Self(bytes)
    }
}

impl Serialize for Bytes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bytes(self.0.as_ref())
    }
}

impl<'de> Deserialize<'de> for Bytes {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let bytes = Vec::<u8>::deserialize(deserializer)?;
        Ok(Bytes(hyper::body::Bytes::from(bytes)))
    }
}

impl Default for BodyVc {
    fn default() -> Self {
        Body::default().cell()
    }
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
#[turbo_tasks::value(shared)]
#[derive(Debug, Default, Clone)]
pub struct ContentSourceDataVary {
    pub method: bool,
    pub url: bool,
    pub query: Option<ContentSourceDataFilter>,
    pub headers: Option<ContentSourceDataFilter>,
    pub body: bool,
    /// When true, a `cache_buster` value is added to the [ContentSourceData].
    /// This value will be different on every request, which ensures the
    /// content is never cached.
    pub cache_buster: bool,
    pub placeholder_for_future_extensions: (),
}

impl ContentSourceDataVary {
    /// Merges two vary specification to create a combination of both that cover
    /// all information requested by either one
    pub fn extend(&mut self, other: &ContentSourceDataVary) {
        self.method = self.method || other.method;
        self.url = self.url || other.url;
        self.body = self.body || other.body;
        self.cache_buster = self.cache_buster || other.cache_buster;
        ContentSourceDataFilter::extend_options(&mut self.query, &other.query);
        ContentSourceDataFilter::extend_options(&mut self.headers, &other.headers);
    }
}

/// A source of content that the dev server uses to respond to http requests.
#[turbo_tasks::value_trait]
pub trait ContentSource {
    /// Gets content by `path` and request `data` from the source. `data` is
    /// empty by default and will only be filled when returning `NeedData`.
    /// This is useful as this method call will be cached based on it's
    /// arguments, so we want to make the arguments contain as few information
    /// as possible to increase cache hit ratio.
    fn get(&self, path: &str, data: Value<ContentSourceData>) -> ContentSourceResultVc;
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
}
